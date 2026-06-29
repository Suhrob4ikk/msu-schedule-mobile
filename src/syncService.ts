import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, DAYS_ORDER, PAIR_TIMES, isCurrentWeek, WeekOption, Teacher } from './api';

export type ProgressCallback = (step: string) => void;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function batch<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency = 3,
  delayMs = 80
) {
  for (let i = 0; i < items.length; i += concurrency) {
    await Promise.all(items.slice(i, i + concurrency).map(fn));
    if (i + concurrency < items.length) await sleep(delayMs);
  }
}

export async function performFullSync(onProgress?: ProgressCallback): Promise<void> {
  // 1. Groups
  onProgress?.('Загружаем группы...');
  const groups = await api.getGroups();
  await AsyncStorage.setItem('cache_groups', JSON.stringify(groups));

  // 2. All weeks
  onProgress?.('Загружаем недели...');
  const weeksAll = await api.getWeeksAll();
  await AsyncStorage.setItem('cache_weeks_all', JSON.stringify(weeksAll));

  // Pick current + next 2 weeks for teacher/room sync
  const curIdx = weeksAll.findIndex(w => isCurrentWeek(w.week_start));
  const baseIdx = curIdx === -1 ? Math.max(0, weeksAll.length - 2) : curIdx;
  const syncWeeks: WeekOption[] = weeksAll.slice(baseIdx, baseIdx + 3);

  // 3. All group schedules for all weeks — 2 groups at a time to not overload server
  const total = groups.length;
  let done = 0;
  await batch(groups, async (group) => {
    try {
      const gWeeks = await api.getGroupWeeks(group.id);
      await AsyncStorage.setItem(`cache_weeks_${group.id}`, JSON.stringify(gWeeks));
      // Fetch weeks one-by-one per group to keep total requests low
      for (const week of gWeeks) {
        try {
          const sched = await api.getGroupSchedule(group.id, week.id);
          await AsyncStorage.setItem(
            `cache_schedule_${group.id}_${week.id}`,
            JSON.stringify(sched)
          );
          await sleep(50);
        } catch {}
      }
    } catch {}
    done++;
    onProgress?.(`Расписания групп: ${done}/${total}`);
  }, 2, 150);

  // 4. Teachers list — по неделе (как в вебе), кэшируем под ключ недели
  onProgress?.('Загружаем преподавателей...');
  const teacherMap = new Map<number, Teacher>();
  for (const week of syncWeeks) {
    try {
      const ts = await api.getTeachers(week.week_start);
      await AsyncStorage.setItem(`cache_teachers_${week.week_start}`, JSON.stringify(ts));
      for (const t of ts) teacherMap.set(t.id, t);
    } catch {}
  }
  const teachers = Array.from(teacherMap.values());

  // 5. Teacher schedules for current + next 2 weeks — 3 teachers at a time
  const tTotal = teachers.length;
  let tDone = 0;
  await batch(teachers, async (teacher) => {
    for (const week of syncWeeks) {
      try {
        const sched = await api.getTeacherSchedule(teacher.id, week.week_start);
        await AsyncStorage.setItem(
          `cache_teacher_${teacher.id}_${week.week_start}`,
          JSON.stringify(sched)
        );
        await sleep(40);
      } catch {}
    }
    tDone++;
    if (tDone % 10 === 0) onProgress?.(`Педагоги: ${tDone}/${tTotal}`);
  }, 3, 100);

  // 6. Rooms for current + next 2 weeks
  onProgress?.('Загружаем аудитории...');
  const days = DAYS_ORDER.filter(d => d !== 'воскресенье');
  const pairs = Object.keys(PAIR_TIMES);
  const roomCombos = syncWeeks.flatMap(week =>
    days.flatMap(day => pairs.map(pair => ({ day, pair, weekStart: week.week_start })))
  );
  await batch(roomCombos, async ({ day, pair, weekStart }) => {
    try {
      const data = await api.getFreeRooms(day, pair, weekStart);
      await AsyncStorage.setItem(
        `cache_rooms_${day}_${pair}_${weekStart}`,
        JSON.stringify(data)
      );
    } catch {}
  }, 3, 80);

  await AsyncStorage.setItem('cache_sync_timestamp', new Date().toISOString());
}

export async function getLastSyncTime(): Promise<Date | null> {
  const ts = await AsyncStorage.getItem('cache_sync_timestamp');
  return ts ? new Date(ts) : null;
}

// Re-sync if last sync was more than 4 hours ago
export function shouldResync(last: Date | null): boolean {
  if (!last) return true;
  return Date.now() - last.getTime() > 4 * 3600 * 1000;
}

export function formatSyncTime(d: Date): string {
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${months[d.getMonth()]} · ${h}:${m}`;
}

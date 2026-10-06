/**
 * Экран загрузки «для работы без интернета»: всё ли уже лежит на телефоне
 * и что рисовать в строке этапа. missingParts, syncWeeks, stepStatus,
 * stepDetail — чистые функции, проверяются скриптом на синтетических данных.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SYNC_INCOMPLETE_KEY, shouldResync, type SyncStage } from '../syncService';
import { DAYS_ORDER, PAIR_NUMBERS, type Group, type Teacher, type WeekInfo, type WeekOption } from '../api';
import { plural } from '../schedule/state';

/** Аудитории сервер отдаёт по шести дням — воскресенья в bulk-sync нет. */
const ROOM_DAYS = DAYS_ORDER.filter(d => d !== 'воскресенье');

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Недели педагогов и аудиторий — как у сервера: эта и следующая, иначе самая свежая. */
export function syncWeeks(weeksAll: WeekOption[], today: Date): string[] {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const next = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
  const wanted = new Set([isoOf(monday), isoOf(next)]);
  const hit = weeksAll.filter(w => wanted.has(w.week_start)).map(w => w.week_start);
  return hit.length ? hit : weeksAll.slice(0, 1).map(w => w.week_start);
}

export interface OfflineSnapshot {
  keys: Set<string>;
  groupId: number;
  /** Последняя полная загрузка оборвалась на записи. */
  interrupted: boolean;
  weeksAll: WeekOption[] | null;
  myWeeks: WeekInfo[] | null;
  /** cache_teachers_<неделя> по неделям из syncWeeks. */
  teachersByWeek: Record<string, Teacher[] | null>;
}

/**
 * Всё ли для работы без интернета лежит на телефоне — то же, что кладёт
 * полная синхронизация: список групп, все недели своей группы с расписанием,
 * педагоги (список и расписание каждого) и аудитории по всем дням и парам на
 * эту и следующую неделю. Чужие группы не проверяем поштучно: они приходят
 * тем же ответом, что и своя.
 */
export function missingParts(s: OfflineSnapshot, today: Date): string[] {
  const miss: string[] = [];
  if (s.interrupted || !s.keys.has('cache_sync_timestamp')) miss.push('sync');
  if (!s.keys.has('cache_groups') || !s.weeksAll) miss.push('groups');
  if (!s.myWeeks) miss.push('my-weeks');
  else if (s.myWeeks.some(w => !s.keys.has(`cache_schedule_${s.groupId}_${w.id}`))) miss.push('my-schedule');
  for (const ws of syncWeeks(s.weeksAll ?? [], today)) {
    const teachers = s.teachersByWeek[ws];
    if (!teachers) miss.push(`teachers ${ws}`);
    else if (teachers.some(t => !s.keys.has(`cache_teacher_${t.id}_${ws}`))) miss.push(`teacher-schedules ${ws}`);
    if (ROOM_DAYS.some(d => PAIR_NUMBERS.some(p => !s.keys.has(`cache_rooms_${d}_${p}_${ws}`)))) miss.push(`rooms ${ws}`);
  }
  return miss;
}

function parse<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

/** Проверить хранилище: true — всё на месте (или группа не выбрана — проверять нечего). */
export async function isOfflineDataComplete(today = new Date()): Promise<boolean> {
  try {
    const gidRaw = await AsyncStorage.getItem('selected_group_id');
    if (!gidRaw) return true;
    const groupId = Number(gidRaw);
    const [[, weeksAllRaw], [, myWeeksRaw], [, flag], [, syncedAt], [, groupsRaw]] = await AsyncStorage.multiGet([
      'cache_weeks_all', `cache_weeks_${groupId}`, SYNC_INCOMPLETE_KEY, 'cache_sync_timestamp', 'cache_groups',
    ]);
    // Полная загрузка недавно прошла до конца — на телефоне всё, что отдаёт
    // сервер. Не хватает чего-то и тут — докачка не поможет, не мучаем экраном.
    if (!flag && syncedAt && !shouldResync(new Date(syncedAt))) return true;
    const keys = new Set(await AsyncStorage.getAllKeys());
    // Группы нет в списке (переименовали на msu.tj) — её недель сервер не отдаст;
    // выбор поправит repairSavedGroup в Расписании
    const groups = parse<Group[]>(groupsRaw);
    const groupGone = !!groups?.length && !groups.some(g => g.id === groupId);
    const weeksAll = parse<WeekOption[]>(weeksAllRaw);
    const weeks = syncWeeks(weeksAll ?? [], today);
    const tPairs = weeks.length ? await AsyncStorage.multiGet(weeks.map(ws => `cache_teachers_${ws}`)) : [];
    const teachersByWeek: Record<string, Teacher[] | null> = {};
    weeks.forEach((ws, i) => { teachersByWeek[ws] = parse<Teacher[]>(tPairs[i]?.[1]); });
    return missingParts({
      keys, groupId, interrupted: !!flag, weeksAll, myWeeks: groupGone ? [] : parse<WeekInfo[]>(myWeeksRaw), teachersByWeek,
    }, today).length === 0;
  } catch {
    return true; // не смогли прочитать — не мешаем открыть приложение
  }
}

/** Этапы экрана: четыре — из полной синхронизации, пятый — история своей группы. */
export type Step = SyncStage | 'history';
export const STEPS: { id: Step; title: string }[] = [
  { id: 'download', title: 'Подключаемся к серверу' },
  { id: 'groups', title: 'Расписание групп' },
  { id: 'teachers', title: 'Педагоги' },
  { id: 'rooms', title: 'Аудитории' },
  { id: 'history', title: 'История изменений вашей группы' },
];

export type Phase = 'running' | 'done' | 'error';
export type StepStatus = 'done' | 'active' | 'pending' | 'failed';

export function stepStatus(step: Step, current: Step, phase: Phase, historyFailed: boolean): StepStatus {
  const i = STEPS.findIndex(s => s.id === step);
  const c = STEPS.findIndex(s => s.id === current);
  if (phase === 'done') return step === 'history' && historyFailed ? 'failed' : 'done';
  if (i < c) return 'done';
  if (i > c) return 'pending';
  return phase === 'error' ? 'failed' : 'active';
}

export interface Counts { groups: number; teachers: number; rooms: number }

/** Подпись справа у пройденного этапа: «24 группы», «85 педагогов». */
export function stepDetail(step: Step, counts: Counts | null, historyFailed: boolean): string | null {
  if (step === 'history' && historyFailed) return 'обновится позже';
  if (!counts) return null;
  if (step === 'groups') return `${counts.groups} ${plural(counts.groups, 'группа', 'группы', 'групп')}`;
  if (step === 'teachers') return `${counts.teachers} ${plural(counts.teachers, 'педагог', 'педагога', 'педагогов')}`;
  if (step === 'rooms') return `${counts.rooms} ${plural(counts.rooms, 'аудитория', 'аудитории', 'аудиторий')}`;
  return null;
}

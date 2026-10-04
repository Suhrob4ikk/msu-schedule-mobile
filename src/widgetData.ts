import AsyncStorage from '@react-native-async-storage/async-storage';
import { Group, Lesson, WeekInfo, DAYS_ORDER, shortGroupName } from './api';
import LiveLessonNative from '../modules/live-lesson';
import { addDays, lessonKind } from './schedule/state';
import { displayRoom } from './rooms/state';

// Данные для виджета на рабочем столе. Пишем компактный JSON в AsyncStorage
// (ключ widget_data) — нативный виджет (ScheduleWidget.kt) читает его напрямую
// из базы RKStorage, поэтому дополнительных библиотек не нужно. Тот же ключ
// читает строка «идёт пара» (modules/live-lesson).

const DAY_SHORT: Record<string, string> = {
  понедельник: 'Пн', вторник: 'Вт', среда: 'Ср',
  четверг: 'Чт', пятница: 'Пт', суббота: 'Сб', воскресенье: 'Вс',
};

const pad = (n: number) => String(n).padStart(2, '0');

interface WidgetItem {
  startAt: number; endAt: number; subject: string; room: string; label: string;
  pair: string; type: string; teacher: string;
}

function widgetItems(lessons: Lesson[], weekStart: string): WidgetItem[] {
  return lessons
    .map((l): WidgetItem | null => {
      // Дата пары: из данных или вычисляем от начала недели (в локальном времени)
      let date = l.lesson_date;
      if (!date) {
        const idx = DAYS_ORDER.indexOf(l.day_of_week);
        if (idx < 0) return null;
        const d = new Date(weekStart + 'T00:00:00');
        d.setDate(d.getDate() + idx);
        date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      }
      const startAt = new Date(`${date}T${l.pair_time_start}:00`).getTime();
      const endAt = new Date(`${date}T${l.pair_time_end}:00`).getTime();
      if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) return null;
      return {
        startAt,
        endAt,
        subject: l.subject,
        // Как на вкладке «Аудитории»: «лабхим» → «Лаб. химии»
        room: l.room?.name ? displayRoom(l.room.name) : '',
        label: `${DAY_SHORT[l.day_of_week] ?? ''} ${l.pair_time_start}–${l.pair_time_end}`,
        // Для виджета: «Идёт · II пара», «09:45–11:15 · Практика · Хайбуллоев Д.А.»
        pair: l.pair_number ?? '',
        type: lessonKind(l.lesson_type)?.label ?? '',
        teacher: l.teacher?.name ?? '',
      };
    })
    .filter((x): x is WidgetItem => x !== null);
}

/**
 * Пары следующей недели — из кэша (его заполняют полная синхронизация и экран
 * Расписания). null — неделя ещё не опубликована или её пар нет на телефоне.
 * Нужны виджету в субботу вечером («Завтра» → понедельник) и для правила
 * «каникулы — нет пар в 14 днях».
 */
async function nextWeekLessons(groupId: number, weekStart: string): Promise<{ lessons: Lesson[]; weekStart: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(`cache_weeks_${groupId}`);
    if (!raw) return null;
    const next = addDays(weekStart, 7);
    const w = (JSON.parse(raw) as WeekInfo[]).find(x => x.week_start === next);
    if (!w) return null;
    const s = await AsyncStorage.getItem(`cache_schedule_${groupId}_${w.id}`);
    return s ? { lessons: JSON.parse(s) as Lesson[], weekStart: next } : null;
  } catch {
    return null;
  }
}

export async function writeWidgetData(group: Group, lessons: Lesson[], weekStart: string): Promise<void> {
  const next = await nextWeekLessons(group.id, weekStart);
  const items = [
    ...widgetItems(lessons, weekStart),
    ...(next ? widgetItems(next.lessons, next.weekStart) : []),
  ].sort((a, b) => a.startAt - b.startAt);

  await AsyncStorage.setItem('widget_data', JSON.stringify({
    group: `${shortGroupName(group.name)} · ${group.year} курс`,
    updatedAt: Date.now(),
    // Пары лежат до этого момента (конец следующей недели, если она вышла,
    // иначе конец этой) — дальше виджет не знает, есть ли занятия.
    knownUntil: new Date(`${addDays(next ? next.weekStart : weekStart, 7)}T00:00:00`).getTime(),
    nextWeekPublished: next != null,
    lessons: items,
  }));

  // Раньше на этом всё заканчивалось: виджет узнавал о новых данных только
  // на своём будильнике или системном updatePeriodMillis (30 минут) — а MIUI
  // умеет замораживать и то, и другое на часы. 3 сентября 2026 виджет так
  // провисел с 15:30 до 23:01, показывая пару, которая давно закончилась, с
  // отсчётом в минус. Теперь каждое открытие приложения (расписание
  // загружается заново при каждом входе) сразу же будит виджет — независимо
  // от того, работает будильник на этом телефоне или нет.
  await LiveLessonNative?.refreshWidget().catch(() => null);
}

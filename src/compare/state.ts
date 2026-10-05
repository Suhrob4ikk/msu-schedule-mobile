/**
 * «Сравнить с группой» — чистые функции: какая неделя, сетка «день × пара»,
 * общие свободные пары, что у группы в клетке. Без React Native — проверяются
 * скриптом.
 */
import type { Lesson, WeekInfo } from '../api';

export const PAIRS = ['I', 'II', 'III', 'IV', 'V'];
export const DAYS = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
export const DAY_SHORT: Record<string, string> = {
  понедельник: 'Пн', вторник: 'Вт', среда: 'Ср', четверг: 'Чт', пятница: 'Пт', суббота: 'Сб',
};
const DAY_NAME: Record<string, string> = {
  понедельник: 'Понедельник', вторник: 'Вторник', среда: 'Среда', четверг: 'Четверг', пятница: 'Пятница', суббота: 'Суббота',
};

export type Which = 'this' | 'next';
export type CellKind = 'free' | 'mine' | 'theirs' | 'both';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Понедельник недели, в которой лежит дата (воскресенье — ещё та же неделя). */
export function mondayOf(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}

export function addDaysIso(s: string, n: number): string {
  const [y, m, d] = s.split('-').map(Number);
  return iso(new Date(y, m - 1, d + n));
}

/** Неделя группы с этим понедельником; null — у группы её нет (не опубликована). */
export function weekFor(weeks: WeekInfo[], weekStart: string): WeekInfo | null {
  return weeks.find(w => w.week_start === weekStart) ?? null;
}

/**
 * Неделя по умолчанию: эта; в воскресенье — следующая, если она уже есть у обеих
 * групп (так же решает «Расписание» и экран педагога).
 */
export function defaultWhich(now: Date, nextAvailable: boolean): Which {
  return now.getDay() === 0 && nextAvailable ? 'next' : 'this';
}

const key = (day: string, pair: string) => `${day}|${pair}`;

export function busyMap(lessons: Lesson[]): Map<string, Lesson[]> {
  const m = new Map<string, Lesson[]>();
  for (const l of lessons) {
    const k = key(l.day_of_week, l.pair_number);
    m.set(k, [...(m.get(k) ?? []), l]);
  }
  return m;
}

export interface Grid {
  /** Учебные дни: хоть у одной группы есть пары. Выходной — не «оба свободны». */
  days: string[];
  cell: (day: string, pair: string) => CellKind;
  commonFree: number;
}

export function buildGrid(mine: Lesson[], theirs: Lesson[]): Grid {
  const a = busyMap(mine);
  const b = busyMap(theirs);
  const cell = (day: string, pair: string): CellKind => {
    const m = a.has(key(day, pair));
    const t = b.has(key(day, pair));
    return m && t ? 'both' : m ? 'mine' : t ? 'theirs' : 'free';
  };
  const days = DAYS.filter(d => PAIRS.some(p => cell(d, p) !== 'free'));
  let commonFree = 0;
  for (const d of days) for (const p of PAIRS) if (cell(d, p) === 'free') commonFree++;
  return { days, cell, commonFree };
}

/** Что у группы в клетке: «Численные методы · ауд. 702» или «свободна». */
export function slotLine(lessons: Lesson[], day: string, pair: string): string {
  const here = lessons.filter(l => l.day_of_week === day && l.pair_number === pair);
  if (!here.length) return 'свободна';
  const uniq = [...new Set(here.map(l => [l.subject, l.room?.name ? `ауд. ${l.room.name}` : null].filter(Boolean).join(' · ')))];
  return uniq.join(' / ');
}

export function slotTitle(day: string, pair: string, times: Record<string, [string, string]>): string {
  const t = times[pair];
  return `${DAY_NAME[day] ?? day}, ${pair} пара${t ? ` · ${t[0]}–${t[1]}` : ''}`;
}

const pluralRu = (n: number, one: string, few: string, many: string) => {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return one;
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return few;
  return many;
};

/** «8 общих свободных пар», «1 общая свободная пара». */
export function commonLabel(n: number): string {
  return `${n} ${pluralRu(n, 'общая свободная пара', 'общие свободные пары', 'общих свободных пар')}`;
}

/** «6–11 окт» — подпись недели на переключателе. */
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export function weekRange(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  const a = new Date(y, m - 1, d);
  const b = new Date(y, m - 1, d + 5);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

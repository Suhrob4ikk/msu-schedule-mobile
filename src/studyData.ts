/**
 * Пропуски пар и заметки. Хранятся ТОЛЬКО на устройстве (AsyncStorage),
 * на сервер не уходят.
 *
 * Модель пропусков: отмечаем только то, что пропустил. Отсутствие отметки
 * у уже прошедшей пары = «был». Так не нужно отмечать каждую пару, а
 * статистика получается честной (а не «процент от отмеченных»).
 *
 * Формат ключей задан здесь и продублирован в вебе (src/lib/studyData.ts) —
 * менять надо в обоих местах.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const SKIP_PREFIX = 'miss_';
const NOTE_WEEKLY_PREFIX = 'note2_';
const NOTE_DATED_PREFIX = 'noted_';

/** Пропуск привязан к конкретной дате — отметки разных недель не смешиваются. */
export const skipKey = (groupId: number | string, date: string, pair: string) =>
  `${SKIP_PREFIX}${groupId}_${date}_${pair}`;

/** Заметка «каждую неделю» — привязана к слоту день+пара, без даты. */
export const noteWeeklyKey = (groupId: number | string, day: string, pair: string) =>
  `${NOTE_WEEKLY_PREFIX}${groupId}_${day}_${pair}`;

/** Разовая заметка — только на конкретную дату. */
export const noteDatedKey = (groupId: number | string, date: string, pair: string) =>
  `${NOTE_DATED_PREFIX}${groupId}_${date}_${pair}`;

/** Сегодняшняя дата как YYYY-MM-DD по МЕСТНОМУ времени.
 *  (toISOString() дал бы UTC — вечером в Душанбе это уже завтра.) */
export function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Пару можно отметить как пропущенную, только если она уже прошла. */
export const isPastLesson = (lessonDate?: string | null): boolean =>
  !!lessonDate && lessonDate <= todayIso();

export interface SkipStats {
  total: number;
  /** [предмет, сколько пропусков] — по убыванию */
  bySubject: Array<[string, number]>;
}

export async function collectSkips(): Promise<SkipStats> {
  const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(SKIP_PREFIX));
  const rows = await AsyncStorage.multiGet(keys);
  const bySubj = new Map<string, number>();
  let total = 0;
  for (const [, v] of rows) {
    total++;
    const subject = (v ?? '').trim();
    if (subject) bySubj.set(subject, (bySubj.get(subject) ?? 0) + 1);
  }
  return {
    total,
    bySubject: [...bySubj.entries()].sort((a, b) => b[1] - a[1]),
  };
}

export interface NoteEntry {
  /** «понедельник, I пара» или «15.09, I пара» */
  slot: string;
  text: string;
}

export async function collectNotes(): Promise<NoteEntry[]> {
  const keys = (await AsyncStorage.getAllKeys()).filter(
    k => k.startsWith(NOTE_WEEKLY_PREFIX) || k.startsWith(NOTE_DATED_PREFIX)
  );
  const rows = await AsyncStorage.multiGet(keys);
  const out: NoteEntry[] = [];
  for (const [k, v] of rows) {
    const text = (v ?? '').trim();
    if (!text) continue;
    const dated = k.startsWith(NOTE_DATED_PREFIX);
    const parts = k.split('_'); // префикс _ id группы _ (день|дата) _ пара
    const when = parts[2] ?? '';
    const pair = parts[3] ?? '';
    out.push({ slot: `${dated ? formatDateShort(when) : when}, ${pair} пара`, text });
  }
  return out;
}

function formatDateShort(iso: string): string {
  const [, m, d] = iso.split('-');
  return m && d ? `${d}.${m}` : iso;
}

/**
 * Логика вкладки «Аудитории» (стиль «Табло») без React: режим «Сейчас»,
 * день аудитории из пяти пар, статусы «до HH:MM», накладки, поиск.
 *
 * Всё считается на телефоне из ответов /schedule/free-rooms (они же лежат
 * в офлайн-кэше bulk-sync) — бэкенд не меняется. «Свободна до» сервер
 * считает как конец последней свободной пары; ТЗ просит начало следующего
 * занятия — поэтому статусы считаются здесь, из всех пяти пар дня.
 */
import { DAYS_ORDER, PAIR_NUMBERS, PAIR_TIMES } from '../api';
import { addDays, atMs, dayTitle, isoOf, leftParts, lessonKind, parseIso, plural } from '../schedule/state';

export const PAIRS = PAIR_NUMBERS;

/** Ответ /schedule/free-rooms для одной аудитории. */
export interface RoomSlot {
  room_name: string;
  is_free: boolean;
  occupied_by?: string;
  occupied_list?: string[];
  conflict?: boolean;
  free_until?: string | null;
  occupied_until?: string | null;
}

// ─── Названия и сортировка ─────────────────────────────────────────────────

const NAMED: Record<string, string> = {
  стадион: 'Стадион',
  лабгеол: 'Лаб. геологии',
  лабфиз: 'Лаб. физики',
  лабхим: 'Лаб. химии',
};

/** «лабгеол» → «Лаб. геологии»; номера — как есть. */
export const displayRoom = (raw: string): string => NAMED[raw.trim().toLowerCase()] ?? raw;

export const isNumbered = (raw: string): boolean => /^\d/.test(raw.trim());

/** По номеру как числу (100, 104, 108, 208…), именованные — в конце по алфавиту. */
export function sortRooms(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    const an = !Number.isNaN(na);
    const bn = !Number.isNaN(nb);
    if (an && bn) return na - nb || a.localeCompare(b, 'ru');
    if (an) return -1;
    if (bn) return 1;
    return displayRoom(a).localeCompare(displayRoom(b), 'ru');
  });
}

// ─── Кто в аудитории ───────────────────────────────────────────────────────

export interface Occupant {
  /** «3 курс · ХФММ» */
  group: string;
  course: number | null;
  program: string;
  subject: string;
  type: string | null;
  teacher: string | null;
}

/** Похоже на ФИО с инициалами («Акбарова В.А.», «Махмадрасулзода Б.С»). */
const looksLikeTeacher = (s: string) => /[А-ЯЁA-Z]\.\s*([А-ЯЁA-Z]\.?)?\s*$/.test(s.trim()) || s.includes(',');

/**
 * Разбор строки сервера «3 курс · ХФММ: Предмет · Тип · Преподаватель».
 * Тип и преподаватель необязательны (сервер дописывает их, только если есть),
 * поэтому одиночный хвост различаем по виду: ФИО с инициалами — преподаватель.
 */
export function parseOccupant(entry: string): Occupant {
  const sep = entry.indexOf(': ');
  const head = sep >= 0 ? entry.slice(0, sep) : '';
  const rest = (sep >= 0 ? entry.slice(sep + 2) : entry).split(' · ');
  const [courseStr, ...prog] = head.split(' · ');
  const course = parseInt(courseStr, 10);
  let subject = rest[0] ?? '';
  let type: string | null = null;
  let teacher: string | null = null;
  if (rest.length >= 3) {
    teacher = rest[rest.length - 1];
    type = rest[rest.length - 2];
    subject = rest.slice(0, -2).join(' · ');
  } else if (rest.length === 2) {
    if (looksLikeTeacher(rest[1])) teacher = rest[1];
    else type = rest[1];
  }
  return {
    group: head,
    course: Number.isNaN(course) ? null : course,
    program: prog.join(' · '),
    subject,
    type,
    teacher,
  };
}

export const occupantsOf = (r: RoomSlot | undefined): Occupant[] =>
  !r || r.is_free ? [] : (r.occupied_list ?? (r.occupied_by ? r.occupied_by.split('; ') : [])).map(parseOccupant);

/**
 * Несколько групп в одной аудитории одновременно:
 * shared — общее занятие (у всех один предмет, преподаватель и тип: поток,
 * общая лекция); conflict — настоящая накладка (предмет или преподаватель
 * разные). Решение владельца от 4 окт 2026: общее занятие накладкой не считаем.
 */
export type Overlap = { kind: 'none' } | { kind: 'shared' | 'conflict'; count: number };

export function overlapOf(occ: Occupant[]): Overlap {
  if (occ.length < 2) return { kind: 'none' };
  const f = occ[0];
  const same = occ.every(o => o.subject === f.subject && o.teacher === f.teacher && o.type === f.type);
  return { kind: same ? 'shared' : 'conflict', count: occ.length };
}

export const groupsWord = (n: number) => `${n} ${plural(n, 'группа', 'группы', 'групп')}`;

/** Бейдж в строке: «Накладка · 2 группы» / «Поток · 3 группы». */
export function overlapBadge(o: Overlap): string | null {
  if (o.kind === 'none') return null;
  return `${o.kind === 'conflict' ? 'Накладка' : 'Поток'} · ${groupsWord(o.count)}`;
}

/** Строка «кто» у занятой: «3 курс ХФММ · Химическая термодинамика и кинетика». */
export function whoLine(o: Occupant): string {
  const g = o.course != null && o.program ? `${o.course} курс ${o.program}` : o.group;
  return g ? `${g} · ${o.subject}` : o.subject;
}

// ─── День аудитории ────────────────────────────────────────────────────────

export type CellStatus = 'free' | 'busy' | 'conflict';

export interface RoomDay {
  room: string;
  /** Кто занимает по парам I–V. */
  occupants: Occupant[][];
  cells: CellStatus[];
}

export const cellOf = (occ: Occupant[]): CellStatus =>
  !occ.length ? 'free' : overlapOf(occ).kind === 'conflict' ? 'conflict' : 'busy';

/** День каждой аудитории из пяти ответов free-rooms (пары I–V). */
export function buildDay(byPair: Record<string, RoomSlot[] | undefined>): RoomDay[] {
  const names = new Set<string>();
  for (const p of PAIRS) for (const r of byPair[p] ?? []) names.add(r.room_name);
  return sortRooms([...names]).map(room => {
    const occupants = PAIRS.map(p => occupantsOf((byPair[p] ?? []).find(r => r.room_name === room)));
    return { room, occupants, cells: occupants.map(cellOf) };
  });
}

export interface RoomStatus { free: boolean; until: string | null }

/**
 * Свободна — до начала следующего занятия (null — весь день).
 * Занята — до конца непрерывной цепочки занятий (сдвоенная, несколько подряд).
 */
export function roomStatus(d: RoomDay, pairIdx: number): RoomStatus {
  if (!d.occupants[pairIdx]?.length) {
    for (let j = pairIdx + 1; j < PAIRS.length; j++) {
      if (d.occupants[j].length) return { free: true, until: PAIR_TIMES[PAIRS[j]][0] };
    }
    return { free: true, until: null };
  }
  let j = pairIdx;
  while (j + 1 < PAIRS.length && d.occupants[j + 1].length) j++;
  return { free: false, until: PAIR_TIMES[PAIRS[j]][1] };
}

export function statusText(s: RoomStatus): string {
  if (s.free) return s.until ? `Свободна до ${s.until}` : 'Свободна весь день';
  return `Занята до ${s.until}`;
}

/** Время занятия группы в аудитории: «09:45–13:00 · 2 пары» (подряд, та же группа и предмет). */
export function groupSpan(d: RoomDay, pairIdx: number, o: Occupant): string {
  const same = (j: number) => d.occupants[j]?.some(x => x.group === o.group && x.subject === o.subject);
  let a = pairIdx;
  let b = pairIdx;
  while (a - 1 >= 0 && same(a - 1)) a--;
  while (b + 1 < PAIRS.length && same(b + 1)) b++;
  const time = `${PAIR_TIMES[PAIRS[a]][0]}–${PAIR_TIMES[PAIRS[b]][1]}`;
  const n = b - a + 1;
  return n > 1 ? `${time} · ${n} ${plural(n, 'пара', 'пары', 'пар')}` : time;
}

// ─── Поиск ─────────────────────────────────────────────────────────────────

/**
 * По началу номера или слова, без регистра: «10» → 100, 104, 105, 107, 108;
 * «ста» → Стадион; «гео» → Лаб. геологии. exact — точное совпадение.
 */
export function searchRooms(names: string[], query: string): { exact: string | null; others: string[] } | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const hits = sortRooms(names.filter(n => {
    const raw = n.toLowerCase();
    const disp = displayRoom(n).toLowerCase();
    return raw.startsWith(q) || disp.startsWith(q) || disp.split(/[\s.]+/).some(w => w.startsWith(q));
  }));
  const exact = hits.find(n => n.toLowerCase() === q || displayRoom(n).toLowerCase() === q) ?? null;
  return { exact, others: hits.filter(n => n !== exact) };
}

// ─── Режим «Сейчас» ────────────────────────────────────────────────────────

/** Выбранные день и пара — в режиме «Сейчас» или вручную. */
export interface Slot {
  date: string;
  weekStart: string;
  /** 0 = понедельник … 5 = суббота */
  dayIndex: number;
  pair: string;
}

/**
 * live — идёт пара; break — перемена (следующая пара сегодня);
 * morning — сегодня пары ещё не начались; nearest — вечер или воскресенье:
 * I пара ближайшего учебного дня.
 */
export type NowKind = 'live' | 'break' | 'morning' | 'nearest';

export interface NowSlot extends Slot {
  kind: NowKind;
  /** До конца (live) или до начала (break/morning); у nearest — null. */
  targetAt: number | null;
}

export const mondayOf = (iso: string): string => addDays(iso, -((parseIso(iso).getDay() + 6) % 7));

function slotOf(date: string, pair: string): Slot {
  return { date, weekStart: mondayOf(date), dayIndex: (parseIso(date).getDay() + 6) % 7, pair };
}

export function nowSlot(now: Date): NowSlot {
  const today = isoOf(now);
  const t = now.getTime();
  const dow = (now.getDay() + 6) % 7;
  if (dow <= 5) {
    for (let i = 0; i < PAIRS.length; i++) {
      const [s, e] = PAIR_TIMES[PAIRS[i]];
      const startAt = atMs(today, s);
      const endAt = atMs(today, e);
      if (t >= startAt && t < endAt) return { ...slotOf(today, PAIRS[i]), kind: 'live', targetAt: endAt };
      if (t < startAt) return { ...slotOf(today, PAIRS[i]), kind: i === 0 ? 'morning' : 'break', targetAt: startAt };
    }
  }
  let next = addDays(today, 1);
  if (parseIso(next).getDay() === 0) next = addDays(next, 1); // воскресенье пропускаем
  return { ...slotOf(next, PAIRS[0]), kind: 'nearest', targetAt: null };
}

/** Ключ режима «Сейчас»: меняется только на границах пар. */
export const nowKey = (s: NowSlot) => `${s.kind}|${s.date}|${s.pair}`;

const DAY_NAMES = DAYS_ORDER;
const DAY_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export const pairTitle = (pair: string) => `${pair} пара · ${PAIR_TIMES[pair][0]}–${PAIR_TIMES[pair][1]}`;

function leftText(ms: number): string {
  const p = leftParts(Math.max(0, ms));
  return p.lessThanMinute ? 'меньше минуты' : p.parts.map(x => `${x.n} ${x.u}`).join(' ');
}

/**
 * Мелкая строка шапки. lead — выделенное слово (accent-text):
 * «Сейчас · вторник · ещё 43 мин», «Ближайшая · понедельник».
 * Вручную: «Четверг, 8 октября» без выделения.
 */
export function headerSubtitle(slot: Slot, now: NowSlot | null, at: Date): { lead: string | null; rest: string } {
  if (!now) return { lead: null, rest: dayTitle(slot.date) };
  const day = DAY_NAMES[now.dayIndex];
  if (now.kind === 'nearest') return { lead: 'Ближайшая', rest: ` · ${day}` };
  const ms = (now.targetAt ?? at.getTime()) - at.getTime();
  const left = now.kind === 'live'
    ? `ещё ${leftText(ms)}`
    : ms < 60_000 ? 'через минуту' : `через ${leftText(ms)}`;
  return { lead: 'Сейчас', rest: ` · ${day} · ${left}` };
}

/** «Показать · чт, III пара» */
export const showLabel = (dayIndex: number, pair: string) => `Показать · ${DAY_SHORT[dayIndex]}, ${pair} пара`;

// ─── Озвучивание ───────────────────────────────────────────────────────────

const ORDINAL: Record<string, string> = { I: 'Первая', II: 'Вторая', III: 'Третья', IV: 'Четвёртая', V: 'Пятая' };
const CELL_WORD: Record<CellStatus, string> = { free: 'свободна', busy: 'занята', conflict: 'накладка' };
export const cellWord = (c: CellStatus) => CELL_WORD[c];

/** «Третья пара, 11:30–13:00, занята» */
export const cellA11y = (pairIdx: number, c: CellStatus) =>
  `${ORDINAL[PAIRS[pairIdx]]} пара, ${PAIR_TIMES[PAIRS[pairIdx]][0]}–${PAIR_TIMES[PAIRS[pairIdx]][1]}, ${CELL_WORD[c]}`;

/** «Аудитория 301, занята до 13:00, 3 курс ХФММ, химическая термодинамика и кинетика» */
export function rowA11y(d: RoomDay, pairIdx: number): string {
  const s = roomStatus(d, pairIdx);
  const occ = d.occupants[pairIdx];
  const o = overlapOf(occ);
  const parts = [`Аудитория ${displayRoom(d.room)}`, statusText(s).toLowerCase()];
  if (o.kind === 'conflict') parts.push(`накладка, ${groupsWord(o.count)}`);
  else if (o.kind === 'shared') parts.push(`общее занятие, ${groupsWord(o.count)}`, occ[0].subject.toLowerCase());
  else if (occ.length) {
    const x = occ[0];
    parts.push(x.course != null ? `${x.course} курс ${x.program}` : x.group, x.subject.toLowerCase());
  }
  return parts.join(', ');
}

/** Бейдж типа занятия — та же таблица, что в расписании. */
export { lessonKind };

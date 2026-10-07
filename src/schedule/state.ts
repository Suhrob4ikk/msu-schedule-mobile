/**
 * Логика нового экрана расписания без React: что раскрыто, как подписаны
 * промежутки, заголовки дней, статистика, какую неделю открыть.
 *
 * Всё считается по часам телефона и списку пар недели — без сети.
 * Проверяется скриптом с поддельными часами (см. коммит этапа 1).
 */
import type { Lesson } from '../api';
import { BREAK_MAX_MIN, DAYS_ORDER, PAIR_NUMBERS, humanDuration } from '../api';

// ─── Даты и время ──────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');

export const toMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** YYYY-MM-DD по местному времени. */
export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Момент «дата + 14:00» в миллисекундах, по местному времени. */
export function atMs(iso: string, hhmm: string): number {
  const d = parseIso(iso);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

/** Разница в днях b − a (по календарю, без часов). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86_400_000);
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «Вторник, 6 октября» */
export function dayTitle(iso: string): string {
  const d = parseIso(iso);
  return `${cap(DAYS_ORDER[(d.getDay() + 6) % 7])}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

/** «5–10 октября» или «28 сентября – 3 октября» */
export function rangeLabel(fromIso: string, toIso: string): string {
  const a = parseIso(fromIso);
  const b = parseIso(toIso);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
  return `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
}

/** Время для статуса связи: «10:31», если сегодня, иначе «2 окт, 22:10». */
export function stampLabel(at: Date, now: Date): string {
  const hm = `${pad2(at.getHours())}:${pad2(at.getMinutes())}`;
  return isoOf(at) === isoOf(now) ? hm : `${at.getDate()} ${MONTHS_SHORT[at.getMonth()]}, ${hm}`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// ─── Неделя: дни и блоки ───────────────────────────────────────────────────

/**
 * Блок — одна строка ленты: одна пара или сдвоенная (два и более соседних
 * слота с тем же предметом, типом, преподавателем и аудиторией).
 */
export interface Block {
  key: string;
  lessons: Lesson[];
  day: string;
  date: string;
  pairs: string[];
  start: string;
  end: string;
  startAt: number;
  endAt: number;
}

export interface DayData {
  day: string;
  dayIndex: number;
  date: string;
  blocks: Block[];
  /** Сколько пар (сдвоенная — 2). */
  pairCount: number;
}

const pairIdx = (p: string) => PAIR_NUMBERS.indexOf(p);

function lessonDate(l: Lesson, weekStart: string): string {
  if (l.lesson_date) return l.lesson_date;
  const i = DAYS_ORDER.indexOf(l.day_of_week);
  return addDays(weekStart, i < 0 ? 0 : i);
}

export function sameBlock(a: Lesson, b: Lesson): boolean {
  return a.subject === b.subject
    && (a.teacher?.id ?? null) === (b.teacher?.id ?? null)
    && (a.room?.id ?? null) === (b.room?.id ?? null)
    && a.lesson_type === b.lesson_type
    && pairIdx(b.pair_number) - pairIdx(a.pair_number) === 1;
}

function makeBlock(lessons: Lesson[], date: string): Block {
  const first = lessons[0];
  const last = lessons[lessons.length - 1];
  return {
    key: `${date}|${first.pair_number}|${first.id}`,
    lessons,
    day: first.day_of_week,
    date,
    pairs: lessons.map(l => l.pair_number),
    start: first.pair_time_start,
    end: last.pair_time_end,
    startAt: atMs(date, first.pair_time_start),
    endAt: atMs(date, last.pair_time_end),
  };
}

/** Семь дней недели (Пн–Вс), у каждого — блоки по порядку пар. */
export function buildWeek(lessons: Lesson[], weekStart: string): DayData[] {
  return DAYS_ORDER.map((day, dayIndex) => {
    const date = addDays(weekStart, dayIndex);
    const own = lessons
      .filter(l => l.day_of_week === day)
      .sort((a, b) => pairIdx(a.pair_number) - pairIdx(b.pair_number) || toMin(a.pair_time_start) - toMin(b.pair_time_start));
    // Каждая пара — своей строкой, без склейки двух одинаковых подряд в «сдвоенную»
    // (решение владельца, 7 окт 2026). sameBlock оставлен — на случай возврата.
    const runs: Lesson[][] = own.map(l => [l]);
    const blocks = runs.map(r => makeBlock(r, lessonDate(r[0], weekStart)));
    return { day, dayIndex, date, blocks, pairCount: own.length };
  });
}

// ─── Подписи ───────────────────────────────────────────────────────────────

/**
 * Что между двумя строками дня: до 20 минут — «перемена 15 мин», дольше —
 * «перерыв 1 ч» (обед, пропущенная пара). Слово «окно» студентам непонятно —
 * решение владельца, окт 2026; на сайте те же слова (BREAK_MAX_MIN в api.ts).
 */
export function gapLabel(prev: Block, next: Block): string | null {
  const minutes = Math.round((next.startAt - prev.endAt) / 60_000);
  if (minutes <= 0) return null;
  return `${minutes <= BREAK_MAX_MIN ? 'перемена' : 'перерыв'} ${humanDuration(minutes)}`;
}

export const freeFromLabel = (last: Block) => `свободны с ${last.end}`;

/** «II пара» или «2 пары» — третья строка колонки времени. */
export function pairsLabel(b: Block): string {
  const n = b.lessons.length;
  return n > 1 ? `${n} ${plural(n, 'пара', 'пары', 'пар')}` : `${b.pairs[0]} пара`;
}

/** «14:00–15:30 и 15:45–17:15» — под преподавателем у сдвоенной пары. */
export function slotsLabel(b: Block): string | null {
  if (b.lessons.length < 2) return null;
  const parts = b.lessons.map(l => `${l.pair_time_start}–${l.pair_time_end}`);
  return parts.length === 2 ? parts.join(' и ') : `${parts.slice(0, -1).join(', ')} и ${parts[parts.length - 1]}`;
}

const pairsCount = (n: number) => `${n} ${plural(n, 'пара', 'пары', 'пар')}`;

/**
 * Правая часть заголовка дня. Относительное слово («сегодня», «завтра»,
 * «послезавтра») — у сегодняшнего дня и у дня с раскрытой карточкой, как на
 * макетах; у остальных — «2 пары · 11:30–17:15».
 */
export function dayMeta(d: DayData, now: Date, isFocusDay: boolean): string {
  const rel = diffDays(isoOf(now), d.date);
  const word = rel === 0 ? 'сегодня'
    : isFocusDay && rel === 1 ? 'завтра'
    : isFocusDay && rel === 2 ? 'послезавтра'
    : null;
  if (!d.blocks.length) return word ?? 'пар нет';
  if (word) return `${word} · ${pairsCount(d.pairCount)}`;
  return `${pairsCount(d.pairCount)} · ${d.blocks[0].start}–${d.blocks[d.blocks.length - 1].end}`;
}

/** «5–10 октября · 13 пар · 6 предметов · 7 педагогов» — только у другой недели. */
export function weekStatsLine(days: DayData[], lessons: Lesson[]): string {
  const withPairs = days.filter(d => d.blocks.length);
  const first = days[0].date;
  // Конец диапазона — суббота, если в воскресенье пар нет (как на макете «5–10 октября»)
  const last = days[6].blocks.length ? days[6].date : days[5].date;
  const subjects = new Set(lessons.map(l => l.subject)).size;
  const teachers = new Set(lessons.map(l => l.teacher?.id).filter(v => v != null)).size;
  const n = withPairs.reduce((s, d) => s + d.pairCount, 0);
  return [
    rangeLabel(first, last),
    pairsCount(n),
    `${subjects} ${plural(subjects, 'предмет', 'предмета', 'предметов')}`,
    `${teachers} ${plural(teachers, 'педагог', 'педагога', 'педагогов')}`,
  ].join(' · ');
}

// ─── Тип занятия ───────────────────────────────────────────────────────────

export type KindPalette = 'lecture' | 'practice' | 'exam' | 'neutral';

/** Подпись и цвет бейджа. null — тип не указан, бейджа нет. */
export function lessonKind(type: string | null): { label: string; palette: KindPalette } | null {
  const t = (type ?? '').trim();
  if (!t) return null;
  const u = t.toUpperCase();
  if (u === 'ЛК' || u.startsWith('ЛЕКЦ')) return { label: 'Лекция', palette: 'lecture' };
  if (u === 'ПЗ' || u.startsWith('ПРАКТ')) return { label: 'Практика', palette: 'practice' };
  if (u.startsWith('СЕМИНАР')) return { label: 'Семинар', palette: 'practice' };
  if (u.startsWith('ЛАБ')) return { label: 'Лаб. работа', palette: 'practice' };
  if (u.startsWith('ЭКЗ')) return { label: 'Экзамен', palette: 'exam' };
  if (u.startsWith('ЗАЧ')) return { label: 'Зачёт', palette: 'exam' };
  if (u.startsWith('КОНС')) return { label: 'Консультация', palette: 'exam' };
  if (u.startsWith('РЕЙТ')) return { label: 'Рейтинг', palette: 'exam' };
  if (u === 'ПОТОК') return { label: 'Поток', palette: 'neutral' };
  const sub = u.match(/^(\d)\s*-?\s*АЯ\s*П\/ГР/);
  if (sub) return { label: `${sub[1]}-я подгруппа`, palette: 'neutral' };
  return { label: cap(t.toLowerCase()), palette: 'neutral' };
}

/** Пропуск отмечают не на экзаменах, зачётах и консультациях — как раньше. */
export const attendanceApplies = (type: string | null) => !/экзамен|зач|конс/i.test(type ?? '');

// ─── Отсчёт ────────────────────────────────────────────────────────────────

export type LeftParts = { lessThanMinute: true } | { lessThanMinute: false; parts: Array<{ n: string; u: string }>; minutes: number };

/** «43 мин», «1 ч 05 мин», «меньше минуты». Минуты — с округлением вверх,
 *  чтобы совпадало с разницей по часам: 10:32 → 11:15 = 43 мин. */
export function leftParts(ms: number): LeftParts {
  if (ms < 60_000) return { lessThanMinute: true };
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return { lessThanMinute: false, minutes, parts: [{ n: String(minutes), u: 'мин' }] };
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return {
    lessThanMinute: false,
    minutes,
    parts: m ? [{ n: String(h), u: 'ч' }, { n: pad2(m), u: 'мин' }] : [{ n: String(h), u: 'ч' }],
  };
}

/** Для экранного диктора: «1 час 5 минут», «43 минуты». */
export function leftSpoken(ms: number): string {
  const p = leftParts(ms);
  if (p.lessThanMinute) return 'меньше минуты';
  const h = Math.floor(p.minutes / 60);
  const m = p.minutes % 60;
  const hs = h ? `${h} ${plural(h, 'час', 'часа', 'часов')}` : '';
  const ms_ = m ? `${m} ${plural(m, 'минута', 'минуты', 'минут')}` : '';
  return [hs, ms_].filter(Boolean).join(' ');
}

// ─── Раскрытая карточка ────────────────────────────────────────────────────

export type WeekRel = 'current' | 'future' | 'past';

export function weekRel(weekStart: string, now: Date): WeekRel {
  const today = isoOf(now);
  if (today < weekStart) return 'future';
  if (today > addDays(weekStart, 6)) return 'past';
  return 'current';
}

/**
 * live — идёт пара; break — перемена или перерыв между парами сегодня;
 * morning — сегодня пары ещё не начинались; doneToday — на сегодня всё;
 * noneToday — сегодня пар нет; nextWeek — открыта следующая неделя.
 */
export type FocusKind = 'live' | 'break' | 'morning' | 'doneToday' | 'noneToday' | 'nextWeek';

export interface Focus {
  kind: FocusKind;
  block: Block;
  /** Пара внутри блока, о которой говорит пилюля (у сдвоенной — текущий слот). */
  slot: Lesson;
  pill: string;
  /** Залитая акцентом карточка с отсчётом (live/break/morning). */
  filled: boolean;
  countdownLabel: 'до конца' | 'до начала' | null;
  /** Отсчёт идёт до этого момента. */
  targetAt: number | null;
  /** Начало полосы прогресса; null — полосы нет. */
  progressFrom: number | null;
}

const DAY_IN = ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'];

function whenPhrase(date: string, today: string): string {
  if (diffDays(today, date) === 1) return 'завтра';
  return DAY_IN[(parseIso(date).getDay() + 6) % 7];
}

interface Slot { lesson: Lesson; block: Block; startAt: number; endAt: number }

function slotsOf(b: Block): Slot[] {
  return b.lessons.map(l => ({
    lesson: l, block: b, startAt: atMs(b.date, l.pair_time_start), endAt: atMs(b.date, l.pair_time_end),
  }));
}

/** Какая пара раскрыта и как. null — раскрывать нечего (прошлая неделя, пары кончились). */
export function computeFocus(now: Date, days: DayData[], rel: WeekRel): Focus | null {
  const blocks = days.flatMap(d => d.blocks);
  if (!blocks.length || rel === 'past') return null;

  if (rel === 'future') {
    const b = blocks[0];
    return {
      kind: 'nextWeek', block: b, slot: b.lessons[0], pill: `Следующая пара · ${b.pairs[0]}`,
      filled: false, countdownLabel: null, targetAt: null, progressFrom: null,
    };
  }

  const t = now.getTime();
  const today = isoOf(now);
  const todaySlots = blocks.filter(b => b.date === today).flatMap(slotsOf);

  const live = todaySlots.find(s => t >= s.startAt && t < s.endAt);
  if (live) {
    return {
      kind: 'live', block: live.block, slot: live.lesson, pill: `Идёт · ${live.lesson.pair_number} пара`,
      filled: true, countdownLabel: 'до конца', targetAt: live.endAt, progressFrom: live.startAt,
    };
  }

  const nextIdx = todaySlots.findIndex(s => s.startAt > t);
  if (nextIdx >= 0) {
    const next = todaySlots[nextIdx];
    const prev = nextIdx > 0 ? todaySlots[nextIdx - 1] : null;
    if (prev) {
      // Любой промежуток после сегодняшней пары, и обед тоже, — «Перемена» (решение владельца)
      return {
        kind: 'break', block: next.block, slot: next.lesson,
        pill: `Перемена · ${next.lesson.pair_number} пара`,
        filled: true, countdownLabel: 'до начала', targetAt: next.startAt, progressFrom: prev.endAt,
      };
    }
    return {
      kind: 'morning', block: next.block, slot: next.lesson, pill: `Сегодня · ${next.lesson.pair_number} пара`,
      filled: true, countdownLabel: 'до начала', targetAt: next.startAt, progressFrom: null,
    };
  }

  const later = blocks.find(b => b.date > today);
  if (!later) return null;
  const hadToday = todaySlots.length > 0;
  return {
    kind: hadToday ? 'doneToday' : 'noneToday',
    block: later,
    slot: later.lessons[0],
    pill: hadToday
      ? `Первая пара ${whenPhrase(later.date, today)} · ${later.pairs[0]}`
      : `Следующая пара · ${later.pairs[0]}`,
    filled: false, countdownLabel: null, targetAt: null, progressFrom: null,
  };
}

/** Сегодня пары были и все кончились — для линии «14:10 · на сегодня всё». */
export function doneTodayAt(now: Date, days: DayData[]): boolean {
  const today = days.find(d => d.date === isoOf(now));
  if (!today || !today.blocks.length) return false;
  return today.blocks[today.blocks.length - 1].endAt <= now.getTime();
}

/** Пара уже прошла (серым) — только для текущей недели. */
export const isPast = (b: Block, now: Date) => b.endAt <= now.getTime();

/**
 * Ключ состояния ленты: меняется только на границах пар и в полночь. Экран
 * перерисовывает ленту, когда он изменился, — а не каждые 30 секунд.
 */
export function stateKey(now: Date, days: DayData[], rel: WeekRel): string {
  const f = computeFocus(now, days, rel);
  const ended = days.reduce((n, d) => n + d.blocks.filter(b => isPast(b, now)).length, 0);
  return `${isoOf(now)}|${f ? `${f.kind}|${f.block.key}|${f.slot.pair_number}` : '-'}|${ended}|${doneTodayAt(now, days)}`;
}

/**
 * В текущей неделе больше нет пар (суббота после последней, воскресенье,
 * пятница вечером при пустой субботе) — по умолчанию открываем следующую.
 */
export function weekIsOver(now: Date, days: DayData[]): boolean {
  const t = now.getTime();
  return !days.some(d => d.blocks.some(b => b.endAt > t));
}

// ─── Аудитории в раскрытой карточке ─────────────────────────────────────────

/**
 * «404 401» → ['404', '401']: в раскрытой карточке каждая аудитория своей
 * строкой, одна под другой (просьба владельца, 7 окт 2026), а не рядом.
 */
export const roomLines = (name: string | null | undefined): string[] =>
  (name ?? '').trim().split(/\s+/).filter(Boolean);

// ─── Приветствие ───────────────────────────────────────────────────────────

/** «Доброе утро» — по часам: 5–11 утро, 12–17 день, 18–22 вечер, иначе ночь. */
export function partOfDay(now: Date): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'Доброе утро';
  if (h >= 12 && h < 18) return 'Добрый день';
  if (h >= 18 && h < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

/**
 * Вторая половина строки приветствия — главное о сегодняшнем дне своей
 * группы: «сегодня 3 пары, первая в 09:45», «осталось ещё 2 пары»,
 * «идёт последняя пара», «на сегодня всё», «сегодня пар нет».
 */
export function greetingRest(now: Date, today: DayData | undefined): string {
  if (!today || !today.blocks.length) return 'сегодня пар нет';
  const t = now.getTime();
  const first = today.blocks[0];
  const last = today.blocks[today.blocks.length - 1];
  if (last.endAt <= t) return 'на сегодня всё';
  if (first.startAt > t) {
    const n = today.pairCount;
    return `сегодня ${n} ${plural(n, 'пара', 'пары', 'пар')}, первая в ${first.start}`;
  }
  const left = today.blocks.filter(b => b.startAt > t).reduce((n, b) => n + b.pairs.length, 0);
  return left > 0 ? `осталось ещё ${left} ${plural(left, 'пара', 'пары', 'пар')}` : 'идёт последняя пара';
}

// ─── Шапка ─────────────────────────────────────────────────────────────────

/** Крупная строка шапки: сегодняшняя дата или «Следующая неделя». */
export function headerTitle(weekStart: string, now: Date): string {
  const r = weekRel(weekStart, now);
  if (r === 'current') return dayTitle(isoOf(now));
  const thisMonday = addDays(isoOf(now), -((now.getDay() + 6) % 7));
  const diff = diffDays(thisMonday, weekStart);
  if (diff === 7) return 'Следующая неделя';
  if (diff === -7) return 'Прошлая неделя';
  return cap(rangeLabel(weekStart, addDays(weekStart, 5)));
}

/** Подпись недели в нижнем листе. */
export function weekName(weekStart: string, now: Date): string {
  if (weekRel(weekStart, now) === 'current') return 'Эта неделя';
  return headerTitle(weekStart, now);
}

// ─── Доступность ───────────────────────────────────────────────────────────

const ORDINAL: Record<string, string> = { I: 'первая', II: 'вторая', III: 'третья', IV: 'четвёртая', V: 'пятая' };

const speakTime = (t: string) => t.replace(/^0/, '');

/** «Вторая пара, 9:45–11:15, Численные методы, практика, Хайбуллоев Д.А., аудитория 702» */
export function blockA11y(b: Block, status?: string): string {
  const ords = b.pairs.map(p => ORDINAL[p] ?? p);
  const pairs = ords.length > 1
    ? `${cap(ords.slice(0, -1).join(', '))} и ${ords[ords.length - 1]} пары`
    : `${cap(ords[0])} пара`;
  const l = b.lessons[0];
  const kind = lessonKind(l.lesson_type);
  return [
    pairs,
    `${speakTime(b.start)}–${speakTime(b.end)}`,
    l.subject,
    kind?.label.toLowerCase(),
    l.teacher?.name,
    l.room ? `аудитория ${l.room.name}` : 'аудитория не указана',
    status,
  ].filter(Boolean).join(', ');
}

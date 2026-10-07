/**
 * Логика вкладки «Педагоги» без React: поиск, буквы, статус в списке,
 * неделя педагога, раскрытая карточка, пустые состояния.
 *
 * Всё считается по часам телефона и спискам пар — без сети. Проверяется
 * временным скриптом с поддельными часами и реальными данными.
 */
import type { Lesson, Teacher } from '../api';
import { DAYS_ORDER, PAIR_NUMBERS, shortGroupName } from '../api';
import type { Block, DayData, WeekRel } from '../schedule/state';
import {
  addDays, atMs, dayTitle, diffDays, isoOf, leftSpoken, parseIso, plural, rangeLabel, toMin, lessonKind,
} from '../schedule/state';

// ─── Нормализация и поиск ──────────────────────────────────────────────────

/** ё = е, таджикские буквы — как русские (ТЗ, раздел 2). */
const CHAR_MAP: Record<string, string> = {
  'ё': 'е', 'ҳ': 'х', 'ӯ': 'у', 'ҷ': 'ч', 'қ': 'к', 'ғ': 'г', 'ӣ': 'и',
};

export interface Norm {
  text: string;
  /** map[i] — индекс в исходной строке символа text[i]. */
  map: number[];
}

/**
 * Нижний регистр, замены букв, точки выброшены, пробелы и запятые — один
 * пробел между словами. «Балхова С.Я., Собко В.И.» → «балхова ся собко ви».
 */
export function normalize(s: string): Norm {
  let text = '';
  const map: number[] = [];
  const lower = (s ?? '').toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    if (ch === '.') continue;
    if (/[\s,;\-–—]/.test(ch)) {
      if (text.length && text[text.length - 1] !== ' ') { text += ' '; map.push(i); }
      continue;
    }
    text += CHAR_MAP[ch] ?? ch;
    map.push(i);
  }
  if (text.endsWith(' ')) { text = text.slice(0, -1); map.pop(); }
  return { text, map };
}

export const normKey = (s: string) => normalize(s).text;

export interface Match {
  teacher: Teacher;
  /** Совпавший кусок в исходном ФИО: [начало, конец). */
  range: [number, number];
}

/** Совпадение с начала любого слова записи. null — запрос пустой. */
export function searchTeachers(list: Teacher[], query: string): Match[] | null {
  const q = normKey(query);
  if (!q) return null;
  const out: Match[] = [];
  for (const t of list) {
    const n = normalize(t.name);
    let at = -1;
    for (let i = 0; i <= n.text.length - q.length; i++) {
      if ((i === 0 || n.text[i - 1] === ' ') && n.text.startsWith(q, i)) { at = i; break; }
    }
    if (at < 0) continue;
    out.push({ teacher: t, range: [n.map[at], n.map[at + q.length - 1] + 1] });
  }
  return out;
}

/** «1 совпадение», «3 совпадения», «12 совпадений», «21 совпадение». */
export const matchesLabel = (n: number) => `${n} ${plural(n, 'совпадение', 'совпадения', 'совпадений')}`;

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Фамилии записи: «Балхова С.Я., Собко В.И.» → балхова, собко. */
export const surnamesOf = (name: string): string[] =>
  name.split(',').map(p => normKey(p).split(' ')[0]).filter(Boolean);

/**
 * «Похожая фамилия» при нуле совпадений: расстояние Левенштейна ≤ 2 от
 * первого слова запроса до фамилий из данных. Запрос короче 3 букв не
 * сравниваем — с ним «похожи» почти все короткие фамилии.
 */
export function similarTeachers(list: Teacher[], query: string, max = 2): Teacher[] {
  const q = normKey(query).split(' ')[0] ?? '';
  if (q.length < 3) return [];
  const scored: Array<{ t: Teacher; d: number }> = [];
  for (const t of list) {
    const d = Math.min(...surnamesOf(t.name).map(s => levenshtein(q, s)));
    if (d <= 2) scored.push({ t, d });
  }
  return scored.sort((a, b) => a.d - b.d).slice(0, max).map(x => x.t);
}

// ─── Алфавит ───────────────────────────────────────────────────────────────

export function sortTeachers(list: Teacher[]): Teacher[] {
  return list
    .map(t => ({ t, key: normKey(t.name) }))
    .sort((a, b) => a.key.localeCompare(b.key, 'ru') || a.t.id - b.t.id)
    .map(x => x.t);
}

/** Буква секции — первая буква нормализованной строки («Ҳакимов» → «Х»). */
export const letterOf = (name: string) => (normKey(name)[0] ?? '#').toUpperCase();

export interface Section { letter: string; teachers: Teacher[] }

/** Секции по буквам; список уже отсортирован (sortTeachers). */
export function buildSections(sorted: Teacher[]): Section[] {
  const out: Section[] = [];
  for (const t of sorted) {
    const l = letterOf(t.name);
    const last = out[out.length - 1];
    if (last && last.letter === l) last.teachers.push(t);
    else out.push({ letter: l, teachers: [t] });
  }
  return out;
}

/** Объединение списков нескольких недель по id, без склейки похожих имён. */
export function mergeTeacherLists(lists: Array<Teacher[] | null | undefined>): Teacher[] {
  const byId = new Map<number, Teacher>();
  for (const l of lists) for (const t of l ?? []) if (!byId.has(t.id)) byId.set(t.id, t);
  return sortTeachers([...byId.values()]);
}

/** Недавние: открытый — первым, без повторов, не больше трёх. */
export const pushRecent = (ids: number[], id: number): number[] => [id, ...ids.filter(x => x !== id)].slice(0, 3);

const WEEKDAY = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

/** «85 педагогов · сегодня вторник» */
export const listSummary = (n: number, now: Date) =>
  `${n} ${plural(n, 'педагог', 'педагога', 'педагогов')} · сегодня ${WEEKDAY[now.getDay()]}`;

// ─── Недели ────────────────────────────────────────────────────────────────

export const mondayOf = (iso: string) => addDays(iso, -((parseIso(iso).getDay() + 6) % 7));

/**
 * Недели, из которых собирается список: эта и следующая (у кого пары только
 * на следующей — тоже в списке, со статусом «На этой неделе пар нет»).
 * Неопубликованные пропускаем; если нет ни той ни другой (каникулы) —
 * последняя опубликованная. weeksAll = null — список недель неизвестен.
 */
export function listWeeks(weeksAll: Array<{ week_start: string; is_latest: boolean }> | null, today: string): string[] {
  const cur = mondayOf(today);
  const both = [cur, addDays(cur, 7)];
  if (!weeksAll) return both;
  const have = both.filter(w => weeksAll.some(x => x.week_start === w));
  if (have.length) return have;
  const latest = weeksAll.find(w => w.is_latest) ?? weeksAll[0];
  return latest ? [latest.week_start] : [];
}

/** «5–11 октября» — неделя целиком, пн–вс. */
export const weekRange = (weekStart: string) => rangeLabel(weekStart, addDays(weekStart, 6));

// ─── Неделя педагога ───────────────────────────────────────────────────────

export interface GroupRef { id: number; name: string; year: number; chip: string }

/** «ПМиИ-3»: короткое название направления и курс. */
export const groupChip = (g: { name: string; year: number }) => `${shortGroupName(g.name)}-${g.year}`;

/**
 * Строка ленты педагога. lessons — по одной паре на слот (для номеров пар
 * и времени), groups — все группы строки.
 */
export interface TBlock extends Block {
  subject: string;
  type: string | null;
  room: string | null;
  groups: GroupRef[];
}

export interface TDay extends DayData { blocks: TBlock[] }

const pairIdx = (p: string) => PAIR_NUMBERS.indexOf(p);

function lessonDate(l: Lesson, weekStart: string): string {
  if (l.lesson_date) return l.lesson_date;
  const i = DAYS_ORDER.indexOf(l.day_of_week);
  return addDays(weekStart, i < 0 ? 0 : i);
}

interface Row { pair: string; sig: string; lessons: Lesson[]; groups: GroupRef[]; groupSig: string }

const sigOf = (l: Lesson) => `${l.subject}\u0001${l.lesson_type ?? ''}\u0001${l.room?.name ?? ''}`;

function groupsOf(ls: Lesson[]): GroupRef[] {
  const byId = new Map<number, GroupRef>();
  for (const l of ls) {
    if (l.group && !byId.has(l.group.id)) {
      byId.set(l.group.id, { id: l.group.id, name: l.group.name, year: l.group.year, chip: groupChip(l.group) });
    }
  }
  return [...byId.values()].sort((a, b) => a.chip.localeCompare(b.chip, 'ru'));
}

/**
 * Семь дней недели педагога. Пары одного слота с тем же предметом, типом и
 * аудиторией — одна строка с несколькими группами; разные предметы в одном
 * слоте — разные строки. Соседние пары не склеиваются — каждая своей строкой
 * (решение владельца, 7 окт 2026; раньше было «14:00 / 17:15 / 2 пары»).
 */
export function buildTeacherWeek(lessons: Lesson[], weekStart: string): TDay[] {
  return DAYS_ORDER.map((day, dayIndex) => {
    const date = addDays(weekStart, dayIndex);
    const own = lessons.filter(l => l.day_of_week === day);

    const rows: Row[] = [];
    for (const pair of PAIR_NUMBERS) {
      const inSlot = own.filter(l => l.pair_number === pair);
      const sigs = [...new Set(inSlot.map(sigOf))].sort((a, b) => a.localeCompare(b, 'ru'));
      for (const sig of sigs) {
        const ls = inSlot.filter(l => sigOf(l) === sig);
        const groups = groupsOf(ls);
        rows.push({ pair, sig, lessons: ls, groups, groupSig: groups.map(g => g.id).join(',') });
      }
    }

    const runs: Row[][] = rows.map(r => [r]);

    const blocks: TBlock[] = runs.map(run => {
      const reps = run.map(r => r.lessons[0]);
      const first = reps[0];
      const last = reps[reps.length - 1];
      const d = lessonDate(first, weekStart);
      return {
        key: `${d}|${first.pair_number}|${run[0].sig}`,
        lessons: reps,
        day,
        date: d,
        pairs: reps.map(l => l.pair_number),
        start: first.pair_time_start,
        end: last.pair_time_end,
        startAt: atMs(d, first.pair_time_start),
        endAt: atMs(d, last.pair_time_end),
        subject: first.subject,
        type: first.lesson_type,
        room: first.room?.name ?? null,
        groups: run[0].groups,
      };
    }).sort((a, b) => a.startAt - b.startAt || toMin(a.end) - toMin(b.end) || a.subject.localeCompare(b.subject, 'ru'));

    const pairCount = new Set(own.map(l => l.pair_number)).size;
    return { day, dayIndex, date, blocks, pairCount };
  });
}

export const weekPairCount = (days: TDay[]) => days.reduce((n, d) => n + d.pairCount, 0);

/** Подпись в конце дня: «после 13:00 пар нет» (нейтрально по роду). */
export const dayEndLabel = (last: Block) => `после ${last.end} пар нет`;

/** Сводка под ФИО: «9 пар» жирно + « на этой неделе · сегодня 2». */
export function teacherSummary(days: TDay[], rel: WeekRel, now: Date): { strong: string; rest: string } {
  const n = weekPairCount(days);
  const which = rel === 'future' ? 'на следующей неделе' : 'на этой неделе';
  if (!n) return { strong: '', rest: `${rel === 'future' ? 'На следующей' : 'На этой'} неделе пар нет` };
  let rest = ` ${which}`;
  if (rel === 'current') {
    const today = days.find(d => d.date === isoOf(now));
    if (today && today.pairCount) rest += ` · сегодня ${today.pairCount}`;
  }
  return { strong: `${n} ${plural(n, 'пара', 'пары', 'пар')}`, rest };
}

// ─── Статус в строке списка ────────────────────────────────────────────────

export type StatusKind = 'now' | 'later' | 'done' | 'noneToday' | 'noneWeek';

export interface ListStatus {
  kind: StatusKind;
  text: string;
  /** Для «Сейчас»: номер аудитории (жирно) и конец. */
  room: string | null;
  until: string | null;
  spoken: string;
}

/**
 * Статус по текущим дате и времени (ТЗ, раздел 8). lessons — пары педагога
 * на текущей неделе; undefined — данных нет, статуса нет.
 */
export function teacherStatus(now: Date, lessons: Lesson[] | null | undefined): ListStatus | null {
  if (!lessons) return null;
  const today = isoOf(now);
  const weekStart = mondayOf(today);
  if (!lessons.length) return { kind: 'noneWeek', text: 'На этой неделе пар нет', room: null, until: null, spoken: 'На этой неделе пар нет' };
  const days = buildTeacherWeek(lessons, weekStart);
  const blocks = days.find(d => d.date === today)?.blocks ?? [];
  const t = now.getTime();

  const live = blocks.find(b => t >= b.startAt && t < b.endAt);
  if (live) {
    const room = live.room;
    return {
      kind: 'now',
      text: `Сейчас${room ? ` · ауд. ${room}` : ''} · до ${live.end}`,
      room,
      until: live.end,
      spoken: `Сейчас пара${room ? ` в аудитории ${room}` : ''} до ${live.end}`,
    };
  }
  const next = blocks.find(b => b.startAt > t);
  if (next) {
    return {
      kind: 'later',
      text: `Сегодня с ${next.start}${next.room ? ` · ауд. ${next.room}` : ''}`,
      room: next.room,
      until: null,
      spoken: `Сегодня пара с ${next.start}${next.room ? ` в аудитории ${next.room}` : ''}`,
    };
  }
  if (blocks.length) return { kind: 'done', text: 'Сегодня пар больше нет', room: null, until: null, spoken: 'Сегодня пар больше нет' };
  return { kind: 'noneToday', text: 'Сегодня пар нет', room: null, until: null, spoken: 'Сегодня пар нет' };
}

// ─── Раскрытая карточка ────────────────────────────────────────────────────

export type TFocusKind = 'live' | 'break' | 'calm';

export interface TFocus {
  kind: TFocusKind;
  block: TBlock;
  /** Пара внутри блока, о которой говорит пилюля (у сдвоенной — текущий слот). */
  slot: Lesson;
  pill: string;
  /** Заливка accent (идёт / перемена) или accent-soft (спокойная). */
  filled: boolean;
  countdownLabel: 'до конца' | 'до начала' | 'через' | null;
  targetAt: number | null;
  progressFrom: number | null;
}

const BREAK_WINDOW_MS = 60 * 60_000;
const DAY_NOM = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

interface TSlot { lesson: Lesson; block: TBlock; startAt: number; endAt: number }

function slotsOf(b: TBlock): TSlot[] {
  return b.lessons.map(l => ({
    lesson: l, block: b, startAt: atMs(b.date, l.pair_time_start), endAt: atMs(b.date, l.pair_time_end),
  }));
}

/** «Сегодня», «Завтра», «Четверг» — первое слово пилюли спокойной карточки. */
function dayWord(date: string, today: string): string {
  const diff = diffDays(today, date);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  return DAY_NOM[(parseIso(date).getDay() + 6) % 7];
}

function calm(s: TSlot, today: string, t: number): TFocus {
  // Отсчёт «через …» — только на сегодня и завтра, без «через 45 ч»
  const near = diffDays(today, s.block.date) <= 1 && s.startAt > t;
  return {
    kind: 'calm', block: s.block, slot: s.lesson,
    pill: `${dayWord(s.block.date, today)} · ${s.lesson.pair_number} пара`,
    filled: false, countdownLabel: near ? 'через' : null, targetAt: near ? s.startAt : null, progressFrom: null,
  };
}

/**
 * Ближайшая пара выбранной недели (ТЗ, раздел 8): идущая; иначе первая с
 * началом позже текущего времени. «Перемена» — если до начала ≤ 60 мин и
 * сегодня уже была пара; иначе спокойная карточка. На следующей неделе —
 * первая пара. null — раскрывать нечего.
 */
export function teacherFocus(now: Date, days: TDay[], rel: WeekRel): TFocus | null {
  const slots = days.flatMap(d => d.blocks).flatMap(slotsOf).sort((a, b) => a.startAt - b.startAt);
  if (!slots.length || rel === 'past') return null;
  const t = now.getTime();
  const today = isoOf(now);
  if (rel === 'future') return calm(slots[0], today, t);

  const live = slots.find(s => s.block.date === today && t >= s.startAt && t < s.endAt);
  if (live) {
    return {
      kind: 'live', block: live.block, slot: live.lesson, pill: `Идёт · ${live.lesson.pair_number} пара`,
      filled: true, countdownLabel: 'до конца', targetAt: live.endAt, progressFrom: live.startAt,
    };
  }
  const next = slots.find(s => s.startAt > t);
  if (!next) return null;
  if (next.block.date === today) {
    const ended = slots.filter(s => s.block.date === today && s.endAt <= t);
    const prev = ended[ended.length - 1];
    if (prev && next.startAt - t <= BREAK_WINDOW_MS) {
      return {
        kind: 'break', block: next.block, slot: next.lesson, pill: `Перемена · ${next.lesson.pair_number} пара`,
        filled: true, countdownLabel: 'до начала', targetAt: next.startAt, progressFrom: prev.endAt,
      };
    }
  }
  return calm(next, today, t);
}

/** Ключ состояния: меняется на границах пар, на пороге «перемены» и в полночь. */
export function teacherStateKey(now: Date, days: TDay[], rel: WeekRel): string {
  const f = teacherFocus(now, days, rel);
  const t = now.getTime();
  const ended = days.reduce((n, d) => n + d.blocks.filter(b => b.endAt <= t).length, 0);
  return `${isoOf(now)}|${f ? `${f.kind}|${f.block.key}|${f.slot.pair_number}|${f.countdownLabel}` : '-'}|${ended}`;
}

/**
 * Какую неделю открыть: в воскресенье — следующую; в субботу — тоже, если
 * пары педагога на этой неделе кончились (как в «Расписании»). Если
 * следующая неделя ещё не опубликована — текущую.
 */
export function defaultWeek(now: Date, thisDays: TDay[] | null, nextPublished: boolean): 'this' | 'next' {
  if (!nextPublished) return 'this';
  const dow = now.getDay();
  if (dow === 0) return 'next';
  if (dow === 6 && thisDays && !thisDays.some(d => d.blocks.some(b => b.endAt > now.getTime()))) return 'next';
  return 'this';
}

// ─── Пустая неделя ─────────────────────────────────────────────────────────

const DAY_GEN = ['понедельника', 'вторника', 'среды', 'четверга', 'пятницы', 'субботы', 'воскресенья'];
const DAY_ACC = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export interface EmptyInfo {
  title: string;
  /** «Ближайшая — » + жирная дата + « , ауд. 411». */
  nearest: { lead: string; strong: string; tail: string } | null;
  text: string | null;
  showNext: boolean;
}

/**
 * Карточка «пар нет» для выбранной недели. nextDays — следующая неделя:
 * null — не опубликована, undefined — ещё не загружена.
 */
export function emptyWeekInfo(which: 'this' | 'next', nextDays: TDay[] | null | undefined): EmptyInfo {
  if (which === 'next') return { title: 'На следующей неделе пар нет', nearest: null, text: null, showNext: false };
  if (nextDays === null) {
    return { title: 'На этой неделе пар нет', nearest: null, text: 'Расписание на следующую неделю ещё не опубликовано.', showNext: false };
  }
  const first = nextDays?.flatMap(d => d.blocks)[0];
  if (!nextDays) return { title: 'На этой неделе пар нет', nearest: null, text: null, showNext: false };
  if (!first) return { title: 'Пар нет ни на этой, ни на следующей неделе', nearest: null, text: null, showNext: false };
  const d = parseIso(first.date);
  const wd = (d.getDay() + 6) % 7;
  return {
    title: `Пар нет до ${DAY_GEN[wd]}`,
    nearest: {
      lead: 'Ближайшая — ',
      strong: `${DAY_ACC[wd]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${first.start}`,
      tail: first.room ? `, ауд. ${first.room}` : '',
    },
    text: null,
    showNext: true,
  };
}

// ─── Доступность ───────────────────────────────────────────────────────────

const ORDINAL: Record<string, string> = { I: 'первая', II: 'вторая', III: 'третья', IV: 'четвёртая', V: 'пятая' };
const speakTime = (t: string) => t.replace(/^0/, '');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function pairsSpoken(pairs: string[]): string {
  const ords = pairs.map(p => ORDINAL[p] ?? p);
  return ords.length > 1
    ? `${ords.slice(0, -1).join(', ')} и ${ords[ords.length - 1]} пары`
    : `${ords[0]} пара`;
}

/** Строка пары: «Вторая пара, 9:45–11:15, Численные методы, практика, группы ПМиИ-3, аудитория 702». */
export function tBlockA11y(b: TBlock, status?: string): string {
  const kind = lessonKind(b.type);
  return [
    cap(pairsSpoken(b.pairs)),
    `${speakTime(b.start)}–${speakTime(b.end)}`,
    b.subject,
    kind?.label.toLowerCase(),
    b.groups.length ? `${b.groups.length > 1 ? 'группы' : 'группа'} ${b.groups.map(g => g.chip).join(', ')}` : null,
    b.room ? `аудитория ${b.room}` : 'аудитория не указана',
    status,
  ].filter(Boolean).join(', ');
}

/** Раскрытая карточка одной фразой: «Идёт вторая пара, с 9:45 до 11:15, аудитория 702, …, до конца 43 минуты». */
export function focusA11y(f: TFocus, leftMs: number | null): string {
  const b = f.block;
  const kind = lessonKind(b.type);
  const pairs = pairsSpoken(b.pairs);
  const head = f.kind === 'live' ? `Идёт ${pairs}`
    : f.kind === 'break' ? `Перемена, следующая — ${pairs}`
    : `${f.pill.split(' · ')[0]} ${pairs}`;
  return [
    head,
    `с ${speakTime(b.start)} до ${speakTime(b.end)}`,
    b.room ? `аудитория ${b.room}` : 'аудитория не указана',
    b.subject,
    kind?.label.toLowerCase(),
    leftMs != null && f.countdownLabel ? `${f.countdownLabel} ${leftSpoken(Math.max(0, leftMs))}` : null,
  ].filter(Boolean).join(', ');
}

export { dayTitle };

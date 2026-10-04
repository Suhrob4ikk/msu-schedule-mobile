/**
 * Логика «Уведомлений» и «Истории изменений» без React: «Было / Стало»,
 * заголовки и даты, группировка по дням, склонения, фильтры, отметки
 * «прочитано», срок 30 дней, отбор Истории и подгрузка порциями.
 *
 * Данные — записи /schedule/changes как есть (ТЗ расходится с сервером, см.
 * CLAUDE.md, «Уведомления и История»). Проверяется временным скриптом на
 * записях в точном формате сервера: с old_details/new_details, старых — только
 * с old_value/new_value — и «новой неделе».
 */
import type { Change, Group } from '../api';
import { DAYS_ORDER, shortGroupName } from '../api';
import { addDays, dayTitle, diffDays, isoOf, lessonKind, plural, rangeLabel } from '../schedule/state';

// ─── Запись изменения ──────────────────────────────────────────────────────

/** Описание пары до или после — JSON сервера {subject, room, teacher, lesson_type}. */
export interface ChangeDetails {
  subject?: string | null;
  room?: string | null;
  teacher?: string | null;
  lesson_type?: string | null;
}

/** Запись /schedule/changes. old_details/new_details — с 4 окт 2026, у старых записей их нет. */
export interface ChangeRec extends Change {
  old_details?: ChangeDetails | null;
  new_details?: ChangeDetails | null;
}

export type ChangeKind = 'new_week' | 'added' | 'removed' | 'changed';

/** Тип записи. Сервер пишет changed; modified (так в ТЗ) понимаем тоже. Незнакомый — null, запись не показываем. */
export function changeKind(t: string): ChangeKind | null {
  if (t === 'new_week' || t === 'added' || t === 'removed') return t;
  if (t === 'changed' || t === 'modified') return 'changed';
  return null;
}

export const KIND_LABEL: Record<ChangeKind, string> = {
  new_week: 'Новая неделя', added: 'Добавлено', removed: 'Удалено', changed: 'Изменено',
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Дата пары изменения: начало недели + день. null — у записи нет недели или дня. */
export function changeDate(c: Pick<Change, 'week_start' | 'day_of_week'>): string | null {
  if (!c.week_start || !c.day_of_week) return null;
  const i = DAYS_ORDER.indexOf(c.day_of_week.toLowerCase());
  return i < 0 ? null : addDays(c.week_start, i);
}

/** «5–10 октября»: учебная неделя пн–сб. */
export const studyWeekRange = (weekStart: string) => rangeLabel(weekStart, addDays(weekStart, 5));

/** Заголовок строки: «Среда, 7 октября · III пара»; у новой недели — «Вышло расписание на 5–10 октября». */
export function whenTitle(c: ChangeRec): string {
  if (changeKind(c.change_type) === 'new_week') {
    return c.week_start ? `Вышло расписание на ${studyWeekRange(c.week_start)}` : 'Вышло новое расписание';
  }
  const date = changeDate(c);
  const day = date ? dayTitle(date) : c.day_of_week ? cap(c.day_of_week) : null;
  const pair = c.pair_number ? `${c.pair_number} пара` : null;
  return [day, pair].filter(Boolean).join(' · ') || 'Изменение расписания';
}

// ─── «Было / Стало» ────────────────────────────────────────────────────────

export interface Diff {
  /** Строка предмета — когда предмет не менялся (ТЗ, раздел 8). */
  subject: string | null;
  before: string | null;
  after: string | null;
}

type Field = 'subject' | 'room' | 'teacher' | 'lesson_type';

const INITIALS = /[А-ЯЁ]\.[А-ЯЁ]/;
const str = (v: string | null | undefined) => (v ?? '').trim();
const teacherSet = (name: string) =>
  name.split(',').map(p => p.replace(/\s+/g, '').toLowerCase()).filter(Boolean).sort().join('|');

/**
 * Какие поля пары поменялись — тем же правилом, что у сервера (_diff_fields
 * в backend/app/services/sync.py): аудитория и тип без учёта регистра,
 * преподаватели — как множество и только когда с обеих сторон ФИО с
 * инициалами (код кафедры → фамилия — не замена преподавателя).
 */
export function changedFields(o: ChangeDetails, n: ChangeDetails): Field[] {
  const out: Field[] = [];
  if (str(o.subject) !== str(n.subject)) out.push('subject');
  if (str(o.room).toLowerCase() !== str(n.room).toLowerCase()) out.push('room');
  if (str(o.lesson_type).toLowerCase() !== str(n.lesson_type).toLowerCase()) out.push('lesson_type');
  const ot = str(o.teacher);
  const nt = str(n.teacher);
  if (teacherSet(ot) !== teacherSet(nt) && (!ot || INITIALS.test(ot)) && (!nt || INITIALS.test(nt))) out.push('teacher');
  return out;
}

const roomPiece = (d: ChangeDetails) => (str(d.room) ? `ауд. ${str(d.room)}` : null);
const typePiece = (d: ChangeDetails) => lessonKind(d.lesson_type ?? null)?.label ?? null;

/** Значение одного изменившегося поля — пустое тоже словами, чтобы «Было / Стало» не было пустым. */
function fieldPiece(d: ChangeDetails, f: Field): string {
  switch (f) {
    case 'room': return roomPiece(d) ?? 'без аудитории';
    case 'teacher': return str(d.teacher) || 'без преподавателя';
    case 'lesson_type': return typePiece(d) ?? 'без типа занятия';
    default: return str(d.subject) || 'без предмета';
  }
}

const join = (parts: Array<string | null | undefined>) => parts.filter(p => !!p && p.trim()).join(' · ') || null;

/**
 * «Было / Стало» по таблице раздела 8 ТЗ. Есть old_details/new_details —
 * только изменившиеся поля; нет — краткие old_value/new_value (у старых
 * записей это названия предметов).
 */
export function buildDiff(c: ChangeRec): Diff {
  const kind = changeKind(c.change_type);
  const o = c.old_details ?? null;
  const n = c.new_details ?? null;
  if (kind === 'new_week' || !kind) return { subject: null, before: null, after: null };

  if (kind === 'added') {
    return { subject: null, before: null, after: n ? join([str(n.subject), roomPiece(n), typePiece(n)]) : c.new_value || null };
  }
  if (kind === 'removed') {
    return { subject: null, before: o ? join([str(o.subject), roomPiece(o)]) : c.old_value || null, after: null };
  }
  // Изменено
  if (o && n) {
    const fields = changedFields(o, n);
    if (fields.includes('subject')) {
      return { subject: null, before: join([str(o.subject), roomPiece(o)]), after: join([str(n.subject), roomPiece(n)]) };
    }
    if (fields.length) {
      const order = (['room', 'teacher', 'lesson_type'] as Field[]).filter(f => fields.includes(f));
      return {
        subject: str(n.subject) || str(o.subject) || null,
        before: order.map(f => fieldPiece(o, f)).join(' · '),
        after: order.map(f => fieldPiece(n, f)).join(' · '),
      };
    }
  }
  return { subject: null, before: c.old_value || null, after: c.new_value || null };
}

// ─── Даты и подписи ────────────────────────────────────────────────────────

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** Время обнаружения в строке — только «08:14», без даты. */
export function timeLabel(at: number): string {
  const d = new Date(at);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Заголовок группы: «Сегодня», «Вчера, 5 октября», «Суббота, 3 октября» (в другом году — с годом). */
export function dayHeader(iso: string, now: Date): string {
  const today = isoOf(now);
  if (iso === today) return 'Сегодня';
  const [y, m, d] = iso.split('-').map(Number);
  if (iso === addDays(today, -1)) return `Вчера, ${d} ${MONTHS_GEN[m - 1]}`;
  return y === now.getFullYear() ? dayTitle(iso) : `${dayTitle(iso)} ${y}`;
}

export interface DayGroup<T> { key: string; title: string; items: T[] }

/** Группы по дню (местное время), в порядке элементов — они уже отсортированы новыми вверх. */
export function groupByDay<T>(items: T[], atOf: (t: T) => number, now: Date): DayGroup<T>[] {
  const out: DayGroup<T>[] = [];
  for (const it of items) {
    const key = isoOf(new Date(atOf(it)));
    let g = out[out.length - 1];
    if (!g || g.key !== key) {
      g = { key, title: dayHeader(key, now), items: [] };
      out.push(g);
    }
    g.items.push(it);
  }
  return out;
}

export const newLabel = (n: number) => `${n} ${plural(n, 'новое', 'новых', 'новых')}`;
export const changesLabel = (n: number) => `${n} ${plural(n, 'изменение', 'изменения', 'изменений')}`;
export const recordsLabel = (n: number) => `${n} ${plural(n, 'запись', 'записи', 'записей')}`;
export const unreadSpoken = (n: number) => `${n} ${plural(n, 'непрочитанное', 'непрочитанных', 'непрочитанных')}`;

/** «20 пар · 7 предметов» — для «Новой недели», из расписания своей группы. */
export function weekStatsShort(lessons: Array<{ day_of_week: string; pair_number: string; subject: string; lesson_date?: string | null }>): string | null {
  if (!lessons.length) return null;
  const slots = new Set(lessons.map(l => `${l.lesson_date ?? l.day_of_week}|${l.pair_number}`)).size;
  const subjects = new Set(lessons.map(l => l.subject.trim())).size;
  return `${slots} ${plural(slots, 'пара', 'пары', 'пар')} · ${subjects} ${plural(subjects, 'предмет', 'предмета', 'предметов')}`;
}

// ─── Напоминания о зачётах ─────────────────────────────────────────────────

/** Зачёт или экзамен во «Входящих»: одна строка на зачёт (src/notificationHistory.ts). */
export interface ExamEntry {
  id: string;
  subject: string;
  /** Дата зачёта, YYYY-MM-DD. */
  date: string;
  pair: string;
  /** Начало пары «11:30». */
  time: string;
  room: string | null;
  kind: 'Зачёт' | 'Экзамен';
  /** Когда приходит первое напоминание, мс. До этого строки во «Входящих» нет. */
  firstAt: number;
  weekStart: string;
}

/** «завтра» / «сегодня»; в остальные дни метки нет (решение владельца 4 окт 2026). */
export function countdownLabel(date: string, now: Date): string | null {
  const d = diffDays(isoOf(now), date);
  return d === 0 ? 'сегодня' : d === 1 ? 'завтра' : null;
}

export const examTitle = (e: ExamEntry) => `${dayTitle(e.date)} · ${e.time}`;
export const examPlace = (e: ExamEntry) => join([`${e.pair} пара`, e.room ? `ауд. ${e.room}` : null]) ?? '';

// ─── Входящие ──────────────────────────────────────────────────────────────

export const INBOX_DAYS = 30;
const DAY_MS = 86_400_000;

export type InboxItem =
  | { id: string; kind: 'change'; at: number; change: ChangeRec }
  | { id: string; kind: 'exam'; at: number; exam: ExamEntry };

export const changeItemId = (c: { id: number }) => `c:${c.id}`;
export const examItemId = (e: { id: string }) => `e:${e.id}`;

/**
 * Входящие: изменения своей группы и «новая неделя» своего факультета с
 * сервера за 30 дней + зачёты, у которых уже пришло первое напоминание и
 * дата ещё не прошла. Новые сверху.
 */
export function buildInbox(changes: ChangeRec[], exams: ExamEntry[], now: Date): InboxItem[] {
  const from = now.getTime() - INBOX_DAYS * DAY_MS;
  const today = isoOf(now);
  const out: InboxItem[] = [];
  for (const c of changes) {
    if (!changeKind(c.change_type)) continue;
    const at = Date.parse(c.detected_at);
    if (Number.isNaN(at) || at < from) continue;
    out.push({ id: changeItemId(c), kind: 'change', at, change: c });
  }
  for (const e of exams) {
    if (e.firstAt > now.getTime() || e.firstAt < from || e.date < today) continue;
    out.push({ id: examItemId(e), kind: 'exam', at: e.firstAt, exam: e });
  }
  return out.sort((a, b) => b.at - a.at);
}

export type Filter = 'all' | 'exam' | 'schedule';

export const inFilter = (it: InboxItem, f: Filter) =>
  f === 'all' || (f === 'exam' ? it.kind === 'exam' : it.kind === 'change');

/**
 * Отметки «прочитано» — только на телефоне. baseline: всё, что пришло раньше,
 * прочитано (иначе после обновления колокольчик у всех загорелся бы «9+»).
 * read — id строки → когда она пришла (по нему отметки старше 30 дней удаляются).
 */
export interface ReadState { baseline: number; read: Record<string, number> }

export const isUnread = (it: InboxItem, r: ReadState) => it.at > r.baseline && !(it.id in r.read);

export function unreadCounts(items: InboxItem[], r: ReadState): Record<Filter, number> {
  const out: Record<Filter, number> = { all: 0, exam: 0, schedule: 0 };
  for (const it of items) {
    if (!isUnread(it, r)) continue;
    out.all += 1;
    out[it.kind === 'exam' ? 'exam' : 'schedule'] += 1;
  }
  return out;
}

/** Счётчик на колокольчике и в Кабинете: «9+» свыше 9, 0 — не показывается. */
export const badgeText = (n: number) => (n > 9 ? '9+' : String(n));

export function markRead(r: ReadState, items: InboxItem[]): ReadState {
  const read = { ...r.read };
  for (const it of items) read[it.id] = it.at;
  return { ...r, read };
}

export function markUnread(r: ReadState, ids: string[]): ReadState {
  const read = { ...r.read };
  for (const id of ids) delete read[id];
  return { ...r, read };
}

/** Отметки старше срока хранения не нужны — строк уже нет. */
export function pruneRead(r: ReadState, now: Date): ReadState {
  const from = now.getTime() - (INBOX_DAYS + 1) * DAY_MS;
  const read: Record<string, number> = {};
  for (const [id, at] of Object.entries(r.read)) if (at >= from) read[id] = at;
  return { ...r, read };
}

// ─── История ───────────────────────────────────────────────────────────────

export type Scope = 'my' | 'all';
/** Выбор в «Все факультеты»: все группы, факультет или одна группа. */
export type GroupPick = null | { faculty: string } | { group: number };

/** «Новая неделя» факультета касается каждой его группы. */
const weekOfFaculty = (c: ChangeRec, faculty: string | undefined) =>
  changeKind(c.change_type) === 'new_week' && !!faculty && c.faculty_code === faculty;

/**
 * Записи Истории. «Моя группа»: правки своей группы и новая неделя своего
 * факультета; записи без group_id (старые) — нет. «Все факультеты» — всё
 * или по выбору группы / факультета.
 */
export function historyList(
  changes: ChangeRec[], scope: Scope, my: Group | null, pick: GroupPick, groupsById: Map<number, Group>,
): ChangeRec[] {
  const valid = changes.filter(c => !!changeKind(c.change_type) && !Number.isNaN(Date.parse(c.detected_at)));
  const sorted = valid.sort((a, b) => Date.parse(b.detected_at) - Date.parse(a.detected_at));
  if (scope === 'my') {
    if (!my) return [];
    return sorted.filter(c => c.group_id === my.id || weekOfFaculty(c, my.faculty_code));
  }
  if (!pick) return sorted;
  if ('faculty' in pick) return sorted.filter(c => c.faculty_code === pick.faculty);
  const g = groupsById.get(pick.group);
  return sorted.filter(c => c.group_id === pick.group || weekOfFaculty(c, g?.faculty_code));
}

/** Подпись группы: «ПМиИ · 3 курс». */
export const groupLabel = (g: Pick<Group, 'name' | 'year'>) => `${shortGroupName(g.name)} · ${g.year} курс`;

/** Строка группы в «Все факультеты»: «ЕНФ · ПМиИ · 3 курс»; новая неделя — только факультет. */
export function groupLine(c: ChangeRec, groupsById: Map<number, Group>): string {
  if (changeKind(c.change_type) === 'new_week') return c.faculty_code;
  const g = c.group_id != null ? groupsById.get(c.group_id) : undefined;
  if (g) return `${c.faculty_code} · ${groupLabel(g)}`;
  return join([c.faculty_code, c.group_name ? shortGroupName(c.group_name) : null]) ?? c.faculty_code;
}

/** Надпись на кнопке выбора: «Все группы», «ЕНФ», «ПМиИ · 3 курс». */
export function pickLabel(pick: GroupPick, groupsById: Map<number, Group>): string {
  if (!pick) return 'Все группы';
  if ('faculty' in pick) return pick.faculty;
  const g = groupsById.get(pick.group);
  return g ? groupLabel(g) : 'Группа';
}

/** Сводка «Все факультеты»: сколько групп затронуто сегодня. */
export function todaySummary(list: ChangeRec[], now: Date): string {
  const today = isoOf(now);
  const groups = new Set(
    list.filter(c => isoOf(new Date(Date.parse(c.detected_at))) === today && changeKind(c.change_type) !== 'new_week')
      .map(c => c.group_id ?? `${c.faculty_code}|${c.group_name}`),
  ).size;
  return groups ? `${groups} ${plural(groups, 'группа', 'группы', 'групп')} сегодня` : 'Сегодня изменений нет';
}

export const PAGE_DAYS = 14;

/**
 * Подгрузка порциями по 2 недели — на телефоне: сервер отдаёт до 200
 * записей разом. Отсчёт от самой новой записи, чтобы первая порция не
 * оказалась пустой, если последние две недели было тихо.
 */
export function pageSlice<T>(list: T[], atOf: (t: T) => number, pages: number): { shown: T[]; hasMore: boolean } {
  if (!list.length) return { shown: [], hasMore: false };
  const newest = new Date(atOf(list[0]));
  newest.setHours(0, 0, 0, 0);
  const cutoff = newest.getTime() - (pages * PAGE_DAYS - 1) * DAY_MS;
  const shown = list.filter(x => atOf(x) >= cutoff);
  return { shown, hasMore: shown.length < list.length };
}

/** «26 сентября» — дата самой ранней показанной записи для строки «Записи раньше … загрузятся». */
export function shortDate(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

// ─── Для экранного диктора ─────────────────────────────────────────────────

const PAIR_SPOKEN: Record<string, string> = { I: 'первая', II: 'вторая', III: 'третья', IV: 'четвёртая', V: 'пятая', VI: 'шестая' };
const speak = (s: string) => s.replace(/ауд\. /g, 'аудитория ').replace(/ · /g, ', ');

/** «Новое. Изменено. Среда, 7 октября, третья пара. … Было аудитория 105, стало аудитория 402. Сегодня в 08:14». */
export function changeA11y(c: ChangeRec, opts: { unread: boolean; group?: string | null; extra?: string | null; now: Date }): string {
  const kind = changeKind(c.change_type) ?? 'changed';
  const d = buildDiff(c);
  const title = whenTitle(c).replace(/ · ([IVX]+) пара$/, (_, p) => `, ${PAIR_SPOKEN[p] ?? p} пара`);
  const at = Date.parse(c.detected_at);
  return [
    opts.unread ? 'Новое' : null,
    KIND_LABEL[kind],
    opts.group ? speak(opts.group) : null,
    title,
    d.subject,
    opts.extra ? speak(opts.extra) : null,
    [d.before ? `Было ${speak(d.before)}` : null, d.after ? `${d.before ? 'стало' : 'Стало'} ${speak(d.after)}` : null]
      .filter(Boolean).join(', ') || null,
    `${dayHeader(isoOf(new Date(at)), opts.now).split(',')[0]} в ${timeLabel(at)}`,
  ].filter(Boolean).join('. ');
}

export function examA11y(e: ExamEntry, opts: { unread: boolean; now: Date }): string {
  const cd = countdownLabel(e.date, opts.now);
  return [
    opts.unread ? 'Новое' : null,
    e.kind,
    examTitle(e).replace(' · ', ', '),
    e.subject,
    `${cap(PAIR_SPOKEN[e.pair] ?? e.pair)} пара${e.room ? `, аудитория ${e.room}` : ''}`,
    cd ? cap(cd) : null,
  ].filter(Boolean).join('. ');
}

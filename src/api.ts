import Constants from 'expo-constants';

// Единственный источник URL бэкенда — app.json → expo.extra.apiUrl.
// Литерал ниже — только страховка на случай, если extra не подхватился.
export const API_BASE =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'https://msu-schedule.onrender.com/api';

// Простой in-memory кэш: ключ → {данные, время}
const _cache = new Map<string, { data: unknown; ts: number }>();

async function get<T>(path: string, ttl = 180_000): Promise<T> {
  const hit = _cache.get(path);
  if (hit && Date.now() - hit.ts < ttl) return hit.data as T;
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: T = await res.json();
  _cache.set(path, { data, ts: Date.now() });
  return data;
}

/** Сбрасывает in-memory кэш — чтобы ручная синхронизация тянула свежие данные. */
export function clearApiCache(): void {
  _cache.clear();
}

export interface Group {
  id: number;
  name: string;
  year: number;
  faculty_code: string;
  faculty_name: string;
}

export interface Lesson {
  id: number;
  subject: string;
  lesson_type: string | null;
  day_of_week: string;
  lesson_date: string | null;
  pair_number: string;
  pair_time_start: string;
  pair_time_end: string;
  teacher: { id: number; name: string } | null;
  room: { id: number; name: string } | null;
  group: { id: number; name: string; year: number } | null;
}

export interface Teacher {
  id: number;
  name: string;
}

export interface TodayItem {
  pair_number: string;
  pair_time_start: string;
  pair_time_end: string;
  subject: string;
  lesson_type: string | null;
  teacher: string | null;
  room: string | null;
  is_current: boolean;
  is_next: boolean;
  minutes_until: number | null;
  /** Длина идущей сейчас перемены в минутах. null — перемены нет. */
  break_minutes: number | null;
  /** Пара не сегодня: на сегодня занятия кончились. */
  is_tomorrow: boolean;
  day_label: string | null;   // «Завтра» / «В понедельник»
}

/** Длительность по-человечески: «45 мин», «1 ч», «1 ч 45 мин». */
export function humanDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} мин`;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

/**
 * Окно между двумя парами одного дня — то есть ПРОПУЩЕННЫЙ слот пары
 * (есть I и III, а II нет). Обычный перерыв между соседними парами,
 * включая обеденный III→IV, окном не считается.
 */
export function gapBetween(prevPair: string, nextPair: string): { pairs: string[]; minutes: number } | null {
  const i = PAIR_NUMBERS.indexOf(prevPair);
  const j = PAIR_NUMBERS.indexOf(nextPair);
  if (i < 0 || j < 0 || j - i <= 1) return null;

  const end = PAIR_TIMES[prevPair]?.[1];
  const start = PAIR_TIMES[nextPair]?.[0];
  if (!end || !start) return null;

  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  return { pairs: PAIR_NUMBERS.slice(i + 1, j), minutes: toMin(start) - toMin(end) };
}

/** Как назвать перерыв между парами: 15 минут, обед или «окно» на пол-дня. */
export function breakLabel(minutes: number): string {
  if (minutes <= 20) return `Перемена · ${minutes} мин`;
  if (minutes <= 90) return `Большой перерыв · ${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `Окно · ${h} ч${m ? ` ${m} мин` : ''}`;
}

export const DAYS_ORDER = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
// Порядок пар — тот же, что в вебе (lib/api.ts) и в бэкенде
export const PAIR_NUMBERS = ['I', 'II', 'III', 'IV', 'V'];

export const PAIR_TIMES: Record<string, [string, string]> = {
  'I':   ['08:00', '09:30'],
  'II':  ['09:45', '11:15'],
  'III': ['11:30', '13:00'],
  'IV':  ['14:00', '15:30'],
  'V':   ['15:45', '17:15'],
};

export const DAY_LABELS: Record<string, string> = {
  понедельник: 'Пн', вторник: 'Вт', среда: 'Ср',
  четверг: 'Чт', пятница: 'Пт', суббота: 'Сб', воскресенье: 'Вс',
};

export interface WeekInfo {
  id: number;
  week_number: number;
  week_start: string;
  is_latest: boolean;
}

export interface Change {
  id: number;
  detected_at: string;
  faculty_code: string;
  change_type: string;
  group_name: string | null;
  day_of_week: string | null;
  pair_number: string | null;
  old_value: string | null;
  new_value: string | null;
  week_start: string | null;
}

export interface Stats {
  faculty_code: string;
  group_name: string;
  year: number;
  total_lessons_week: number;
  lessons_by_day: Record<string, number>;
  most_loaded_day: string | null;
  unique_teachers: number;
  unique_subjects: number;
}

export interface WeekOption {
  week_start: string;
  week_number: number;
  is_latest: boolean;
}

export interface AppVersionInfo {
  version: string;
  download_url: string | null;
  notes: string;
}

export function weekLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (today >= start && today <= end) return 'Эта неделя';
  const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  const s = `${start.getDate()} ${months[start.getMonth()]}`;
  const e = `${end.getDate()} ${months[end.getMonth()]}`;
  const range = `${s}–${e}`;
  if (start > today && start.getTime() - today.getTime() <= 8 * 86400000)
    return `Следующая · ${range}`;
  return range;
}

export function isCurrentWeek(weekStart: string): boolean {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today >= start && today <= end;
}

export function shortGroupName(name: string): string {
  const n = name.toUpperCase();
  if (n.includes('ПРИКЛАДНАЯ МАТЕМАТИКА') || (n.includes('МАТЕМАТИК') && n.includes('ИНФОРМАТИК'))) return 'ПМиИ';
  if (n.includes('ХИМИЯ') && (n.includes('ФИЗИКА') || n.includes('МЕХАНИКА'))) return 'ХФММ';
  if (n.includes('ГЕОЛОГИЯ')) return 'Геология';
  if (n.includes('МУНИЦИПАЛЬН') || (n.includes('ГОСУДАРСТВЕНН') && n.includes('УПРАВЛЕНИ'))) return 'ГМУ';
  if (n.includes('МЕЖДУНАРОДН') && n.includes('ОТНОШЕНИ')) return 'МО';
  if (n.includes('ЛИНГВИСТИК')) return 'Лингвистика';
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

export const api = {
  getGroups: () => get<Group[]>('/schedule/groups'),
  getGroupSchedule: (id: number, weekId?: number) =>
    get<Lesson[]>(`/schedule/group/${id}${weekId ? `?week_id=${weekId}` : ''}`),
  getGroupWeeks: (id: number) => get<WeekInfo[]>(`/schedule/weeks/${id}`),
  getNow: (id: number) => get<TodayItem[]>(`/schedule/now?group_id=${id}`, 60_000),
  getStats: (id: number) => get<Stats>(`/schedule/stats/${id}`, 60_000),
  getWeeksAll: () => get<WeekOption[]>('/schedule/weeks-all'),
  getTeachers: (weekStart?: string) =>
    get<Teacher[]>(`/schedule/teachers${weekStart ? `?week_start=${weekStart}` : ''}`),
  getTeacherSchedule: (id: number, weekStart?: string) =>
    get<Lesson[]>(`/schedule/teacher/${id}${weekStart ? `?week_start=${weekStart}` : ''}`),
  getFreeRooms: (day: string, pair: string, weekStart?: string) =>
    get<{ room_name: string; is_free: boolean; occupied_by?: string }[]>(
      `/schedule/free-rooms?day_of_week=${encodeURIComponent(day)}&pair_number=${pair}${weekStart ? `&week_start=${weekStart}` : ''}`
    ),
  getChanges: () => get<Change[]>('/schedule/changes'),
  registerUser: (deviceId: string, name: string, groupId: number) =>
    fetch(`${API_BASE}/user/register?device_id=${encodeURIComponent(deviceId)}&name=${encodeURIComponent(name)}&group_id=${groupId}`, { method: 'POST' })
      .then(r => r.json()).catch(() => null),
  // 5 минут — совпадает с кэшем на бэкенде, чтобы уведомление о новой
  // версии доходило быстро, а не через час после релиза
  getLatestVersion: () => get<AppVersionInfo>('/app/version', 300_000),
};

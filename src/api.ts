const API_BASE = 'https://msu-schedule-backend-production.up.railway.app/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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
}

export const DAYS_ORDER = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export const PAIR_TIMES: Record<string, [string, string]> = {
  'I':   ['08:00', '09:30'],
  'II':  ['09:45', '11:15'],
  'III': ['11:30', '13:00'],
  'IV':  ['14:00', '15:30'],
  'V':   ['15:45', '17:15'],
};

export const DAY_LABELS: Record<string, string> = {
  понедельник: 'Пн', вторник: 'Вт', среда: 'Ср',
  четверг: 'Чт', пятница: 'Пт', суббота: 'Сб',
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
  getNow: (id: number) => get<TodayItem[]>(`/schedule/now?group_id=${id}`),
  getTeachers: () => get<Teacher[]>('/schedule/teachers'),
  getTeacherSchedule: (id: number) => get<Lesson[]>(`/schedule/teacher/${id}`),
  getFreeRooms: (day: string, pair: string) =>
    get<{ room_name: string; is_free: boolean; occupied_by?: string }[]>(
      `/schedule/free-rooms?day_of_week=${encodeURIComponent(day)}&pair_number=${pair}`
    ),
  getChanges: () => get<Change[]>('/schedule/changes'),
  registerUser: (deviceId: string, name: string, groupId: number) =>
    fetch(`${API_BASE}/user/register?device_id=${encodeURIComponent(deviceId)}&name=${encodeURIComponent(name)}&group_id=${groupId}`, { method: 'POST' })
      .then(r => r.json()).catch(() => null),
};

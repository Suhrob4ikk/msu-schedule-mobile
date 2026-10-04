/**
 * Данные вкладки «Педагоги»: кэш AsyncStorage (те же ключи, что заполняет
 * полная синхронизация — cache_teachers_<неделя>, cache_teacher_<id>_<неделя>)
 * и сеть. Статусы списка считаются из кэша одним чтением с диска — без
 * запросов на каждого педагога.
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, Lesson, Teacher, WeekOption } from '../api';
import { ListStatus, teacherStatus } from './state';

export const UPDATED_AT_KEY = 'teachers_updated_at';
const RECENT_KEY = 'teachers_recent';

const parse = <T,>(raw: string | null | undefined): T | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
};

export async function cachedWeeksAll(): Promise<WeekOption[] | null> {
  const ws = parse<WeekOption[]>(await AsyncStorage.getItem('cache_weeks_all').catch(() => null));
  return ws && ws.length ? ws : null;
}

export async function fetchWeeksAll(): Promise<WeekOption[]> {
  const ws = await api.getWeeksAll();
  AsyncStorage.setItem('cache_weeks_all', JSON.stringify(ws)).catch(() => null);
  return ws;
}

/** Списки педагогов недель из кэша; null у недели — в кэше нет. */
export async function cachedTeacherLists(weeks: string[]): Promise<Array<Teacher[] | null>> {
  if (!weeks.length) return [];
  const rows = await AsyncStorage.multiGet(weeks.map(w => `cache_teachers_${w}`)).catch(() => null);
  return weeks.map((_, i) => parse<Teacher[]>(rows?.[i]?.[1]));
}

export async function fetchTeacherLists(weeks: string[]): Promise<Teacher[][]> {
  const lists = await Promise.all(weeks.map(w => api.getTeachers(w)));
  AsyncStorage.multiSet(weeks.map((w, i) => [`cache_teachers_${w}`, JSON.stringify(lists[i])])).catch(() => null);
  return lists;
}

/** Пары многих педагогов за неделю — одним чтением с диска. */
export async function cachedSchedules(ids: number[], weekStart: string): Promise<Map<number, Lesson[]>> {
  const out = new Map<number, Lesson[]>();
  if (!ids.length) return out;
  const rows = await AsyncStorage.multiGet(ids.map(id => `cache_teacher_${id}_${weekStart}`)).catch(() => null);
  ids.forEach((id, i) => {
    const ls = parse<Lesson[]>(rows?.[i]?.[1]);
    if (ls) out.set(id, ls);
  });
  return out;
}

export async function cachedTeacherWeek(id: number, weekStart: string): Promise<Lesson[] | null> {
  return parse<Lesson[]>(await AsyncStorage.getItem(`cache_teacher_${id}_${weekStart}`).catch(() => null));
}

export async function fetchTeacherWeek(id: number, weekStart: string): Promise<Lesson[]> {
  const ls = await api.getTeacherSchedule(id, weekStart);
  AsyncStorage.setItem(`cache_teacher_${id}_${weekStart}`, JSON.stringify(ls)).catch(() => null);
  return ls;
}

export async function readUpdatedAt(): Promise<Date | null> {
  const v = await AsyncStorage.getItem(UPDATED_AT_KEY).catch(() => null);
  return v ? new Date(v) : null;
}

export function writeUpdatedAt(at: Date): void {
  AsyncStorage.setItem(UPDATED_AT_KEY, at.toISOString()).catch(() => null);
}

// ─── Недавние ──────────────────────────────────────────────────────────────

export async function readRecent(): Promise<number[]> {
  const v = parse<unknown>(await AsyncStorage.getItem(RECENT_KEY).catch(() => null));
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number').slice(0, 3) : [];
}

export function writeRecent(ids: number[]): void {
  AsyncStorage.setItem(RECENT_KEY, JSON.stringify(ids)).catch(() => null);
}

// ─── Статусы строк списка ──────────────────────────────────────────────────

/**
 * Хранилище статусов. Строка подписывается на свой статус и
 * перерисовывается, только когда изменился его текст. Раз в минуту (и при
 * возврате приложения) пересчитываются только строки, видимые на экране:
 * экран сообщает окно прокрутки, строки — свои места (в ref, не в state).
 * Строка, въехавшая в окно со старым статусом, освежается при прокрутке.
 */
class StatusStore {
  private lessons = new Map<number, Lesson[]>();
  private minute = Math.floor(Date.now() / 60_000);
  private memo = new Map<number, { minute: number; status: ListStatus | null }>();
  private rows = new Map<string, { id: number; group: string; y: number; h: number; seen: number; notify: () => void }>();
  private groupY = new Map<string, number>();
  private top = 0;
  private bottom = 2000;

  setAll(map: Map<number, Lesson[]>): void {
    this.lessons = map;
    this.minute = Math.floor(Date.now() / 60_000);
    this.memo.clear();
    this.rows.forEach(r => r.notify());
  }

  setOne(id: number, ls: Lesson[]): void {
    this.lessons.set(id, ls);
    const prev = this.memo.get(id);
    this.memo.set(id, { minute: -1, status: prev?.status ?? null });
    this.rows.forEach(r => { if (r.id === id) r.notify(); });
  }

  status(id: number): ListStatus | null {
    const hit = this.memo.get(id);
    if (hit && hit.minute === this.minute) return hit.status;
    const fresh = teacherStatus(new Date(this.minute * 60_000 + 1), this.lessons.get(id));
    // Текст тот же — прежний объект: строка не перерисуется
    const status = hit && hit.status?.text === fresh?.text ? hit.status : fresh;
    this.memo.set(id, { minute: this.minute, status });
    return status;
  }

  private visible(r: { group: string; y: number; h: number }): boolean {
    const gy = this.groupY.get(r.group);
    if (gy == null) return true;
    const y = gy + r.y;
    return y + r.h >= this.top - 200 && y <= this.bottom + 200;
  }

  tick(): void {
    const m = Math.floor(Date.now() / 60_000);
    if (m === this.minute) return;
    this.minute = m;
    this.rows.forEach(r => { if (this.visible(r)) { r.seen = m; r.notify(); } });
  }

  setViewport(top: number, height: number): void {
    this.top = top;
    this.bottom = top + height;
    this.rows.forEach(r => { if (r.seen !== this.minute && this.visible(r)) { r.seen = this.minute; r.notify(); } });
  }

  setGroupY(group: string, y: number): void { this.groupY.set(group, y); }

  place(key: string, y: number, h: number): void {
    const r = this.rows.get(key);
    if (r) { r.y = y; r.h = h; }
  }

  subscribe(key: string, id: number, group: string, notify: () => void): () => void {
    this.rows.set(key, { id, group, y: 0, h: 0, seen: this.minute, notify });
    return () => { if (this.rows.get(key)?.notify === notify) this.rows.delete(key); };
  }
}

export const statusStore = new StatusStore();

/** Статус педагога для строки. key — уникален для строки на экране. */
export function useTeacherStatus(key: string, id: number, group: string): ListStatus | null {
  return useSyncExternalStore(
    notify => statusStore.subscribe(key, id, group, notify),
    () => statusStore.status(id),
  );
}

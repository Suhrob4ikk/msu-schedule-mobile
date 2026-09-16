/**
 * Локальный журнал уведомлений — «Уведомления» в кабинете.
 *
 * Уведомления в приложении и так приходят (напоминания о зачётах, пуш об
 * изменении расписания), но пропадают без следа, стоит смахнуть шторку.
 * Здесь просто сохраняем то же самое на устройстве, чтобы список можно было
 * открыть заново. Аккаунтов у нас нет — поэтому история только локальная,
 * как заметки и пропуски (см. src/studyData.ts).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type NotifCategory = 'exam' | 'change' | 'other';

export interface NotifEntry {
  id: string;
  category: NotifCategory;
  title: string;
  body: string;
  date: string; // ISO — когда уведомление должно сработать/сработало
  read: boolean;
}

const HISTORY_KEY = 'notification_history';
const MAX_ENTRIES = 200;

// Колокольчик в шапке (см. app/_layout.tsx) держит счётчик в состоянии, а
// не перечитывает AsyncStorage на каждый чих — подписка сообщает ему, когда
// счётчик стоит обновить (новая запись или прочтение вкладки).
type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribeNotifHistory(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function notifyListeners(): void {
  listeners.forEach(fn => fn());
}

async function readAll(): Promise<NotifEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeAll(entries: NotifEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch { /* диск заполнен и т.п. — история необязательна, не роняем приложение */ }
}

/**
 * Добавляет запись, если такой ещё нет (по id). Напоминания о зачётах
 * пересчитываются заново при каждом открытии расписания — без дедупа по id
 * список раздувался бы дублями на каждый заход в приложение.
 */
export async function addNotifHistory(entry: Omit<NotifEntry, 'read'>): Promise<void> {
  const all = await readAll();
  if (all.some(e => e.id === entry.id)) return;
  all.unshift({ ...entry, read: false });
  all.sort((a, b) => b.date.localeCompare(a.date));
  await writeAll(all);
  notifyListeners();
}

export async function getNotifHistory(): Promise<NotifEntry[]> {
  return readAll();
}

export async function markCategoryRead(category: NotifCategory): Promise<void> {
  const all = await readAll();
  let changed = false;
  for (const e of all) {
    if (e.category === category && !e.read) { e.read = true; changed = true; }
  }
  if (changed) { await writeAll(all); notifyListeners(); }
}

export async function hasUnreadNotifHistory(): Promise<boolean> {
  const all = await readAll();
  return all.some(e => !e.read);
}

export async function getUnreadNotifCount(): Promise<number> {
  const all = await readAll();
  return all.filter(e => !e.read).length;
}

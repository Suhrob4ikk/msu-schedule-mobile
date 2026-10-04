/**
 * Локальный журнал уведомлений.
 *
 * С 1.9.44 «Уведомления» берут отсюда только зачёты (getExamInbox ниже), а
 * изменения расписания — с сервера (src/notifications/data.ts). Старый журнал
 * (addNotifHistory и т. д.) нужен лишь прежнему экрану, который ни к чему не
 * подключён.
 *
 * Напоминания о зачётах приходят и пропадают без следа, стоит смахнуть
 * шторку. Здесь сохраняем их на устройстве, чтобы список можно было открыть
 * заново. Изменения расписания сюда больше не пишутся — их показывает лента
 * с сервера (src/changesFeed.ts). Аккаунтов у нас нет — поэтому история только локальная,
 * как заметки и пропуски (см. src/studyData.ts).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ExamEntry } from './notifications/state';
import { isoOf } from './schedule/state';

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
/** Пересчитать колокольчик снаружи — например, после просмотра ленты изменений
 *  (она живёт не здесь, а на сервере, см. src/changesFeed.ts). */
export const notifyNotifHistoryChanged = notifyListeners;

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

// ─── Зачёты во «Входящих» (с 1.9.44) ──────────────────────────────────────
//
// Одна строка на один зачёт. Записывается, когда ставим напоминания, а во
// «Входящих» видна с момента первого напоминания (firstAt) — раньше оно на
// телефон не приходило. Напоминания переставляются целиком при каждой
// загрузке расписания (cancelExamReminders снимает все), поэтому и здесь
// ещё не пришедшие строки заменяются новым набором: зачёт пропал из
// расписания до напоминания — строки нет. Пришедшие не трогаем; после даты
// зачёта строка удаляется.

const EXAM_INBOX_KEY = 'exam_inbox';

async function readExams(): Promise<ExamEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(EXAM_INBOX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function getExamInbox(): Promise<ExamEntry[]> {
  return readExams();
}

/** planned — зачёты, для которых только что поставлены напоминания (firstAt в будущем). */
export async function syncExamInbox(planned: ExamEntry[]): Promise<void> {
  const now = Date.now();
  const today = isoOf(new Date());
  const all = await readExams();
  const fired = all.filter(e => e.firstAt <= now && e.date >= today);
  const firedIds = new Set(fired.map(e => e.id));
  const next = [...fired, ...planned.filter(e => !firedIds.has(e.id))];
  const same = next.length === all.length && JSON.stringify(next) === JSON.stringify(all);
  if (same) return;
  try {
    await AsyncStorage.setItem(EXAM_INBOX_KEY, JSON.stringify(next));
  } catch { /* необязательно — не роняем приложение */ }
  notifyListeners();
}

// Записи категории 'change' — наследие прошлых версий, когда изменения
// расписания тоже копились здесь. Теперь их показывает лента с сервера
// (src/changesFeed.ts), поэтому старые локальные записи не считаем.
export async function hasUnreadNotifHistory(): Promise<boolean> {
  const all = await readAll();
  return all.some(e => !e.read && e.category !== 'change');
}

export async function getUnreadNotifCount(): Promise<number> {
  const all = await readAll();
  return all.filter(e => !e.read && e.category !== 'change').length;
}

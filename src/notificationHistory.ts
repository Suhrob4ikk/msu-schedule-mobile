/**
 * Зачёты во «Входящих» — единственное, что «Уведомления» хранят на телефоне.
 * Изменения расписания берутся с сервера (src/notifications/data.ts).
 *
 * Напоминания о зачётах приходят и пропадают без следа, стоит смахнуть
 * шторку. Здесь сохраняем их на устройстве, чтобы список можно было открыть
 * заново. Аккаунтов у нас нет — поэтому только локально, как заметки и
 * пропуски (см. src/studyData.ts).
 *
 * До 2.0.1 здесь же жил старый журнал уведомлений (ключ notification_history,
 * до 200 записей) для прежнего экрана — экран удалён, ключ стирается.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ExamEntry } from './notifications/state';
import { isoOf } from './schedule/state';

// Колокольчик в шапке (см. app/_layout.tsx) держит счётчик в состоянии, а
// не перечитывает AsyncStorage на каждый чих — подписка сообщает ему, когда
// счётчик стоит обновить.
type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribeNotifHistory(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function notifyListeners(): void {
  listeners.forEach(fn => fn());
}

/** Старый журнал (до 2.0.1) больше не читается — освобождаем место один раз за запуск. */
let legacyRemoved = false;
function removeLegacyHistory(): void {
  if (legacyRemoved) return;
  legacyRemoved = true;
  AsyncStorage.removeItem('notification_history').catch(() => null);
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
  removeLegacyHistory();
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

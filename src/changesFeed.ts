/**
 * Лента изменений СВОЕЙ группы с сервера — для вкладки «Изменения» в
 * «Уведомлениях» и для счётчика на колокольчике.
 *
 * Раньше вкладка показывала только локальный журнал пришедших push, и была
 * пустой почти всегда: push попадал в журнал, только если приложение было
 * открыто или по уведомлению нажали, а смахнутое терялось. Теперь источник —
 * сервер (/schedule/changes?group_id=…): правки своей группы и «новая неделя»
 * своего факультета. Были изменения — они видны, дошёл push или нет.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, Change } from './api';

/** Тот же ключ, что ставит экран «История изменений» (app/changes.tsx). */
export const CHANGES_SEEN_KEY = 'changes_last_seen';

export async function loadMyChanges(): Promise<Change[]> {
  const gid = await AsyncStorage.getItem('selected_group_id');
  if (!gid) return [];
  const cacheKey = `cache_changes_${gid}`;
  try {
    const data = await api.getChanges(Number(gid));
    AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => null);
    return data;
  } catch {
    // Нет сети — показываем сохранённое
    try {
      const raw = await AsyncStorage.getItem(cacheKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}

/** Сколько изменений появилось после последнего просмотра. */
export async function countUnseenChanges(changes: Change[]): Promise<number> {
  const latest = changes[0]?.detected_at;
  if (!latest) return 0;
  const seen = await AsyncStorage.getItem(CHANGES_SEEN_KEY);
  if (!seen) {
    // Первый запуск после обновления — старую историю непрочитанной не считаем,
    // иначе колокольчик сразу загорелся бы «9+».
    await AsyncStorage.setItem(CHANGES_SEEN_KEY, latest);
    return 0;
  }
  const seenAt = new Date(seen).getTime();
  return changes.filter(c => new Date(c.detected_at).getTime() > seenAt).length;
}

export async function markChangesSeen(changes: Change[]): Promise<void> {
  const latest = changes[0]?.detected_at;
  if (latest) await AsyncStorage.setItem(CHANGES_SEEN_KEY, latest);
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

export type ProgressCallback = (step: string) => void;

/**
 * Полная офлайн-синхронизация — раньше делала 300+ отдельных HTTP-запросов
 * (расписание каждой группы, каждого преподавателя, свободные аудитории по
 * каждому дню/паре/неделе) и занимала 1-2 минуты. Теперь всё это отдаёт
 * бэкенд одним ответом (/schedule/bulk-sync), а здесь только раскладываем
 * его по тем же ключам AsyncStorage, что использовали экраны раньше.
 */
/**
 * Ключи кэша, которые синхронизация не трогает: метка времени и лента
 * изменений (её пишет и читает свой экран, она маленькая).
 */
const KEEP_KEYS = new Set(['cache_sync_timestamp']);
const keepKey = (k: string) => KEEP_KEYS.has(k) || k.startsWith('cache_changes_');

/**
 * Ключи расписания содержат номера записей сервера (`cache_schedule_<группа>_<id недели>`,
 * `cache_teacher_<id педагога>_…`). После пересборки базы или правки файла номера
 * новые, а старые ключи оставались навсегда. Хранилище Android ограничено ~6 МБ —
 * оно переполнилось («database or disk is full»), и синхронизация перестала
 * работать совсем: в Кабинете «последнее обновление» стояло на дне последней удачи.
 * Поэтому всё, чего нет в свежем ответе, удаляем; keepNew=false — удаляем весь кэш.
 */
async function purgeStaleCache(keepNew: Set<string> | null): Promise<void> {
  const all = await AsyncStorage.getAllKeys();
  const stale = all.filter(k => k.startsWith('cache_') && !keepKey(k) && !(keepNew && keepNew.has(k)));
  if (stale.length) await AsyncStorage.multiRemove(stale);
}

export async function performFullSync(onProgress?: ProgressCallback): Promise<void> {
  onProgress?.('Загружаем расписание...');
  const bulk = await api.getBulkSync();

  const entries: [string, string][] = [
    ['cache_groups', JSON.stringify(bulk.groups)],
    ['cache_weeks_all', JSON.stringify(bulk.weeks_all)],
  ];
  for (const [groupId, weeks] of Object.entries(bulk.group_weeks)) {
    entries.push([`cache_weeks_${groupId}`, JSON.stringify(weeks)]);
  }
  for (const [key, sched] of Object.entries(bulk.schedules)) {
    entries.push([`cache_schedule_${key}`, JSON.stringify(sched)]);
  }
  for (const [weekStart, teachers] of Object.entries(bulk.teachers_by_week)) {
    entries.push([`cache_teachers_${weekStart}`, JSON.stringify(teachers)]);
  }
  for (const [key, sched] of Object.entries(bulk.teacher_schedules)) {
    entries.push([`cache_teacher_${key}`, JSON.stringify(sched)]);
  }
  for (const [key, rooms] of Object.entries(bulk.free_rooms)) {
    entries.push([`cache_rooms_${key}`, JSON.stringify(rooms)]);
  }

  onProgress?.('Сохраняем...');
  // Сначала убираем устаревшее — свежий ответ уже в памяти, потерять нечего.
  await purgeStaleCache(new Set(entries.map(e => e[0])));
  try {
    await AsyncStorage.multiSet(entries);
  } catch {
    // Всё равно не влезло — чистим кэш целиком и пишем заново.
    await purgeStaleCache(null);
    await AsyncStorage.multiSet(entries);
  }

  await AsyncStorage.setItem('cache_sync_timestamp', new Date().toISOString());
}

export async function getLastSyncTime(): Promise<Date | null> {
  const ts = await AsyncStorage.getItem('cache_sync_timestamp');
  return ts ? new Date(ts) : null;
}

// Re-sync if last sync was more than 4 hours ago
export function shouldResync(last: Date | null): boolean {
  if (!last) return true;
  return Date.now() - last.getTime() > 4 * 3600 * 1000;
}

export function formatSyncTime(d: Date): string {
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${months[d.getMonth()]} · ${h}:${m}`;
}

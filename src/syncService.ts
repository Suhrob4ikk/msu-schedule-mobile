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
export async function performFullSync(onProgress?: ProgressCallback): Promise<void> {
  onProgress?.('Загружаем расписание...');
  const bulk = await api.getBulkSync();

  const writes: Promise<void>[] = [
    AsyncStorage.setItem('cache_groups', JSON.stringify(bulk.groups)),
    AsyncStorage.setItem('cache_weeks_all', JSON.stringify(bulk.weeks_all)),
  ];
  for (const [groupId, weeks] of Object.entries(bulk.group_weeks)) {
    writes.push(AsyncStorage.setItem(`cache_weeks_${groupId}`, JSON.stringify(weeks)));
  }
  for (const [key, sched] of Object.entries(bulk.schedules)) {
    writes.push(AsyncStorage.setItem(`cache_schedule_${key}`, JSON.stringify(sched)));
  }
  for (const [weekStart, teachers] of Object.entries(bulk.teachers_by_week)) {
    writes.push(AsyncStorage.setItem(`cache_teachers_${weekStart}`, JSON.stringify(teachers)));
  }
  for (const [key, sched] of Object.entries(bulk.teacher_schedules)) {
    writes.push(AsyncStorage.setItem(`cache_teacher_${key}`, JSON.stringify(sched)));
  }
  for (const [key, rooms] of Object.entries(bulk.free_rooms)) {
    writes.push(AsyncStorage.setItem(`cache_rooms_${key}`, JSON.stringify(rooms)));
  }
  onProgress?.('Сохраняем...');
  await Promise.all(writes);

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

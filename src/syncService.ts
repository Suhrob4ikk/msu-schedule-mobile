import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

/**
 * Этап полной синхронизации — для экрана первой загрузки (src/offline/), где
 * этапы отмечаются галочками. Событие приходит в НАЧАЛЕ этапа: все прежние
 * уже пройдены.
 */
export type SyncStage = 'download' | 'groups' | 'teachers' | 'rooms';
export type ProgressCallback = (step: string, stage: SyncStage) => void;

/** Что лежит на телефоне после синхронизации — итог экрана первой загрузки. */
export interface SyncSummary {
  groups: number;
  teachers: number;
  rooms: number;
}

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

/**
 * Стоит, пока идёт запись в хранилище: если приложение закрыли посередине,
 * на телефоне половина нового и половина старого — экран загрузки
 * (src/offline/) по этой метке предложит докачать. Не `cache_*`: те чистит purge.
 */
export const SYNC_INCOMPLETE_KEY = 'sync_incomplete';

const STEP_TEXT: Record<SyncStage, string> = {
  download: 'Загружаем расписание...',
  groups: 'Сохраняем расписание групп...',
  teachers: 'Сохраняем педагогов...',
  rooms: 'Сохраняем аудитории...',
};

// Синхронизация, которая идёт прямо сейчас. Её запускают с разных мест (старт,
// возврат сети, push, кнопка в Кабинете, экран первой загрузки) — второй
// запуск не качает ответ заново, а присоединяется к первому.
let running: Promise<SyncSummary> | null = null;
let currentStage: SyncStage = 'download';
const listeners = new Set<ProgressCallback>();

function report(stage: SyncStage) {
  currentStage = stage;
  listeners.forEach(fn => fn(STEP_TEXT[stage], stage));
}

async function runFullSync(): Promise<SyncSummary> {
  report('download');
  const bulk = await api.getBulkSync();

  const groupEntries: [string, string][] = [
    ['cache_groups', JSON.stringify(bulk.groups)],
    ['cache_weeks_all', JSON.stringify(bulk.weeks_all)],
  ];
  for (const [groupId, weeks] of Object.entries(bulk.group_weeks)) {
    groupEntries.push([`cache_weeks_${groupId}`, JSON.stringify(weeks)]);
  }
  for (const [key, sched] of Object.entries(bulk.schedules)) {
    groupEntries.push([`cache_schedule_${key}`, JSON.stringify(sched)]);
  }
  const teacherEntries: [string, string][] = [];
  const teacherIds = new Set<number>();
  for (const [weekStart, teachers] of Object.entries(bulk.teachers_by_week)) {
    teacherEntries.push([`cache_teachers_${weekStart}`, JSON.stringify(teachers)]);
    teachers.forEach(t => teacherIds.add(t.id));
  }
  for (const [key, sched] of Object.entries(bulk.teacher_schedules)) {
    teacherEntries.push([`cache_teacher_${key}`, JSON.stringify(sched)]);
  }
  const roomEntries: [string, string][] = [];
  const roomNames = new Set<string>();
  for (const [key, rooms] of Object.entries(bulk.free_rooms)) {
    roomEntries.push([`cache_rooms_${key}`, JSON.stringify(rooms)]);
    rooms.forEach(r => roomNames.add(r.room_name));
  }
  const entries = [...groupEntries, ...teacherEntries, ...roomEntries];

  // Сначала убираем устаревшее — свежий ответ уже в памяти, потерять нечего.
  report('groups');
  await AsyncStorage.setItem(SYNC_INCOMPLETE_KEY, '1');
  await purgeStaleCache(new Set(entries.map(e => e[0])));
  try {
    // Тремя частями — чтобы экран первой загрузки отмечал их по очереди
    await AsyncStorage.multiSet(groupEntries);
    report('teachers');
    await AsyncStorage.multiSet(teacherEntries);
    report('rooms');
    await AsyncStorage.multiSet(roomEntries);
  } catch {
    // Всё равно не влезло — чистим кэш целиком и пишем заново.
    await purgeStaleCache(null);
    await AsyncStorage.multiSet(entries);
  }

  await AsyncStorage.setItem('cache_sync_timestamp', new Date().toISOString());
  await AsyncStorage.removeItem(SYNC_INCOMPLETE_KEY);
  return { groups: bulk.groups.length, teachers: teacherIds.size, rooms: roomNames.size };
}

export function performFullSync(onProgress?: ProgressCallback): Promise<SyncSummary> {
  if (onProgress) {
    listeners.add(onProgress);
    // Присоединились к уже идущей — сразу говорим, на каком она этапе
    if (running) onProgress(STEP_TEXT[currentStage], currentStage);
  }
  if (!running) {
    running = runFullSync().finally(() => { running = null; });
  }
  const p = running;
  return onProgress ? p.finally(() => { listeners.delete(onProgress); }) : p;
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

/**
 * Данные «Уведомлений» и «Истории»: один источник для экрана и счётчика.
 *
 * Входящие = изменения своей группы и «новая неделя» своего факультета с
 * сервера (/schedule/changes?group_id=…) + зачёты из src/notificationHistory.ts.
 * Раньше изменения попадали во «Входящие», только если push дошёл при
 * открытом приложении или по нему нажали, — смахнутые терялись. Теперь
 * строка Уведомлений и запись Истории — одна и та же запись сервера.
 *
 * Отметки «прочитано» — только на телефоне (ключ notif_read), без сервера.
 */
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, invalidateApiCache, Group, WeekInfo, Lesson } from '../api';
import { getExamInbox, subscribeNotifHistory } from '../notificationHistory';
import { onScheduleUpdated } from '../scheduleEvents';
import {
  ChangeRec, ExamEntry, InboxItem, ReadState, buildInbox, markRead, markUnread, pruneRead, unreadCounts, weekStatsShort,
} from './state';

const READ_KEY = 'notif_read';
/** До 1.9.44 — момент последнего просмотра старой ленты изменений. */
const LEGACY_SEEN_KEY = 'changes_last_seen';
const UPDATED_KEY = 'notif_updated_at';

const myCacheKey = (gid: number) => `cache_changes_${gid}`;
const ALL_CACHE_KEY = 'cache_changes_all';

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

// ─── Группы ────────────────────────────────────────────────────────────────

/** Список групп: кэш, если пуст — сеть. Нужен для курса в строке группы. */
export async function loadGroups(): Promise<Group[]> {
  const cached = await readJson<Group[]>('cache_groups');
  if (cached?.length) return cached;
  try {
    const gs = await api.getGroups();
    AsyncStorage.setItem('cache_groups', JSON.stringify(gs)).catch(() => null);
    return gs;
  } catch {
    return [];
  }
}

export async function myGroupId(): Promise<number | null> {
  const v = await AsyncStorage.getItem('selected_group_id').catch(() => null);
  return v ? Number(v) : null;
}

// ─── Лента «Все факультеты» ────────────────────────────────────────────────

export const cachedAllChanges = () => readJson<ChangeRec[]>(ALL_CACHE_KEY);

export async function fetchAllChanges(force = false): Promise<ChangeRec[]> {
  if (force) invalidateApiCache('/schedule/changes');
  const data = (await api.getChanges()) as ChangeRec[];
  AsyncStorage.setItem(ALL_CACHE_KEY, JSON.stringify(data)).catch(() => null);
  return data;
}

// ─── «Новая неделя»: «20 пар · 7 предметов» ────────────────────────────────

/** Строка статистики недели своей группы — только из кэша, без запросов. */
export async function weekStatsFromCache(gid: number, weekStart: string): Promise<string | null> {
  const weeks = await readJson<WeekInfo[]>(`cache_weeks_${gid}`);
  const w = weeks?.find(x => x.week_start === weekStart);
  if (!w) return null;
  const ls = await readJson<Lesson[]>(`cache_schedule_${gid}_${w.id}`);
  return ls ? weekStatsShort(ls) : null;
}

// ─── Входящие: общий снимок ────────────────────────────────────────────────

export interface InboxSnap {
  groupId: number | null;
  /** null — ещё не читали ни кэш, ни сеть. */
  changes: ChangeRec[] | null;
  exams: ExamEntry[];
  read: ReadState | null;
  updatedAt: Date | null;
  /** Последний запрос не прошёл. */
  failed: boolean;
  loading: boolean;
}

let snap: InboxSnap = { groupId: null, changes: null, exams: [], read: null, updatedAt: null, failed: false, loading: false };
const subs = new Set<() => void>();
const emit = (patch: Partial<InboxSnap>) => {
  snap = { ...snap, ...patch };
  subs.forEach(fn => fn());
};

async function loadReadState(): Promise<ReadState> {
  const saved = await readJson<ReadState>(READ_KEY);
  if (saved && typeof saved.baseline === 'number' && saved.read) return saved;
  // Первый запуск 1.9.44: всё, что пришло до последнего просмотра старой ленты
  // (а если её не открывали — до этой минуты), считаем прочитанным.
  const legacy = await AsyncStorage.getItem(LEGACY_SEEN_KEY).catch(() => null);
  const legacyAt = legacy ? Date.parse(legacy) : NaN;
  const r: ReadState = { baseline: Number.isNaN(legacyAt) ? Date.now() : legacyAt, read: {} };
  AsyncStorage.setItem(READ_KEY, JSON.stringify(r)).catch(() => null);
  return r;
}

let refreshing: Promise<void> | null = null;

/**
 * Перечитать входящие: кэш и зачёты с телефона, потом сеть. force — пул
 * вниз: забыть ответ, сохранённый в памяти (src/api.ts держит его 3 минуты).
 */
export function refreshInbox(opts: { network?: boolean; force?: boolean } = {}): Promise<void> {
  const network = opts.network ?? true;
  const run = async () => {
    const gid = await myGroupId();
    const [exams, read, updated] = await Promise.all([
      getExamInbox(),
      snap.read ? Promise.resolve(snap.read) : loadReadState(),
      snap.updatedAt ? Promise.resolve(null) : AsyncStorage.getItem(UPDATED_KEY).catch(() => null),
    ]);
    let changes = gid === snap.groupId ? snap.changes : null;
    if (changes == null && gid != null) changes = await readJson<ChangeRec[]>(myCacheKey(gid));
    if (gid == null) changes = [];
    emit({
      groupId: gid, exams, read: pruneRead(read, new Date()), changes,
      updatedAt: snap.updatedAt ?? (updated ? new Date(updated) : null),
    });
    if (!network || gid == null) return;

    emit({ loading: true });
    try {
      if (opts.force) invalidateApiCache('/schedule/changes');
      const data = (await api.getChanges(gid)) as ChangeRec[];
      AsyncStorage.setItem(myCacheKey(gid), JSON.stringify(data)).catch(() => null);
      const at = new Date();
      AsyncStorage.setItem(UPDATED_KEY, at.toISOString()).catch(() => null);
      if ((await myGroupId()) === gid) emit({ changes: data, updatedAt: at, failed: false });
    } catch {
      // Кэша нет и сеть не ответила — changes остаётся null: История покажет «Нет подключения»
      emit({ failed: true });
    } finally {
      emit({ loading: false });
    }
  };
  // Пул вниз во время фоновой загрузки — дождаться её и повторить
  const prev = refreshing ?? Promise.resolve();
  const p = (opts.force ? prev.then(run) : refreshing ?? run()).finally(() => { if (refreshing === p) refreshing = null; });
  refreshing = p;
  return p;
}

let started = false;
/** Слушатели — один раз на всё приложение: зачёты, push, возврат в приложение. */
function ensureStarted() {
  if (started) return;
  started = true;
  refreshInbox();
  subscribeNotifHistory(() => { refreshInbox({ network: false }); });
  onScheduleUpdated(() => { refreshInbox(); });
  AppState.addEventListener('change', s => { if (s === 'active') refreshInbox(); });
}

function subscribe(fn: () => void) {
  ensureStarted();
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export function useInbox(): InboxSnap {
  return useSyncExternalStore(subscribe, () => snap);
}

/** Строки входящих на этот момент. */
export const inboxItems = (s: InboxSnap, now: Date): InboxItem[] => buildInbox(s.changes ?? [], s.exams, now);

/** Непрочитанные — для колокольчика и строки в Кабинете. */
export function unreadOf(s: InboxSnap, now: Date): number {
  if (!s.read) return 0;
  return unreadCounts(inboxItems(s, now), s.read).all;
}

async function saveRead(r: ReadState) {
  emit({ read: r });
  try {
    await AsyncStorage.setItem(READ_KEY, JSON.stringify(r));
  } catch { /* отметка останется до перезапуска */ }
}

export function setItemsRead(items: InboxItem[]): Promise<void> {
  if (!snap.read || !items.length) return Promise.resolve();
  return saveRead(markRead(snap.read, items));
}

export function setItemsUnread(ids: string[]): Promise<void> {
  if (!snap.read || !ids.length) return Promise.resolve();
  return saveRead(markUnread(snap.read, ids));
}

/** Нажатие на напоминание о зачёте в шторке — отметить строку прочитанной. */
export async function markExamReadById(examId: string): Promise<void> {
  await refreshInbox({ network: false });
  const e = snap.exams.find(x => x.id === examId);
  if (e) await setItemsRead([{ id: `e:${e.id}`, kind: 'exam', at: e.firstAt, exam: e }]);
}

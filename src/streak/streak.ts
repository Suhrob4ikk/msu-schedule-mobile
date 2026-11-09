/**
 * Огонёк серии — как на сайте (frontend/src/lib/streak.ts репозитория сайта; спека — docs/Огонёк — логика.md там же).
 *
 * С 9 ноя 2026 серию, рекорд, неделю и достижения считает СЕРВЕР (`POST /user/streak` → `summary`): сайт и приложение
 * показывают одно и то же, а заходы, сделанные с сайта, видны и здесь, если устройства связаны (код из 6 цифр или логин).
 * Правила (backend services/streak_rules.py): заход в любой день — +1; день без захода рвёт серию, только если у группы
 * в этот день точно были пары (каникулы и праздники не рвут); один такой пропуск в неделю спасает заморозка;
 * достижения — за дни всего, не подряд (21, 30, 40, 50).
 *
 * Без сети — тот же расчёт здесь по дням с сервера и своим (`streak_days`), будни без пар — `offdays` с сервера.
 * Видно только тестировщикам: «Тестовый режим» (Кабинет → долгое нажатие на номер версии) — `streak_on`,
 * `streak_test` — подставленная серия.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { API_BASE } from '../api';
import { dushanbeNow, isoOf } from '../holiday/holidays';

export const STREAK_GOAL = 21;   // владелец: «для достижений достаточно 21 дня» (1 ноя 2026); с 8 ноя — всего, не подряд
export const STREAK_HINT_DAYS = [7, 14, 20, 21];
const ON = 'streak_on', TEST = 'streak_test', DAYS = 'streak_days', BEST = 'streak_best';
const SRV = 'streak_state', VISIT = 'streak_visit_day';
export const STREAK_HINTS_KEY = 'streak_hints';

export type DayMark = 'visit' | 'frozen' | 'off' | 'missed' | 'today' | 'future';
export interface AchProgress { got: string | null; cur?: number; goal?: number }
export interface ServerSummary {
  streak: number; best: number; total: number; goal: number; freeze_left: boolean;
  week: { iso: string; mark: DayMark }[];
  achievements: Record<string, AchProgress>;
}
export interface ServerStreak {
  days: string[]; offdays: string[]; events: Record<string, string>; login: string | null;
  linked?: number; twin?: boolean; summary?: ServerSummary;
  /** Устройство владельца (привязано в /dev или кодом с его устройства) — у него «Сохранить серию» только показывает код. */
  owner?: boolean;
  /** День (по Душанбе), когда сервер посчитал summary. */
  at?: string;
}
export interface StreakState {
  streak: number; best: number;
  /** Всего дней с заходом (не подряд) — по ним достижения. */
  total: number;
  freezeLeft: boolean;
  week: { iso: string; mark: DayMark }[];
  test: boolean;
  /** Достижения с сервера (нет сети и не было ответа — null). */
  achievements: Record<string, AchProgress> | null;
  login: string | null;
  linked: number;
  twin: boolean;
  owner: boolean;
}

const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };
const dow = (iso: string) => (new Date(iso + 'T12:00:00').getDay() + 6) % 7;
const monday = (iso: string) => addDays(iso, -dow(iso));

/** Тот же расчёт, что на сервере, — когда его ответа нет: учебный день — пн–сб, кроме offdays с сервера. */
export function computeStreak(days: string[], today: string, off: Set<string> = new Set()) {
  const visited = new Set(days), frozen = new Set<string>(), usedWeeks = new Set<string>();
  if (!days.length) return { streak: 0, frozen, usedWeeks };
  const first = [...days].sort()[0];
  let streak = visited.has(today) ? 1 : 0;
  for (let d = addDays(today, -1); d >= first; d = addDays(d, -1)) {
    if (visited.has(d)) { streak++; continue; }
    if (dow(d) === 6 || off.has(d)) continue;
    const wk = monday(d);
    if (!usedWeeks.has(wk)) { usedWeeks.add(wk); frozen.add(d); continue; }
    break;
  }
  return { streak, frozen, usedWeeks };
}

let state: StreakState | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(f => f());

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try { const v = await AsyncStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } as T : fallback; } catch { return fallback; }
}
async function readDays(): Promise<string[]> {
  try { return JSON.parse((await AsyncStorage.getItem(DAYS)) ?? '[]'); } catch { return []; }
}
const EMPTY: ServerStreak = { days: [], offdays: [], events: {}, login: null };
export const readServerStreak = () => readJson<ServerStreak>(SRV, EMPTY);

export async function streakEnabled(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(ON)) === '1'; } catch { return false; }
}

export async function refreshStreak(): Promise<void> {
  if (!(await streakEnabled())) { state = null; emit(); return; }
  let testRaw: string | null = null, bestRaw: string | null = null;
  try { [testRaw, bestRaw] = [await AsyncStorage.getItem(TEST), await AsyncStorage.getItem(BEST)]; } catch { /* нет хранилища */ }
  const today = isoOf(dushanbeNow());
  const srv = await readServerStreak();
  const days = [...new Set([...(await readDays()), ...srv.days])];
  const off = new Set(srv.offdays);
  const test = testRaw === null ? null : Number(testRaw);
  const common = { login: srv.login, linked: srv.linked ?? 1, twin: !!srv.twin, owner: !!srv.owner, test: test !== null };
  const sm = srv.summary;
  if (test === null && sm && srv.at === today) {
    const best = Math.max(sm.best, Number(bestRaw || 0));
    state = { ...common, streak: sm.streak, best, total: sm.total, freezeLeft: sm.freeze_left, week: sm.week, achievements: sm.achievements };
    emit();
    return;
  }
  const { streak: real, frozen, usedWeeks } = computeStreak(days, today, off);
  const streak = test ?? real;
  const best = Math.max(streak, Number(bestRaw || 0));
  if (test === null) AsyncStorage.setItem(BEST, String(best)).catch(() => {});
  const visited = new Set(days), mon = monday(today);
  const week = Array.from({ length: 7 }, (_, i) => {
    const iso = addDays(mon, i);
    const mark: DayMark = iso > today ? 'future' : visited.has(iso) ? 'visit' : iso === today ? 'today'
      : frozen.has(iso) ? 'frozen' : dow(iso) === 6 || off.has(iso) ? 'off' : 'missed';
    return { iso, mark };
  });
  state = { ...common, streak, best, total: test ?? days.length, freezeLeft: !usedWeeks.has(mon), week,
    achievements: sm?.achievements ?? null };
  emit();
}

async function deviceId(): Promise<string | null> {
  try { return await AsyncStorage.getItem('msu_device_id'); } catch { return null; }
}

async function saveServer(data: Partial<ServerStreak>): Promise<void> {
  const st: ServerStreak = { ...EMPTY, ...data, at: isoOf(dushanbeNow()) };
  try { await AsyncStorage.setItem(SRV, JSON.stringify(st)); } catch { /* нет хранилища */ }
}

async function post(path: string, body: object): Promise<{ ok: boolean; data: any }> {
  const res = await fetch(`${API_BASE}/user/streak${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/** Устройство владельца ли (GET /user/owner — список в памяти сервера, базу не будит). */
async function isOwnerDevice(dev: string): Promise<boolean> {
  try { const r = await fetch(`${API_BASE}/user/owner?device_id=${encodeURIComponent(dev)}`); return !!(await r.json()).owner; } catch { return false; }
}

let busy: Promise<void> | null = null;
/** Заход (раз в день — сервер копит в памяти и пишет пачкой, базу не будит) и отметки для счётных достижений. */
async function syncStreak(visit: boolean, extra: { hits?: string[]; teacher?: { id: number; groups: number[] }; flags?: string[] } = {}): Promise<void> {
  if (!(await streakEnabled())) return;
  while (busy) await busy.catch(() => {});
  const dev = await deviceId();
  if (!dev) return;
  const today = isoOf(dushanbeNow());
  let sent: string | null = null;
  try { sent = await AsyncStorage.getItem(VISIT); } catch { /* нет хранилища */ }
  const srv = await readServerStreak();
  const needVisit = visit && (sent !== today || srv.at !== today);
  const flags = (extra.flags ?? []).filter(f => !srv.events[f]);
  if (!needVisit && !extra.hits?.length && !extra.teacher && !flags.length) return;
  const run = (async () => {
    try {
      const r = await post('', { device_id: dev, visit: needVisit, flags, hits: extra.hits ?? [],
        teacher_id: extra.teacher?.id ?? null, teacher_groups: extra.teacher?.groups ?? [] });
      if (!r.ok) return;
      await saveServer({ ...r.data, owner: await isOwnerDevice(dev) });
      if (needVisit) await AsyncStorage.setItem(VISIT, today).catch(() => {});
    } catch { /* нет сети — отправим при следующем заходе */ }
  })();
  busy = run;
  try { await run; } finally { if (busy === run) busy = null; }
  await refreshStreak();
}

/** Отметить сегодняшний заход (при запуске и возврате в приложение). */
export async function noteStreakVisit(): Promise<void> {
  try {
    if (await streakEnabled()) {
      const today = isoOf(dushanbeNow()), days = await readDays();
      if (!days.includes(today)) await AsyncStorage.setItem(DAYS, JSON.stringify([...days, today].slice(-400)));
    }
  } catch { /* нет хранилища */ }
  await refreshStreak();
  const now = dushanbeNow();
  void syncStreak(true, { flags: now.getHours() === 0 && now.getMinutes() <= 1 ? ['zero'] : [] });
}

/** Редкое событие для достижения (explorer — побывал везде; zero — секрет, время проверяет сервер). */
export async function noteStreakEvent(flag: string): Promise<void> { await syncStreak(false, { flags: [flag] }); }

const EXPLORE = ['/', '/teachers', '/rooms', '/changes', '/compare', '/profile'];
/** Открыта вкладка или экран — для «Следопыта» и «Ключа от аудитории». Зовёт app/_layout.tsx при смене экрана. */
export async function noteStreakScreen(path: string): Promise<void> {
  if (!(await streakEnabled())) return;
  if (path.startsWith('/rooms')) void noteStreakHit('rooms');
  const tab = EXPLORE.find(t => (t === '/' ? path === '/' : path.startsWith(t)));
  if (!tab) return;
  let seen: string[] = [];
  try { seen = JSON.parse((await AsyncStorage.getItem('streak_tabs')) ?? '[]'); } catch { /* нет хранилища */ }
  if (!seen.includes(tab)) { seen = [...seen, tab]; AsyncStorage.setItem('streak_tabs', JSON.stringify(seen)).catch(() => {}); }
  if (EXPLORE.every(t => seen.includes(t))) void noteStreakEvent('explorer');
}

/** «Аудитории», «поделился» — раз в день на вид. */
export async function noteStreakHit(kind: 'rooms' | 'share'): Promise<void> {
  const k = `streak_hit_${kind}`, today = isoOf(dushanbeNow());
  try { if ((await AsyncStorage.getItem(k)) === today) return; await AsyncStorage.setItem(k, today); } catch { return; }
  await syncStreak(false, { hits: [kind] });
}

/** Открыли расписание преподавателя — для «Кто ведёт?» (каждый преподаватель — один раз). */
export async function noteStreakTeacher(id: number, groups: number[]): Promise<void> {
  const uniq = [...new Set(groups)].filter(Boolean);
  if (!uniq.length) return;
  const k = 'streak_hit_teachers';
  let seen: number[] = [];
  try { seen = JSON.parse((await AsyncStorage.getItem(k)) ?? '[]'); } catch { /* нет хранилища */ }
  if (seen.includes(id)) return;
  AsyncStorage.setItem(k, JSON.stringify([...seen, id].slice(-60))).catch(() => {});
  await syncStreak(false, { teacher: { id, groups: uniq } });
}

/** Перечитать с сервера (устройство, показавшее код, так узнаёт о связи). */
export async function reloadStreak(): Promise<void> {
  await AsyncStorage.removeItem(VISIT).catch(() => {});
  await syncStreak(true);
}

const errText = (d: any) => (typeof d?.detail === 'string' ? d.detail : 'Не получилось — попробуйте ещё раз');

/** Код из 6 цифр: связать свои устройства без пароля. */
export async function pairStart(): Promise<{ code: string; expires: number } | string> {
  const dev = await deviceId();
  if (!dev) return 'Сначала выберите группу';
  try {
    const r = await post('/pair/start', { device_id: dev });
    if (!r.ok) return errText(r.data);
    return { code: String(r.data.code), expires: Date.now() + Number(r.data.expires_in ?? 300) * 1000 };
  } catch { return 'Нет сети — попробуйте позже'; }
}

export async function pairClaim(code: string): Promise<string> {
  const dev = await deviceId();
  if (!dev) return 'Сначала выберите группу';
  try {
    const r = await post('/pair/claim', { device_id: dev, code });
    if (!r.ok) return errText(r.data);
    await saveServer(r.data);
    await refreshStreak();
    return '';
  } catch { return 'Нет сети — попробуйте позже'; }
}

/** Логин и пароль: создать / войти / выйти. Текст ошибки или ''. */
export async function streakAccount(kind: 'account' | 'login' | 'logout', login = '', password = ''): Promise<string> {
  const dev = await deviceId();
  if (!dev) return 'Сначала выберите группу';
  try {
    const r = await post(`/${kind}`, kind === 'logout' ? { device_id: dev } : { device_id: dev, login, password });
    if (!r.ok) return errText(r.data);
    await saveServer(r.data);
    await refreshStreak();
    return '';
  } catch { return 'Нет сети — попробуйте позже'; }
}

/** Тестовый режим: null — выключить; 'on' — настоящий счёт; число — подставить серию. */
export async function setStreakTest(v: null | 'on' | number): Promise<void> {
  try {
    if (v === null) { await AsyncStorage.multiRemove([ON, TEST]); }
    else {
      await AsyncStorage.setItem(ON, '1');
      if (v === 'on') await AsyncStorage.removeItem(TEST);
      else { await AsyncStorage.setItem(TEST, String(v)); await AsyncStorage.removeItem(STREAK_HINTS_KEY); }
    }
  } catch { /* нет хранилища */ }
  await noteStreakVisit();
}

export function useStreak(): StreakState | null {
  const [s, setS] = useState(state);
  useEffect(() => { const f = () => setS(state); listeners.add(f); f(); return () => { listeners.delete(f); }; }, []);
  return s;
}

export function flameStage(n: number): number {
  return n <= 0 ? 0 : n <= 2 ? 1 : n <= 6 ? 2 : n <= 13 ? 3 : n <= 29 ? 4 : n <= 59 ? 5 : 6;
}
export function daysWord(n: number): string {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? 'день' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'дня' : 'дней';
}

// Открыть шторку огонька (из подсказки, с другой вкладки). section 'save' — сразу к «Сохранить серию».
type Opener = (section?: 'save') => void;
const openListeners = new Set<Opener>();
// Огонёк живёт в Кабинете: если Кабинет ещё не открывали, запрос ждёт, пока шторка появится
let pendingOpen: { section?: 'save' } | null = null;
export function openStreakSheet(section?: 'save'): void {
  if (openListeners.size) openListeners.forEach(f => f(section)); else pendingOpen = { section };
}
export function onOpenStreakSheet(f: Opener): () => void {
  openListeners.add(f);
  if (pendingOpen) { const p = pendingOpen; pendingOpen = null; f(p.section); }
  return () => { openListeners.delete(f); };
}

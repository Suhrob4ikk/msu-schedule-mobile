/**
 * Огонёк серии — как на сайте (frontend/src/lib/streak.ts), правила владельца 1 ноя 2026: каждый день,
 * когда открыли приложение, — +1 (и воскресенье, и день без пар); день без пар без захода серию не рвёт;
 * учебный день без захода обнуляет, но раз в неделю (пн–вс) один такой пропуск спасает «заморозка»;
 * сегодняшний день, пока не кончился, серию не рвёт.
 *
 * ТЕСТОВАЯ ВЕРСИЯ: заходы копятся только на этом телефоне (`streak_days`), «учебный день» — пн–сб.
 * Видно только после «Тестового режима» (Кабинет → долгое нажатие на номер версии): `streak_on`,
 * `streak_test` — подставленная серия для проверки подсказок.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { dushanbeNow, isoOf } from '../holiday/holidays';

export const STREAK_GOAL = 21;   // владелец: «для достижений достаточно 21 дня» (1 ноя 2026)
export const STREAK_HINT_DAYS = [7, 14, 20, 21];
const ON = 'streak_on', TEST = 'streak_test', DAYS = 'streak_days', BEST = 'streak_best';
export const STREAK_HINTS_KEY = 'streak_hints';

export type DayMark = 'visit' | 'frozen' | 'off' | 'missed' | 'today' | 'future';
export interface StreakState { streak: number; best: number; freezeLeft: boolean; week: { iso: string; mark: DayMark }[]; test: boolean }

const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };
const dow = (iso: string) => (new Date(iso + 'T12:00:00').getDay() + 6) % 7;
const monday = (iso: string) => addDays(iso, -dow(iso));
const isStudyDay = (iso: string) => dow(iso) !== 6;

export function computeStreak(days: string[], today: string) {
  const visited = new Set(days), frozen = new Set<string>(), usedWeeks = new Set<string>();
  if (!days.length) return { streak: 0, frozen, usedWeeks };
  const first = [...days].sort()[0];
  let streak = visited.has(today) ? 1 : 0;
  for (let d = addDays(today, -1); d >= first; d = addDays(d, -1)) {
    if (visited.has(d)) { streak++; continue; }
    if (!isStudyDay(d)) continue;
    const wk = monday(d);
    if (!usedWeeks.has(wk)) { usedWeeks.add(wk); frozen.add(d); continue; }
    break;
  }
  return { streak, frozen, usedWeeks };
}

let state: StreakState | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(f => f());

async function readDays(): Promise<string[]> {
  try { return JSON.parse((await AsyncStorage.getItem(DAYS)) ?? '[]'); } catch { return []; }
}

export async function refreshStreak(): Promise<void> {
  let on = false, testRaw: string | null = null, bestRaw: string | null = null;
  try { [on, testRaw, bestRaw] = [(await AsyncStorage.getItem(ON)) === '1', await AsyncStorage.getItem(TEST), await AsyncStorage.getItem(BEST)]; } catch { /* нет хранилища */ }
  if (!on) { state = null; emit(); return; }
  const today = isoOf(dushanbeNow()), days = await readDays();
  const { streak: real, frozen, usedWeeks } = computeStreak(days, today);
  const test = testRaw === null ? null : Number(testRaw);
  const streak = test ?? real;
  const best = Math.max(streak, Number(bestRaw || 0));
  if (test === null) AsyncStorage.setItem(BEST, String(best)).catch(() => {});
  const visited = new Set(days), mon = monday(today);
  const week = Array.from({ length: 7 }, (_, i) => {
    const iso = addDays(mon, i);
    const mark: DayMark = iso > today ? 'future' : visited.has(iso) ? 'visit' : iso === today ? 'today' : frozen.has(iso) ? 'frozen' : !isStudyDay(iso) ? 'off' : 'missed';
    return { iso, mark };
  });
  state = { streak, best, freezeLeft: !usedWeeks.has(mon), week, test: test !== null };
  emit();
}

/** Отметить сегодняшний заход (при запуске и возврате в приложение). */
export async function noteStreakVisit(): Promise<void> {
  try {
    if ((await AsyncStorage.getItem(ON)) === '1') {
      const today = isoOf(dushanbeNow()), days = await readDays();
      if (!days.includes(today)) await AsyncStorage.setItem(DAYS, JSON.stringify([...days, today].slice(-400)));
    }
  } catch { /* нет хранилища */ }
  await refreshStreak();
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

// Открыть шторку огонька из подсказки «30 дней подряд»
const openListeners = new Set<() => void>();
// Огонёк живёт в Кабинете: если Кабинет ещё не открывали, запрос ждёт, пока строка появится
let pendingOpen = false;
export function openStreakSheet(): void { if (openListeners.size) openListeners.forEach(f => f()); else pendingOpen = true; }
export function onOpenStreakSheet(f: () => void): () => void {
  openListeners.add(f);
  if (pendingOpen) { pendingOpen = false; f(); }
  return () => { openListeners.delete(f); };
}

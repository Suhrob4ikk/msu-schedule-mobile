/**
 * Праздничное оформление — как на сайте (frontend/src/lib/holidays.ts): открытка сверху Расписания
 * (HolidayBanner), эффекты поверх всех вкладок (HolidayParticles в app/_layout.tsx), карточки пар в
 * настроении праздника (HolidayCardDeco). Список и тексты — те же, что на сайте.
 *
 * Даты владелец назовёт позже: без `days` студенты ничего не видят. Проверка — «Тестовый режим»
 * (Кабинет → долгое нажатие на номер версии внизу, src/TestModeSheet.tsx): ключ `holiday_test`.
 * Выключатель для всех — «Внешний вид» → «Праздничное оформление» (ключ `holiday_off`).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type HolidayId = 'ny' | 'nye' | 'navruz' | 'mar8' | 'sep1' | 'indep' | 'session' | 'eid_ramazon' | 'eid_qurbon';
export type HolidayFx = 'snow' | 'petals' | 'glow' | 'none';
export type Burst = 'fireworks' | 'confetti' | 'both';

export interface Holiday {
  id: HolidayId;
  title: string;
  sub: string;
  label: string;
  scene: 'ny' | 'navruz' | 'mar8' | 'sep1' | 'indep' | 'eid';
  fx: HolidayFx;
  burst?: Burst;
  garland?: boolean;
  /** Дни показа «MM-DD» включительно, по Душанбе. Пусто — только тестовый режим. */
  days?: [string, string][];
}

export const HOLIDAYS: Holiday[] = [
  { id: 'ny', label: 'Новый год', title: 'С наступающим Новым годом!', sub: 'Хороших праздников и лёгкой сессии', scene: 'ny', fx: 'snow', garland: true },
  { id: 'nye', label: '31 декабря', title: 'До Нового года', sub: '', scene: 'ny', fx: 'snow', garland: true, burst: 'both' },
  { id: 'navruz', label: 'Навруз', title: 'Навруз муборак!', sub: 'С праздником весны и нового года', scene: 'navruz', fx: 'petals' },
  { id: 'mar8', label: '8 Марта', title: 'С 8 Марта!', sub: 'Поздравляем с Международным женским днём', scene: 'mar8', fx: 'glow' },
  { id: 'sep1', label: 'День знаний', title: 'С началом учебного года!', sub: 'Удачного семестра', scene: 'sep1', fx: 'none', burst: 'confetti' },
  { id: 'indep', label: 'День независимости', title: 'С Днём независимости!', sub: 'С праздником, Таджикистан', scene: 'indep', fx: 'none', burst: 'fireworks' },
  { id: 'session', label: 'Конец сессии', title: 'Сессия закрыта!', sub: 'Последний экзамен позади. Хороших каникул', scene: 'indep', fx: 'none', burst: 'both' },
  { id: 'eid_ramazon', label: 'Иди Рамазон', title: 'Иди Рамазон муборак!', sub: 'Поздравляем с праздником', scene: 'eid', fx: 'glow' },
  { id: 'eid_qurbon', label: 'Иди Қурбон', title: 'Иди Қурбон муборак!', sub: 'Поздравляем с праздником', scene: 'eid', fx: 'glow' },
];

export const HOLIDAY_TEST_KEY = 'holiday_test';
export const HOLIDAY_OFF_KEY = 'holiday_off';

/** Сейчас по Душанбе (UTC+5) — поля Date как у часов в Душанбе. */
export function dushanbeNow(ms: number = Date.now()): Date {
  const offsetMin = new Date(ms).getTimezoneOffset();
  return new Date(ms + (offsetMin + 300) * 60_000);
}
export const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mmdd = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inRange = (md: string, [from, to]: [string, string]) => (from <= to ? md >= from && md <= to : md >= from || md <= to);

// ── Состояние на всё приложение ────────────────────────────────────
let state: { holiday: Holiday | null; test: boolean } = { holiday: null, test: false };
const listeners = new Set<() => void>();
const burstListeners = new Set<(b: Burst) => void>();

export async function refreshHoliday(): Promise<void> {
  let test: string | null = null, off = false;
  try { [test, off] = [await AsyncStorage.getItem(HOLIDAY_TEST_KEY), (await AsyncStorage.getItem(HOLIDAY_OFF_KEY)) === '1']; } catch { /* нет хранилища */ }
  let holiday: Holiday | null = null;
  if (test) holiday = HOLIDAYS.find(h => h.id === test) ?? null;
  else if (!off) { const md = mmdd(dushanbeNow()); holiday = HOLIDAYS.find(h => h.days?.some(r => inRange(md, r))) ?? null; }
  state = { holiday, test: !!test && !!holiday };
  listeners.forEach(f => f());
}

export async function setTestHoliday(id: HolidayId | null): Promise<void> {
  try { if (id) await AsyncStorage.setItem(HOLIDAY_TEST_KEY, id); else await AsyncStorage.removeItem(HOLIDAY_TEST_KEY); } catch { /* нет хранилища */ }
  await refreshHoliday();
}

export async function setHolidayOff(off: boolean): Promise<void> {
  try { if (off) await AsyncStorage.setItem(HOLIDAY_OFF_KEY, '1'); else await AsyncStorage.removeItem(HOLIDAY_OFF_KEY); } catch { /* нет хранилища */ }
  await refreshHoliday();
}

export function useHoliday(): { holiday: Holiday | null; test: boolean } {
  const [s, setS] = useState(state);
  useEffect(() => {
    const f = () => setS(state);
    listeners.add(f);
    f();
    return () => { listeners.delete(f); };
  }, []);
  return s;
}

/** Салют/конфетти по всему экрану (HolidayParticles). */
export function askBurst(b: Burst | undefined): void { if (b) burstListeners.forEach(f => f(b)); }
export function onBurst(f: (b: Burst) => void): () => void { burstListeners.add(f); return () => { burstListeners.delete(f); }; }

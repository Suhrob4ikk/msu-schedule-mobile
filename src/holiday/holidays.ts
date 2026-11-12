/**
 * Праздничное оформление — как на сайте (frontend/src/lib/holidays.ts): открытка сверху Расписания
 * (HolidayBanner), эффекты поверх всех вкладок (HolidayParticles в app/_layout.tsx), карточки пар в
 * настроении праздника (HolidayCardDeco). Список и тексты — те же, что на сайте.
 *
 * Даты владелец назовёт позже: без `days` студенты ничего не видят. Проверка — «Тестовый режим»
 * (Кабинет → долгое нажатие на номер версии внизу, src/TestModeSheet.tsx): ключ `holiday_test`.
 * Выключатель для всех — «Внешний вид» → «Праздничное оформление» (ключ `holiday_off`).
 *
 * «Погода» из панели /dev (12 ноя 2026, как на сайте — frontend/src/lib/siteFlags.ts): владелец включает снег или дождь
 * у всех, если он пошёл в Душанбе. Только эффект, без открытки. Ответ сервера `GET /user/site-flags` — в AsyncStorage
 * `site_weather` («snow» / «rain» / пусто); спрашиваем при запуске и возврате (не чаще раза в 5 минут). `holiday_off`
 * снимает и его.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { API_BASE } from '../api';

export type HolidayId = 'ny' | 'nye' | 'ny2' | 'navruz' | 'mar8' | 'sep1' | 'indep' | 'session' | 'eid_ramazon' | 'eid_qurbon';
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
  // Новый год — даты от владельца (1 ноя 2026): с 15 декабря по 7 января; 31-го — отсчёт до полуночи
  { id: 'ny', label: 'Новый год', title: 'С наступающим Новым годом!', sub: 'Хороших праздников и лёгкой сессии', scene: 'ny', fx: 'snow', garland: true, days: [['12-15', '12-30']] },
  { id: 'nye', label: '31 декабря', title: 'До Нового года', sub: '', scene: 'ny', fx: 'snow', garland: true, burst: 'both', days: [['12-31', '12-31']] },
  { id: 'ny2', label: '1–7 января', title: 'С Новым годом!', sub: 'Хороших праздников и лёгкой сессии', scene: 'ny', fx: 'snow', garland: true, days: [['01-01', '01-07']] },
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
export const SITE_WEATHER_KEY = 'site_weather';
export type Weather = 'snow' | 'rain' | null;

/** Сейчас по Душанбе (UTC+5) — поля Date как у часов в Душанбе. */
export function dushanbeNow(ms: number = Date.now()): Date {
  const offsetMin = new Date(ms).getTimezoneOffset();
  return new Date(ms + (offsetMin + 300) * 60_000);
}
export const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mmdd = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inRange = (md: string, [from, to]: [string, string]) => (from <= to ? md >= from && md <= to : md >= from || md <= to);

// ── Состояние на всё приложение ────────────────────────────────────
type HState = { holiday: Holiday | null; test: boolean; off: boolean; testId: HolidayId | null; weather: Weather };
let state: HState = { holiday: null, test: false, off: false, testId: null, weather: null };
const listeners = new Set<() => void>();
const burstListeners = new Set<(b: Burst) => void>();

export async function refreshHoliday(): Promise<void> {
  let test: string | null = null, off = false, w: string | null = null;
  try {
    [test, off, w] = [await AsyncStorage.getItem(HOLIDAY_TEST_KEY), (await AsyncStorage.getItem(HOLIDAY_OFF_KEY)) === '1',
      await AsyncStorage.getItem(SITE_WEATHER_KEY)];
  } catch { /* нет хранилища */ }
  const siteWeather: Weather = w === 'snow' || w === 'rain' ? w : null;
  // выключатель во «Внешнем виде» сильнее всего, и тестового праздника тоже (как на сайте)
  let holiday: Holiday | null = null;
  if (off) holiday = null;
  else if (test) holiday = HOLIDAYS.find(h => h.id === test) ?? null;
  else { const md = mmdd(dushanbeNow()); holiday = HOLIDAYS.find(h => h.days?.some(r => inRange(md, r))) ?? null; }
  // погода владельца — только когда праздника нет (в праздник свой эффект) и оформление не выключено
  state = { holiday, test: !!test && !!holiday, off, testId: (test as HolidayId | null) ?? null, weather: !off && !holiday ? siteWeather : null };
  listeners.forEach(f => f());
}

let flagsAt = 0;
/** Спросить сервер, включены ли снег или дождь из панели /dev (не чаще раза в 5 минут; force — сразу). */
export async function refreshSiteFlags(force = false): Promise<void> {
  if (!force && Date.now() - flagsAt < 5 * 60_000) return;
  flagsAt = Date.now();
  try {
    const r = await fetch(`${API_BASE}/user/site-flags`);
    if (!r.ok) return;
    const f = await r.json();
    const next = f.snow ? 'snow' : f.rain ? 'rain' : '';
    if (((await AsyncStorage.getItem(SITE_WEATHER_KEY)) ?? '') !== next) {
      await AsyncStorage.setItem(SITE_WEATHER_KEY, next);
      await refreshHoliday();
    }
  } catch { /* нет сети — остаётся прежний ответ */ }
}

export async function setTestHoliday(id: HolidayId | null): Promise<void> {
  try {
    if (id) { await AsyncStorage.setItem(HOLIDAY_TEST_KEY, id); await AsyncStorage.removeItem(HOLIDAY_OFF_KEY); }
    else await AsyncStorage.removeItem(HOLIDAY_TEST_KEY);
  } catch { /* нет хранилища */ }
  await refreshHoliday();
}

export async function setHolidayOff(off: boolean): Promise<void> {
  try { if (off) await AsyncStorage.setItem(HOLIDAY_OFF_KEY, '1'); else await AsyncStorage.removeItem(HOLIDAY_OFF_KEY); } catch { /* нет хранилища */ }
  await refreshHoliday();
}

export function useHoliday(): HState {
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

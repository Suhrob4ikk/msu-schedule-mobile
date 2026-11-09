/**
 * Призы за достижения — как на сайте (lib/prizes.ts репозитория сайта; демо — docs/Призы за достижения - демо.html).
 * Каждый приз человек включает и выключает сам. Пока достижений нет — призы включаются только в
 * «Тестовом режиме» (Кабинет → долгое нажатие на номер версии).
 *
 * «Живая рамка» вокруг идущей пары (в цвет оформления или радугой), «Табло» (время перелистывается
 * цифрами), «Живое небо» в шапке «Расписания» (восход и закат по Душанбе), «Другой огонёк» (8 видов).
 * Хранение — AsyncStorage `prizes`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type FlameKind = 'base' | 'blue' | 'violet' | 'emerald' | 'ice' | 'rainbow' | 'plasma' | 'black';
export const FLAME_NAMES: Record<FlameKind, string> = {
  base: 'Обычный', blue: 'Синий', violet: 'Фиолетовый', emerald: 'Изумрудный',
  ice: 'Ледяной', rainbow: 'Радужный', plasma: 'Плазма', black: 'Чёрный огонь',
};

export interface Prizes {
  /** «Волна» (бывшая «Живая рамка», 9 ноя 2026): 'off' — выкл, иначе вкл ('rainbow' — от прежних тестов, тоже вкл). */
  frame: 'off' | 'accent' | 'rainbow';
  flip: boolean;
  sky: boolean;
  flame: FlameKind;
  /** «Финал недели» (src/prizes/WeekFinale.tsx) — не выключается: получил — работает. */
  final: boolean;
}
export const NO_PRIZES: Prizes = { frame: 'off', flip: false, sky: false, flame: 'base', final: false };
/** Открытый приз, который человек ещё не трогал, — включён (как на сайте, lib/prizes.ts). */
const ON_BY_DEFAULT: Prizes = { frame: 'accent', flip: true, sky: true, flame: 'base', final: true };
const KEY = 'prizes';                       // выбор человека
const UNLOCKED = 'prizes_unlocked';         // открытые достижениями (пишет src/streak/AchToast.tsx)
const TEST = 'prizes_test';                 // «Тестовый режим»: призы без достижений

let choices: Partial<Prizes> = {};
let unlocked = new Set<string>();
let test = false;
let state: Prizes = NO_PRIZES;
const listeners = new Set<() => void>();

/** Призы, которые сейчас действуют: в тесте — выбор как есть, иначе — только открытые достижениями (как на сайте). */
function effective(): Prizes {
  if (test) return { ...NO_PRIZES, ...choices };
  return {
    frame: unlocked.has('frame') ? choices.frame ?? ON_BY_DEFAULT.frame : 'off',
    flip: unlocked.has('flip') ? choices.flip ?? ON_BY_DEFAULT.flip : false,
    sky: unlocked.has('sky') ? choices.sky ?? ON_BY_DEFAULT.sky : false,
    flame: unlocked.has('flame') ? choices.flame ?? 'base' : 'base',
    final: unlocked.has('final'),
  };
}
const emit = () => { state = effective(); listeners.forEach(f => f()); };

export async function refreshPrizes(): Promise<void> {
  try {
    const [[, c], [, u], [, t]] = await AsyncStorage.multiGet([KEY, UNLOCKED, TEST]);
    choices = JSON.parse(c ?? '{}');
    unlocked = new Set(JSON.parse(u ?? '[]'));
    // до 9 ноя 2026 призы включались только «Тестовым режимом» — у кого они уже выбраны, тот тестировщик
    test = t === '1' || (t === null && c !== null && u === null);
    if (test && t === null) AsyncStorage.setItem(TEST, '1').catch(() => {});
  } catch { choices = {}; unlocked = new Set(); test = false; }
  emit();
}

/** Выбор человека в шторке огонька. */
export async function savePrizes(patch: Partial<Prizes>): Promise<void> {
  choices = { ...choices, ...patch };
  emit();
  try { await AsyncStorage.setItem(KEY, JSON.stringify(choices)); } catch { /* нет хранилища */ }
}

/** «Тестовый режим»: включить приз без достижений. */
export async function savePrizesTest(patch: Partial<Prizes>): Promise<void> {
  test = true;
  AsyncStorage.setItem(TEST, '1').catch(() => {});
  await savePrizes(patch);
}

/** Какие призы открыты достижениями — пишет AchToast по ответу сервера. */
export async function saveUnlocked(ids: string[]): Promise<void> {
  const next = [...ids].sort();
  if (next.join() === [...unlocked].sort().join()) return;
  unlocked = new Set(next);
  emit();
  try { await AsyncStorage.setItem(UNLOCKED, JSON.stringify(next)); } catch { /* нет хранилища */ }
}

export const anyPrize = (p: Prizes) => test && (p.frame !== 'off' || p.flip || p.sky || p.flame !== 'base');

/** Открыт ли приз достижением (например, «Ранний доступ» — значок в профиле). */
export function usePrizeUnlocked(id: string): boolean {
  const [on, setOn] = useState(unlocked.has(id));
  useEffect(() => { const f = () => setOn(unlocked.has(id)); listeners.add(f); f(); return () => { listeners.delete(f); }; }, [id]);
  return on;
}

export function usePrizes(): Prizes {
  const [p, setP] = useState(state);
  useEffect(() => {
    const f = () => setP(state);
    listeners.add(f);
    f();
    return () => { listeners.delete(f); };
  }, []);
  return p;
}

/** Восход и закат (часы, по Душанбе, UTC+5) — упрощённая формула NOAA, точность 1–2 минуты. */
export function sunTimes(date: Date): [number, number] {
  const rad = Math.PI / 180, lat = 38.56, lon = 68.77, tz = 5;
  const n = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 864e5);
  const g = 2 * Math.PI / 365 * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(dec)) - Math.tan(lat * rad) * Math.tan(dec)) / rad;
  return [(720 - 4 * (lon + ha) - eq) / 60 + tz, (720 - 4 * (lon - ha) - eq) / 60 + tz];
}

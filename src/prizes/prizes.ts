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
  /** Живая рамка: выкл / в цвет оформления / радуга. */
  frame: 'off' | 'accent' | 'rainbow';
  flip: boolean;
  sky: boolean;
  flame: FlameKind;
}
export const NO_PRIZES: Prizes = { frame: 'off', flip: false, sky: false, flame: 'base' };
const KEY = 'prizes';

let state: Prizes = NO_PRIZES;
const listeners = new Set<() => void>();

export async function refreshPrizes(): Promise<void> {
  try { state = { ...NO_PRIZES, ...JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') }; } catch { state = NO_PRIZES; }
  listeners.forEach(f => f());
}

export async function savePrizes(patch: Partial<Prizes>): Promise<void> {
  state = { ...state, ...patch };
  listeners.forEach(f => f());
  try { await AsyncStorage.setItem(KEY, JSON.stringify(state)); } catch { /* нет хранилища */ }
}

export const anyPrize = (p: Prizes) => p.frame !== 'off' || p.flip || p.sky || p.flame !== 'base';

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

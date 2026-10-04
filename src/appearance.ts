/**
 * Хранение настроек «Внешнего вида»: один ключ `appearance` в AsyncStorage.
 * Чтение стартует при загрузке модуля, корневой _layout ждёт его до первого
 * кадра — без мигания синего или светлой темы. Значение живёт здесь, с
 * подпиской: меняется сразу во всех вкладках, без перезапуска.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, DEFAULT_APPEARANCE, migrateLegacy, parseAppearance } from './appearanceModel';

const KEY = 'appearance';
/** Ключи до 1.9.40 — читаются один раз для переноса и не стираются. */
const LEGACY_THEME = 'msu_theme';
const LEGACY_ACCENT = 'msu_accent';

let value: Appearance | null = null;
const listeners = new Set<(a: Appearance) => void>();

async function load(): Promise<Appearance> {
  try {
    const parsed = parseAppearance(await AsyncStorage.getItem(KEY));
    if (parsed) return parsed;
    const pairs = await AsyncStorage.multiGet([LEGACY_THEME, LEGACY_ACCENT]);
    const migrated = migrateLegacy(pairs[0]?.[1] ?? null, pairs[1]?.[1] ?? null);
    await AsyncStorage.setItem(KEY, JSON.stringify(migrated)).catch(() => null);
    return migrated;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

const loading = load().then(a => {
  value = a;
  listeners.forEach(l => l(a));
  return a;
});

export function getAppearance(): Appearance {
  return value ?? DEFAULT_APPEARANCE;
}

export function setAppearance(next: Appearance | ((prev: Appearance) => Appearance)): void {
  const a = typeof next === 'function' ? next(getAppearance()) : next;
  value = a;
  listeners.forEach(l => l(a));
  AsyncStorage.setItem(KEY, JSON.stringify(a)).catch(() => null);
}

export function resetAppearance(): void {
  setAppearance(DEFAULT_APPEARANCE);
}

/** null — ещё не прочитано (доли секунды при запуске). */
export function useAppearance(): Appearance | null {
  const [a, setA] = useState<Appearance | null>(value);
  useEffect(() => {
    listeners.add(setA);
    if (value) setA(value);
    else loading.then(setA);
    return () => { listeners.delete(setA); };
  }, []);
  return a;
}

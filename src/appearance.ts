/**
 * Хранение настроек «Внешнего вида»: один ключ `appearance` в AsyncStorage.
 * Чтение стартует при загрузке модуля, корневой _layout ждёт его до первого
 * кадра — без мигания синего или светлой темы.
 *
 * Два значения, чтобы касание не ждало перекраски всего приложения:
 *  - «выбранное» (useSelectedAppearance) — меняется сразу, на него подписан
 *    только экран «Внешний вид»: кольцо выбора появляется в тот же кадр;
 *  - «применённое» (useAppearance, его читает ThemeProvider) — следующим
 *    кадром после касания. Быстрые тапы схлопываются: применяется последний.
 * Запись в хранилище — одна, через 400 мс после последнего изменения.
 */
import { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, DEFAULT_APPEARANCE, migrateLegacy, parseAppearance } from './appearanceModel';
import { writeWidgetTheme } from './widgetTheme';

const KEY = 'appearance';
/** Ключи до 1.9.40 — читаются один раз для переноса и не стираются. */
const LEGACY_THEME = 'msu_theme';
const LEGACY_ACCENT = 'msu_accent';
const WRITE_DELAY_MS = 400;

let applied: Appearance | null = null;
let selected: Appearance | null = null;
const appliedListeners = new Set<(a: Appearance) => void>();
const selectedListeners = new Set<(a: Appearance) => void>();

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
  applied = a;
  selected = a;
  appliedListeners.forEach(l => l(a));
  selectedListeners.forEach(l => l(a));
  // После обновления приложения виджет должен сразу взять свой цвет, а не ждать смены оформления
  writeWidgetTheme(a);
  return a;
});

// ─── Изменение ────────────────────────────────────────────────────────────

let writeTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleWrite(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    if (!applied) return;
    AsyncStorage.setItem(KEY, JSON.stringify(applied)).catch(() => null);
    // Виджет на рабочем столе перекрашивается вместе с приложением
    writeWidgetTheme(applied);
  }, WRITE_DELAY_MS);
}

function applyNow(): void {
  if (!selected || selected === applied) return;
  applied = selected;
  const a = applied;
  appliedListeners.forEach(l => l(a));
  scheduleWrite();
}

let applyScheduled = false;
function scheduleApply(): void {
  if (applyScheduled) return;
  applyScheduled = true;
  // Сначала кадр с кольцом выбора, потом — перекраска приложения
  requestAnimationFrame(() => {
    InteractionManager.runAfterInteractions(() => {
      applyScheduled = false;
      applyNow();
    });
  });
}

export function getAppearance(): Appearance {
  return selected ?? applied ?? DEFAULT_APPEARANCE;
}

/**
 * Меняет оформление. По умолчанию — в два шага (см. шапку файла).
 * immediate — применить в этом же кадре: нужно смене фона с растворением,
 * у которой свой снимок экрана и свои два кадра ожидания (ThemeReveal).
 */
export function setAppearance(
  next: Appearance | ((prev: Appearance) => Appearance),
  opts?: { immediate?: boolean },
): void {
  const a = typeof next === 'function' ? next(getAppearance()) : next;
  selected = a;
  selectedListeners.forEach(l => l(a));
  if (opts?.immediate) applyNow();
  else scheduleApply();
}

export function resetAppearance(): void {
  setAppearance(DEFAULT_APPEARANCE);
}

function useStore(listeners: Set<(a: Appearance) => void>, current: () => Appearance | null): Appearance | null {
  const [a, setA] = useState<Appearance | null>(current);
  useEffect(() => {
    listeners.add(setA);
    const now = current();
    if (now) setA(now);
    else loading.then(() => setA(current()));
    return () => { listeners.delete(setA); };
  }, [listeners, current]);
  return a;
}

const getApplied = () => applied;
const getSelected = () => selected;

/** Применённое оформление — его рисует приложение. null — ещё не прочитано. */
export function useAppearance(): Appearance | null {
  return useStore(appliedListeners, getApplied);
}

/** Выбранное на экране «Внешний вид» — опережает применённое на кадр. */
export function useSelectedAppearance(): Appearance {
  return useStore(selectedListeners, getSelected) ?? DEFAULT_APPEARANCE;
}

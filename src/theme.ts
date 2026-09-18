import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ThemeReveal from './ThemeReveal';

// Дизайн-система «Academic Emerald». Значения совпадают 1-в-1 с веб (globals.css).
export const lightColors = {
  bg: '#f3f5f8',
  fg: '#14181c',
  card: '#ffffff',
  border: '#e6e9ee',
  primary: '#0e9b72',
  primaryFg: '#ffffff',     // текст на кнопке-акценте
  muted: '#5b6677',
  tag: '#eef1f6',
  tagText: '#475569',
  tabBar: '#ffffff',
  tabBorder: '#e6e9ee',
  inputBg: '#f7f9fb',
  inputBorder: '#e6e9ee',
  green: '#0e9b72',
  greenBg: '#e5f4f0',
  redBg: '#fdeaeb',
  red: '#c5303a',
  // акценты типов занятий (левая полоса карточки)
  examAccent: '#d43a40',
  practiceAccent: '#5650d6',
  // Раньше был тот же зелёный, что у primary — полоса не читалась как
  // «это лекция», сливаясь с обычным акцентом интерфейса. Синий совпадает
  // с web (.lesson-accent[data-kind="lecture"] в globals.css).
  lectureAccent: '#2563eb',
};

// Тёмная тема — редизайн сен 2026, токены 1:1 с сайтом и макетами
// (design/mockups «Карточка занятия», C:\Users\Suhrob\Desktop\mgu-mobile-redesign-mockups).
export const darkColors = {
  bg: '#0d0c13',
  fg: '#f3f1f6',
  card: '#18151f',
  border: '#2a2734',
  primary: '#0e9b72',
  primaryFg: '#ffffff',
  muted: '#8b8594',
  tag: '#221e2c',
  tagText: '#a39dae',
  tabBar: '#18151f',
  tabBorder: '#211e29',
  inputBg: '#0d0c13',
  inputBorder: '#2a2734',
  green: '#34d399',
  greenBg: 'rgba(52,211,153,0.08)',
  redBg: 'rgba(199,58,72,0.16)',
  red: '#ef6673',
  examAccent: '#c73a48',
  practiceAccent: '#8c87f3',
  lectureAccent: '#60a5fa',
};

// blueBg — не статичный токен: мягкая подложка бейджей/карточек, которая
// раньше всегда оставалась зелёной независимо от акцента (был отдельный
// баг-фидбек — «все цвета меняются кроме этого»). Теперь считается от
// текущего primary при каждой смене акцента/темы, см. ThemeProvider ниже.
export type Colors = typeof lightColors & { blueBg: string };

/** hex → rgba(...) с заданной прозрачностью. Нужна для полупрозрачных
 *  вариантов primaryFg — раньше подсветки поверх акцентной заливки везде
 *  были жёстко rgba(255,255,255,...), что ломалось на фиолетовом акценте
 *  (primaryFg у него тёмный, не белый). */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Радиусы редизайна сен 2026 — 1:1 с макетами. Карточки крупнее, чем было,
 *  чипы/пилюли ощутимо круглее. Используются по мере переноса экранов. */
export const RADIUS = {
  card: 20,
  control: 12,
  chip: 10,
  pill: 999,
} as const;

// Альтернативные акценты — тот же выбор, что и на сайте (см.
// frontend/src/lib/theme.ts), плюс «Фиолетовый» из редизайна сен 2026 (дефолт).
// Меняется только primary/primaryFg: статус «свободно»/«занято» на аудиториях
// (green/greenBg/red/redBg) от акцента не зависит.
export type AccentPref = 'green' | 'blue' | 'violet';
const BLUE_PRIMARY_LIGHT = '#2563eb';
const BLUE_PRIMARY_DARK = '#2563eb';
// Фиолетовый — светлый пастельный тон что в тёмной, что в светлой теме
// (как на сайте): текст на кнопке-акценте поэтому тёмный, а не белый —
// белый на #9b8afb уходил бы в нечитаемый бледный.
const VIOLET_PRIMARY = '#9b8afb';
const VIOLET_PRIMARY_FG = '#0d0c13';

export type ThemeMode = 'light' | 'dark';
/** Настройка пользователя: явная тема или «как в системе». */
export type ThemePref = ThemeMode | 'system';

interface ThemeCtxType {
  colors: Colors;
  /** Тема, которая показывается сейчас (system уже разрешён в light/dark). */
  mode: ThemeMode;
  /** Что выбрал пользователь — для галочки в настройках. */
  pref: ThemePref;
  /**
   * Ставит тему. С origin (точка нажатия) и только если это реально меняет
   * картинку на экране — расходится круг новой темы; иначе применяется
   * сразу. Единственный способ сменить тему во всём приложении — раньше
   * рядом жили две независимые кнопки (общий toggle + чипы выбора),
   * что на экране кабинета читалось как два разных переключателя одного
   * и того же значения.
   */
  choose: (pref: ThemePref, origin?: { x: number; y: number }) => void;
  /** Цвет акцента — независим от светлой/тёмной темы. */
  accent: AccentPref;
  setAccent: (a: AccentPref) => void;
}

const ThemeCtx = createContext<ThemeCtxType>({
  colors: { ...lightColors, blueBg: withAlpha(lightColors.primary, 0.12) },
  mode: 'light',
  pref: 'system',
  choose: () => {},
  accent: 'violet',
  setAccent: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Пока настройка не прочитана из хранилища — идём за системой: так первый
  // кадр совпадает с тем, что человек ожидает увидеть, и не мигает.
  const system: ThemeMode = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [pref, setPrefState] = useState<ThemePref>('system');
  const mode: ThemeMode = pref === 'system' ? system : pref;

  // Пока круг растёт, тема ещё старая — переключаем её в момент, когда он
  // накрыл экран (см. ThemeReveal). Без origin меняем сразу, без анимации.
  const [reveal, setReveal] = useState<{ x: number; y: number; color: string } | null>(null);
  // Что применить, когда круг накроет экран — обычный useState тут не подойдёт:
  // onCovered читает значение в отдельном колбэке, а не в этом рендере.
  const pendingPref = useRef<ThemePref>('system');

  // Дефолт — «Фиолетовый» (редизайн сен 2026). Старые green/blue, выбранные
  // до редизайна, читаем из хранилища и оставляем как есть.
  const [accent, setAccentState] = useState<AccentPref>('violet');

  useEffect(() => {
    AsyncStorage.getItem('msu_theme').then(v => {
      if (v === 'dark' || v === 'light' || v === 'system') setPrefState(v);
    });
    AsyncStorage.getItem('msu_accent').then(v => {
      if (v === 'blue' || v === 'green') setAccentState(v);
    });
  }, []);

  const setAccent = useCallback((a: AccentPref) => {
    setAccentState(a);
    AsyncStorage.setItem('msu_accent', a);
  }, []);

  const applyPref = useCallback((next: ThemePref) => {
    setPrefState(next);
    AsyncStorage.setItem('msu_theme', next);
  }, []);

  const choose = useCallback((next: ThemePref, origin?: { x: number; y: number }) => {
    const nextMode: ThemeMode = next === 'system' ? system : next;
    // Без точки нажатия или без видимой смены цвета — анимировать нечего
    if (!origin || nextMode === mode) {
      applyPref(next);
      return;
    }
    pendingPref.current = next;
    const nextColors = nextMode === 'dark' ? darkColors : lightColors;
    setReveal({ x: origin.x, y: origin.y, color: nextColors.bg });
  }, [mode, system, applyPref]);

  const onCovered = useCallback(() => {
    applyPref(pendingPref.current);
    setReveal(null);
  }, [applyPref]);

  const baseColors = mode === 'dark' ? darkColors : lightColors;
  const withPrimary = accent === 'blue'
    ? { ...baseColors, primary: mode === 'dark' ? BLUE_PRIMARY_DARK : BLUE_PRIMARY_LIGHT }
    : accent === 'violet'
    ? { ...baseColors, primary: VIOLET_PRIMARY, primaryFg: VIOLET_PRIMARY_FG }
    : baseColors;
  const colors: Colors = {
    ...withPrimary,
    blueBg: withAlpha(withPrimary.primary, mode === 'dark' ? 0.16 : 0.12),
  };

  const value: ThemeCtxType = {
    colors,
    mode,
    pref,
    choose,
    accent,
    setAccent,
  };

  return React.createElement(
    ThemeCtx.Provider,
    { value },
    children,
    reveal
      ? React.createElement(ThemeReveal, { key: 'reveal', ...reveal, onCovered })
      : null,
  );
}

export function useTheme(): Colors {
  return useContext(ThemeCtx).colors;
}

export function useThemeMode(): Pick<ThemeCtxType, 'mode' | 'pref' | 'choose'> {
  const { mode, pref, choose } = useContext(ThemeCtx);
  return { mode, pref, choose };
}

export function useAccent(): Pick<ThemeCtxType, 'accent' | 'setAccent'> {
  const { accent, setAccent } = useContext(ThemeCtx);
  return { accent, setAccent };
}

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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
  blueBg: '#e5f4f0',        // мягкая изумрудная подложка (бейдж пары)
  redBg: '#fdeaeb',
  red: '#c5303a',
  // акценты типов занятий (левая полоса карточки)
  examAccent: '#d43a40',
  practiceAccent: '#5650d6',
  lectureAccent: '#0e9b72',
};

export const darkColors = {
  bg: '#0b0d10',
  fg: '#e7eaee',
  card: '#14171b',
  border: '#262b32',
  primary: '#0e9b72',
  primaryFg: '#ffffff',
  muted: '#8b94a3',
  tag: '#1b2026',
  tagText: '#9aa3b2',
  tabBar: '#14171b',
  tabBorder: '#262b32',
  inputBg: '#1b1f25',
  inputBorder: '#262b32',
  green: '#2dd4a7',
  greenBg: '#0e2a22',
  blueBg: '#0e2a22',
  redBg: '#281517',
  red: '#ff8a8e',
  examAccent: '#ff6166',
  practiceAccent: '#8c87f3',
  lectureAccent: '#2dd4a7',
};

export type Colors = typeof lightColors;

export type ThemeMode = 'light' | 'dark';
/** Настройка пользователя: явная тема или «как в системе». */
export type ThemePref = ThemeMode | 'system';

interface ThemeCtxType {
  colors: Colors;
  /** Тема, которая показывается сейчас (system уже разрешён в light/dark). */
  mode: ThemeMode;
  /** Что выбрал пользователь — для галочки в настройках. */
  pref: ThemePref;
  /** origin — точка нажатия, от неё расходится круг новой темы (необязательно). */
  toggle: (origin?: { x: number; y: number }) => void;
  setPref: (pref: ThemePref) => void;
}

const ThemeCtx = createContext<ThemeCtxType>({
  colors: lightColors,
  mode: 'light',
  pref: 'system',
  toggle: () => {},
  setPref: () => {},
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

  useEffect(() => {
    AsyncStorage.getItem('msu_theme').then(v => {
      if (v === 'dark' || v === 'light') setPrefState(v);
      // Всё остальное (включая пусто и 'system') — «как в системе»
    });
  }, []);

  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next);
    AsyncStorage.setItem('msu_theme', next);
  }, []);

  // Кнопка «Светлая/Тёмная тема» ставит тему явно, отключая режим «как в
  // системе» — вернуть его можно переключателем в настройках.
  const applyNext = useCallback(() => {
    setPref(mode === 'light' ? 'dark' : 'light');
  }, [mode, setPref]);

  const toggle = useCallback((origin?: { x: number; y: number }) => {
    if (!origin) { applyNext(); return; }
    const nextColors = mode === 'light' ? darkColors : lightColors;
    setReveal({ x: origin.x, y: origin.y, color: nextColors.bg });
  }, [mode, applyNext]);

  const onCovered = useCallback(() => {
    applyNext();
    setReveal(null);
  }, [applyNext]);

  const value: ThemeCtxType = {
    colors: mode === 'dark' ? darkColors : lightColors,
    mode,
    pref,
    toggle,
    setPref,
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

export function useThemeMode(): Pick<ThemeCtxType, 'mode' | 'pref' | 'toggle' | 'setPref'> {
  const { mode, pref, toggle, setPref } = useContext(ThemeCtx);
  return { mode, pref, toggle, setPref };
}

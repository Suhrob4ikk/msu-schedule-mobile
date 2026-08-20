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
  /**
   * Ставит тему. С origin (точка нажатия) и только если это реально меняет
   * картинку на экране — расходится круг новой темы; иначе применяется
   * сразу. Единственный способ сменить тему во всём приложении — раньше
   * рядом жили две независимые кнопки (общий toggle + чипы выбора),
   * что на экране кабинета читалось как два разных переключателя одного
   * и того же значения.
   */
  choose: (pref: ThemePref, origin?: { x: number; y: number }) => void;
}

const ThemeCtx = createContext<ThemeCtxType>({
  colors: lightColors,
  mode: 'light',
  pref: 'system',
  choose: () => {},
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

  useEffect(() => {
    AsyncStorage.getItem('msu_theme').then(v => {
      if (v === 'dark' || v === 'light' || v === 'system') setPrefState(v);
    });
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

  const value: ThemeCtxType = {
    colors: mode === 'dark' ? darkColors : lightColors,
    mode,
    pref,
    choose,
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

import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Дизайн-система «Academic Teal». Значения совпадают 1-в-1 с веб (globals.css).
export const lightColors = {
  bg: '#f4f6f9',
  fg: '#0f172a',
  card: '#ffffff',
  border: '#e6eaf1',
  primary: '#0d9488',
  primaryFg: '#ffffff',     // текст на кнопке-акценте
  muted: '#5b6677',
  tag: '#eef1f7',
  tagText: '#475569',
  tabBar: '#ffffff',
  tabBorder: '#e6eaf1',
  inputBg: '#f8fafc',
  inputBorder: '#e6eaf1',
  green: '#16a34a',
  greenBg: '#ecfdf5',
  blueBg: '#e6f6f4',        // мягкая тил-подложка (бейдж пары)
  redBg: '#fff1f3',
  red: '#e11d48',
  // акценты типов занятий (левая полоса карточки)
  examAccent: '#f43f5e',
  practiceAccent: '#6366f1',
  lectureAccent: '#0d9488',
};

export const darkColors = {
  bg: '#0b1220',
  fg: '#e8edf5',
  card: '#151d2e',
  border: '#28324a',
  primary: '#0d9488',
  primaryFg: '#ffffff',
  muted: '#94a1b8',
  tag: '#1c2538',
  tagText: '#9aa6bd',
  tabBar: '#151d2e',
  tabBorder: '#28324a',
  inputBg: '#1b2538',
  inputBorder: '#28324a',
  green: '#34d399',
  greenBg: '#11271d',
  blueBg: '#11302d',
  redBg: '#2a1416',
  red: '#fb7185',
  examAccent: '#f43f5e',
  practiceAccent: '#6366f1',
  lectureAccent: '#0d9488',
};

export type Colors = typeof lightColors;

export type ThemeMode = 'light' | 'dark';

interface ThemeCtxType {
  colors: Colors;
  mode: ThemeMode;
  toggle: () => void;
}

const ThemeCtx = createContext<ThemeCtxType>({
  colors: lightColors,
  mode: 'light',
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    AsyncStorage.getItem('msu_theme').then(v => {
      if (v === 'dark') setMode('dark');
    });
  }, []);

  const toggle = () => {
    setMode(prev => {
      const next: ThemeMode = prev === 'light' ? 'dark' : 'light';
      AsyncStorage.setItem('msu_theme', next);
      return next;
    });
  };

  const value: ThemeCtxType = {
    colors: mode === 'dark' ? darkColors : lightColors,
    mode,
    toggle,
  };

  return React.createElement(ThemeCtx.Provider, { value }, children);
}

export function useTheme(): Colors {
  return useContext(ThemeCtx).colors;
}

export function useThemeMode(): { mode: ThemeMode; toggle: () => void } {
  const { mode, toggle } = useContext(ThemeCtx);
  return { mode, toggle };
}

import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

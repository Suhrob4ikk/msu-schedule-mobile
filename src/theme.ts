import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const lightColors = {
  bg: '#f5f5f0',
  fg: '#111111',
  card: '#ffffff',
  border: '#e2e1d9',
  primary: '#2563eb',
  muted: '#6b6b6b',
  tag: '#f0efe8',
  tagText: '#555555',
  tabBar: '#ffffff',
  tabBorder: '#e2e8f0',
  inputBg: '#f8fafc',
  inputBorder: '#e2e8f0',
  green: '#22c55e',
  greenBg: '#f0fdf4',
  blueBg: '#eff6ff',
  redBg: '#fef2f2',
  red: '#ef4444',
};

export const darkColors = {
  bg: '#0d1117',
  fg: '#e6edf3',
  card: '#161b22',
  border: '#30363d',
  primary: '#3b82f6',
  muted: '#8b949e',
  tag: '#21262d',
  tagText: '#8b949e',
  tabBar: '#161b22',
  tabBorder: '#30363d',
  inputBg: '#21262d',
  inputBorder: '#30363d',
  green: '#22c55e',
  greenBg: '#0d2818',
  blueBg: '#0f1f3d',
  redBg: '#2d0f0f',
  red: '#f87171',
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

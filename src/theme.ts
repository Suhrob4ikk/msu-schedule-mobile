import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { useColorScheme, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import ThemeReveal from './ThemeReveal';
import { buildTokens, type Tokens, type BaseMode } from './schedule/colors';
import { useAppearance, setAppearance } from './appearance';
import { Appearance, Background, DEFAULT_APPEARANCE, accentHex, resolveMode } from './appearanceModel';

/**
 * Палитра прежних вкладок (Педагоги, Изменения, Уведомления, Сравнение,
 * онбординг…) — с 1.9.40 это не своя палитра, а имена поверх токенов «Табло»
 * (src/schedule/colors.ts). Поэтому выбор в «Внешнем виде» — акцент, цвета
 * типов, фон — действует и на них, а тон совпадает с Расписанием.
 *
 * Правило ТЗ: акцент (`primary`) — только заливка. Текст, иконки и обводки
 * акцентного цвета — `primaryText` (accent-text, ≥ 4,5 : 1 при любом цвете).
 * Остальные токены «Табло» доступны тут же под своими именами (C.statusSync…).
 */
export type Colors = Tokens & {
  fg: string;
  /** Заливка акцентом (кнопки, выбранный чип, шапка). */
  primary: string;
  /** Текст и иконки на `primary`. */
  primaryFg: string;
  /** Акцент как текст, иконка, обводка. */
  primaryText: string;
  muted: string;
  tag: string;
  tagText: string;
  tabBar: string;
  tabBorder: string;
  inputBg: string;
  inputBorder: string;
  green: string;
  greenBg: string;
  red: string;
  redBg: string;
  examAccent: string;
  practiceAccent: string;
  lectureAccent: string;
  /** Мягкая акцентная подложка (accent-soft). */
  blueBg: string;
};

function legacyColors(k: Tokens): Colors {
  return {
    ...k,
    fg: k.text,
    primary: k.accent,
    primaryFg: k.onAccent,
    primaryText: k.accentText,
    muted: k.textSecondary,
    tag: k.surface2,
    tagText: k.textSecondary,
    tabBar: k.surface,
    tabBorder: k.border,
    inputBg: k.surface2,
    inputBorder: k.border,
    green: k.roomFreeText,
    greenBg: k.roomFreeBg,
    red: k.roomBusyText,
    redBg: k.roomBusyBg,
    examAccent: k.typeExamText,
    practiceAccent: k.typePracticeText,
    lectureAccent: k.typeLectureText,
    blueBg: k.accentSoft,
  };
}

/** hex → rgba(...) с заданной прозрачностью. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Радиусы редизайна сен 2026 (прежние вкладки). */
export const RADIUS = {
  card: 20,
  control: 12,
  chip: 10,
  pill: 999,
} as const;

/** Светлая или тёмная — для строки состояния и т. п.; чёрный фон — тёмная. */
export type ThemeMode = 'light' | 'dark';

interface ThemeCtxType {
  tokens: Tokens;
  colors: Colors;
  mode: ThemeMode;
  base: BaseMode;
  appearance: Appearance;
  /**
   * Ставит фон. С origin (точка нажатия) и только если это реально меняет
   * картинку на экране — снимок старого экрана растворяется поверх нового
   * (src/ThemeReveal.tsx); иначе применяется сразу.
   */
  choose: (bg: Background, origin?: { x: number; y: number }) => void;
}

const defaultTokens = buildTokens('light');
const ThemeCtx = createContext<ThemeCtxType>({
  tokens: defaultTokens,
  colors: legacyColors(defaultTokens),
  mode: 'light',
  base: 'light',
  appearance: DEFAULT_APPEARANCE,
  choose: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemDark = useColorScheme() === 'dark';
  // Корневой _layout не рисует ничего, пока настройки не прочитаны, так что
  // значение по умолчанию тут — только страховка.
  const appearance = useAppearance() ?? DEFAULT_APPEARANCE;
  const base = resolveMode(appearance.background, systemDark);
  const accent = accentHex(appearance);

  const tokens = useMemo(
    () => buildTokens(base, accent, appearance.types, appearance.density),
    [base, accent, appearance.types, appearance.density],
  );
  const colors = useMemo(() => legacyColors(tokens), [tokens]);

  // Смена фона с анимацией: снимок старого экрана поверх, фон меняется под
  // ним, снимок растворяется (см. ThemeReveal). Без origin — сразу.
  const rootRef = useRef<View>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const switching = useRef(false);
  // Что применить, когда снимок показан — onShown читает значение в
  // отдельном колбэке, а не в этом рендере.
  const pending = useRef<Background>('system');

  const apply = useCallback((bg: Background) => {
    setAppearance(prev => ({ ...prev, background: bg }));
  }, []);

  const choose = useCallback((next: Background, origin?: { x: number; y: number }) => {
    // Нажали ещё раз, пока идёт растворение, — применяем сразу и запоминаем,
    // чтобы ещё не показанный снимок не вернул предыдущий выбор
    if (switching.current) {
      pending.current = next;
      apply(next);
      return;
    }
    if (!origin || resolveMode(next, systemDark) === base) {
      apply(next);
      return;
    }
    pending.current = next;
    switching.current = true;
    captureRef(rootRef, { format: 'jpg', quality: 0.9, result: 'tmpfile' })
      .then(uri => setSnapshot(uri))
      .catch(() => {
        // Снимок не получился — просто меняем фон без анимации
        switching.current = false;
        apply(next);
      });
  }, [base, systemDark, apply]);

  const onSnapshotShown = useCallback(() => apply(pending.current), [apply]);
  const onSnapshotDone = useCallback(() => {
    switching.current = false;
    setSnapshot(null);
  }, []);

  const value = useMemo<ThemeCtxType>(() => ({
    tokens,
    colors,
    mode: base === 'light' ? 'light' : 'dark',
    base,
    appearance,
    choose,
  }), [tokens, colors, base, appearance, choose]);

  return React.createElement(
    ThemeCtx.Provider,
    { value },
    // Корень, который фотографируется при смене фона. collapsable={false} —
    // иначе Android может «схлопнуть» обёртку, и снимать будет нечего.
    React.createElement(View, { ref: rootRef, style: { flex: 1, backgroundColor: tokens.bg }, collapsable: false }, children),
    snapshot
      ? React.createElement(ThemeReveal, {
        key: snapshot, uri: snapshot, onShown: onSnapshotShown, onDone: onSnapshotDone,
      })
      : null,
  );
}

export function useTheme(): Colors {
  return useContext(ThemeCtx).colors;
}

/** Токены «Табло» текущего оформления — см. useTokens в src/schedule/tokens.ts. */
export function useThemeTokens(): Tokens {
  return useContext(ThemeCtx).tokens;
}

export function useThemeMode(): Pick<ThemeCtxType, 'mode' | 'base' | 'choose'> & { pref: Background } {
  const { mode, base, choose, appearance } = useContext(ThemeCtx);
  return { mode, base, choose, pref: appearance.background };
}

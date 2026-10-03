/**
 * Токены нового экрана расписания («Табло») — по ТЗ «токены и экран
 * „Внешний вид“». Ни одного HEX в компонентах: всё отсюда, через useTokens().
 *
 * В этапе 1 токены берёт только новый экран. Остальные вкладки живут на
 * старой палитре src/theme.ts — перевод на эти токены вместе с экраном
 * «Внешний вид» (этап 2), там же акцент станет выбираемым.
 */
import { useMemo } from 'react';
import { PixelRatio, TextStyle } from 'react-native';
import { oklch, formatHex, wcagContrast, interpolate, clampChroma } from 'culori';
import { useThemeMode } from '../theme';

export type BaseMode = 'light' | 'dark' | 'black';

/** Фоновые и текстовые токены — зависят только от фона. */
export interface BaseTheme {
  mode: BaseMode;
  bg: string;
  surface: string;
  card: string;
  surface2: string;
  border: string;
  text: string;
  textSecondary: string;
  typeLectureBg: string;
  typeLectureText: string;
  typePracticeBg: string;
  typePracticeText: string;
  typeExamBg: string;
  typeExamText: string;
  statusOnline: string;
  statusSync: string;
  statusOffline: string;
  statusOfflineBg: string;
  scrim: string;
}

export const BASE_THEMES: Record<BaseMode, BaseTheme> = {
  dark: {
    mode: 'dark',
    bg: '#0B0D12',
    surface: '#151821',
    card: '#151821',
    surface2: '#1E222D',
    border: '#2A2F3B',
    text: '#F1F3F7',
    textSecondary: '#A8AFBD',
    typeLectureBg: '#13314A',
    typeLectureText: '#8CCBFF',
    typePracticeBg: '#2B2350',
    typePracticeText: '#C7B8FF',
    typeExamBg: '#47220F',
    typeExamText: '#FFB27A',
    statusOnline: '#4ADE80',
    statusSync: '#FACC15',
    statusOffline: '#FF8A80',
    statusOfflineBg: '#3A1C1C',
    scrim: 'rgba(0,0,0,0.62)',
  },
  light: {
    mode: 'light',
    bg: '#F2F4F8',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    surface2: '#EBEEF4',
    border: '#DDE2EA',
    text: '#10131A',
    textSecondary: '#4B5262',
    typeLectureBg: '#DDF0FF',
    typeLectureText: '#0B5A8C',
    typePracticeBg: '#ECE7FF',
    typePracticeText: '#5534C2',
    typeExamBg: '#FFE7D6',
    typeExamText: '#A33F00',
    statusOnline: '#15803D',
    statusSync: '#8A5A00',
    statusOffline: '#B42318',
    statusOfflineBg: '#FDE8E6',
    scrim: 'rgba(0,0,0,0.40)',
  },
  black: {
    mode: 'black',
    bg: '#000000',
    surface: '#0E0F12',
    card: '#0E0F12',
    surface2: '#17191F',
    border: '#24272F',
    text: '#F1F3F7',
    textSecondary: '#A8AFBD',
    typeLectureBg: '#13314A',
    typeLectureText: '#8CCBFF',
    typePracticeBg: '#2B2350',
    typePracticeText: '#C7B8FF',
    typeExamBg: '#47220F',
    typeExamText: '#FFB27A',
    statusOnline: '#4ADE80',
    statusSync: '#FACC15',
    statusOffline: '#FF8A80',
    statusOfflineBg: '#3A1C1C',
    scrim: 'rgba(0,0,0,0.70)',
  },
};

/** Акцент по умолчанию (ТЗ). Экран «Внешний вид» — этап 2. */
export const DEFAULT_ACCENT = '#2F62EA';

// ─── Производные акцентные цвета (пример из ТЗ, один к одному) ────────────

const WHITE = '#FFFFFF';
const INK = '#0B0D12';
const MIN = 4.5;

export function pickOnAccent(accent: string): string {
  return wcagContrast(accent, WHITE) >= wcagContrast(accent, INK) ? WHITE : INK;
}

export function ensureContrast(color: string, bg: string, lighter: boolean): string {
  let c = oklch(color)!;
  for (let i = 0; i < 50; i++) {
    const hex = formatHex(clampChroma(c, 'oklch'));
    if (wcagContrast(hex, bg) >= MIN) return hex;
    c = { ...c, l: Math.min(1, Math.max(0, c.l + (lighter ? 0.02 : -0.02))) };
  }
  return lighter ? WHITE : INK;
}

export function mix(a: string, b: string, t: number): string {
  return formatHex(interpolate([a, b], 'rgb')(t));
}

export interface AccentTokens {
  accent: string;
  onAccent: string;
  accentText: string;
  accentSoft: string;
  onAccentSoft: string;
  accentChip: string;
  accentLine: string;
}

export function deriveAccent(accent: string, base: BaseTheme): AccentTokens {
  const lighter = base.mode !== 'light';
  const onAccent = pickOnAccent(accent);
  const accentText = ensureContrast(accent, base.surface2, lighter);
  const softShare = base.mode === 'light' ? 0.12 : base.mode === 'black' ? 0.14 : 0.16;
  const accentSoft = mix(base.surface, accent, softShare);
  const onAccentSoft = ensureContrast(accentText, accentSoft, lighter);
  const darkInk = onAccent === WHITE;
  return {
    accent,
    onAccent,
    accentText,
    accentSoft,
    onAccentSoft,
    accentChip: darkInk ? `rgba(0,0,0,${base.mode === 'light' ? 0.2 : 0.24})` : 'rgba(255,255,255,0.45)',
    accentLine: darkInk ? `rgba(255,255,255,${base.mode === 'light' ? 0.5 : 0.42})` : 'rgba(11,13,18,0.30)',
  };
}

/**
 * Для акцента по умолчанию — значения прямо из таблицы ТЗ (их проверял
 * дизайнер). Формула для #2F62EA даёт близкие, но не те же оттенки, а макет
 * сверстан именно по таблице. Для любого другого цвета — deriveAccent.
 */
const DEFAULT_ACCENT_TABLE: Record<BaseMode, AccentTokens> = {
  dark: {
    accent: DEFAULT_ACCENT, onAccent: '#FFFFFF', accentText: '#8FB0FF', accentSoft: '#1C2850',
    onAccentSoft: '#BFD0FF', accentChip: 'rgba(0,0,0,0.24)', accentLine: 'rgba(255,255,255,0.42)',
  },
  light: {
    accent: DEFAULT_ACCENT, onAccent: '#FFFFFF', accentText: '#2856D6', accentSoft: '#E5ECFD',
    onAccentSoft: '#1E46B8', accentChip: 'rgba(0,0,0,0.20)', accentLine: 'rgba(255,255,255,0.50)',
  },
  black: {
    accent: DEFAULT_ACCENT, onAccent: '#FFFFFF', accentText: '#8FB0FF', accentSoft: '#16204A',
    onAccentSoft: '#BFD0FF', accentChip: 'rgba(0,0,0,0.24)', accentLine: 'rgba(255,255,255,0.42)',
  },
};

export type Tokens = BaseTheme & AccentTokens;

// Пересчёт один раз на пару «фон + акцент» — ТЗ: «пересчитывать при смене
// цвета или темы и кешировать».
const cache = new Map<string, Tokens>();

export function buildTokens(mode: BaseMode, accent: string = DEFAULT_ACCENT): Tokens {
  const key = `${mode}|${accent.toUpperCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = BASE_THEMES[mode];
  const acc = accent.toUpperCase() === DEFAULT_ACCENT ? DEFAULT_ACCENT_TABLE[mode] : deriveAccent(accent, base);
  const t = { ...base, ...acc };
  cache.set(key, t);
  return t;
}

/** Токены текущей темы. Светлая/тёмная — из общей настройки приложения. */
export function useTokens(): Tokens {
  const { mode } = useThemeMode();
  return useMemo(() => buildTokens(mode === 'dark' ? 'dark' : 'light'), [mode]);
}

// ─── Шрифт ─────────────────────────────────────────────────────────────────

/** Каждое начертание Onest — отдельное семейство (так их грузит expo-font).
 *  fontWeight рядом не ставим: Android дорисовал бы поверх ещё и псевдо-жирный. */
export const FONT = {
  400: 'Onest_400Regular',
  500: 'Onest_500Medium',
  600: 'Onest_600SemiBold',
  700: 'Onest_700Bold',
  800: 'Onest_800ExtraBold',
} as const;

export type Weight = keyof typeof FONT;

/** Текстовый стиль: размер/строка в pt, начертание, табличные цифры. */
export function type(size: number, lineHeight: number, weight: Weight, extra?: TextStyle): TextStyle {
  return {
    fontFamily: FONT[weight],
    fontSize: size,
    lineHeight,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    ...extra,
  };
}

/** Типографика из таблицы ТЗ. Масштаб — maxFontSizeMultiplier у Text. */
export const TYPE = {
  display: { style: type(40, 40, 800, { letterSpacing: -1.2 }), max: 1.4 },
  countdown: { style: type(26, 26, 800), max: 1.4 },
  roomRow: { style: type(22, 24, 800), max: 1.4 },
  timeRow: { style: type(18, 22, 700), max: 1.4 },
  titleCard: { style: type(18, 23, 700), max: 2 },
  titleRow: { style: type(15, 20, 600), max: 2 },
  body: { style: type(15, 20, 500), max: 2 },
  label: { style: type(13, 18, 600), max: 2 },
  labelStrong: { style: type(14, 18, 700), max: 2 },
  caption: { style: type(12, 16, 500), max: 2 },
  captionStrong: { style: type(12, 16, 700), max: 2 },
  overline: { style: type(11, 14, 700, { letterSpacing: 1.1, textTransform: 'uppercase' }), max: 2 },
} as const;

export const RADIUS = { sm: 12, md: 14, card: 18, lg: 20, sheet: 28, pill: 999 } as const;
export const SPACE = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24 } as const;
export const GUTTER = 12;
export const TOUCH_MIN = 48;
export const DAY_CELL = 56;
export const ROW_MIN = 60;
export const ROW_PAD_Y = 10;
export const HEADER_H = 60;

/** Ширина колонки с крупными цифрами: цифры растут до ×1,4 — колонка вместе с ними. */
export function scaledWidth(base: number, fontScale = PixelRatio.getFontScale()): number {
  return Math.round(base * Math.min(Math.max(fontScale, 1), 1.4));
}

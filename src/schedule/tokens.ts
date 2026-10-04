/**
 * Токены «Табло» — по ТЗ «токены и экран „Внешний вид“». Ни одного HEX в
 * компонентах: всё отсюда, через useTokens().
 *
 * Цвета и их вычисление — чистые функции в colors.ts (проверяются скриптом),
 * выбор пользователя — src/appearance.ts. Здесь — хук и типографика.
 */
import { PixelRatio, TextStyle } from 'react-native';
import { useThemeTokens } from '../theme';
import type { Tokens } from './colors';

export * from './colors';

/** Токены текущего оформления: фон, акцент, цвета типов и плотность из «Внешнего вида». */
export function useTokens(): Tokens {
  return useThemeTokens();
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
  // ТЗ «Аудитории», раздел «Размеры, шрифт и радиусы»
  roomNumber: { style: type(24, 28, 800), max: 1.4 },
  roomNamed: { style: type(16, 20, 700), max: 2 },
  status: { style: type(15, 20, 700), max: 2 },
  statusLg: { style: type(16, 20, 700), max: 2 },
  groupTitle: { style: type(16, 20, 700), max: 2 },
  subject: { style: type(15, 20, 400), max: 2 },
  small: { style: type(13, 18, 500), max: 2 },
  smallStrong: { style: type(13, 18, 700), max: 2 },
  cellNum: { style: type(14, 18, 800), max: 2 },
  cellWord: { style: type(11, 14, 600), max: 2 },
} as const;

export const RADIUS = { sm: 12, md: 14, card: 18, lg: 20, sheet: 28, pill: 999 } as const;
export const SPACE = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24 } as const;
export const GUTTER = 12;
export const TOUCH_MIN = 48;
export const DAY_CELL = 56;
export const HEADER_H = 60;

/** Ширина колонки с крупными цифрами: цифры растут до ×1,4 — колонка вместе с ними. */
export function scaledWidth(base: number, fontScale = PixelRatio.getFontScale()): number {
  return Math.round(base * Math.min(Math.max(fontScale, 1), 1.4));
}

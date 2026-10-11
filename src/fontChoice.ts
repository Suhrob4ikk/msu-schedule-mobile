/**
 * Шрифт на выбор: обычный Onest или узкий Roboto Condensed (с 2.0.5; на сайте — «Внешний вид» →
 * «Шрифт», с 11 окт 2026). Выбор — поле `font` ключа `appearance`.
 *
 * Шрифт зашит в стили текста (TYPE в schedule/tokens.ts, FONT[...] в отдельных местах), поэтому
 * не переписываем каждый экран: общие текстовые компоненты — Txt (schedule/ui.tsx) и Text /
 * TextInput (OnestText.tsx) — подменяют семейство Onest на такое же начертание узкого, когда он
 * выбран. Поле ввода, собранное прямо из react-native, — через fontFamily().
 */
import { createContext, useContext } from 'react';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { RobotoCondensed_400Regular } from '@expo-google-fonts/roboto-condensed/400Regular';
import { RobotoCondensed_500Medium } from '@expo-google-fonts/roboto-condensed/500Medium';
import { RobotoCondensed_600SemiBold } from '@expo-google-fonts/roboto-condensed/600SemiBold';
import { RobotoCondensed_700Bold } from '@expo-google-fonts/roboto-condensed/700Bold';
import { RobotoCondensed_800ExtraBold } from '@expo-google-fonts/roboto-condensed/800ExtraBold';

export type FontChoice = 'regular' | 'condensed';

/** Для useFonts в корневом _layout: только пять нужных начертаний, не все восемнадцать. */
export const CONDENSED_FONTS = {
  RobotoCondensed_400Regular, RobotoCondensed_500Medium, RobotoCondensed_600SemiBold,
  RobotoCondensed_700Bold, RobotoCondensed_800ExtraBold,
};

const MAP: Record<string, string> = {
  Onest_400Regular: 'RobotoCondensed_400Regular',
  Onest_500Medium: 'RobotoCondensed_500Medium',
  Onest_600SemiBold: 'RobotoCondensed_600SemiBold',
  Onest_700Bold: 'RobotoCondensed_700Bold',
  Onest_800ExtraBold: 'RobotoCondensed_800ExtraBold',
};

/** true — выбран узкий. Значение ставит ThemeProvider (src/theme.ts) из настроек. */
export const CondensedFont = createContext(false);
export const useCondensed = () => useContext(CondensedFont);

/** Семейство с учётом выбора: Onest_700Bold → RobotoCondensed_700Bold, если выбран узкий. */
export function fontFamily(family: string, condensed: boolean): string {
  return condensed ? MAP[family] ?? family : family;
}

/** Стиль текста с подменой семейства. Обычный шрифт — стиль как есть, без лишней работы. */
export function withFont<S extends StyleProp<TextStyle>>(style: S, condensed: boolean): S | TextStyle {
  if (!condensed) return style;
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const f = flat?.fontFamily;
  if (!f || !MAP[f]) return style;
  return { ...flat, fontFamily: MAP[f] };
}

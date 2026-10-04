/**
 * Text и TextInput со шрифтом Onest — для прежних вкладок, чтобы они не
 * отличались от «Табло». Вёрстку не трогаем: обёртка берёт fontWeight из
 * стиля и подставляет нужное начертание (каждое начертание Onest — отдельное
 * семейство; fontWeight рядом снимаем, иначе Android дорисует псевдо-жирный).
 *
 * Вложенный Text без своего fontWeight наследует начертание родителя — как
 * у обычного Text, иначе «жирная строка с цветным словом» стала бы тонкой.
 */
import React, { createContext, useContext } from 'react';
import {
  Text as RNText, TextInput as RNTextInput, StyleSheet,
  type TextProps, type TextInputProps, type TextStyle,
} from 'react-native';
import { FONT, type Weight } from './schedule/tokens';

const ParentWeight = createContext<Weight | null>(null);

function toWeight(w: TextStyle['fontWeight'] | undefined, inherited: Weight | null): Weight {
  if (w == null) return inherited ?? 400;
  if (w === 'bold') return 700;
  if (w === 'normal') return 400;
  const n = Number(w);
  if (!Number.isFinite(n)) return inherited ?? 400;
  if (n >= 800) return 800;
  if (n >= 700) return 700;
  if (n >= 600) return 600;
  if (n >= 500) return 500;
  return 400;
}

function onest(style: TextProps['style'], inherited: Weight | null): { style: TextProps['style']; weight: Weight | null } {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  // Своё семейство (иконки, «Табло» через Txt) — не трогаем
  if (flat?.fontFamily) return { style, weight: inherited };
  const weight = toWeight(flat?.fontWeight, inherited);
  return { style: [style, { fontFamily: FONT[weight], fontWeight: 'normal' }], weight };
}

export function Text(props: TextProps & { ref?: React.Ref<RNText> }) {
  const inherited = useContext(ParentWeight);
  const { style, weight } = onest(props.style, inherited);
  return (
    <ParentWeight.Provider value={weight}>
      <RNText {...props} style={style} />
    </ParentWeight.Provider>
  );
}

export function TextInput(props: TextInputProps & { ref?: React.Ref<RNTextInput> }) {
  const { style } = onest(props.style, null);
  return <RNTextInput {...props} style={style} />;
}

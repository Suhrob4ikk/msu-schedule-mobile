/**
 * Большое название дня по центру («Среда») и под ним мелко дата и число пар.
 * При прокрутке уменьшается и гаснет, уходя вверх; следом приходит название
 * следующего дня. Общее для Расписания и расписания педагога.
 */
import React, { useMemo } from 'react';
import { Animated } from 'react-native';
import { DAYS_ORDER } from '../api';
import { Tokens } from './tokens';
import { Txt } from './ui';

/** Высота, на которой название успевает уменьшиться и погаснуть. */
const FADE_RANGE = 72;

export const dayPaddingTop = (k: Tokens) => 12 + k.dayGap * 2;

export default function DayHeading({ k, dayIndex, sub, a11y, accent, scrollY, top }: {
  k: Tokens;
  dayIndex: number;
  /** «7 октября · завтра · 2 пары» */
  sub: string;
  a11y: string;
  accent: boolean;
  /** Прокрутка ленты; без неё (постраничный режим) название всегда целое. */
  scrollY?: Animated.Value;
  /** Положение дня в ленте — координата, не размер. */
  top: number | null;
}) {
  const style = useMemo(() => {
    if (!scrollY || top == null) return null;
    const from = top + 8; // при открытии день стоит на top — название ещё целое
    const range = (out: number[]) => scrollY.interpolate({ inputRange: [from, from + FADE_RANGE], outputRange: out, extrapolate: 'clamp' });
    return { opacity: range([1, 0]), transform: [{ scale: range([1, 0.7]) }, { translateY: range([0, -10]) }] };
  }, [top, scrollY]);
  const name = DAYS_ORDER[dayIndex];
  return (
    <Animated.View
      accessible
      accessibilityRole="header"
      accessibilityLabel={a11y}
      style={[{ alignItems: 'center', paddingHorizontal: 4, paddingBottom: 6 + k.dayHeaderPad }, style]}
    >
      <Txt t="display" color={accent ? k.accentText : k.text} style={{ fontSize: 32, lineHeight: 38, letterSpacing: 0, textAlign: 'center' }}>
        {name.charAt(0).toUpperCase() + name.slice(1)}
      </Txt>
      <Txt t="small" color={k.textSecondary} style={{ textAlign: 'center', marginTop: 2 }}>{sub}</Txt>
    </Animated.View>
  );
}

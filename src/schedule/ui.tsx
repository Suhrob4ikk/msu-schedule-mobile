/** Мелкие общие детали нового экрана: текст по токенам, бейдж типа, точка «идёт». */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Text, TextProps, View } from 'react-native';
import { TYPE, Tokens, RADIUS } from './tokens';
import { KindPalette, lessonKind } from './state';

type TypeName = keyof typeof TYPE;

/** Внутри — шрифт не масштабируется системной настройкой: предпросмотр во
 *  «Внешнем виде» имеет постоянный размер, без измерений раскладки. */
export const FixedFontScale = createContext(false);

/** Text со стилем из таблицы типографики и потолком масштаба шрифта из ТЗ.
 *  ref (React 19 передаёт его обычным свойством) уходит в Text — для фокуса диктора. */
export function Txt({ t, color, style, ...rest }: TextProps & { t: TypeName; color: string; ref?: React.Ref<Text> }) {
  const spec = TYPE[t];
  const fixed = useContext(FixedFontScale);
  return (
    <Text
      maxFontSizeMultiplier={spec.max}
      {...rest}
      {...(fixed ? { allowFontScaling: false, adjustsFontSizeToFit: false } : null)}
      style={[spec.style, { color }, style]}
    />
  );
}

function paletteColors(p: KindPalette, k: Tokens): { bg: string; fg: string } {
  switch (p) {
    case 'lecture': return { bg: k.typeLectureBg, fg: k.typeLectureText };
    case 'practice': return { bg: k.typePracticeBg, fg: k.typePracticeText };
    case 'exam': return { bg: k.typeExamBg, fg: k.typeExamText };
    default: return { bg: k.surface2, fg: k.textSecondary };
  }
}

/**
 * Бейдж типа занятия. onAccent — бейдж лежит на заливке accent: подложка
 * accent-chip, текст on-accent (ТЗ, раздел «Раскрытая карточка»).
 */
export function KindBadge({ type, k, onAccent, muted }: {
  type: string | null; k: Tokens; onAccent?: boolean; muted?: boolean;
}) {
  const kind = lessonKind(type);
  if (!kind) return null;
  const c = onAccent
    ? { bg: k.accentChip, fg: k.onAccent }
    : muted ? { bg: k.surface2, fg: k.textSecondary } : paletteColors(kind.palette, k);
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Txt t="captionStrong" color={c.fg}>{kind.label}</Txt>
    </View>
  );
}

/** Включено ли в системе «Уменьшить движение». */
export function useReduceMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setOn).catch(() => null);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOn);
    return () => sub.remove();
  }, []);
  return on;
}

/** Точка в пилюле: у идущей пары пульсирует прозрачностью, цикл 1,6 с. */
export function PillDot({ color, pulse }: { color: string; pulse: boolean }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!pulse || reduce) { v.setValue(1); return; }
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [pulse, reduce, v]);
  return <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity: v }} />;
}

/** Тонкая линия-разделитель внутри карточки дня. */
export function Divider({ k }: { k: Tokens }) {
  return <View style={{ height: 1, backgroundColor: k.border }} />;
}

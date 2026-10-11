/**
 * Полоса букв у правого края списка педагогов — как в контактах телефона (владелец,
 * 11 окт 2026; раньше была кнопка «А–Я» с листом букв). Ведёшь пальцем по полосе —
 * список сразу прыгает к букве, слева крупно всплывает сама буква, лёгкий отклик
 * вибрацией на каждой новой. Буква — по высоте пальца внутри полосы, поэтому палец
 * может уйти чуть в сторону. Так же на сайте (components/tablo/teachers/TeacherList.tsx).
 */
import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Tokens } from '../schedule/tokens';
import { Txt } from '../schedule/ui';

export default function LetterRail({ k, letters, onLetter }: {
  k: Tokens;
  letters: string[];
  /** Прокрутить к букве — без анимации, палец ведёт быстро. */
  onLetter: (letter: string) => void;
}) {
  const { height } = useWindowDimensions();
  // высота буквы — из высоты окна, не из onLayout (правило проекта: размер не от своего измерения)
  const cell = Math.max(12, Math.min(20, Math.floor((height - 320) / Math.max(letters.length, 1))));
  const railH = cell * letters.length;
  const [active, setActive] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null);
  const lettersRef = useRef(letters);
  lettersRef.current = letters;
  const onLetterRef = useRef(onLetter);
  onLetterRef.current = onLetter;

  const pick = (y: number) => {
    const ls = lettersRef.current;
    const i = Math.min(ls.length - 1, Math.max(0, Math.floor((y / railH) * ls.length)));
    const l = ls[i];
    if (!l || l === activeRef.current) return;
    activeRef.current = l;
    setActive(l);
    onLetterRef.current(l);
    Haptics.selectionAsync();
  };
  const end = () => { activeRef.current = null; setActive(null); };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: e => pick(e.nativeEvent.locationY),
    onPanResponderMove: e => pick(e.nativeEvent.locationY),
    onPanResponderRelease: end,
    onPanResponderTerminate: end,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [railH]);

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, bottom: 0, right: 0, justifyContent: 'center' }}>
      {active && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', right: 46, alignSelf: 'center', width: 76, height: 76, borderRadius: 38,
            alignItems: 'center', justifyContent: 'center', backgroundColor: k.accent,
            shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, elevation: 8,
          }}
        >
          <Txt t="display" color={k.onAccent} style={{ fontSize: 36, lineHeight: 42, letterSpacing: 0 }}>{active}</Txt>
        </View>
      )}
      <View
        {...pan.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Буквы"
        style={{
          height: railH, width: 26, paddingVertical: 0, borderTopLeftRadius: 13, borderBottomLeftRadius: 13,
          backgroundColor: active ? k.surface : 'transparent',
        }}
      >
        {letters.map(l => (
          <Pressable
            key={l}
            accessibilityRole="button"
            accessibilityLabel={`Буква ${l}`}
            onPress={() => onLetter(l)}
            style={{
              height: cell, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2, borderRadius: 6,
              backgroundColor: active === l ? k.accent : 'transparent',
            }}
          >
            <Txt t="labelStrong" color={active === l ? k.onAccent : k.accentText} style={{ fontSize: Math.min(12.5, cell - 2), lineHeight: cell }}>{l}</Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

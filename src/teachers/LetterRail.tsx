/**
 * Полоса букв у правого края списка педагогов — как в контактах телефона (владелец,
 * 11 окт 2026; раньше была кнопка «А–Я» с листом букв). Ведёшь пальцем по полосе —
 * список сразу прыгает к букве, слева крупно всплывает сама буква, лёгкий отклик
 * вибрацией на каждой новой. Буква — по высоте пальца внутри полосы, поэтому палец
 * может уйти чуть в сторону. Так же на сайте (components/tablo/teachers/TeacherList.tsx).
 *
 * Высота пальца считается от верха всей полосы (pageY минус её pageY), а не по locationY:
 * locationY отсчитывается от того элемента, на который попал палец, — в 2.0.4 буквы были
 * отдельными кнопками, и при движении список дёргался между буквами (владелец, 11 окт 2026).
 * Поэтому буквы — простые View без своих нажатий, касание целиком ловит полоса.
 */
import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, View, useWindowDimensions } from 'react-native';
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
  const railRef = useRef<View>(null);
  /** pageY верха полосы; уточняется при каждом касании. */
  const topRef = useRef<number | null>(null);
  const measure = () => railRef.current?.measure((_x, _y, _w, _h, _px, py) => { topRef.current = py; });

  const pick = (pageY: number, locationY: number) => {
    const ls = lettersRef.current;
    // пока замер не пришёл (первое касание) — locationY: палец ещё на самой полосе
    const y = topRef.current != null ? pageY - topRef.current : locationY;
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
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: e => { measure(); pick(e.nativeEvent.pageY, e.nativeEvent.locationY); },
    onPanResponderMove: e => pick(e.nativeEvent.pageY, e.nativeEvent.locationY),
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
        ref={railRef}
        onLayout={measure}
        {...pan.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Буквы"
        style={{
          height: railH, width: 26, paddingVertical: 0, borderTopLeftRadius: 13, borderBottomLeftRadius: 13,
          backgroundColor: active ? k.surface : 'transparent',
        }}
      >
        {letters.map(l => (
          <View
            key={l}
            pointerEvents="none"
            style={{
              height: cell, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2, borderRadius: 6,
              backgroundColor: active === l ? k.accent : 'transparent',
            }}
          >
            <Txt t="labelStrong" color={active === l ? k.onAccent : k.accentText} style={{ fontSize: Math.min(12.5, cell - 2), lineHeight: cell }}>{l}</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

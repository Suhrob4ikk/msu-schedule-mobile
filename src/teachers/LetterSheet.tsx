/**
 * Лист «Перейти к букве»: сетка только существующих букв — 6 колонок, при
 * шрифте ×1,5 и крупнее 4. Ячейка 56 dp, текущая буква залита accent.
 * Ширина ячейки считается из ширины окна, а не из измерения листа.
 */
import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tokens, TOUCH_MIN, RADIUS, FONT } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import BottomSheet from '../schedule/BottomSheet';
import { plural } from '../schedule/state';

const GAP = 6;
const SHEET_PAD = 16;

export default function LetterSheet({ visible, onClose, k, letters, current, total, onPick }: {
  visible: boolean;
  onClose: () => void;
  k: Tokens;
  letters: string[];
  current: string | null;
  total: number;
  onPick: (letter: string) => void;
}) {
  const { width, fontScale } = useWindowDimensions();
  const cols = fontScale >= 1.5 ? 4 : 6;
  const cell = Math.floor((width - SHEET_PAD * 2 - GAP * (cols - 1)) / cols);

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 8, paddingBottom: 12 }}>
      <View style={{ flex: 1 }}>
        <Txt t="titleScreen" color={k.text} accessibilityRole="header" style={{ fontFamily: FONT[800] }}>Перейти к букве</Txt>
        <Txt t="small" color={k.textSecondary}>{`${total} ${plural(total, 'педагог', 'педагога', 'педагогов')}`}</Txt>
      </View>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Закрыть"
        style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center', marginRight: -12 }}
      >
        <Ionicons name="close" size={22} color={k.text} />
      </Pressable>
    </View>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} k={k} label="Переход к букве" header={header} topGap={64}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingBottom: 8 }}>
        {letters.map(l => {
          const on = l === current;
          return (
            <Pressable
              key={l}
              onPress={() => onPick(l)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Буква ${l}`}
              style={({ pressed }) => ({
                width: cell, height: 56, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
                backgroundColor: on ? k.accent : pressed ? k.border : k.surface2,
              })}
            >
              <Txt t="labelStrong" color={on ? k.onAccent : k.text} maxFontSizeMultiplier={1.6} style={{ fontSize: 17, lineHeight: 22 }}>{l}</Txt>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

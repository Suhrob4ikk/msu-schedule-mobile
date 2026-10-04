/**
 * «День аудитории» — пять ячеек I–V: римская цифра и слово «свободна» /
 * «занята» / «накладка» на фоне своего токена. Выбранная пара — кольцо
 * accent-text. Касание ячейки переключает пару.
 */
import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import { Tokens, TOUCH_MIN } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import { CellStatus, PAIRS, cellA11y, cellWord } from './state';

export const CELL_H = 56;

function colors(c: CellStatus, k: Tokens) {
  if (c === 'free') return { bg: k.roomFreeBg, fg: k.roomFreeText };
  if (c === 'conflict') return { bg: k.roomConflictBg, fg: k.roomConflictText };
  return { bg: k.roomBusyBg, fg: k.roomBusyText };
}

function DayCells({ cells, selected, k, onPick }: {
  cells: CellStatus[];
  selected: number;
  k: Tokens;
  onPick: (pairIdx: number) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', columnGap: 4 }}>
      {PAIRS.map((p, i) => {
        const c = colors(cells[i] ?? 'free', k);
        const on = i === selected;
        return (
          <Pressable
            key={p}
            onPress={() => onPick(i)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={cellA11y(i, cells[i] ?? 'free')}
            style={{
              flex: 1, minHeight: Math.max(CELL_H, TOUCH_MIN), borderRadius: 12,
              alignItems: 'center', justifyContent: 'center', paddingVertical: 4, paddingHorizontal: 2,
              backgroundColor: c.bg, borderWidth: 2, borderColor: on ? k.accentText : 'transparent',
            }}
          >
            <Txt t="cellNum" color={c.fg}>{p}</Txt>
            <Txt t="cellWord" color={c.fg} numberOfLines={1} adjustsFontSizeToFit>{cellWord(cells[i] ?? 'free')}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export default memo(DayCells);

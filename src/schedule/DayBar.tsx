/**
 * Ряд дней Пн–Вс над вкладками. Точка — в этот день есть пары; сегодня —
 * кольцо accent-text; видимый в ленте день — заливка accent.
 */
import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import { DAY_LABELS } from '../api';
import { Tokens, DAY_CELL, RADIUS } from './tokens';
import { DayData, dayTitle, plural } from './state';
import { Txt } from './ui';

function DayBar({ days, k, todayIso, visible, onPick }: {
  days: DayData[];
  k: Tokens;
  todayIso: string;
  visible: number;
  onPick: (dayIndex: number) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{
        minHeight: DAY_CELL, flexDirection: 'row', alignItems: 'center',
        backgroundColor: k.surface, borderTopWidth: 1, borderTopColor: k.border,
        paddingHorizontal: 4,
      }}
    >
      {days.map(d => {
        const selected = d.dayIndex === visible;
        const today = d.date === todayIso;
        const has = d.blocks.length > 0;
        const fg = selected ? k.onAccent : k.text;
        const a11y = [
          dayTitle(d.date),
          today ? 'сегодня' : null,
          has ? `${d.pairCount} ${plural(d.pairCount, 'пара', 'пары', 'пар')}` : 'пар нет',
        ].filter(Boolean).join(', ');
        return (
          <Pressable
            key={d.day}
            onPress={() => onPick(d.dayIndex)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={a11y}
            style={{ flex: 1, minHeight: DAY_CELL, alignItems: 'center', justifyContent: 'center' }}
          >
            {/* Кольцо «сегодня» — снаружи заливки, с зазором */}
            <View style={{ borderRadius: RADIUS.md + 3, borderWidth: 2, borderColor: today ? k.accentText : 'transparent', padding: 1 }}>
              <View
                style={{
                  minWidth: 38, paddingHorizontal: 4, paddingVertical: 3,
                  borderRadius: RADIUS.md, alignItems: 'center',
                  backgroundColor: selected ? k.accent : 'transparent',
                }}
              >
                <Txt t="caption" color={selected ? k.onAccent : k.textSecondary} maxFontSizeMultiplier={1.3}>
                  {DAY_LABELS[d.day]}
                </Txt>
                <Txt t="labelStrong" color={fg} maxFontSizeMultiplier={1.3}>
                  {Number(d.date.slice(8))}
                </Txt>
                <View
                  style={{
                    width: 4, height: 4, borderRadius: 2, marginTop: 2,
                    backgroundColor: has ? (selected ? k.onAccent : k.accentText) : 'transparent',
                  }}
                />
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default memo(DayBar);

/**
 * Строка аудитории: номер крупно слева, статус словом и цветом, у занятой —
 * кто в ней (или бейдж накладки / общего занятия), стрелка. Вся строка —
 * одна зона нажатия, открывает лист аудитории.
 */
import React, { memo } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tokens, RADIUS, scaledWidth } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import {
  RoomDay, displayRoom, isNumbered, overlapBadge, overlapOf, roomStatus, rowA11y, statusText, whoLine,
} from './state';

export const NUM_COL = 72;

/** Бейдж «Накладка · 2 группы» (янтарный) или «Поток · 3 группы» (нейтральный). */
export function OverlapBadge({ day, pairIdx, k }: { day: RoomDay; pairIdx: number; k: Tokens }) {
  const o = overlapOf(day.occupants[pairIdx] ?? []);
  const text = overlapBadge(o);
  if (!text) return null;
  const conflict = o.kind === 'conflict';
  return (
    <View
      style={{
        alignSelf: 'flex-start', borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2,
        backgroundColor: conflict ? k.roomConflictBg : k.surface2,
      }}
    >
      <Txt t="captionStrong" color={conflict ? k.roomConflictText : k.textSecondary}>{text}</Txt>
    </View>
  );
}

function RoomRow({ day, pairIdx, k, onPress }: {
  day: RoomDay;
  pairIdx: number;
  k: Tokens;
  onPress: (room: string) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const st = roomStatus(day, pairIdx);
  const occ = day.occupants[pairIdx] ?? [];
  const numbered = isNumbered(day.room);
  const multi = occ.length > 1;

  return (
    <Pressable
      onPress={() => onPress(day.room)}
      accessibilityRole="button"
      accessibilityLabel={rowA11y(day, pairIdx)}
      accessibilityHint="Открыть подробности"
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', columnGap: 12, minHeight: k.roomRowMin,
        // Компактная плотность из «Внешнего вида» — поля поменьше
        paddingTop: k.density === 'compact' ? 5 : 8, paddingRight: 8,
        paddingBottom: k.density === 'compact' ? 5 : 8, paddingLeft: 14,
        backgroundColor: pressed ? k.surface2 : 'transparent',
      })}
    >
      <View style={{ minWidth: scaledWidth(NUM_COL, fontScale), maxWidth: numbered ? undefined : '45%' }}>
        {numbered ? (
          <Txt t="roomNumber" color={k.text} numberOfLines={1}>{day.room}</Txt>
        ) : (
          <Txt t="roomNamed" color={k.text}>{displayRoom(day.room)}</Txt>
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0, rowGap: 2 }}>
        <Txt t="status" color={st.free ? k.roomFreeText : k.roomBusyText}>{statusText(st)}</Txt>
        {multi ? (
          <OverlapBadge day={day} pairIdx={pairIdx} k={k} />
        ) : occ.length === 1 ? (
          <Txt t="small" color={k.textSecondary}>{whoLine(occ[0])}</Txt>
        ) : null}
      </View>

      <View style={{ width: 20, alignItems: 'center' }}>
        <Ionicons name="chevron-forward" size={16} color={k.textSecondary} />
      </View>
    </Pressable>
  );
}

export default memo(RoomRow);

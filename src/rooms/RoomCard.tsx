/**
 * Карточка точного совпадения в поиске: номер крупно, статус для выбранной
 * пары, «день аудитории» и кнопка «Кто в аудитории» (у свободной её нет).
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { Tokens, RADIUS, TOUCH_MIN } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import { dayTitle } from '../schedule/state';
import { RoomDay, displayRoom, isNumbered, roomStatus, statusText } from './state';
import { OverlapBadge } from './RoomRow';
import DayCells from './DayCells';

export default function RoomCard({ day, pairIdx, date, k, onPickPair, onWho }: {
  day: RoomDay;
  pairIdx: number;
  date: string;
  k: Tokens;
  onPickPair: (pairIdx: number) => void;
  onWho: () => void;
}) {
  const st = roomStatus(day, pairIdx);
  return (
    <View style={{ backgroundColor: k.card, borderRadius: RADIUS.lg, padding: 16, rowGap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', columnGap: 12, rowGap: 6 }}>
        <View style={{ flexShrink: 1 }}>
          <Txt t="overline" color={k.textSecondary}>Аудитория</Txt>
          <Txt t="display" color={k.text} numberOfLines={isNumbered(day.room) ? 1 : undefined}>{displayRoom(day.room)}</Txt>
        </View>
        <View style={{ alignItems: 'flex-end', rowGap: 4, marginLeft: 'auto', paddingTop: 14 }}>
          <Txt t="status" color={st.free ? k.roomFreeText : k.roomBusyText}>{statusText(st)}</Txt>
          <OverlapBadge day={day} pairIdx={pairIdx} k={k} />
        </View>
      </View>

      <View style={{ rowGap: 8 }}>
        <Txt t="overline" color={k.textSecondary}>{dayTitle(date)}</Txt>
        <DayCells cells={day.cells} selected={pairIdx} k={k} onPick={onPickPair} />
      </View>

      {!st.free && (
        <Pressable
          onPress={onWho}
          accessibilityRole="button"
          style={{ minHeight: TOUCH_MIN, borderRadius: RADIUS.md, backgroundColor: k.accentSoft, alignItems: 'center', justifyContent: 'center' }}
        >
          <Txt t="labelStrong" color={k.onAccentSoft}>Кто в аудитории</Txt>
        </Pressable>
      )}
    </View>
  );
}

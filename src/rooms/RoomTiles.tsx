/**
 * Аудитории плитками (с 2.0.2, по умолчанию; просьба владельца: «покомпактнее»).
 * На плитке — номер крупно и одна строка: «до 11:30», «весь день» или «до 15:30».
 * С 2.0.5 плитки — обычные карточки, цвет только в статусе (решение владельца 11 окт 2026,
 * как на сайте): сплошные красные и зелёные заливки кричали, а занятых обычно большинство.
 * У свободной — зелёная точка и «весь день» зелёным, у занятой — спокойный серый текст.
 * Накладка — янтарная точка в углу. Нажатие открывает лист аудитории с подробностями.
 *
 * Без измерений раскладки: ширина плитки — целое число из ширины окна.
 */
import React, { memo } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Tokens, RADIUS, GUTTER, FONT } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import { RoomDay, displayRoom, isNumbered, overlapOf, roomStatus, rowA11y } from './state';

const GAP = 8;

/** Сколько плиток в ряд и их ширина: 3 на обычном телефоне, 4 — от 400 dp. */
export function tileGrid(winW: number): { cols: number; w: number } {
  const inner = winW - GUTTER * 2;
  const cols = inner >= 400 ? 4 : 3;
  return { cols, w: Math.floor((inner - GAP * (cols - 1)) / cols) };
}

export function tileLine(d: RoomDay, pairIdx: number): string {
  const s = roomStatus(d, pairIdx);
  if (s.free) return s.until ? `до ${s.until}` : 'весь день';
  return `до ${s.until}`;
}

const RoomTile = memo(function RoomTile({ day, pairIdx, k, w, onPress }: {
  day: RoomDay; pairIdx: number; k: Tokens; w: number; onPress: (room: string) => void;
}) {
  const st = roomStatus(day, pairIdx);
  const numbered = isNumbered(day.room);
  const conflict = overlapOf(day.occupants[pairIdx] ?? []).kind === 'conflict';
  const compact = k.density === 'compact';
  return (
    <Pressable
      onPress={() => onPress(day.room)}
      accessibilityRole="button"
      accessibilityLabel={rowA11y(day, pairIdx)}
      accessibilityHint="Открыть подробности"
      style={({ pressed }) => ({
        // Именная аудитория («Лаб. геологии») — на две клетки, чтобы название не резалось
        width: numbered ? w : w * 2 + GAP,
        minHeight: compact ? 52 : 64,
        paddingHorizontal: 12, paddingVertical: compact ? 6 : 10,
        borderRadius: RADIUS.md, justifyContent: 'center',
        backgroundColor: pressed ? k.surface2 : k.card, borderWidth: 1, borderColor: k.border,
      })}
    >
      {numbered ? (
        <Txt t="roomNumber" color={k.text} numberOfLines={1} style={st.free ? undefined : { opacity: 0.75 }}>{day.room}</Txt>
      ) : (
        <Txt t="roomNamed" color={k.text} numberOfLines={1} style={st.free ? undefined : { opacity: 0.75 }}>{displayRoom(day.room)}</Txt>
      )}
      <Txt t="smallStrong" color={st.free ? k.roomFreeText : k.textSecondary} numberOfLines={1} style={st.free ? undefined : { fontFamily: FONT[500] }}>
        {tileLine(day, pairIdx)}
      </Txt>
      {st.free && (
        <View
          style={{
            position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: 4,
            backgroundColor: k.roomFreeText,
          }}
        />
      )}
      {conflict && (
        <View
          style={{
            position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4,
            backgroundColor: k.roomConflictText,
          }}
        />
      )}
    </Pressable>
  );
});

export function RoomTiles({ days, pairIdx, k, onPress }: {
  days: RoomDay[]; pairIdx: number; k: Tokens; onPress: (room: string) => void;
}) {
  const { width } = useWindowDimensions();
  if (!days.length) return null;
  const { w } = tileGrid(width);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: GAP }}>
      {days.map(d => <RoomTile key={d.room} day={d} pairIdx={pairIdx} k={k} w={w} onPress={onPress} />)}
    </View>
  );
}

/** Заглушки плиток, пока данные грузятся — без мерцания. */
export function TileSkeleton({ k }: { k: Tokens }) {
  const { width } = useWindowDimensions();
  const { w } = tileGrid(width);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: GAP, marginTop: 16 }}>
      {Array.from({ length: 9 }, (_, i) => (
        <View key={i} style={{ width: w, height: k.density === 'compact' ? 52 : 64, borderRadius: RADIUS.md, backgroundColor: k.surface2 }} />
      ))}
    </View>
  );
}

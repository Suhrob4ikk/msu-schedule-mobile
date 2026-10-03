/**
 * Строка пары: сетка «58 | 1fr | 56», как табло. Время — в одну строку,
 * предмет — без обрезки, аудитория крупно справа и нажимается целиком.
 */
import React, { memo } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Lesson } from '../api';
import { Tokens, FONT, ROW_MIN, ROW_PAD_Y, scaledWidth } from './tokens';
import { Block, blockA11y, pairsLabel, slotsLabel } from './state';
import { Txt, KindBadge } from './ui';

export const COL_TIME = 58;
export const COL_ROOM = 56;
export const COL_GAP = 12;
export const ROW_PAD_X = 12;

export function openTeacher(l: Lesson) {
  if (!l.teacher) return;
  Haptics.selectionAsync();
  router.push({ pathname: '/teachers', params: { teacher: String(l.teacher.id) } });
}

export function openRoom(l: Lesson) {
  if (!l.room) return;
  Haptics.selectionAsync();
  router.push({ pathname: '/rooms', params: { day: l.day_of_week, pair: l.pair_number } });
}

/** До 48 dp по высоте у строки подписи 16 dp. */
const SLOP = { top: 16, bottom: 16, left: 8, right: 8 };

interface Props {
  block: Block;
  k: Tokens;
  past: boolean;
  /** Есть заметка / отмечен пропуск — маленький значок у преподавателя. */
  hasNote?: boolean;
  skipped?: boolean;
  onPress: (b: Block) => void;
}

function LessonRow({ block, k, past, hasNote, skipped, onPress }: Props) {
  const { fontScale } = useWindowDimensions();
  const l = block.lessons[0];
  const main = past ? k.textSecondary : k.text;
  const sub = k.textSecondary;
  // Прошедшие: весь текст в text-secondary, время и аудитория — начертание 600
  const bigWeight = past ? { fontFamily: FONT[600] } : null;
  const slots = slotsLabel(block);

  return (
    <Pressable
      onPress={() => onPress(block)}
      accessibilityRole="button"
      accessibilityLabel={blockA11y(block, past ? 'прошла' : undefined)}
      style={({ pressed }) => ({
        flexDirection: 'row', columnGap: COL_GAP, minHeight: ROW_MIN,
        paddingVertical: ROW_PAD_Y, paddingHorizontal: ROW_PAD_X,
        backgroundColor: pressed ? k.surface2 : 'transparent',
      })}
    >
      <View style={{ width: scaledWidth(COL_TIME, fontScale) }}>
        <Txt t="timeRow" color={main} numberOfLines={1} adjustsFontSizeToFit style={bigWeight}>{block.start}</Txt>
        <Txt t="caption" color={sub} numberOfLines={1} adjustsFontSizeToFit>{block.end}</Txt>
        <Txt t="caption" color={sub} numberOfLines={1} adjustsFontSizeToFit>{pairsLabel(block)}</Txt>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt t="titleRow" color={main}>{l.subject}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4, marginTop: 4 }}>
          <KindBadge type={l.lesson_type} k={k} muted={past} />
          {l.teacher && (
            <Pressable
              onPress={() => openTeacher(l)}
              hitSlop={SLOP}
              accessibilityRole="link"
              accessibilityLabel={`Расписание преподавателя ${l.teacher.name}`}
            >
              <Txt t="caption" color={sub}>{l.teacher.name}</Txt>
            </Pressable>
          )}
          {skipped && <Ionicons name="close-circle" size={14} color={k.statusOffline} accessibilityLabel="пропуск отмечен" />}
          {hasNote && <Ionicons name="create-outline" size={14} color={k.accentText} accessibilityLabel="есть заметка" />}
        </View>
        {slots && <Txt t="caption" color={sub} style={{ marginTop: 2 }}>{slots}</Txt>}
      </View>

      {/* Вся правая ячейка на высоту строки — зона нажатия аудитории */}
      <Pressable
        onPress={() => openRoom(l)}
        disabled={!l.room}
        accessibilityRole={l.room ? 'link' : 'text'}
        accessibilityLabel={l.room ? `Аудитория ${l.room.name}, открыть во вкладке «Ауд.»` : 'Аудитория не указана'}
        style={{
          width: scaledWidth(COL_ROOM, fontScale) + ROW_PAD_X + COL_GAP / 2,
          marginVertical: -ROW_PAD_Y, paddingVertical: ROW_PAD_Y,
          marginRight: -ROW_PAD_X, paddingRight: ROW_PAD_X,
          marginLeft: -COL_GAP / 2, minHeight: ROW_MIN,
          alignItems: 'flex-end',
        }}
      >
        <Txt
          t="roomRow"
          color={l.room ? main : sub}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[{ textAlign: 'right' }, bigWeight]}
        >
          {l.room?.name ?? '—'}
        </Txt>
      </Pressable>
    </Pressable>
  );
}

export default memo(LessonRow);

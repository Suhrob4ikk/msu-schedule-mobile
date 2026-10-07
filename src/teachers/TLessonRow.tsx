/**
 * Строка пары педагога: сетка «58 | 1fr | 56», как в «Табло», только вместо
 * ФИО — чипы групп. Чип открывает «Расписание» группы, аудитория — вкладку
 * «Аудитории». Без аудитории — «—», не нажимается.
 */
import React, { memo } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Tokens, FONT, RADIUS, TOUCH_MIN, scaledWidth } from '../schedule/tokens';
import { Txt, KindBadge } from '../schedule/ui';
import { PairNum } from '../schedule/LessonRow';
import { TBlock, tBlockA11y, GroupRef } from './state';
import { openGroupSchedule, openRoomFromTeacher } from './ui';

export const COL_TIME = 58;
export const COL_ROOM = 56;
const COL_GAP = 12;
const ROW_PAD_X = 12;

/**
 * Чипы групп: зона нажатия 48 по высоте, видимая пилюля 28. Переносятся;
 * зазор между соседними 6, зоны не перекрываются.
 */
export function GroupChips({ groups, date, k, variant = 'row', badge }: {
  groups: GroupRef[];
  date: string;
  k: Tokens;
  /** row — в строке; live — на заливке accent; calm — на accent-soft. */
  variant?: 'row' | 'live' | 'calm';
  badge?: React.ReactNode;
}) {
  const bg = variant === 'live' ? k.accentChip : variant === 'calm' ? k.surface : k.surface2;
  const fg = variant === 'live' ? k.onAccent : variant === 'calm' ? k.onAccentSoft : k.text;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6 }}>
      {badge ? <View style={{ minHeight: TOUCH_MIN, justifyContent: 'center' }}>{badge}</View> : null}
      {groups.map(g => (
        <Pressable
          key={g.id}
          onPress={() => openGroupSchedule(g.id, date)}
          accessibilityRole="link"
          accessibilityLabel={`Группа ${g.chip}, расписание`}
          style={{ minHeight: TOUCH_MIN, justifyContent: 'center', maxWidth: '100%' }}
        >
          {({ pressed }) => (
            <View
              style={{
                minHeight: 28, borderRadius: RADIUS.pill, paddingHorizontal: 12, justifyContent: 'center',
                backgroundColor: bg, opacity: pressed ? 0.7 : 1,
              }}
            >
              <Txt t="chip" color={fg} numberOfLines={1}>{g.chip}</Txt>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

function TLessonRow({ block, k, past }: { block: TBlock; k: Tokens; past: boolean }) {
  const { fontScale } = useWindowDimensions();
  const main = past ? k.textSecondary : k.text;
  const sub = k.textSecondary;
  const bigWeight = past ? { fontFamily: FONT[600] } : null;
  const first = block.lessons[0];

  return (
    <View
      style={{
        flexDirection: 'row', columnGap: COL_GAP, minHeight: k.rowMin,
        paddingVertical: k.rowPadY, paddingHorizontal: ROW_PAD_X,
      }}
    >
      <PairNum pair={block.pairs[0]} color={sub} fontScale={fontScale} />
      {/* Колонка времени — она же озвучивает строку целиком */}
      <View
        accessible
        accessibilityLabel={tBlockA11y(block, past ? 'прошла' : undefined)}
        style={{ width: scaledWidth(COL_TIME, fontScale) }}
      >
        <Txt t="timeRow" color={main} numberOfLines={1} adjustsFontSizeToFit style={bigWeight}>{block.start}</Txt>
        <Txt t="caption" color={sub} numberOfLines={1} adjustsFontSizeToFit>{block.end}</Txt>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt t="titleRow" color={main} importantForAccessibility="no" android_hyphenationFrequency="full">{block.subject}</Txt>
        <View style={{ marginTop: -2, marginBottom: -k.rowPadY }}>
          <GroupChips
            groups={block.groups}
            date={block.date}
            k={k}
            badge={<View importantForAccessibility="no-hide-descendants"><KindBadge type={block.type} k={k} muted={past} /></View>}
          />
        </View>
      </View>

      {/* Вся правая ячейка на высоту строки — зона нажатия аудитории */}
      <Pressable
        onPress={() => block.room && openRoomFromTeacher(block.room, first.day_of_week, first.pair_number, block.date)}
        disabled={!block.room}
        accessibilityRole={block.room ? 'link' : 'text'}
        accessibilityLabel={block.room ? `Аудитория ${block.room}, открыть` : 'Аудитория не указана'}
        style={{
          width: scaledWidth(COL_ROOM, fontScale) + ROW_PAD_X + COL_GAP / 2,
          marginVertical: -k.rowPadY, paddingVertical: k.rowPadY,
          marginRight: -ROW_PAD_X, paddingRight: ROW_PAD_X,
          marginLeft: -COL_GAP / 2, minHeight: Math.max(k.rowMin, TOUCH_MIN),
          alignItems: 'flex-end',
        }}
      >
        <Txt
          t="roomRow"
          color={block.room ? main : sub}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[{ textAlign: 'right' }, bigWeight]}
        >
          {block.room ?? '—'}
        </Txt>
      </Pressable>
    </View>
  );
}

export default memo(TLessonRow);

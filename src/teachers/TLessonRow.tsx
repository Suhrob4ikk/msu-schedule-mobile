/**
 * Строка пары педагога: сетка «58 | 1fr | 56», как в «Табло», только вместо
 * ФИО — чипы групп. Чип открывает «Расписание» группы, аудитория — вкладку
 * «Аудитории». Без аудитории — «—», не нажимается.
 */
import React, { memo } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Tokens, FONT, RADIUS, TOUCH_MIN, scaledWidth } from '../schedule/tokens';
import { Txt, KindBadge } from '../schedule/ui';
import { PairNum, ROW_LINE, ROW_SUBJ, TimeRange } from '../schedule/LessonRow';
import { lessonKind } from '../schedule/state';
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

/** Строка педагога в формате msu.tj, как у группы: цифра · предмет, «тип · ауд.», группы · время справа. */
function TLessonRow({ block, k, past }: { block: TBlock; k: Tokens; past: boolean }) {
  const { fontScale } = useWindowDimensions();
  const main = past ? k.textSecondary : k.text;
  const sub = k.textSecondary;
  const first = block.lessons[0];
  const kind = lessonKind(block.type);
  const parts: React.ReactNode[] = [];
  if (kind) parts.push(<Txt key="k" t="caption" color={sub} style={ROW_LINE}>{kind.label}</Txt>);
  if (block.room) {
    parts.push(
      <Txt key="r" t="captionStrong" color={main} style={ROW_LINE} accessibilityRole="link" accessibilityLabel={`Аудитория ${block.room}, открыть`}
        onPress={() => block.room && openRoomFromTeacher(block.room, first.day_of_week, first.pair_number, block.date)}>
        ауд. {block.room}
      </Txt>,
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row', columnGap: COL_GAP, minHeight: k.rowMin,
        paddingVertical: k.rowPadY, paddingHorizontal: ROW_PAD_X,
      }}
    >
      <PairNum pair={block.pairs[0]} color={main} fontScale={fontScale} />

      <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
        <Txt t="titleRow" color={main} style={ROW_SUBJ} accessibilityLabel={tBlockA11y(block, past ? 'прошла' : undefined)} android_hyphenationFrequency="full">{block.subject}</Txt>
        {parts.length > 0 && (
          <Txt t="caption" color={sub} style={[{ marginTop: 3 }, ROW_LINE]}>
            {parts.map((p, i) => <React.Fragment key={i}>{i > 0 ? ' · ' : ''}{p}</React.Fragment>)}
          </Txt>
        )}
        <View style={{ marginBottom: -k.rowPadY, marginTop: -6 }}>
          <GroupChips groups={block.groups} date={block.date} k={k} />
        </View>
      </View>

      <TimeRange start={block.start} end={block.end} color={main} sub={sub} past={past} />
    </View>
  );
}

export default memo(TLessonRow);

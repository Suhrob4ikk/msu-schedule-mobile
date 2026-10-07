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
import { DAYS_ORDER } from '../api';
import { Tokens, FONT, scaledWidth } from './tokens';
import { Block, addDays, blockA11y, lessonKind, slotsLabel } from './state';
import { Txt, KindBadge } from './ui';

export const COL_TIME = 58;
export const COL_ROOM = 56;
export const COL_GAP = 12;
export const ROW_PAD_X = 12;
/** Столбец номера пары слева («III»), как в приложении msu.tj (владелец, 7 окт 2026). */
export const COL_PAIR = 50;
/** Крупнее прежнего (владелец 7 окт 2026: «маленький шрифт»): предмет 17, серая строка 14. */
export const ROW_SUBJ = { fontSize: 17, lineHeight: 22 } as const;
export const ROW_LINE = { fontSize: 14, lineHeight: 19 } as const;

/** Номер пары крупной римской цифрой на всю высоту строки. */
export function PairNum({ pair, color, fontScale }: { pair: string; color: string; fontScale: number }) {
  return (
    <View style={{ width: scaledWidth(COL_PAIR, fontScale), justifyContent: 'center' }} importantForAccessibility="no-hide-descendants">
      <Txt t="timeRow" color={color} numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 38, lineHeight: 42, fontFamily: FONT[500] }}>{pair}</Txt>
    </View>
  );
}

/** Время справа в две строки: начало жирным, ниже конец (владелец: «чтобы мало места по ширине»). */
export function TimeRange({ start, end, color, sub, past }: { start: string; end: string; color: string; sub: string; past?: boolean }) {
  return (
    <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
      <Txt t="timeRow" color={color} numberOfLines={1} style={past ? { fontFamily: FONT[600] } : null}>{start}</Txt>
      <Txt t="small" color={sub} numberOfLines={1}>{end}</Txt>
    </View>
  );
}

export function openTeacher(l: Lesson) {
  if (!l.teacher) return;
  Haptics.selectionAsync();
  // name — экран педагога сразу с ФИО, даже пока список не загрузился;
  // back — «Назад» с экрана педагога вернёт сюда
  router.push({ pathname: '/teachers', params: { teacher: String(l.teacher.id), name: l.teacher.name, back: 'schedule' } });
}

/**
 * Аудитория → вкладка «Ауд.»: сразу лист этой аудитории на нужных дне и
 * паре этой недели.
 */
export function openRoom(l: Lesson) {
  if (!l.room) return;
  Haptics.selectionAsync();
  const dayIdx = DAYS_ORDER.indexOf(l.day_of_week);
  const weekStart = l.lesson_date && dayIdx >= 0 ? addDays(l.lesson_date, -dayIdx) : '';
  router.push({
    pathname: '/rooms',
    params: { day: l.day_of_week, pair: l.pair_number, room: l.room.name, week_start: weekStart },
  });
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

/**
 * Строка в формате приложения msu.tj (решение владельца, 7 окт 2026): крупная
 * римская цифра · предмет, под ним серым «преподаватель · тип · ауд. 105»
 * (преподаватель и аудитория нажимаются) · справа время в две строки.
 */
function LessonRow({ block, k, past, hasNote, skipped, onPress }: Props) {
  const { fontScale } = useWindowDimensions();
  const l = block.lessons[0];
  const main = past ? k.textSecondary : k.text;
  const sub = k.textSecondary;
  const slots = slotsLabel(block);
  const kind = lessonKind(l.lesson_type);
  const parts: React.ReactNode[] = [];
  if (l.teacher) {
    parts.push(
      <Txt key="t" t="caption" color={sub} style={ROW_LINE} onPress={() => openTeacher(l)} accessibilityRole="link"
        accessibilityLabel={`Расписание преподавателя ${l.teacher.name}`}>{l.teacher.name}</Txt>,
    );
  }
  if (kind) parts.push(<Txt key="k" t="caption" color={sub} style={ROW_LINE}>{kind.label}</Txt>);
  if (l.room) {
    parts.push(
      <Txt key="r" t="captionStrong" color={main} style={ROW_LINE} onPress={() => openRoom(l)} accessibilityRole="link"
        accessibilityLabel={`Аудитория ${l.room.name}, открыть во вкладке «Ауд.»`}>ауд. {l.room.name}</Txt>,
    );
  }

  return (
    <Pressable
      onPress={() => onPress(block)}
      accessibilityRole="button"
      accessibilityLabel={blockA11y(block, past ? 'прошла' : undefined)}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'stretch', columnGap: COL_GAP, minHeight: k.rowMin,
        paddingVertical: k.rowPadY, paddingHorizontal: ROW_PAD_X,
        backgroundColor: pressed ? k.surface2 : 'transparent',
      })}
    >
      <PairNum pair={block.pairs[0]} color={main} fontScale={fontScale} />

      <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
        <Txt t="titleRow" color={main} style={ROW_SUBJ}>{l.subject}</Txt>
        <Txt t="caption" color={sub} style={[{ marginTop: 3 }, ROW_LINE]}>
          {parts.map((p, i) => <React.Fragment key={i}>{i > 0 ? ' · ' : ''}{p}</React.Fragment>)}
        </Txt>
        {(skipped || hasNote) && (
          <View style={{ flexDirection: 'row', columnGap: 6, marginTop: 3 }}>
            {skipped && <Ionicons name="close-circle" size={14} color={k.statusOffline} accessibilityLabel="пропуск отмечен" />}
            {hasNote && <Ionicons name="create-outline" size={14} color={k.accentText} accessibilityLabel="есть заметка" />}
          </View>
        )}
        {slots && <Txt t="caption" color={sub} style={{ marginTop: 2 }}>{slots}</Txt>}
      </View>

      <TimeRange start={block.start} end={block.end} color={main} sub={sub} past={past} />
    </Pressable>
  );
}

export default memo(LessonRow);

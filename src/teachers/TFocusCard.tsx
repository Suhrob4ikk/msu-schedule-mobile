/**
 * Раскрытая карточка в расписании педагога: идёт пара / перемена (заливка
 * accent, отсчёт, прогресс) или спокойная следующая (accent-soft, «через …»).
 * Как FocusCard «Табло», только вместо ФИО — чипы групп.
 *
 * Отсчёт тикает здесь (раз в 30 с и при возврате из фона) — перерисовывается
 * только карточка. Дошёл до нуля — экран пересчитает состояние (onExpire).
 */
import React, { memo, useEffect, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { Tokens, RADIUS, TOUCH_MIN } from '../schedule/tokens';
import { Txt, KindBadge, PillDot } from '../schedule/ui';
import { leftParts, roomLines } from '../schedule/state';
import { TFocus, focusA11y } from './state';
import { GroupChips } from './TLessonRow';
import { openRoomFromTeacher } from './ui';

const TICK_MS = 30_000;

function useClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') setNow(Date.now()); });
    return () => { clearInterval(id); sub.remove(); };
  }, [active]);
  return now;
}

function TFocusCard({ focus, k, onExpire }: { focus: TFocus; k: Tokens; onExpire: () => void }) {
  const { block, slot, filled } = focus;
  const now = useClock(focus.targetAt != null);
  const leftMs = focus.targetAt != null ? focus.targetAt - now : null;

  useEffect(() => {
    if (leftMs != null && leftMs <= 0) onExpire();
  }, [leftMs, onExpire]);

  const fg = filled ? k.onAccent : k.text;
  const fg2 = filled ? k.onAccent : k.textSecondary;
  const roomColor = filled ? k.onAccent : k.onAccentSoft;
  const rooms = roomLines(block.room);
  const parts = leftMs != null ? leftParts(Math.max(0, leftMs)) : null;
  const progress = focus.progressFrom != null && focus.targetAt != null
    ? Math.min(1, Math.max(0, (now - focus.progressFrom) / (focus.targetAt - focus.progressFrom)))
    : null;

  return (
    <View
      style={{
        backgroundColor: filled ? k.accent : k.accentSoft,
        borderRadius: RADIUS.lg,
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: progress != null ? 0 : 8,
        overflow: 'hidden',
      }}
    >
      {/* 1. Пилюля и отсчёт — они же озвучивают карточку одной фразой */}
      <View
        accessible
        accessibilityLabel={focusA11y(focus, leftMs)}
        style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 8, rowGap: 6 }}
      >
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', columnGap: 6,
            backgroundColor: filled ? k.accentChip : k.surface,
            borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4,
          }}
        >
          <PillDot color={filled ? k.onAccent : k.onAccentSoft} pulse={focus.kind === 'live'} />
          <Txt t="captionStrong" color={filled ? k.onAccent : k.onAccentSoft}>{focus.pill}</Txt>
        </View>
        {parts && (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 4, marginLeft: 'auto' }}>
            <Txt t="label" color={fg2}>{focus.countdownLabel}</Txt>
            {parts.lessThanMinute ? (
              <Txt t="labelStrong" color={fg}>меньше минуты</Txt>
            ) : parts.parts.map(p => (
              <View key={p.u} style={{ flexDirection: 'row', alignItems: 'baseline', columnGap: 3 }}>
                <Txt t="countdown" color={fg} numberOfLines={1}>{p.n}</Txt>
                <Txt t="label" color={fg}>{p.u}</Txt>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 2. Начало слева, аудитория справа; при крупном шрифте аудитория уходит вниз */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', columnGap: 12, rowGap: 6, marginTop: 10 }}>
        <View importantForAccessibility="no-hide-descendants">
          <Txt t="display" color={fg} numberOfLines={1}>{block.start}</Txt>
          <Txt t="label" color={fg2} style={{ marginTop: 4 }}>до {block.end}</Txt>
        </View>
        <Pressable
          onPress={() => block.room && openRoomFromTeacher(block.room, slot.day_of_week, slot.pair_number, block.date)}
          disabled={!block.room}
          hitSlop={8}
          accessibilityRole={block.room ? 'link' : 'text'}
          accessibilityLabel={block.room ? `Аудитория ${block.room}, открыть` : 'Аудитория не указана'}
          style={{ alignItems: 'flex-end', marginLeft: 'auto', minHeight: TOUCH_MIN, justifyContent: 'flex-end' }}
        >
          <Txt t="overline" color={fg2}>{rooms.length > 1 ? 'Аудитории' : 'Аудитория'}</Txt>
          {rooms.length
            ? rooms.map(r => <Txt key={r} t="display" color={roomColor} numberOfLines={1} adjustsFontSizeToFit style={{ textAlign: 'right' }}>{r}</Txt>)
            : <Txt t="display" color={roomColor}>—</Txt>}
        </Pressable>
      </View>

      {/* 3. Предмет */}
      <Txt t="titleCard" color={fg} style={{ marginTop: 10 }} importantForAccessibility="no" android_hyphenationFrequency="full">
        {block.subject}
      </Txt>

      {/* 4. Тип и группы */}
      <View style={{ marginTop: 2 }}>
        <GroupChips
          groups={block.groups}
          date={block.date}
          k={k}
          variant={filled ? 'live' : 'calm'}
          badge={<View importantForAccessibility="no-hide-descendants"><KindBadge type={block.type} k={k} onAccent={filled} /></View>}
        />
      </View>

      {/* 5. Прогресс — только у идущей пары и перемены, во всю ширину */}
      {progress != null && (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={focus.kind === 'live' ? 'Прошло от пары' : 'Прошло от перемены'}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          style={{ height: 4, marginTop: 6, marginHorizontal: -16, backgroundColor: k.accentChip }}
        >
          <View style={{ height: 4, width: `${progress * 100}%`, backgroundColor: k.onAccent }} />
        </View>
      )}
    </View>
  );
}

export default memo(TFocusCard);

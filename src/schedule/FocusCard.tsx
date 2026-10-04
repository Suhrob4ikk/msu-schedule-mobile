/**
 * Раскрытая карточка в ленте: идёт пара / перемена (заливка accent, отсчёт,
 * прогресс) или спокойная карточка следующей пары (accent-soft).
 *
 * Отсчёт тикает здесь, раз в 30 с и при возврате из фона — перерисовывается
 * только карточка, а не вся лента. Когда отсчёт дошёл до нуля, сообщаем
 * экрану (onExpire): тот пересчитает состояние без перезагрузки.
 */
import React, { memo, useEffect, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { Tokens, RADIUS } from './tokens';
import { Focus, blockA11y, leftParts, leftSpoken, slotsLabel } from './state';
import { Txt, KindBadge, PillDot } from './ui';
import { openRoom, openTeacher } from './LessonRow';

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

const SLOP = { top: 16, bottom: 16, left: 8, right: 8 };

function FocusCard({ focus, k, onPress, onExpire, stillAt }: {
  focus: Focus;
  k: Tokens;
  onPress: () => void;
  onExpire: () => void;
  /** Неподвижная карточка (предпросмотр во «Внешнем виде»): время замерло на
   *  этом моменте — ни тикера отсчёта, ни пульсации точки. */
  stillAt?: number;
}) {
  const { block, slot, filled } = focus;
  const still = stillAt != null;
  const clock = useClock(focus.targetAt != null && !still);
  const now = stillAt ?? clock;
  const leftMs = focus.targetAt != null ? focus.targetAt - now : null;

  useEffect(() => {
    if (!still && leftMs != null && leftMs <= 0) onExpire();
  }, [still, leftMs, onExpire]);

  const fg = filled ? k.onAccent : k.text;
  const fg2 = filled ? k.onAccent : k.textSecondary;
  const roomColor = filled ? k.onAccent : k.onAccentSoft;
  const l = block.lessons[0];
  const slots = slotsLabel(block);
  const parts = leftMs != null ? leftParts(Math.max(0, leftMs)) : null;

  const progress = focus.progressFrom != null && focus.targetAt != null
    ? Math.min(1, Math.max(0, (now - focus.progressFrom) / (focus.targetAt - focus.progressFrom)))
    : null;

  const status = leftMs != null
    ? `${focus.pill.toLowerCase()}, ${focus.countdownLabel} ${leftSpoken(Math.max(0, leftMs))}`
    : focus.pill.toLowerCase();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={blockA11y(block, status)}
      style={{
        backgroundColor: filled ? k.accent : k.accentSoft,
        borderRadius: RADIUS.lg,
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: progress != null ? 0 : 14,
        overflow: 'hidden',
      }}
    >
      {/* 1. Пилюля и отсчёт */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 8, rowGap: 6 }}>
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', columnGap: 6,
            backgroundColor: filled ? k.accentChip : k.surface,
            borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4,
          }}
        >
          {filled && <PillDot color={k.onAccent} pulse={focus.kind === 'live' && !still} />}
          <Txt t="captionStrong" color={filled ? k.onAccent : k.onAccentSoft}>
            {focus.pill}
          </Txt>
        </View>
        {parts && (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 4, marginLeft: 'auto' }}>
            <Txt t="label" color={fg}>{focus.countdownLabel}</Txt>
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
        <View>
          <Txt t="display" color={fg} numberOfLines={1}>{block.start}</Txt>
          <Txt t="label" color={fg2} style={{ marginTop: 4 }}>до {block.end}</Txt>
        </View>
        <Pressable
          onPress={() => openRoom(slot)}
          disabled={!l.room}
          hitSlop={8}
          accessibilityRole={l.room ? 'link' : 'text'}
          accessibilityLabel={l.room ? `Аудитория ${l.room.name}, открыть во вкладке «Ауд.»` : 'Аудитория не указана'}
          style={{ alignItems: 'flex-end', marginLeft: 'auto', minHeight: 48, justifyContent: 'flex-end' }}
        >
          <Txt t="overline" color={fg2}>Аудитория</Txt>
          <Txt t="display" color={roomColor} numberOfLines={1}>{l.room?.name ?? '—'}</Txt>
        </Pressable>
      </View>

      {/* 3. Предмет */}
      <Txt t="titleCard" color={fg} style={{ marginTop: 10 }}>{l.subject}</Txt>

      {/* 4. Тип и преподаватель */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 6, marginTop: 8 }}>
        <KindBadge type={l.lesson_type} k={k} onAccent={filled} />
        {l.teacher && (
          <Pressable
            onPress={() => openTeacher(l)}
            hitSlop={SLOP}
            accessibilityRole="link"
            accessibilityLabel={`Расписание преподавателя ${l.teacher.name}`}
          >
            <Txt t="label" color={fg2}>{l.teacher.name}</Txt>
          </Pressable>
        )}
      </View>
      {slots && <Txt t="caption" color={fg2} style={{ marginTop: 6 }}>{slots}</Txt>}

      {/* 5. Прогресс — только в живых состояниях, во всю ширину */}
      {progress != null && (
        <View style={{ height: 4, marginTop: 14, marginHorizontal: -16, backgroundColor: k.accentChip }}>
          <View style={{ height: 4, width: `${progress * 100}%`, backgroundColor: k.onAccent }} />
        </View>
      )}
    </Pressable>
  );
}

export default memo(FocusCard);

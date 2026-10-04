/**
 * Один день ленты: заголовок «ВТОРНИК, 6 ОКТЯБРЯ · сегодня · 2 пары» и строки
 * пар в карточке. Если раскрытая пара в этом дне — карточка дня делится на
 * две части, а между ними встаёт большая карточка (как на макете).
 */
import React, { memo, useEffect, useMemo, useState } from 'react';
import { Animated, AppState, LayoutChangeEvent, View } from 'react-native';
import { DAYS_ORDER } from '../api';
import { Tokens, RADIUS } from './tokens';
import {
  Block, DayData, Focus, WeekRel, dayMeta, dayTitle, freeFromLabel, gapLabel, isPast, isoOf,
} from './state';
import { Txt, Divider } from './ui';
import LessonRow from './LessonRow';
import FocusCard from './FocusCard';

export type Marks = { notes: Set<string>; skips: Set<string> };

type Item = { kind: 'row'; block: Block } | { kind: 'label'; text: string; key: string };

function Segment({ items, k, now, rel, marks, onRowPress }: {
  items: Item[]; k: Tokens; now: Date; rel: WeekRel; marks: Marks; onRowPress: (b: Block) => void;
}) {
  if (!items.length) return null;
  return (
    <View style={{ backgroundColor: k.card, borderRadius: RADIUS.card, overflow: 'hidden' }}>
      {items.map((it, i) => (
        <React.Fragment key={it.kind === 'row' ? it.block.key : it.key}>
          {i > 0 && <Divider k={k} />}
          {it.kind === 'row' ? (
            <LessonRow
              block={it.block}
              k={k}
              past={rel === 'current' && isPast(it.block, now)}
              hasNote={it.block.lessons.some(l => marks.notes.has(String(l.id)))}
              skipped={it.block.lessons.some(l => marks.skips.has(String(l.id)))}
              onPress={onRowPress}
            />
          ) : (
            <View style={{ paddingVertical: k.labelPadY, paddingHorizontal: 12, alignItems: 'center' }}>
              <Txt t="caption" color={k.textSecondary}>{it.text}</Txt>
            </View>
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

/** Строки с подписями промежутков между ними. */
function itemsOf(blocks: Block[], prevBlock: Block | null, freeFrom: boolean): Item[] {
  const out: Item[] = [];
  let prev = prevBlock;
  for (const b of blocks) {
    if (prev) {
      const g = gapLabel(prev, b);
      if (g) out.push({ kind: 'label', text: g, key: `gap|${b.key}` });
    }
    out.push({ kind: 'row', block: b });
    prev = b;
  }
  if (freeFrom && blocks.length) out.push({ kind: 'label', text: freeFromLabel(blocks[blocks.length - 1]), key: 'free' });
  return out;
}

/** Линия «14:10 · на сегодня всё» — время текущее, тикает само. */
function DoneLine({ k }: { k: Tokens }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') setNow(new Date()); });
    return () => { clearInterval(id); sub.remove(); };
  }, []);
  const hh = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return (
    <View
      accessible
      accessibilityLabel={`${hh}, на сегодня всё`}
      style={{ flexDirection: 'row', alignItems: 'center', columnGap: 8, paddingTop: 12, paddingHorizontal: 4 }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: k.accentText }} />
      <Txt t="captionStrong" color={k.accentText}>{hh} · на сегодня всё</Txt>
      <View style={{ flex: 1, height: 2, borderRadius: 1, backgroundColor: k.accentText }} />
    </View>
  );
}

/** Высота, на которой большое название дня успевает уменьшиться и погаснуть. */
const FADE_RANGE = 72;

function DaySection({
  d, k, now, rel, focus, doneToday, marks, scrollY, onRowPress, onFocusPress, onExpire, onLayout, onFocusLayout,
}: {
  d: DayData;
  k: Tokens;
  now: Date;
  rel: WeekRel;
  focus: Focus | null;
  /** Сегодня пары кончились — линия «14:10 · на сегодня всё» под днём. */
  doneToday: boolean;
  marks: Marks;
  /** Прокрутка ленты — большое название дня уменьшается и гаснет, уходя вверх. */
  scrollY: Animated.Value;
  onRowPress: (b: Block) => void;
  onFocusPress: () => void;
  onExpire: () => void;
  onLayout: (dayIndex: number, e: LayoutChangeEvent) => void;
  onFocusLayout: (dayIndex: number, e: LayoutChangeEvent) => void;
}) {
  const today = d.date === isoOf(now);
  // Положение дня в ленте (только координата: размеры из onLayout не берём)
  const [top, setTop] = useState<number | null>(null);
  const headStyle = useMemo(() => {
    if (top == null) return null;
    const from = top + 8; // при открытии день стоит на top — название ещё целое
    return {
      opacity: scrollY.interpolate({ inputRange: [from, from + FADE_RANGE], outputRange: [1, 0], extrapolate: 'clamp' }),
      transform: [
        { scale: scrollY.interpolate({ inputRange: [from, from + FADE_RANGE], outputRange: [1, 0.7], extrapolate: 'clamp' }) },
        { translateY: scrollY.interpolate({ inputRange: [from, from + FADE_RANGE], outputRange: [0, -10], extrapolate: 'clamp' }) },
      ],
    };
  }, [top, scrollY]);
  const focusIdx = focus ? d.blocks.findIndex(b => b.key === focus.block.key) : -1;
  const showDone = today && doneToday;

  let before: Item[] = [];
  let after: Item[] = [];
  if (focusIdx >= 0) {
    // Подпись перед раскрытой карточкой не ставим, после неё — сверху второй части
    before = itemsOf(d.blocks.slice(0, focusIdx), null, false);
    after = itemsOf(d.blocks.slice(focusIdx + 1), d.blocks[focusIdx], true);
  } else {
    before = itemsOf(d.blocks, null, !showDone);
  }

  return (
    <View
      onLayout={e => { setTop(e.nativeEvent.layout.y); onLayout(d.dayIndex, e); }}
      style={{ paddingTop: 12 + k.dayGap * 2 }}
    >
      {/* Большое название дня по центру; при прокрутке уменьшается и гаснет,
          следом из-под низа приходит название следующего дня */}
      <Animated.View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${dayTitle(d.date)}, ${dayMeta(d, now, focusIdx >= 0)}`}
        style={[{ alignItems: 'center', paddingHorizontal: 4, paddingBottom: 6 + k.dayHeaderPad }, headStyle]}
      >
        <Txt
          t="display"
          color={today ? k.accentText : k.text}
          style={{ fontSize: 32, lineHeight: 38, letterSpacing: 0, textAlign: 'center' }}
        >
          {DAYS_ORDER[d.dayIndex].charAt(0).toUpperCase() + DAYS_ORDER[d.dayIndex].slice(1)}
        </Txt>
        <Txt t="small" color={k.textSecondary} style={{ textAlign: 'center', marginTop: 2 }}>
          {dayTitle(d.date).split(', ')[1]} · {dayMeta(d, now, focusIdx >= 0)}
        </Txt>
      </Animated.View>

      {d.blocks.length === 0 && today && (
        <View style={{ backgroundColor: k.card, borderRadius: RADIUS.card, paddingVertical: 8, alignItems: 'center' }}>
          <Txt t="caption" color={k.textSecondary}>пар нет</Txt>
        </View>
      )}

      <View style={{ rowGap: k.blockGap }}>
        <Segment items={before} k={k} now={now} rel={rel} marks={marks} onRowPress={onRowPress} />
        {focus && focusIdx >= 0 && (
          <View onLayout={e => onFocusLayout(d.dayIndex, e)}>
            <FocusCard focus={focus} k={k} onPress={onFocusPress} onExpire={onExpire} />
          </View>
        )}
        <Segment items={after} k={k} now={now} rel={rel} marks={marks} onRowPress={onRowPress} />
      </View>

      {showDone && <DoneLine k={k} />}
    </View>
  );
}

export default memo(DaySection);

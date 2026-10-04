/**
 * Один день расписания педагога: заголовок «ВТОРНИК, 6 ОКТЯБРЯ · сегодня ·
 * 2 пары» и строки пар в карточке с подписями перемен и окон. Если
 * раскрытая пара в этом дне — карточка дня делится, между частями встаёт
 * большая карточка (как в «Табло»).
 */
import React, { memo } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import { Tokens, RADIUS } from '../schedule/tokens';
import { Txt, Divider } from '../schedule/ui';
import { WeekRel, dayMeta, gapLabel, isPast, isoOf } from '../schedule/state';
import { TBlock, TDay, TFocus, dayEndLabel, dayTitle } from './state';
import TLessonRow from './TLessonRow';
import TFocusCard from './TFocusCard';

type Item = { kind: 'row'; block: TBlock } | { kind: 'label'; text: string; key: string };

function itemsOf(blocks: TBlock[], prevBlock: TBlock | null, end: boolean): Item[] {
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
  if (end && blocks.length) out.push({ kind: 'label', text: dayEndLabel(blocks[blocks.length - 1]), key: 'end' });
  return out;
}

function Segment({ items, k, now, rel }: { items: Item[]; k: Tokens; now: Date; rel: WeekRel }) {
  if (!items.length) return null;
  return (
    <View style={{ backgroundColor: k.card, borderRadius: RADIUS.card, overflow: 'hidden' }}>
      {items.map((it, i) => (
        <React.Fragment key={it.kind === 'row' ? it.block.key : it.key}>
          {i > 0 && <Divider k={k} />}
          {it.kind === 'row' ? (
            <TLessonRow block={it.block} k={k} past={rel === 'current' && isPast(it.block, now)} />
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

function TDaySection({ d, k, now, rel, focus, onExpire, onLayout, onFocusLayout }: {
  d: TDay;
  k: Tokens;
  now: Date;
  rel: WeekRel;
  focus: TFocus | null;
  onExpire: () => void;
  onLayout: (dayIndex: number, e: LayoutChangeEvent) => void;
  onFocusLayout: (dayIndex: number, e: LayoutChangeEvent) => void;
}) {
  const today = d.date === isoOf(now);
  const focusIdx = focus ? d.blocks.findIndex(b => b.key === focus.block.key) : -1;

  let before: Item[];
  let after: Item[] = [];
  if (focusIdx >= 0) {
    before = itemsOf(d.blocks.slice(0, focusIdx), null, false);
    after = itemsOf(d.blocks.slice(focusIdx + 1), d.blocks[focusIdx], true);
  } else {
    before = itemsOf(d.blocks, null, true);
  }
  const accent = today && rel === 'current';

  return (
    <View onLayout={e => onLayout(d.dayIndex, e)} style={{ paddingTop: k.dayGap }}>
      <View
        accessibilityRole="header"
        style={{
          flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between',
          columnGap: 8, paddingHorizontal: 4, paddingBottom: k.dayHeaderPad,
        }}
      >
        <Txt t="captionStrong" color={accent ? k.accentText : k.text} style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {dayTitle(d.date)}
        </Txt>
        <Txt t="caption" color={accent ? k.accentText : k.textSecondary}>{dayMeta(d, now, focusIdx >= 0)}</Txt>
      </View>

      <View style={{ rowGap: k.blockGap }}>
        <Segment items={before} k={k} now={now} rel={rel} />
        {focus && focusIdx >= 0 && (
          <View onLayout={e => onFocusLayout(d.dayIndex, e)}>
            <TFocusCard focus={focus} k={k} onExpire={onExpire} />
          </View>
        )}
        <Segment items={after} k={k} now={now} rel={rel} />
      </View>
    </View>
  );
}

export default memo(TDaySection);

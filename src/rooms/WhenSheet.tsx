/**
 * Лист «Когда»: «Сейчас · II пара» (сразу возвращает режим «Сейчас»),
 * неделя (эта / следующая), день Пн–Сб, пара I–V и «Показать · чт, III пара».
 */
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DAY_LABELS, DAYS_ORDER, PAIR_TIMES } from '../api';
import { Tokens, RADIUS, TOUCH_MIN } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import { addDays, parseIso } from '../schedule/state';
import BottomSheet from '../schedule/BottomSheet';
import { PAIRS, Slot, showLabel } from './state';

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** «5–10 окт» (пн–сб) */
function shortRange(weekStart: string): string {
  const a = parseIso(weekStart);
  const b = parseIso(addDays(weekStart, 5));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}`;
}

function Label({ k, children }: { k: Tokens; children: string }) {
  return <Txt t="overline" color={k.textSecondary} style={{ marginTop: 16, marginBottom: 8 }}>{children}</Txt>;
}

export default function WhenSheet({
  visible, onClose, k, slot, nowPair, thisWeek, nextWeek, nextPublished, todayIso, onNow, onApply,
}: {
  visible: boolean;
  onClose: () => void;
  k: Tokens;
  /** Что выбрано сейчас — с этого начинается черновик. */
  slot: Slot;
  /** Пара режима «Сейчас» — для кнопки «Сейчас · II пара». */
  nowPair: string;
  thisWeek: string;
  nextWeek: string;
  nextPublished: boolean;
  todayIso: string;
  onNow: () => void;
  onApply: (s: Slot) => void;
}) {
  const [week, setWeek] = useState(slot.weekStart);
  const [dayIndex, setDayIndex] = useState(slot.dayIndex);
  const [pair, setPair] = useState(slot.pair);

  // Каждое открытие — с текущего выбора
  useEffect(() => {
    if (!visible) return;
    setWeek(slot.weekStart === nextWeek && nextPublished ? nextWeek : thisWeek);
    setDayIndex(Math.min(slot.dayIndex, 5));
    setPair(slot.pair);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Txt t="titleCard" color={k.text} accessibilityRole="header">Когда</Txt>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Закрыть"
        style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center', marginRight: -12 }}
      >
        <Ionicons name="close" size={22} color={k.text} />
      </Pressable>
    </View>
  );

  const weeks: Array<{ ws: string; label: string; enabled: boolean }> = [
    { ws: thisWeek, label: `Эта · ${shortRange(thisWeek)}`, enabled: true },
    { ws: nextWeek, label: 'Следующая', enabled: nextPublished },
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose} k={k} label="Выбор дня и пары" header={header} topGap={64}>
      <Pressable
        onPress={() => { onNow(); onClose(); }}
        accessibilityRole="button"
        style={{ marginTop: 4, minHeight: TOUCH_MIN, borderRadius: RADIUS.md, backgroundColor: k.accentSoft, alignItems: 'center', justifyContent: 'center' }}
      >
        <Txt t="labelStrong" color={k.onAccentSoft}>Сейчас · {nowPair} пара</Txt>
      </Pressable>

      <Label k={k}>Неделя</Label>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', padding: 3, borderRadius: RADIUS.sm, backgroundColor: k.surface2, columnGap: 3 }}>
        {weeks.map(w => {
          const on = week === w.ws;
          return (
            <Pressable
              key={w.ws}
              onPress={() => setWeek(w.ws)}
              disabled={!w.enabled}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: !w.enabled }}
              accessibilityLabel={w.enabled ? w.label : `${w.label}, ещё не опубликована`}
              style={{
                flex: 1, minHeight: 42, borderRadius: RADIUS.sm - 3, alignItems: 'center', justifyContent: 'center',
                paddingHorizontal: 6, backgroundColor: on ? k.bg : 'transparent',
              }}
            >
              <Txt t="labelStrong" color={!w.enabled ? k.border : on ? k.text : k.textSecondary} style={{ textAlign: 'center' }}>{w.label}</Txt>
            </Pressable>
          );
        })}
      </View>

      <Label k={k}>День</Label>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', columnGap: 4 }}>
        {DAYS_ORDER.slice(0, 6).map((d, i) => {
          const date = addDays(week, i);
          const on = i === dayIndex;
          const today = date === todayIso;
          return (
            <Pressable
              key={d}
              onPress={() => setDayIndex(i)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${d}, ${parseIso(date).getDate()}${today ? ', сегодня' : ''}`}
              style={{
                flex: 1, minHeight: 56, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
                backgroundColor: on ? k.accent : k.surface2,
                borderWidth: 2, borderColor: today ? k.accentText : 'transparent',
              }}
            >
              <Txt t="labelStrong" color={on ? k.onAccent : k.text}>{DAY_LABELS[d]}</Txt>
              <Txt t="caption" color={on ? k.onAccent : k.textSecondary}>{parseIso(date).getDate()}</Txt>
            </Pressable>
          );
        })}
      </View>

      <Label k={k}>Пара</Label>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', columnGap: 4 }}>
        {PAIRS.map(p => {
          const on = p === pair;
          return (
            <Pressable
              key={p}
              onPress={() => setPair(p)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${p} пара, ${PAIR_TIMES[p][0]}–${PAIR_TIMES[p][1]}`}
              style={{
                flex: 1, minHeight: 56, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
                backgroundColor: on ? k.accent : k.surface2,
              }}
            >
              <Txt t="labelStrong" color={on ? k.onAccent : k.text}>{p}</Txt>
              <Txt t="caption" color={on ? k.onAccent : k.textSecondary} numberOfLines={1} adjustsFontSizeToFit>{PAIR_TIMES[p][0]}</Txt>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => {
          onApply({ date: addDays(week, dayIndex), weekStart: week, dayIndex, pair });
          onClose();
        }}
        accessibilityRole="button"
        style={{ marginTop: 20, minHeight: 52, borderRadius: RADIUS.md, backgroundColor: k.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}
      >
        <Txt t="labelStrong" color={k.onAccent} style={{ textAlign: 'center' }}>{showLabel(dayIndex, pair)}</Txt>
      </Pressable>
    </BottomSheet>
  );
}

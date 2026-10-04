/**
 * Режим «По дням»: один день на экране, листается свайпом влево-вправо.
 * Внутри каждого дня — своя вертикальная прокрутка. Выбранный день
 * управляется снаружи (index), как и в ленте — ряд дней внизу его переключает.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { RefreshControl, ScrollView, View, useWindowDimensions } from 'react-native';
import { Tokens } from './tokens';
import { Block, DayData, Focus, WeekRel } from './state';
import DaySection, { Marks } from './DaySection';

const noop = () => {};

export default function DayPager({
  days, k, now, rel, focus, doneToday, marks, index, onIndex, refreshing, onRefresh,
  bottomPad, onRowPress, onFocusPress, onExpire,
}: {
  days: DayData[]; k: Tokens; now: Date; rel: WeekRel; focus: Focus | null; doneToday: boolean; marks: Marks;
  index: number; onIndex: (i: number) => void; refreshing: boolean; onRefresh: () => void; bottomPad: number;
  onRowPress: (b: Block) => void; onFocusPress: () => void; onExpire: () => void;
}) {
  const { width } = useWindowDimensions();
  const ref = useRef<ScrollView>(null);
  const shown = useRef(index);

  // Снаружи выбрали другой день (ряд дней, переход из уведомления) — листаем к нему
  useEffect(() => {
    if (shown.current === index) return;
    shown.current = index;
    ref.current?.scrollTo({ x: index * width, animated: true });
  }, [index, width]);

  // При открытии — сразу на нужной странице, без анимации
  useEffect(() => {
    const id = setTimeout(() => ref.current?.scrollTo({ x: shown.current * width, animated: false }), 0);
    return () => clearTimeout(id);
  }, [width]);

  const onEnd = useCallback((x: number) => {
    const i = Math.max(0, Math.min(days.length - 1, Math.round(x / width)));
    shown.current = i;
    onIndex(i);
  }, [days.length, width, onIndex]);

  return (
    <ScrollView
      ref={ref}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      style={{ flex: 1 }}
      onMomentumScrollEnd={e => onEnd(e.nativeEvent.contentOffset.x)}
    >
      {days.map(d => (
        <View key={d.date} style={{ width }}>
          <ScrollView
            nestedScrollEnabled
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: bottomPad }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accentText} colors={[k.accent]} progressBackgroundColor={k.surface} />
            }
          >
            <DaySection
              d={d} k={k} now={now} rel={rel} focus={focus} doneToday={doneToday} marks={marks}
              onRowPress={onRowPress} onFocusPress={onFocusPress} onExpire={onExpire}
              onLayout={noop} onFocusLayout={noop}
            />
          </ScrollView>
        </View>
      ))}
    </ScrollView>
  );
}

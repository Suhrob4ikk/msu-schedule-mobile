/**
 * Ряд дней Пн–Вс над вкладками. Точка — в этот день есть пары; сегодня —
 * кольцо accent-text; видимый день — заливка accent.
 *
 * Заливка — одна «таблетка» поверх всего ряда, а не фон выбранной ячейки
 * (2.0.2, просьба владельца): она едет за пальцем, пока листаются дни
 * (scrollX — горизонтальная прокрутка DayPager, на нативном драйвере, без
 * перерисовки экрана). Заодно ушёл квадрат: смена фона ячейки с прозрачного
 * на цвет на Android теряла скругление, и заливка рисовалась квадратом
 * поверх кольца «сегодня». Цвет надписей переключается, когда таблетка
 * проходит середину между днями (слушатель меняет состояние только этого ряда).
 */
import React, { memo, useEffect, useMemo, useState } from 'react';
import { Animated, PixelRatio, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { DAY_LABELS } from '../api';
import { Tokens, DAY_CELL, RADIUS } from './tokens';
import { DayData, dayTitle, plural } from './state';
import { Txt } from './ui';

const PAD_X = 4;
const FILL_W = 38;
/** Потолок масштаба надписей ряда — тот же, что у Txt ниже. */
const MAX_SCALE = 1.3;

function DayBar({ days, k, todayIso, visible, onPick, atTop, scrollX }: {
  days: DayData[];
  k: Tokens;
  todayIso: string;
  visible: number;
  onPick: (dayIndex: number) => void;
  /** Ряд стоит под шапкой, а не над вкладками: линия — снизу. */
  atTop?: boolean;
  /** Горизонтальная прокрутка страниц дней (ширина страницы — ширина окна). */
  scrollX?: Animated.Value;
}) {
  const { width, fontScale } = useWindowDimensions();
  const n = days.length;
  const cellW = (width - 2 * PAD_X) / Math.max(1, n);

  // Какой день подсвечен надписями: из прокрутки (середина пути) или снаружи (нажатие)
  const [shown, setShown] = useState(visible);
  useEffect(() => { setShown(visible); }, [visible]);
  useEffect(() => {
    if (!scrollX || width <= 0) return;
    const id = scrollX.addListener(({ value }) => {
      const i = Math.max(0, Math.min(n - 1, Math.round(value / width)));
      setShown(prev => (prev === i ? prev : i));
    });
    return () => scrollX.removeListener(id);
  }, [scrollX, width, n]);

  // Таблетка: без прокрутки — стоит на видимом дне; с прокруткой — едет за ней
  const fixedX = useMemo(() => new Animated.Value(visible * width), [visible, width]);
  const source = scrollX ?? fixedX;
  const x0 = PAD_X + (cellW - FILL_W) / 2;
  const translateX = n > 1
    ? source.interpolate({
      inputRange: [0, (n - 1) * width],
      outputRange: [x0, x0 + (n - 1) * cellW],
      extrapolate: 'clamp',
    })
    : x0;
  // Высота заливки = содержимое ячейки: поля 3 + подпись 16 + число 18 + точка 6 + поля 3
  const fs = Math.min(Math.max(fontScale ?? PixelRatio.getFontScale(), 1), MAX_SCALE);
  const fillH = 12 + 34 * fs;

  return (
    <View
      accessibilityRole="tablist"
      style={{
        minHeight: DAY_CELL, flexDirection: 'row', alignItems: 'center',
        backgroundColor: k.surface, borderColor: k.border,
        ...(atTop ? { borderBottomWidth: 1 } : { borderTopWidth: 1 }),
        paddingHorizontal: PAD_X,
      }}
    >
      {n > 0 && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'center' }]}>
          <Animated.View
            style={{
              position: 'absolute', left: 0, width: FILL_W, height: fillH,
              borderRadius: RADIUS.md, backgroundColor: k.accent,
              transform: [{ translateX }],
            }}
          />
        </View>
      )}
      {days.map(d => {
        const selected = d.dayIndex === shown;
        const today = d.date === todayIso;
        const has = d.blocks.length > 0;
        const fg = selected ? k.onAccent : k.text;
        const a11y = [
          dayTitle(d.date),
          today ? 'сегодня' : null,
          has ? `${d.pairCount} ${plural(d.pairCount, 'пара', 'пары', 'пар')}` : 'пар нет',
        ].filter(Boolean).join(', ');
        return (
          <Pressable
            key={d.day}
            onPress={() => onPick(d.dayIndex)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={a11y}
            style={{ flex: 1, minHeight: DAY_CELL, alignItems: 'center', justifyContent: 'center' }}
          >
            {/* Кольцо «сегодня» — снаружи заливки, с зазором */}
            <View style={{ borderRadius: RADIUS.md + 3, borderWidth: 2, borderColor: today ? k.accentText : 'transparent', padding: 1 }}>
              <View style={{ minWidth: FILL_W, paddingHorizontal: 4, paddingVertical: 3, alignItems: 'center' }}>
                <Txt t="caption" color={selected ? k.onAccent : k.textSecondary} maxFontSizeMultiplier={MAX_SCALE}>
                  {DAY_LABELS[d.day]}
                </Txt>
                <Txt t="labelStrong" color={fg} maxFontSizeMultiplier={MAX_SCALE}>
                  {Number(d.date.slice(8))}
                </Txt>
                <View
                  style={{
                    width: 4, height: 4, borderRadius: 2, marginTop: 2,
                    backgroundColor: has ? (selected ? k.onAccent : k.accentText) : 'transparent',
                  }}
                />
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export default memo(DayBar);

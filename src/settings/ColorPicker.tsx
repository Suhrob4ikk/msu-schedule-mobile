/**
 * Выбор цвета пальцем: квадрат «насыщенность × яркость» и ползунок оттенка.
 * Градиенты — react-native-svg (уже в проекте), жесты — PanResponder.
 * Без измерений раскладки: ширина приходит сверху целым числом.
 *
 * Пока тянут — меняется только локальное состояние этого компонента
 * (onChange наверх зовётся на каждом движении, но наверху это тоже лишь
 * состояние листа); в настройки цвет уходит по «Применить».
 */
import React, { useRef } from 'react';
import { PanResponder, View, type GestureResponderEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { formatHex, hsv as toHsv } from 'culori';
import { Tokens, RADIUS } from '../schedule/tokens';

export interface Hsv { h: number; s: number; v: number }

export function hsvToHex({ h, s, v }: Hsv): string {
  return formatHex({ mode: 'hsv', h, s, v }).toUpperCase();
}

/** prevHue — для серых оттенок не определён: оставляем прежний. */
export function hexToHsv(hex: string, prevHue = 0): Hsv {
  const c = toHsv(hex);
  return { h: c?.h ?? prevHue, s: c?.s ?? 0, v: c?.v ?? 0 };
}

const THUMB = 32;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Перетаскивание по полю: координата касания относительно самого поля. */
function useDrag(onMove: (x: number, y: number) => void, onActive: (on: boolean) => void) {
  const origin = useRef({ x: 0, y: 0 });
  const move = useRef(onMove);
  move.current = onMove;
  const active = useRef(onActive);
  active.current = onActive;
  return useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e: GestureResponderEvent) => {
      const { pageX, pageY, locationX, locationY } = e.nativeEvent;
      origin.current = { x: pageX - locationX, y: pageY - locationY };
      active.current(true);
      move.current(locationX, locationY);
    },
    onPanResponderMove: (e: GestureResponderEvent) => {
      move.current(e.nativeEvent.pageX - origin.current.x, e.nativeEvent.pageY - origin.current.y);
    },
    onPanResponderRelease: () => active.current(false),
    onPanResponderTerminate: () => active.current(false),
  })).current.panHandlers;
}

function Thumb({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', left: x - THUMB / 2, top: y - THUMB / 2, width: THUMB, height: THUMB,
        borderRadius: THUMB / 2, backgroundColor: color, borderWidth: 3, borderColor: '#FFFFFF',
        // Тёмный ободок снаружи белого — бегунок виден и на белом, и на чёрном
        shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 2, elevation: 3,
      }}
    />
  );
}

/** Квадрат: по горизонтали насыщенность, по вертикали яркость (вверху — ярче). */
export function SatValSquare({ k, width, height, value, onChange, onActive }: {
  k: Tokens; width: number; height: number; value: Hsv;
  onChange: (v: Hsv) => void; onActive: (on: boolean) => void;
}) {
  const handlers = useDrag(
    (x, y) => onChange({ ...value, s: clamp01(x / width), v: clamp01(1 - y / height) }),
    onActive,
  );
  const pure = hsvToHex({ h: value.h, s: 1, v: 1 });
  const step = (ds: number, dv: number) => onChange({ ...value, s: clamp01(value.s + ds), v: clamp01(value.v + dv) });
  return (
    <View
      {...handlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Насыщенность и яркость"
      accessibilityValue={{ text: `насыщенность ${Math.round(value.s * 100)} %, яркость ${Math.round(value.v * 100)} %` }}
      accessibilityHint="Проведите вверх или вниз, чтобы изменить яркость"
      accessibilityActions={[
        { name: 'increment', label: 'Ярче' },
        { name: 'decrement', label: 'Темнее' },
        { name: 'more', label: 'Насыщеннее' },
        { name: 'less', label: 'Бледнее' },
      ]}
      onAccessibilityAction={e => {
        switch (e.nativeEvent.actionName) {
          case 'increment': step(0, 0.05); break;
          case 'decrement': step(0, -0.05); break;
          case 'more': step(0.05, 0); break;
          case 'less': step(-0.05, 0); break;
        }
      }}
      style={{ width, height, borderRadius: RADIUS.sm, overflow: 'visible' }}
    >
      <View pointerEvents="none" style={{ width, height, borderRadius: RADIUS.sm, overflow: 'hidden' }}>
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="sat" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id="val" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000000" stopOpacity="0" />
              <Stop offset="1" stopColor="#000000" stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={width} height={height} fill={pure} />
          <Rect x="0" y="0" width={width} height={height} fill="url(#sat)" />
          <Rect x="0" y="0" width={width} height={height} fill="url(#val)" />
        </Svg>
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: k.border }} />
      <Thumb x={value.s * width} y={(1 - value.v) * height} color={hsvToHex(value)} />
    </View>
  );
}

const HUE_STOPS = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'];
const SLIDER_H = 48;
const TRACK_H = 16;

/** Ползунок оттенка (радуга). Зона захвата — 48 dp по высоте. */
export function HueSlider({ k, width, value, onChange, onActive }: {
  k: Tokens; width: number; value: Hsv;
  onChange: (v: Hsv) => void; onActive: (on: boolean) => void;
}) {
  // Центр бегунка не уходит за края дорожки
  const inner = width - THUMB;
  const handlers = useDrag(
    x => onChange({ ...value, h: clamp01((x - THUMB / 2) / inner) * 360 }),
    onActive,
  );
  const step = (d: number) => onChange({ ...value, h: (value.h + d + 360) % 360 });
  return (
    <View
      {...handlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Оттенок"
      accessibilityValue={{ min: 0, max: 360, now: Math.round(value.h), text: `${Math.round(value.h)} градусов` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={e => {
        if (e.nativeEvent.actionName === 'increment') step(10);
        if (e.nativeEvent.actionName === 'decrement') step(-10);
      }}
      style={{ width, height: SLIDER_H, justifyContent: 'center' }}
    >
      <View pointerEvents="none" style={{ marginHorizontal: THUMB / 2, height: TRACK_H, borderRadius: TRACK_H / 2, overflow: 'hidden', borderWidth: 1, borderColor: k.border }}>
        <Svg width={inner} height={TRACK_H}>
          <Defs>
            <LinearGradient id="hue" x1="0" y1="0" x2="1" y2="0">
              {HUE_STOPS.map((c, i) => <Stop key={i} offset={String(i / (HUE_STOPS.length - 1))} stopColor={c} />)}
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={inner} height={TRACK_H} fill="url(#hue)" />
        </Svg>
      </View>
      <Thumb x={THUMB / 2 + (value.h / 360) * inner} y={SLIDER_H / 2} color={hsvToHex({ h: value.h, s: 1, v: 1 })} />
    </View>
  );
}

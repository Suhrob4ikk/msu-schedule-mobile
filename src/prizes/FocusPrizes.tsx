/**
 * Призы на карточке пары (src/prizes/prizes.ts): «Живая рамка» — свет по краю идущей пары, заполняется
 * по ходу пары, по краю бежит искра; «Табло» — время до конца или начала пары перелистывается цифрами
 * каждую секунду. Как на сайте (components/prizes/FocusPrizes.tsx).
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { FONT, type Tokens } from '../schedule/tokens';
import { leftSpoken } from '../schedule/state';

const ARect = Animated.createAnimatedComponent(Rect);

/** Рамка поверх карточки (у карточки overflow: hidden). progress — доля прошедшей пары, 0…1. */
export function LiveFrame({ progress, rainbow, radius, k }: { progress: number; rainbow: boolean; radius: number; k: Tokens }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const run = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.timing(run, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: false }));
    a.start();
    return () => a.stop();
  }, [run]);
  const sw = 4, inset = 2;
  const w = size ? size.w - inset * 2 : 0, h = size ? size.h - inset * 2 : 0, r = Math.max(0, radius - inset);
  const L = size ? 2 * (w + h) - (8 - 2 * Math.PI) * r : 0;   // длина контура со скруглениями
  const c = rainbow ? ['#ffd166', '#ff7aa2', '#7cc6ff'] : ['#ffffff', '#ffffff', '#ffffff'];
  const sparkLen = Math.max(6, L * 0.02);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size && (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id="lf" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={c[0]} stopOpacity={rainbow ? 1 : 0.75} />
              <Stop offset="0.5" stopColor={c[1]} />
              <Stop offset="1" stopColor={c[2]} stopOpacity={rainbow ? 1 : 0.85} />
            </LinearGradient>
          </Defs>
          <Rect x={inset} y={inset} width={w} height={h} rx={r} fill="none" stroke={k.onAccent} strokeOpacity={0.22} strokeWidth={3} />
          <Rect x={inset} y={inset} width={w} height={h} rx={r} fill="none" stroke="url(#lf)" strokeWidth={sw} strokeLinecap="round"
            strokeDasharray={[progress * L, L]} />
          <ARect x={inset} y={inset} width={w} height={h} rx={r} fill="none" stroke="#ffffff" strokeWidth={5} strokeLinecap="round"
            strokeDasharray={[sparkLen, L - sparkLen]}
            strokeDashoffset={run.interpolate({ inputRange: [0, 1], outputRange: [0, -L] })} />
        </Svg>
      )}
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** «осталось 46:59» цифрами-табло; сам тикает раз в секунду. Светлая тема — белые карточки, тёмная — чёрные.
 *  Компактно — в одну строку с плашкой, чтобы карточка не росла (владелец, 1 ноя 2026). */
export function FlipCountdown({ targetAt, label, color, k }: { targetAt: number; label: string; color: string; k: Tokens }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const left = Math.max(0, Math.floor((targetAt - now) / 1000));
  const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
  const text = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return (
    <View accessible accessibilityLabel={`${label} ${leftSpoken(targetAt - now)}`} style={{ flexDirection: 'row', alignItems: 'center', columnGap: 6, marginLeft: 'auto' }}>
      <Text style={{ fontFamily: FONT[500], fontSize: 13.5, color }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 2 }}>
        {[...text].map((ch, i) => ch === ':'
          ? <Text key={i} style={{ fontFamily: FONT[800], fontSize: 16, color }}>:</Text>
          : <FlipDigit key={i} d={ch} k={k} />)}
      </View>
    </View>
  );
}

function FlipDigit({ d, k }: { d: string; k: Tokens }) {
  const flip = useRef(new Animated.Value(1)).current;
  const prev = useRef(d);
  useEffect(() => {
    if (prev.current === d) return;
    prev.current = d;
    flip.setValue(0.15);
    Animated.timing(flip, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [d, flip]);
  const dark = k.mode !== 'light';
  return (
    <View style={{ width: 18, height: 25, borderRadius: 5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      backgroundColor: dark ? '#15161b' : '#ffffff', elevation: 2, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }}>
      <Animated.Text style={{ fontFamily: FONT[800], fontSize: 17, color: dark ? '#ffffff' : k.accentText, transform: [{ scaleY: flip }], opacity: flip }}>{d}</Animated.Text>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 12.5, height: StyleSheet.hairlineWidth, backgroundColor: dark ? 'rgba(0,0,0,.6)' : 'rgba(0,0,0,.1)' }} />
    </View>
  );
}

/**
 * Эффекты праздника поверх всех вкладок (src/holiday/holidays.ts) — как на сайте (HolidayAmbient):
 * снег с глубиной (дальние — мелкие точки, ближние — кристаллы), лепестки, которые кувыркаются,
 * мягкие огоньки; по нажатию на открытку и при первом открытии в праздник — бумажное конфетти и салют.
 * Всё на Animated с нативным драйвером (только transform и opacity), нажатия не ловит.
 * Выключено, если в телефоне включено «Убрать анимации».
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg';
import { askBurst, dushanbeNow, isoOf, onBurst, useHoliday, type Burst } from './holidays';

const R = Math.random;
const rnd = (a: number, b: number) => a + R() * (b - a);
const BURST_KEY = 'holiday_burst';

function loop(v: Animated.Value, duration: number, delay = 0) {
  v.setValue(0);
  return Animated.loop(Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.linear, useNativeDriver: true }));
}

// ── Снег ───────────────────────────────────────────────────────────
const Flake = memo(function Flake({ w, h }: { w: number; h: number }) {
  const p = useRef(new Animated.Value(0)).current;
  const cfg = useMemo(() => {
    const z = R(), near = z > 0.6;
    return { near, x: R() * w, size: near ? rnd(9, 14) : rnd(2, 4), dur: (near ? rnd(7000, 10000) : rnd(12000, 18000)), sway: rnd(10, 26), a: near ? rnd(0.75, 0.95) : rnd(0.35, 0.7), start: R() };
  }, [w]);
  useEffect(() => {
    // начать с середины пути, чтобы снег был сразу по всему экрану
    p.setValue(cfg.start);
    const first = Animated.timing(p, { toValue: 1, duration: cfg.dur * (1 - cfg.start), easing: Easing.linear, useNativeDriver: true });
    let a: Animated.CompositeAnimation | null = null;
    first.start(({ finished }) => { if (finished) { a = loop(p, cfg.dur); a.start(); } });
    return () => { first.stop(); a?.stop(); };
  }, [p, cfg]);
  const ty = p.interpolate({ inputRange: [0, 1], outputRange: [-20, h + 20] });
  const tx = p.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, cfg.sway, 0, -cfg.sway, 0] });
  const rot = p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <Animated.View style={{ position: 'absolute', left: cfg.x, top: 0, opacity: cfg.a, transform: [{ translateY: ty }, { translateX: tx }, { rotate: rot }] }}>
      {cfg.near ? (
        <Svg width={cfg.size} height={cfg.size} viewBox="-10 -10 20 20">
          {[0, 60, 120].map(d => <Line key={d} x1={-9} y1={0} x2={9} y2={0} stroke="#fff" strokeWidth={1.4} strokeLinecap="round" transform={`rotate(${d})`} />)}
          {[0, 60, 120, 180, 240, 300].map(d => <Line key={`b${d}`} x1={5} y1={0} x2={7.5} y2={-2.5} stroke="#fff" strokeWidth={1.1} strokeLinecap="round" transform={`rotate(${d})`} />)}
        </Svg>
      ) : <View style={{ width: cfg.size, height: cfg.size, borderRadius: cfg.size / 2, backgroundColor: '#fff' }} />}
    </Animated.View>
  );
});

// ── Лепестки ───────────────────────────────────────────────────────
const PETAL_COLORS = ['#FFE4EC', '#F8BBD0', '#FFF5F7', '#FFCDD2'];
const Petal = memo(function Petal({ w, h }: { w: number; h: number }) {
  const p = useRef(new Animated.Value(0)).current;
  const flip = useRef(new Animated.Value(0)).current;
  const cfg = useMemo(() => ({ x: rnd(-40, w), size: rnd(8, 13), dur: rnd(9000, 14000), drift: rnd(30, 90), c: PETAL_COLORS[Math.floor(R() * 4)], delay: rnd(0, 9000), fdur: rnd(1600, 2800) }), [w]);
  useEffect(() => {
    const a = loop(p, cfg.dur, cfg.delay), b = loop(flip, cfg.fdur);
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [p, flip, cfg]);
  const ty = p.interpolate({ inputRange: [0, 1], outputRange: [-20, h + 20] });
  const tx = p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, cfg.drift * 0.6, cfg.drift] });
  const rot = p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '540deg'] });
  const sx = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, -1, 1] });
  return (
    <Animated.View style={{ position: 'absolute', left: cfg.x, top: 0, opacity: 0.9, transform: [{ translateY: ty }, { translateX: tx }, { rotate: rot }, { scaleX: sx }] }}>
      <View style={{ width: cfg.size * 0.7, height: cfg.size, borderTopLeftRadius: cfg.size, borderBottomRightRadius: cfg.size, backgroundColor: cfg.c }} />
    </Animated.View>
  );
});

// ── Огоньки ────────────────────────────────────────────────────────
const GLOW_COLORS = ['#FFD1E0', '#FFE08A', '#FFB3C8'];
const Glow = memo(function Glow({ w, h, i }: { w: number; h: number; i: number }) {
  const p = useRef(new Animated.Value(0)).current;
  const cfg = useMemo(() => ({ x: R() * w, size: rnd(18, 40), dur: rnd(14000, 22000), c: GLOW_COLORS[i % 3], delay: rnd(0, 12000) }), [w, i]);
  useEffect(() => { const a = loop(p, cfg.dur, cfg.delay); a.start(); return () => a.stop(); }, [p, cfg]);
  const ty = p.interpolate({ inputRange: [0, 1], outputRange: [h + 20, -40] });
  const op = p.interpolate({ inputRange: [0, 0.2, 0.5, 0.8, 1], outputRange: [0, 0.35, 0.15, 0.35, 0] });
  return (
    <Animated.View style={{ position: 'absolute', left: cfg.x, top: 0, opacity: op, transform: [{ translateY: ty }] }}>
      <Svg width={cfg.size} height={cfg.size}>
        <Defs><RadialGradient id={`g${i}`} cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor={cfg.c} stopOpacity="0.9" /><Stop offset="1" stopColor={cfg.c} stopOpacity="0" /></RadialGradient></Defs>
        <Circle cx={cfg.size / 2} cy={cfg.size / 2} r={cfg.size / 2} fill={`url(#g${i})`} />
      </Svg>
    </Animated.View>
  );
});

// ── Конфетти и салют ───────────────────────────────────────────────
const CONF_COLORS = ['#FF5F6D', '#FFC371', '#7BED9F', '#70A1FF', '#A55EEA', '#FFFFFF', '#FFD54F'];
function ConfettiPiece({ w, h, i }: { w: number; h: number; i: number }) {
  const p = useRef(new Animated.Value(0)).current, flip = useRef(new Animated.Value(0)).current;
  const cfg = useMemo(() => ({ x0: rnd(w * 0.2, w * 0.8), dx: rnd(-140, 140), up: rnd(40, 140), dur: rnd(2200, 3400), c: CONF_COLORS[i % CONF_COLORS.length], s: rnd(7, 11), rot: rnd(360, 900) }), [w, h, i]);
  useEffect(() => {
    const a = Animated.timing(p, { toValue: 1, duration: cfg.dur, easing: Easing.in(Easing.quad), useNativeDriver: true });
    const b = Animated.loop(Animated.timing(flip, { toValue: 1, duration: rnd(500, 900), easing: Easing.linear, useNativeDriver: true }));
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [p, flip, cfg]);
  const ty = p.interpolate({ inputRange: [0, 0.18, 1], outputRange: [h * 0.12, h * 0.12 - cfg.up, h + 30] });
  const tx = p.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, cfg.dx * 0.7, cfg.dx] });
  const rot = p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${cfg.rot}deg`] });
  const sx = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, -1, 1] });
  return <Animated.View style={{ position: 'absolute', left: cfg.x0, top: 0, width: cfg.s, height: cfg.s * 0.62, borderRadius: 1.5, backgroundColor: cfg.c, transform: [{ translateY: ty }, { translateX: tx }, { rotate: rot }, { scaleX: sx }] }} />;
}

const FW_COLORS = ['#FF4D5E', '#FFD34D', '#4DFF9A', '#4DB8FF', '#E1A6FF', '#FFFFFF'];
function Firework({ w, h, delay }: { w: number; h: number; delay: number }) {
  const rise = useRef(new Animated.Value(0)).current, boom = useRef(new Animated.Value(0)).current;
  const cfg = useMemo(() => ({ x: rnd(w * 0.15, w * 0.85), y: rnd(h * 0.12, h * 0.38), c: FW_COLORS[Math.floor(R() * FW_COLORS.length)], c2: R() < 0.4 ? '#FFFFFF' : null, r: rnd(70, 110) }), [w, h]);
  useEffect(() => {
    const a = Animated.sequence([
      Animated.delay(delay),
      Animated.timing(rise, { toValue: 1, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(boom, { toValue: 1, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
    a.start();
    return () => a.stop();
  }, [rise, boom, delay]);
  const ry = rise.interpolate({ inputRange: [0, 1], outputRange: [h + 10, cfg.y] });
  const rop = rise.interpolate({ inputRange: [0, 0.95, 1], outputRange: [1, 1, 0] });
  const sparks = 26;
  return (
    <>
      <Animated.View style={{ position: 'absolute', left: cfg.x - 1.5, top: 0, width: 3, height: 14, borderRadius: 2, backgroundColor: '#FFDCA0', opacity: rop, transform: [{ translateY: ry }] }} />
      <Animated.View style={{ position: 'absolute', left: cfg.x - 60, top: cfg.y - 60, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,240,210,0.35)',
        opacity: boom.interpolate({ inputRange: [0, 0.08, 0.35], outputRange: [0, 1, 0] }), transform: [{ scale: boom.interpolate({ inputRange: [0, 0.35], outputRange: [0.3, 1.2] }) }] }} />
      {Array.from({ length: sparks }, (_, i) => {
        const ang = (i / sparks) * Math.PI * 2, dist = cfg.r * rnd(0.75, 1.05);
        const tx = boom.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(ang) * dist] });
        const ty = boom.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, Math.sin(ang) * dist * 0.95 + 10, Math.sin(ang) * dist + 46] });
        const op = boom.interpolate({ inputRange: [0, 0.02, 0.6, 1], outputRange: [0, 1, 0.85, 0] });
        return <Animated.View key={i} style={{ position: 'absolute', left: cfg.x - 2, top: cfg.y - 2, width: 4, height: 4, borderRadius: 2,
          backgroundColor: cfg.c2 && i % 5 === 0 ? cfg.c2 : cfg.c, opacity: op, transform: [{ translateX: tx }, { translateY: ty }] }} />;
      })}
    </>
  );
}

export default function HolidayParticles() {
  const { holiday, test } = useHoliday();
  const { width: w, height: h } = useWindowDimensions();
  const [reduce, setReduce] = useState(false);
  const [bursts, setBursts] = useState<{ id: number; kind: Burst }[]>([]);
  const nextId = useRef(1);

  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {}); }, []);

  useEffect(() => onBurst(kind => {
    const id = nextId.current++;
    setBursts(b => [...b, { id, kind }]);
    setTimeout(() => setBursts(b => b.filter(x => x.id !== id)), 5200);
  }), []);

  // при первом открытии в праздник — салют/конфетти (раз в день; в тестовом режиме — каждый раз)
  useEffect(() => {
    if (!holiday?.burst || holiday.id === 'nye' || reduce) return;
    const key = `${holiday.id}|${isoOf(dushanbeNow())}`;
    AsyncStorage.getItem(BURST_KEY).then(v => {
      if (!test && v === key) return;
      if (!test) AsyncStorage.setItem(BURST_KEY, key).catch(() => {});
      setTimeout(() => askBurst(holiday.burst), 800);
    }).catch(() => {});
  }, [holiday, test, reduce]);

  if (!holiday || reduce) return null;
  const density = Math.min(1.3, Math.max(0.7, (w * h) / (390 * 800)));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]}>
      {holiday.fx === 'snow' && Array.from({ length: Math.round(38 * density) }, (_, i) => <Flake key={`s${i}`} w={w} h={h} />)}
      {holiday.fx === 'petals' && Array.from({ length: Math.round(20 * density) }, (_, i) => <Petal key={`p${i}`} w={w} h={h} />)}
      {holiday.fx === 'glow' && Array.from({ length: 9 }, (_, i) => <Glow key={`g${i}`} w={w} h={h} i={i} />)}
      {bursts.map(b => (
        <View key={b.id} style={StyleSheet.absoluteFill}>
          {(b.kind === 'fireworks' || b.kind === 'both') && Array.from({ length: 7 }, (_, i) => <Firework key={i} w={w} h={h} delay={i * 420 + rnd(0, 200)} />)}
          {(b.kind === 'confetti' || b.kind === 'both') && Array.from({ length: 60 }, (_, i) => <ConfettiPiece key={`c${i}`} w={w} h={h} i={i} />)}
        </View>
      ))}
    </View>
  );
}

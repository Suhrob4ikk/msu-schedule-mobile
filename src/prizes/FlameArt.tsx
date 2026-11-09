/**
 * Огонёк серии крупно — нарисованное пламя, как на сайте (components/prizes/FlameCanvas.tsx): три слоя языков,
 * которые колышутся, светлое ядро, свечение и искры (у ледяного — кристаллики). Восемь видов — приз
 * «Другой огонёк» (src/prizes/prizes.ts). Пропорции костра, не свечи (замечание владельца, 1 ноя 2026).
 * Холста в React Native нет: контуры — Path из react-native-svg, кадр меняет их через setNativeProps
 * (~30 кадров в секунду), без перерисовки React. В фоне и при выключенных движениях — неподвижно.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { FlameKind } from './prizes';

// [ядро, середина, край, тень] — от светлого к тёмному
const PAL: Record<FlameKind, string[] | null> = {
  base: ['#fff7cf', '#ffc53d', '#ff7a1a', '#e2401b'],
  blue: ['#ffffff', '#9fe0ff', '#3d8bff', '#1d45d6'],
  violet: ['#fff2ff', '#f2a4ff', '#a24dff', '#6223c9'],
  emerald: ['#f6ffe9', '#a6f57a', '#19c27a', '#0c7f52'],
  ice: ['#ffffff', '#dff8ff', '#8fd9ff', '#4aa8e0'],
  rainbow: null,
  plasma: ['#ffffff', '#ff9be6', '#ff2fa0', '#7a1fff'],
  black: ['#ff7a4d', '#d42a10', '#3b0b0b', '#0a0505'],
};
const SPARKS: Partial<Record<FlameKind, boolean>> = { plasma: true, black: true, ice: true };
const S = 150, CX = S / 2, BASE = S - 22, EMBERS = 8;

function hsl(h: number, s: number, l: number) {
  s /= 100; l /= 100;
  const f = (n: number) => { const k = (n + h / 30) % 12, c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Язык пламени: капля, у которой ширина, высота и кончик колышутся. */
function tongue(cx: number, base: number, w: number, h: number, t: number, seed: number, amp: number): string {
  const s1 = Math.sin(t * 3.1 + seed), s2 = Math.sin(t * 4.7 + seed * 2.3), s3 = Math.sin(t * 2.3 + seed * 0.7);
  const H = h * (1 + 0.07 * s1 + 0.04 * s2), W = w * (1 + 0.05 * s3);
  const tx = cx + amp * (s2 * 0.6 + s3 * 0.4), ty = base - H;
  const mL = cx - W * (1 + 0.06 * s1), mR = cx + W * (1 + 0.06 * s2);
  const f = (n: number) => n.toFixed(1);
  return `M${f(cx)} ${f(base + W * 0.12)}C${f(mL - W * 0.3)} ${f(base + W * 0.08)} ${f(mL - W * 0.12)} ${f(base - H * 0.42)} ${f((mL + tx) / 2 - W * 0.05)} ${f(base - H * 0.7)}`
    + `Q${f(tx - W * 0.08 * s1)} ${f(base - H * 0.9)} ${f(tx)} ${f(ty)}Q${f(tx + W * 0.12)} ${f(base - H * 0.86)} ${f((mR + tx) / 2 + W * 0.08)} ${f(base - H * 0.66)}`
    + `C${f(mR + W * 0.12)} ${f(base - H * 0.4)} ${f(mR + W * 0.3)} ${f(base + W * 0.08)} ${f(cx)} ${f(base + W * 0.12)}Z`;
}
// [cx, w, h, seed, amp, dy] — два боковых, главный, средний, ядро
const LAYERS: [number, number, number, number, number, number][] = [
  [CX - 24, 20, 58, 1.3, 8, 0], [CX + 25, 19, 54, 4.1, 8, 0], [CX, 40, 100, 0, 10, 0], [CX, 30, 76, 2.2, 8, 0], [CX, 18, 48, 5.5, 4, 2],
];
const frame = (t: number) => LAYERS.map(([cx, w, h, seed, amp, dy]) => tongue(cx, BASE + dy, w, h, t, seed, amp));

/** still — без движения (значок на вкладке: живое пламя на всех экранах подтормаживало приложение, 9 ноя 2026). */
export default function FlameArt({ kind, size = 96, dark, still: fixed = false }: { kind: FlameKind; size?: number; dark: boolean; still?: boolean }) {
  const paths = useRef<(Path | null)[]>([]);
  const dots = useRef<(Circle | null)[]>([]);
  const [hue, setHue] = useState(0);
  const first = useMemo(() => frame(0), []);

  useEffect(() => {
    let raf = 0, last = 0, alive = true, still = false, active = AppState.currentState === 'active';
    const em = Array.from({ length: EMBERS }, () => ({ x: CX, y: BASE, vx: 0, vy: 0, l: 0, s: Math.random() * 6.28 }));
    const tick = (ts: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(tick);
      if (ts - last < 33) return;
      last = ts;
      const t = Date.now() / 1000;
      frame(t).forEach((d, i) => paths.current[i]?.setNativeProps({ d }));
      for (let i = 0; i < EMBERS; i++) {
        const e = em[i];
        if (e.l <= 0 && Math.random() < (SPARKS[kind] ? 0.25 : 0.08)) Object.assign(e, { x: CX + (Math.random() - 0.5) * 34, y: BASE - 30 - Math.random() * 26, vx: (Math.random() - 0.5) * 1.6, vy: -1.6 - Math.random() * 2.2, l: 1 });
        if (e.l > 0) { e.x += e.vx + Math.sin(t * 3 + e.s) * 0.6; e.y += e.vy; e.l -= 0.032; }
        dots.current[i]?.setNativeProps({ cx: e.x, cy: e.y, opacity: Math.max(0, e.l) });
      }
    };
    const start = () => { if (!fixed && !still && active && !raf) raf = requestAnimationFrame(tick); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    AccessibilityInfo.isReduceMotionEnabled().then(r => { still = r; if (r) stop(); else start(); }).catch(start);
    const sub = AppState.addEventListener('change', s => { active = s === 'active'; if (active) start(); else stop(); });
    // радужный — цвет плавно идёт по кругу (раз в 120 мс хватает)
    const hueId = kind === 'rainbow' ? setInterval(() => setHue(h => (h + 5) % 360), 120) : null;
    return () => { alive = false; stop(); sub.remove(); if (hueId) clearInterval(hueId); };
  }, [kind, fixed]);

  const pal = PAL[kind] ?? [hsl(hue, 100, 92), hsl((hue + 30) % 360, 100, 65), hsl((hue + 70) % 360, 95, 55), hsl((hue + 120) % 360, 90, 45)];
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${S} ${S}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <RadialGradient id="fg" cx={CX} cy={BASE - 26} r={70} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={pal[2]} stopOpacity={dark ? 0.45 : 0.22} /><Stop offset="1" stopColor={pal[2]} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="fo" x1="0" y1={BASE - 105} x2="0" y2={BASE} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={pal[3]} stopOpacity={0} /><Stop offset="0.3" stopColor={pal[3]} stopOpacity={0.9} /><Stop offset="1" stopColor={pal[2]} stopOpacity={0.9} />
        </LinearGradient>
        <LinearGradient id="fm" x1="0" y1={BASE - 80} x2="0" y2={BASE} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={pal[2]} stopOpacity={0} /><Stop offset="0.35" stopColor={pal[2]} stopOpacity={0.95} /><Stop offset="1" stopColor={pal[1]} />
        </LinearGradient>
        <LinearGradient id="fc" x1="0" y1={BASE - 52} x2="0" y2={BASE} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={pal[1]} stopOpacity={0} /><Stop offset="0.25" stopColor={pal[1]} /><Stop offset="1" stopColor={pal[0]} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={S} height={S} fill="url(#fg)" />
      {first.map((d, i) => (
        <Path key={i} ref={el => { paths.current[i] = el; }} d={d} fill={i < 3 ? 'url(#fo)' : i === 3 ? 'url(#fm)' : 'url(#fc)'} />
      ))}
      {Array.from({ length: EMBERS }, (_, i) => (
        <Circle key={i} ref={el => { dots.current[i] = el; }} cx={CX} cy={BASE} r={kind === 'ice' ? 2.6 : 2.2} opacity={0}
          fill={kind === 'ice' ? '#96d7ff' : pal[1]} />
      ))}
    </Svg>
  );
}

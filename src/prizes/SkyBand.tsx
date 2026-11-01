/**
 * Приз «Живое небо» (src/prizes/prizes.ts): фон шапки «Расписания» и «Аудиторий» — небо Душанбе сейчас, как на сайте
 * (components/prizes/SkyBand.tsx). Восход и закат — по формуле для Душанбе на сегодняшний день (sunTimes), солнце и
 * луна идут по дуге, днём облака, ночью звёзды. Перерисовка раз в минуту — анимации кадрами здесь не нужны.
 * В праздник неба нет — у праздника своё оформление (владелец: «небо плохо смотрится с праздничными»).
 * В тёмной теме небо приглушено. Ночью шапка светлит свои надписи (useSky().night).
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { dushanbeNow, useHoliday } from '../holiday/holidays';
import { sunTimes, usePrizes } from './prizes';

const KEYS = (r: number, s: number): [number, string, string][] => [
  [0, '#050816', '#0d1433'], [r - 1.3, '#0b1230', '#2a2350'], [r - 0.2, '#3c3f7a', '#f39a7b'], [r + 1, '#6fa8e8', '#ffd9b0'],
  [(r + s) / 2, '#3d8be0', '#a9d4ff'], [s - 1.2, '#4f86d6', '#ffd1a0'], [s, '#5b4a8a', '#ff8a5c'], [s + 0.8, '#1d1c45', '#6b3f6e'],
  [s + 1.8, '#070a1d', '#141a3a'], [24, '#050816', '#0d1433'],
];
const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

interface SkyNow { hour: number; sr: number; ss: number; top: string; bot: string; night: number }
function skyNow(): SkyNow {
  const d = dushanbeNow(), hour = d.getHours() + d.getMinutes() / 60, [sr, ss] = sunTimes(d), keys = KEYS(sr, ss);
  let top = keys[0][1], bot = keys[0][2];
  for (let i = 0; i < keys.length - 1; i++) {
    const [h1, a1, b1] = keys[i], [h2, a2, b2] = keys[i + 1];
    if (hour >= h1 && hour <= h2) { const t = (hour - h1) / (h2 - h1); top = mix(a1, a2, t); bot = mix(b1, b2, t); break; }
  }
  const night = hour < sr - 0.8 || hour > ss + 0.8 ? 1 : hour < sr + 0.3 ? (sr + 0.3 - hour) / 1.1 : hour > ss - 0.3 ? (hour - ss + 0.3) / 1.1 : 0;
  return { hour, sr, ss, top, bot, night };
}

/** Включено ли небо сейчас и ночь ли — для цвета надписей шапки. */
export function useSky(): { on: boolean; night: boolean; now: SkyNow } {
  const { sky } = usePrizes();
  const { holiday } = useHoliday();
  const [now, setNow] = useState(skyNow);
  useEffect(() => { if (!sky) return; setNow(skyNow()); const id = setInterval(() => setNow(skyNow()), 60_000); return () => clearInterval(id); }, [sky]);
  const on = sky && !holiday;
  return { on, night: on && now.night > 0.3, now };
}

function SkyBand({ now, dark, bg }: { now: SkyNow; dark: boolean; bg: string }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const stars = useMemo(() => Array.from({ length: 40 }, () => [Math.random(), Math.random() * 0.8, Math.random() * 1.1 + 0.4, Math.random() * 0.5 + 0.5]), []);
  const clouds = useMemo(() => Array.from({ length: 3 }, (_, i) => [0.15 + i * 0.33 + Math.random() * 0.1, 0.25 + Math.random() * 0.35, 24 + Math.random() * 22]), []);
  const { w: W, h: H } = size, { hour, sr, ss, top, bot, night } = now;
  const day = hour >= sr && hour <= ss;
  const k = day ? (hour - sr) / (ss - sr) : ((hour + 24 - ss) % 24) / (24 - ss + sr);
  const cx = W * (0.1 + 0.8 * k), cy = H * (0.9 - Math.sin(k * Math.PI) * 0.65);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {W > 0 && (
        <Svg width={W} height={H}>
          <Defs>
            <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={top} /><Stop offset="1" stopColor={bot} /></LinearGradient>
            <RadialGradient id="sun" cx="0.5" cy="0.5" r="0.5"><Stop offset="0" stopColor="#fff0b4" /><Stop offset="0.3" stopColor="#ffd278" stopOpacity={0.9} /><Stop offset="1" stopColor="#ffc878" stopOpacity={0} /></RadialGradient>
            {/* к низу небо растворяется в фоне страницы */}
            <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0.7" stopColor={bg} stopOpacity={0} /><Stop offset="1" stopColor={bg} stopOpacity={1} /></LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={W} height={H} fill="url(#sky)" />
          {night > 0 && stars.map(([x, y, r, a], i) => <Circle key={i} cx={x * W} cy={y * H} r={r} fill="#fff" opacity={Math.min(1, night) * a} />)}
          {day ? <Circle cx={cx} cy={cy} r={32} fill="url(#sun)" /> : (
            <>
              <Circle cx={cx} cy={cy} r={9} fill="#f4f1e3" />
              <Circle cx={cx + 4} cy={cy - 3} r={8} fill={top} />
            </>
          )}
          {day && hour > sr + 0.3 && hour < ss - 0.2 && clouds.map(([x, y, r], i) => (
            <G key={i}>
              <Ellipse cx={x * W} cy={y * H} rx={r} ry={r * 0.32} fill="#fff" opacity={0.5} />
              <Ellipse cx={x * W + r * 0.35} cy={y * H - r * 0.18} rx={r * 0.45} ry={r * 0.3} fill="#fff" opacity={0.5} />
            </G>
          ))}
          {dark && <Rect x={0} y={0} width={W} height={H} fill="#0a0b10" opacity={0.38} />}
          <Rect x={0} y={0} width={W} height={H} fill="url(#fade)" />
        </Svg>
      )}
    </View>
  );
}

export default memo(SkyBand);

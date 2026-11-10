/**
 * Призы на карточке пары (src/prizes/prizes.ts), вариант владельца от 9 ноя 2026 — как на сайте
 * (components/prizes/FocusPrizes.tsx; макет — docs/Табло и рамка - варианты.html в репозитории сайта):
 *
 * «Табло» (А) — «до конца 46 мин», только цифры минут в плашках цвета карточки, тем же шрифтом; при смене минуты
 * цифра мягко перелистывается. Без секунд и без линии поперёк цифр.
 *
 * «Волна» (Г, вместо «Живой рамки») — карточка наполняется светом слева направо, на краю бежит волна. Одна
 * анимация на видеокарте (useNativeDriver) от нынешней доли до конца пары длиной в оставшееся время; волна —
 * вертикальная лента синуса, бесконечно бегущая по краю. После возврата из фона — пересчёт, чтобы не отставала.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { FONT } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import { leftParts, leftSpoken } from '../schedule/state';

const WAVE_C = 'rgba(255,255,255,0.17)';
const EDGE_W = 18, EDGE_H = 640, PERIOD = 40;
/** Край волны: синус с периодом 40 dp вдоль высоты, заливка — влево от него. */
const WAVE_PATH = (() => {
  let d = 'M0 0';
  for (let y = 0; y <= EDGE_H; y += 4) d += ` L${(9 + 6 * Math.sin((y / PERIOD) * 2 * Math.PI)).toFixed(2)} ${y}`;
  return d + ` L0 ${EDGE_H} Z`;
})();

/** «Волна»: первым ребёнком карточки (под содержимым). from/to — начало и конец пары, мс. */
export function LiveWave({ from, to }: { from: number; to: number }) {
  const [w, setW] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const run = useRef(new Animated.Value(0)).current;

  // Вернулись из фона — начать заново от настоящей доли
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') setEpoch(e => e + 1); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!w) return;
    const now = Date.now();
    const p0 = Math.min(1, Math.max(0, (now - from) / Math.max(1, to - from)));
    x.setValue((p0 - 1) * w);
    const a = Animated.timing(x, { toValue: 0, duration: Math.max(0, to - now), easing: Easing.linear, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [w, from, to, epoch, x]);

  useEffect(() => {
    const a = Animated.loop(Animated.timing(run, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [run]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} onLayout={e => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: w, backgroundColor: WAVE_C, transform: [{ translateX: x }] }}>
          <Animated.View style={{ position: 'absolute', top: 0, left: w, width: EDGE_W, height: EDGE_H,
            transform: [{ translateY: run.interpolate({ inputRange: [0, 1], outputRange: [-PERIOD * 2, 0] }) }] }}>
            <Svg width={EDGE_W} height={EDGE_H}><Path d={WAVE_PATH} fill={WAVE_C} /></Svg>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

/** «до конца 46 мин»: цифры в плашках, перелистываются при смене минуты. Тикает раз в секунду. */
export function FlipCountdown({ targetAt, label, color }: { targetAt: number; label: string; color: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const ms = Math.max(0, targetAt - now);
  const p = leftParts(ms);
  return (
    <View accessible accessibilityLabel={`${label} ${leftSpoken(ms)}`}
      style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 4, marginLeft: 'auto' }}>
      <Txt t="label" color={color}>{label}</Txt>
      {p.lessThanMinute ? <Txt t="labelStrong" color={color}>меньше минуты</Txt> : p.parts.map(x => (
        <View key={x.u} style={{ flexDirection: 'row', alignItems: 'center', columnGap: 3 }}>
          {/* в плашках — только минуты; часы обычной цифрой, иначе «12 ч 12 мин» не влезает в строку (9 ноя 2026) */}
          {x.u === 'мин' ? (
            <View style={{ flexDirection: 'row', columnGap: 3 }}>
              {[...x.n].map((c, j) => <FlipDigit key={x.n.length - j} d={c} color={color} />)}
            </View>
          ) : <Txt t="countdown" color={color}>{x.n}</Txt>}
          <Txt t="label" color={color}>{x.u}</Txt>
        </View>
      ))}
    </View>
  );
}

function FlipDigit({ d, color }: { d: string; color: string }) {
  const flip = useRef(new Animated.Value(1)).current;
  const prev = useRef(d);
  useEffect(() => {
    if (prev.current === d) return;
    prev.current = d;
    flip.setValue(0);
    Animated.timing(flip, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [d, flip]);
  return (
    <View style={{ width: 22, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      backgroundColor: hexA(color, 0.13) }}>
      <Animated.Text allowFontScaling={false} style={{ fontFamily: FONT[800], fontSize: 24, lineHeight: 28, color, opacity: flip,
        transform: [{ perspective: 200 }, { rotateX: flip.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] }) }] }}>{d}</Animated.Text>
    </View>
  );
}

/** «#RRGGBB» + прозрачность → rgba(); иное — как есть с подложкой по умолчанию. */
function hexA(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(127,127,127,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

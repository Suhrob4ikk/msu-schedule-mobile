/** Огонь серии — как на сайте: размер, цвет и движение по ступени (streak.ts → flameStage). */
import { memo, useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { flameStage } from './streak';

const COLORS: Record<number, [string, string, string]> = {
  1: ['#FFB347', '#FF6A2B', '#E8400C'], 2: ['#FFB347', '#FF6A2B', '#E8400C'], 3: ['#FFB347', '#FF6A2B', '#E8400C'],
  4: ['#FFC861', '#FF6A2B', '#E0330A'], 5: ['#9FE3FF', '#3FA2FF', '#2459E8'], 6: ['#E9B8FF', '#A35CFF', '#6B2BE0'],
};
const SCALE = [0, 0.62, 0.75, 0.88, 1, 1.05, 1.12];
const OPACITY = [0, 0.55, 0.75, 0.9, 1, 1, 1];

function Flame({ n, size = 20 }: { n: number; size?: number }) {
  const st = flameStage(n);
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (st < 3) return;
    const a = Animated.loop(Animated.timing(v, { toValue: 1, duration: st >= 4 ? 900 : 1600, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [st, v]);
  if (!st) return null;
  const c = COLORS[st], s = size * SCALE[st];
  const sx = v.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: [1, 1.05, 0.97, 1] });
  const sy = v.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: [1, 0.96, 1.05, 1] });
  const rot = v.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: ['0deg', '-2deg', '2deg', '0deg'] });
  const id = `fl${st}`;
  return (
    <Animated.View style={{ width: s, height: s, opacity: OPACITY[st], transform: [{ scaleX: sx }, { scaleY: sy }, { rotate: rot }] }}>
      <Svg width={s} height={s} viewBox="0 0 24 24">
        <Defs>
          <LinearGradient id={id} x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor={c[2]} /><Stop offset="0.55" stopColor={c[1]} /><Stop offset="1" stopColor={c[0]} />
          </LinearGradient>
        </Defs>
        {st === 6 && <><Circle cx={5} cy={6} r={1.2} fill={c[0]} /><Circle cx={19} cy={4} r={1} fill={c[0]} /><Circle cx={20} cy={11} r={0.9} fill={c[0]} /></>}
        <Path d="M12 22c-4.2 0-7-2.8-7-6.6 0-3.2 2-5.3 3.6-7.1.5 1.5 1.3 2.4 2.3 2.8C10.6 7.4 12.4 4 15.4 2c-.4 2.6.6 4.4 2 6.2 1.3 1.7 1.6 3.4 1.6 5.2C19 18.8 16.2 22 12 22z" fill={`url(#${id})`} />
        <Path d="M12 20.4c-1.9 0-3.1-1.2-3.1-3 0-1.6 1-2.6 2-3.6.3.8.8 1.3 1.4 1.5-.1-1.6.6-3 1.8-4 .1 1.4.9 2.3 1.4 3.2.4.7.6 1.4.6 2.2 0 2.2-1.5 3.7-4.1 3.7z" fill={c[0]} opacity={0.85} />
      </Svg>
    </Animated.View>
  );
}

export default memo(Flame);

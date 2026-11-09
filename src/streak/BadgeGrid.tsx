/**
 * Достижения — «Знаки отличия», как на сайте (components/streak/BadgeGrid.tsx; выбор владельца 1 ноя 2026, 9 ноя —
 * «нужна как в сайте»). Гранёный знак с тонким рисунком: полученный залит цветом оформления, неполученный — контур,
 * у секретного рисунка нет. Нажатие — карточка вырастает из знака поверх сетки, вокруг затемнение; у полученного знак
 * «впечатывается», как штамп. Тап по карточке или мимо — закрыть.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import type { Tokens } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import { ACHIEVEMENTS, PRIZE_NAMES, fmtDay, type AchDef } from './achievements';
import type { AchProgress } from './streak';

type Shape = { p: string } | { c: [number, number, number] } | { r: [number, number, number, number, number] };
/** Рисунки — те же, что на сайте (IC в BadgeGrid.tsx), поле 24 × 24. */
const IC: Record<string, Shape[]> = {
  weeks3: [{ p: 'M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3 1.9-5 3.4-6.7.4 1.4 1.2 2.3 2.1 2.6-.1-3.1 1.6-6.2 4.4-8.1-.4 2.5.6 4.2 1.9 5.9 1.2 1.6 1.5 3.2 1.5 4.9 0 4.6-2.7 7.6-6.8 7.6z' }],
  early: [{ p: 'M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0M12 5v3M4.6 9.6l2 2M19.4 9.6l-2 2M8 21h8' }],
  rooms: [{ c: [8, 15, 4] }, { p: 'M11 12l8-8M16 7l2 2M14 9l2 2' }],
  teacher: [{ p: 'M2.5 9 12 4.5 21.5 9 12 13.5z' }, { p: 'M6.5 11v4.5c1.6 1.6 3.4 2.4 5.5 2.4s3.9-.8 5.5-2.4V11M21.5 9v5' }],
  explorer: [{ c: [12, 12, 9] }, { p: 'M15.5 8.5l-2 5-5 2 2-5z' }],
  share: [{ p: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1' }, { p: 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1' }],
  names: [{ p: 'M20 4c-7 1-12 6-14 14l2-1c1-3 3-5 6-6-2 0-3.5-.3-4.5-.8C12 8 15 5.6 20 4z' }, { p: 'M4 20l2-2' }],
  d50: [{ p: 'M4 7h5v4H5.5a2.5 2.5 0 1 0 2.5 3' }, { r: [12.5, 7, 7, 10, 3.5] }],
  d75: [{ p: 'M2 18l5-6 4 4 4-6 7 8z' }, { c: [17, 6, 2.2] }],
  d100: [{ p: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z' }],
  term: [{ p: 'M5 21V4M5 4h12l-2.5 4L17 12H5' }],
  zero: [{ p: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z' }],
};

export interface AchItem extends AchDef { got: string | null; cur?: number; goal?: number }

/** Список с сервера; в «Тестовом режиме» достижения за дни считаются от подставленной серии (как на сайте). */
export function achItems(ach: Record<string, AchProgress> | null, test: boolean, total: number, today: string): AchItem[] {
  const DAYS: Record<string, number> = { weeks3: 21, d50: 30, d75: 40, d100: 50 };
  return ACHIEVEMENTS.map(a => {
    const p = ach?.[a.id];
    let got = p?.got ?? null;
    if (test && DAYS[a.id]) got = total >= DAYS[a.id] ? today : null;
    const goal = DAYS[a.id] ?? p?.goal;
    const cur = DAYS[a.id] ? Math.min(total, DAYS[a.id]) : p?.cur;
    return { ...a, got, cur, goal };
  });
}

function Emblem({ a, k, big = false }: { a: AchItem; k: Tokens; big?: boolean }) {
  const got = !!a.got, hidden = a.secret && !got;
  const w = big ? 64 : 54, h = big ? 71 : 60;   // рисунок 24 × 24 в центре знака (поле знака 54 × 60)
  const stroke = got ? k.onAccent : k.textSecondary;
  return (
    <Svg width={w} height={h} viewBox="0 0 54 60">
      <Path d="M27 2 50 15v30L27 58 4 45V15z" fill={got ? k.accent : 'none'} stroke={got ? k.accent : k.border} strokeWidth={2} />
      {got && <Path d="M27 7 45.5 17.5v25L27 53 8.5 42.5v-25z" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1} />}
      {!hidden && (
        <G transform="translate(15 18)">
          {(IC[a.id] ?? []).map((sh, i) => 'p' in sh
            ? <Path key={i} d={sh.p} fill="none" stroke={stroke} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
            : 'c' in sh ? <Circle key={i} cx={sh.c[0]} cy={sh.c[1]} r={sh.c[2]} fill="none" stroke={stroke} strokeWidth={1.7} />
              : <Rect key={i} x={sh.r[0]} y={sh.r[1]} width={sh.r[2]} height={sh.r[3]} rx={sh.r[4]} fill="none" stroke={stroke} strokeWidth={1.7} />)}
        </G>
      )}
    </Svg>
  );
}

interface Open { a: AchItem; top: number; h: number; cx: number }

export default function BadgeGrid({ list, k }: { list: AchItem[]; k: Tokens }) {
  const [open, setOpen] = useState<Open | null>(null);
  const frames = useRef<Record<string, { x: number; y: number; w: number; h: number }>>({});
  const grow = useRef(new Animated.Value(0)).current;
  const stamp = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!open) return;
    grow.setValue(0); stamp.setValue(0);
    Animated.timing(grow, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }).start();
    if (open.a.got) Animated.sequence([Animated.delay(180), Animated.spring(stamp, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true })]).start();
  }, [open, grow, stamp]);

  const a = open?.a, hidden = !!a && !!a.secret && !a.got;
  return (
    <View style={{ position: 'relative' }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
        {list.map(x => {
          const sec = x.secret && !x.got;
          return (
            <View key={x.id} style={{ width: '33.333%', padding: 5 }}
              onLayout={e => { const l = e.nativeEvent.layout; frames.current[x.id] = { x: l.x, y: l.y, w: l.width, h: l.height }; }}>
              <Pressable onPress={() => { const f = frames.current[x.id]; if (f) setOpen({ a: x, top: f.y, h: f.h, cx: f.x + f.w / 2 }); }}
                accessibilityRole="button" accessibilityLabel={`${sec ? 'Секретное достижение' : x.name}: ${x.got ? 'получено' : 'ещё нет'}`}
                style={{ alignItems: 'center', rowGap: 7, paddingTop: 14, paddingBottom: 12, paddingHorizontal: 6, borderRadius: 18, minHeight: 132,
                  borderWidth: 1, borderColor: k.border, backgroundColor: x.got ? k.surface2 : 'transparent' }}>
                <Emblem a={x} k={k} />
                <Txt t="captionStrong" color={x.got ? k.text : k.textSecondary} style={{ textAlign: 'center' }}>{sec ? 'Секрет' : x.name}</Txt>
                <Txt t="caption" color={k.textSecondary}>{x.got ? 'получен' : x.goal ? `${x.cur ?? 0}/${x.goal}` : '—'}</Txt>
              </Pressable>
            </View>
          );
        })}
      </View>
      {open && a && (
        <>
          <Pressable onPress={() => setOpen(null)} accessibilityLabel="Закрыть"
            style={{ position: 'absolute', top: -2000, bottom: -2000, left: -40, right: -40, backgroundColor: 'rgba(8,10,20,0.42)', zIndex: 3 }} />
          <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: Math.max(0, open.top - 8), minHeight: open.h + 16, zIndex: 4,
            transformOrigin: [open.cx, open.h / 2 + 8, 0], opacity: grow, transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }] }}>
            <Pressable onPress={() => setOpen(null)} accessibilityRole="button" accessibilityLabel={hidden ? 'Секретное достижение' : a.name}
              style={{ padding: 18, borderRadius: 22, backgroundColor: k.surface, rowGap: 10, borderWidth: a.got ? 2 : 1, borderColor: a.got ? k.accent : k.border,
                shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 14 }}>
                <Animated.View style={a.got ? { opacity: stamp, transform: [
                  { scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] }) },
                  { rotate: stamp.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '0deg'] }) }] } : undefined}>
                  <Emblem a={a} k={k} big />
                </Animated.View>
                <View style={{ flex: 1, minWidth: 0, rowGap: 2 }}>
                  <Txt t="overline" color={a.got ? k.accentText : k.textSecondary}>{a.got ? 'Получено' : hidden ? 'Секретное достижение' : 'Ещё не получено'}</Txt>
                  <Txt t="titleScreen" color={k.text} style={{ fontSize: 22, lineHeight: 26 }}>{hidden ? '???' : a.name}</Txt>
                </View>
              </View>
              <Txt t="body" color={k.textSecondary}>{hidden ? 'Условие не раскрывается. Получится само — может быть, случайно.' : a.how}</Txt>
              {a.got ? <Txt t="labelStrong" color={k.accentText} style={{ fontSize: 15 }}>Получено {fmtDay(a.got)}</Txt> : null}
              {!a.got && a.goal ? (
                <View style={{ rowGap: 6 }}>
                  <Txt t="labelStrong" color={k.textSecondary} style={{ fontSize: 15 }}>
                    <Txt t="bigCount" color={k.accentText} style={{ fontSize: 28, lineHeight: 32 }}>{a.cur ?? 0}</Txt> из {a.goal}
                  </Txt>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: k.surface2, overflow: 'hidden' }}>
                    <View style={{ height: 8, borderRadius: 4, width: `${Math.min(100, ((a.cur ?? 0) / a.goal) * 100)}%`, backgroundColor: k.accent }} />
                  </View>
                </View>
              ) : null}
              {a.prize && !hidden ? (
                <View style={{ flexDirection: 'row', alignItems: 'baseline', columnGap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: k.border }}>
                  <Txt t="caption" color={k.textSecondary}>Приз</Txt>
                  <Txt t="labelStrong" color={k.text}>{PRIZE_NAMES[a.prize]}</Txt>
                </View>
              ) : null}
            </Pressable>
          </Animated.View>
        </>
      )}
    </View>
  );
}

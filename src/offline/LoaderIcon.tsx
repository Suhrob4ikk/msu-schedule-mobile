/**
 * Единая загрузка приложения (владелец 9 ноя 2026: «если где-то загрузка — пусть в таком формате»): иконка приложения,
 * вокруг кольцо.
 * - progress задан (0…1) — кольцо ЧЕСТНОЕ: плавно заполняется до этой доли (этапы синхронизации, обновление);
 * - progress не задан — неизвестно, сколько осталось: по кольцу бежит дуга;
 * - phase 'done' — кольцо целиком цветом accent-text и галочка; 'error' — серое кольцо и «нет сети».
 * «Уменьшить движение» в системе — дуга не бежит, заполнение без анимации.
 * Где: первая загрузка для офлайна (OfflineSetupScreen), экран «Обновляем приложение» (UpdatingOverlay),
 * загрузка в «Сравнении» и на «Входе».
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Tokens } from '../schedule/tokens';
import { useReduceMotion } from '../schedule/ui';
import type { Phase } from './state';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const ICON_FILL = 0.84;   // assets/icon.png: круг 431 из 512 px

export default function LoaderIcon({ k, phase = 'running', progress, size = 72 }: {
  k: Tokens; phase?: Phase; progress?: number; size?: number;
}) {
  const reduce = useReduceMotion();
  const ring = size + 22;
  const stroke = Math.max(3, Math.round(size / 24));
  const r = (ring - stroke) / 2;
  const len = 2 * Math.PI * r;
  const badge = Math.round(size * 0.39);

  const known = progress != null && phase === 'running';
  const target = phase === 'done' ? 1 : known ? Math.min(1, Math.max(0, progress!)) : 0.25;

  // честное заполнение — плавно до доли
  const fill = useRef(new Animated.Value(known ? target : 0)).current;
  useEffect(() => {
    if (reduce) { fill.setValue(target); return; }
    const a = Animated.timing(fill, { toValue: target, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [target, reduce, fill]);

  // ход неизвестен — дуга бежит по кругу
  const spin = useRef(new Animated.Value(0)).current;
  const spinning = phase === 'running' && !known && !reduce;
  useEffect(() => {
    if (!spinning) return;
    spin.setValue(0);
    const a = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }));
    a.start();
    return () => a.stop();
  }, [spinning, spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const arc = phase === 'error' ? k.border : k.accentText;
  const pct = known ? Math.round(target * 100) : null;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={phase === 'done' ? 'Загрузка завершена' : phase === 'error' ? 'Загрузка не удалась' : pct != null ? `Загрузка, ${pct} процентов` : 'Идёт загрузка'}
      accessibilityValue={pct != null ? { min: 0, max: 100, now: pct } : undefined}
      style={{ width: ring, height: ring, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}
    >
      <Animated.View style={{ position: 'absolute', width: ring, height: ring, transform: [{ rotate: spinning ? rotate : '-90deg' }] }}>
        <Svg width={ring} height={ring}>
          <Circle cx={ring / 2} cy={ring / 2} r={r} stroke={k.border} strokeWidth={stroke} fill="none" />
          <AnimatedCircle
            cx={ring / 2} cy={ring / 2} r={r} stroke={arc} strokeWidth={stroke} fill="none" strokeLinecap="round"
            strokeDasharray={`${len} ${len}`}
            strokeDashoffset={spinning ? len * 0.75 : fill.interpolate({ inputRange: [0, 1], outputRange: [len, 0] })}
          />
        </Svg>
      </Animated.View>
      {/* Круг на картинке иконки занимает 84 % (вокруг прозрачные поля) — увеличиваем, чтобы синяя кайма шла по краю */}
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <Image source={require('../../assets/icon.png')} style={{ width: size / ICON_FILL, height: size / ICON_FILL }} />
      </View>
      {phase !== 'running' && (
        <View
          style={{
            position: 'absolute', right: 0, bottom: 0, width: badge, height: badge, borderRadius: badge / 2,
            alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: k.bg,
            backgroundColor: phase === 'done' ? k.accent : k.statusOfflineBg,
          }}
        >
          <Ionicons name={phase === 'done' ? 'checkmark' : 'cloud-offline-outline'} size={Math.round(badge * 0.55)}
            color={phase === 'done' ? k.onAccent : k.statusOffline} />
        </View>
      )}
    </View>
  );
}

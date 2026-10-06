/**
 * Иконка приложения с кольцом вокруг (прежний AppLoader, удалённый в 2.0.1,
 * по просьбе владельца — «чтобы во время ожидания было на что посмотреть»).
 * Пока грузится — кольцо крутится; готово — кольцо целиком цветом
 * accent-text и галочка; ошибка — серое кольцо и значок «нет сети».
 * «Уменьшить движение» в системе — кольцо стоит, крутится только ActivityIndicator этапа.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tokens } from '../schedule/tokens';
import { useReduceMotion } from '../schedule/ui';
import type { Phase } from './state';

const ICON = 72;
const RING = ICON + 22;
const BADGE = 28;

export default function LoaderIcon({ k, phase }: { k: Tokens; phase: Phase }) {
  const reduce = useReduceMotion();
  const spin = useRef(new Animated.Value(0)).current;
  const spinning = phase === 'running' && !reduce;

  useEffect(() => {
    if (!spinning) return;
    spin.setValue(0);
    const anim = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }),
    );
    anim.start();
    return () => anim.stop();
  }, [spinning, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  // Крутится — две четверти цветом, остальное линией; готово — всё кольцо цветом
  const arc = phase === 'error' ? k.border : k.accentText;
  const rest = phase === 'done' ? k.accentText : k.border;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={phase === 'done' ? 'Загрузка завершена' : phase === 'error' ? 'Загрузка не удалась' : 'Идёт загрузка'}
      style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}
    >
      <Animated.View
        style={{
          position: 'absolute', width: RING, height: RING, borderRadius: RING / 2, borderWidth: 3,
          borderColor: rest, borderTopColor: arc, borderRightColor: arc,
          transform: [{ rotate: spinning ? rotate : '0deg' }],
        }}
      />
      <Image source={require('../../assets/icon.png')} style={{ width: ICON, height: ICON, borderRadius: ICON / 2 }} />
      {phase !== 'running' && (
        <View
          style={{
            position: 'absolute', right: 0, bottom: 0, width: BADGE, height: BADGE, borderRadius: BADGE / 2,
            alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: k.bg,
            backgroundColor: phase === 'done' ? k.accent : k.statusOfflineBg,
          }}
        >
          <Ionicons
            name={phase === 'done' ? 'checkmark' : 'cloud-offline-outline'}
            size={15}
            color={phase === 'done' ? k.onAccent : k.statusOffline}
          />
        </View>
      )}
    </View>
  );
}

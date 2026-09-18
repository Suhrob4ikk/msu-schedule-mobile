import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, Easing, StyleSheet } from 'react-native';
import { useTheme } from './theme';

/**
 * Иконка приложения с вращающимся кольцом вокруг неё — вместо голого
 * ActivityIndicator на экранах, где первая загрузка неизбежно требует
 * ожидания сети (список преподавателей/аудиторий/изменений). Идея — от
 * владельца: "чтобы во время ожидания было на что посмотреть".
 */
export default function AppLoader({ size = 64 }: { size?: number }) {
  const C = useTheme();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const ringSize = size + 18;
  const iconSize = size * 0.78;

  return (
    <View style={[styles.wrap, { width: ringSize, height: ringSize }]}>
      <Animated.View
        style={[
          styles.ring,
          {
            width: ringSize, height: ringSize, borderRadius: ringSize / 2,
            borderWidth: 3, borderColor: C.border,
            borderTopColor: C.primary, borderRightColor: C.primary,
            transform: [{ rotate }],
          },
        ]}
      />
      <Image
        source={require('../assets/icon.png')}
        style={{ width: iconSize, height: iconSize, borderRadius: iconSize / 2 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 32 },
  ring: { position: 'absolute' },
});

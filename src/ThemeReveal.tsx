import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';

/**
 * Круг новой темы, расходящийся от нажатой кнопки — то же, что делает
 * View Transitions API на сайте (globals.css → theme-switching).
 *
 * В RN снимка старого экрана нет, поэтому играем наоборот: поверх текущего
 * интерфейса растёт круг цвета НОВОГО фона, и в момент, когда он накрыл
 * экран целиком, ThemeProvider переключает тему и убирает оверлей —
 * подмены не видно.
 */
export default function ThemeReveal({
  x, y, color, onCovered,
}: {
  x: number;
  y: number;
  color: string;
  /** Круг накрыл экран — пора менять тему и убирать оверлей. */
  onCovered: () => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const { width, height } = Dimensions.get('window');
  // Радиус — до самого дальнего угла экрана, чтобы круг накрыл всё
  const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 340,
      useNativeDriver: true,
    }).start(({ finished }) => { if (finished) onCovered(); });
    // Круг живёт один проход: координаты и цвет на лету не меняются.
  }, [progress, onCovered]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={{
          position: 'absolute',
          left: x - radius,
          top: y - radius,
          width: radius * 2,
          height: radius * 2,
          borderRadius: radius,
          backgroundColor: color,
          transform: [{ scale: progress }],
        }}
      />
    </View>
  );
}

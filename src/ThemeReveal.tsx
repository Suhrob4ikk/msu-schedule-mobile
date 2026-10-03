import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet } from 'react-native';

/**
 * Плавная смена темы: снимок старого экрана поверх, под ним уже новая тема,
 * снимок растворяется.
 *
 * Раньше поверх интерфейса рос круг сплошного цвета новой темы, и только
 * когда он накрывал экран, тема менялась. Всё это время текст был закрыт
 * чёрным или белым, а потом телефон ещё перерисовывал все экраны — на
 * глазах около секунды. Теперь текст виден всё время: сверху — снимок
 * старого экрана с текстом, снизу — уже перерисованный новый, и между ними
 * короткое растворение.
 */
const FADE_MS = 220;
/** Если снимок почему-то не показался — не держим экран замороженным. */
const SAFETY_MS = 800;

export default function ThemeReveal({
  uri, onShown, onDone,
}: {
  /** Снимок экрана до смены темы (файл от react-native-view-shot). */
  uri: string;
  /** Снимок уже на экране — пора менять тему под ним. */
  onShown: () => void;
  /** Снимок растворился — убрать оверлей. */
  onDone: () => void;
}) {
  const opacity = useRef(new Animated.Value(1)).current;
  const started = useRef(false);

  const start = () => {
    if (started.current) return;
    started.current = true;
    onShown();
    // Два кадра — чтобы под снимком успела отрисоваться новая тема,
    // иначе растворение открыло бы недорисованный экран.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true })
        .start(() => onDone());
    }));
  };

  useEffect(() => {
    const t = setTimeout(start, SAFETY_MS);
    return () => clearTimeout(t);
    // Оверлей живёт один проход: снимок на лету не меняется.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none">
      <Image
        source={{ uri }}
        onLoad={start}
        // На Android у Image своя анимация появления (300 мс) — здесь она
        // показала бы на мгновение новую тему без снимка.
        fadeDuration={0}
        resizeMode="stretch"
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

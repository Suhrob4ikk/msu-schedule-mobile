/**
 * Нижний лист на Modal + Animated (без новых нативных библиотек).
 * Выезжает снизу, под ним затемнение scrim. Закрывается тапом по фону,
 * системной кнопкой «Назад» (onRequestClose у Modal) и свайпом вниз за
 * полоску и шапку листа (PanResponder) — на прокручиваемом содержимом
 * свайп не ловим, чтобы он не спорил с прокруткой.
 *
 * Клавиатура: до 1.9.42 тут был KeyboardAvoidingView в режиме 'height'. Он
 * считает свою высоту от собственного измерения (onLayout → setState →
 * onLayout), и после того как на листе хоть раз открывали клавиатуру, Android
 * округлял размеры до пикселя то вверх, то вниз — значения скакали между
 * двумя соседними, каждый скачок ещё и анимировался (LayoutAnimation), и лист
 * мелко дрожал. Теперь отступ под клавиатуру считается один раз на событие
 * клавиатуры — от рамки всего окна, которая от этого отступа не зависит.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Keyboard, Modal, PanResponder, Platform, Pressable, ScrollView,
  StyleSheet, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tokens, RADIUS } from './tokens';
import { useReduceMotion } from './ui';

export default function BottomSheet({ visible, onClose, k, label, header, topGap, scrollEnabled = true, children }: {
  visible: boolean;
  onClose: () => void;
  k: Tokens;
  /** Для экранного диктора: что это за лист. */
  label: string;
  /** Шапка листа — не прокручивается, за неё же можно смахнуть лист вниз. */
  header?: React.ReactNode;
  /** Верхний край листа — не выше этого отступа от верха экрана (dp). */
  topGap?: number;
  /** false — пока внутри тянут ползунок: прокрутка листа не перехватывает жест. */
  scrollEnabled?: boolean;
  children: React.ReactNode;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const [mounted, setMounted] = useState(visible);
  const v = useRef(new Animated.Value(visible ? 0 : 1)).current; // 0 — открыт, 1 — закрыт
  const drag = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      drag.setValue(0);
      v.setValue(1);
      Animated.timing(v, {
        toValue: 0, duration: reduce ? 0 : 250, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(v, { toValue: 1, duration: reduce ? 0 : 200, useNativeDriver: true })
        .start(({ finished }) => { if (finished) { setMounted(false); drag.setValue(0); } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > 100 || g.vy > 0.8) onCloseRef.current();
      else Animated.spring(drag, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true, friction: 8 }).start(),
  })).current;

  // Сколько снизу закрывает клавиатура — без обратной связи от раскладки листа
  const wrapRef = useRef<View>(null);
  const [kb, setKb] = useState(0);
  useEffect(() => {
    if (!mounted) return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', e => {
      const kbTop = e.endCoordinates.screenY;
      wrapRef.current?.measureInWindow((_x, y, _w, h) => {
        setKb(Math.max(0, Math.round(y + h - kbTop)));
      });
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(0));
    return () => { show.remove(); hide.remove(); setKb(0); };
  }, [mounted]);

  if (!mounted) return null;

  const maxHeight = (topGap != null ? height - topGap - insets.top : height * 0.88) - kb;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: k.scrim, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" />
      </Animated.View>
      <View
        ref={wrapRef}
        collapsable={false}
        style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: kb }}
        pointerEvents="box-none"
      >
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={label}
          style={{
            maxHeight,
            backgroundColor: k.surface,
            borderTopLeftRadius: RADIUS.sheet,
            borderTopRightRadius: RADIUS.sheet,
            // Над клавиатурой системная полоса навигации не нужна
            paddingBottom: kb ? 8 : insets.bottom + 8,
            transform: [{ translateY: Animated.add(v.interpolate({ inputRange: [0, 1], outputRange: [0, height] }), drag) }],
          }}
        >
          <View {...pan.panHandlers}>
            <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: k.border }} />
            </View>
            {header ? <View style={{ paddingHorizontal: 16 }}>{header}</View> : null}
          </View>
          <ScrollView scrollEnabled={scrollEnabled} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

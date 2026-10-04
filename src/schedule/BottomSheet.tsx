/**
 * Нижний лист на Modal + Animated (без новых нативных библиотек).
 * Выезжает снизу, под ним затемнение scrim. Закрывается тапом по фону,
 * системной кнопкой «Назад» (onRequestClose у Modal) и свайпом вниз за
 * полоску и шапку листа (PanResponder) — на прокручиваемом содержимом
 * свайп не ловим, чтобы он не спорил с прокруткой.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView,
  StyleSheet, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tokens, RADIUS } from './tokens';
import { useReduceMotion } from './ui';

export default function BottomSheet({ visible, onClose, k, label, header, topGap, children }: {
  visible: boolean;
  onClose: () => void;
  k: Tokens;
  /** Для экранного диктора: что это за лист. */
  label: string;
  /** Шапка листа — не прокручивается, за неё же можно смахнуть лист вниз. */
  header?: React.ReactNode;
  /** Верхний край листа — не выше этого отступа от верха экрана (dp). */
  topGap?: number;
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

  if (!mounted) return null;

  const maxHeight = topGap != null ? height - topGap - insets.top : height * 0.88;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: k.scrim, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" />
      </Animated.View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end' }}
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
            paddingBottom: insets.bottom + 8,
            transform: [{ translateY: Animated.add(v.interpolate({ inputRange: [0, 1], outputRange: [0, height] }), drag) }],
          }}
        >
          <View {...pan.panHandlers}>
            <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: k.border }} />
            </View>
            {header ? <View style={{ paddingHorizontal: 16 }}>{header}</View> : null}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

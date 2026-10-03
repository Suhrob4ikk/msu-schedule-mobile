/**
 * Нижний лист на Modal + Animated (без новых нативных библиотек).
 * Выезжает снизу, под ним затемнение scrim; закрывается тапом по фону и
 * кнопкой «Назад».
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet,
  View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tokens, RADIUS } from './tokens';
import { useReduceMotion } from './ui';

export default function BottomSheet({ visible, onClose, k, label, children }: {
  visible: boolean;
  onClose: () => void;
  k: Tokens;
  /** Для экранного диктора: что это за лист. */
  label: string;
  children: React.ReactNode;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const [mounted, setMounted] = useState(visible);
  const v = useRef(new Animated.Value(visible ? 0 : 1)).current; // 0 — открыт, 1 — закрыт

  useEffect(() => {
    if (visible) {
      setMounted(true);
      v.setValue(1);
      Animated.timing(v, {
        toValue: 0, duration: reduce ? 0 : 240, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(v, { toValue: 1, duration: reduce ? 0 : 200, useNativeDriver: true })
        .start(({ finished }) => { if (finished) setMounted(false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

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
            maxHeight: height * 0.88,
            backgroundColor: k.surface,
            borderTopLeftRadius: RADIUS.sheet,
            borderTopRightRadius: RADIUS.sheet,
            paddingBottom: insets.bottom + 8,
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, height] }) }],
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: k.border }} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

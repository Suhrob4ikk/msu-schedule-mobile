/**
 * Ход обновления приложения (OTA, src/otaUpdates.ts) — маленькая полоска сверху, НЕ на весь экран и БЕЗ перезапуска.
 *
 * История (12 ноя 2026): раньше по готовности приложение само перезапускалось в новую версию (Updates.reloadAsync) под
 * экраном «Обновляем приложение». На телефоне владельца (Xiaomi, HyperOS) перезапуск зависал намертво — экран висел
 * минутами; не помогла и страховка «через 8 секунд убрать экран»: во время перезапуска замирает само приложение, таймеры
 * не идут. Поэтому перезапуска на ходу больше нет совсем: обновление скачивается в фоне и включается при следующем
 * открытии приложения (так expo-updates и задуман по умолчанию).
 *
 * - скачивается — полоска «Загружаем обновление · 45%» с кольцом (иконка «дышит», чтобы было видно, что идёт);
 * - скачалось — «Обновление скачано · закройте приложение полностью и откройте заново» (владелец: прямо сказать, что
 *   делать); 15 секунд, и снова при каждом возврате в приложение, пока его не перезапустят;
 * - нажатия не перехватывает: приложением можно пользоваться как обычно.
 * Подключено в app/_layout.tsx.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { useTokens } from './schedule/tokens';
import { Txt } from './schedule/ui';
import LoaderIcon from './offline/LoaderIcon';

const READY_SHOW_MS = 15_000;   // «Обновление скачано» — столько видно, потом полоска уходит до следующего возврата

export default function UpdatingOverlay() {
  if (__DEV__ || !Updates.isEnabled) return null;
  return <Strip />;
}

function Strip() {
  const k = useTokens();
  const insets = useSafeAreaInsets();
  const { isDownloading, downloadProgress, isUpdatePending } = Updates.useUpdates();
  const [readyGone, setReadyGone] = useState(false);

  // «скачано» — показать 15 секунд и убрать; вернулся в приложение, а оно всё ещё не перезапущено — показать снова
  useEffect(() => {
    if (!isUpdatePending) return;
    let t = setTimeout(() => setReadyGone(true), READY_SHOW_MS);
    const sub = AppState.addEventListener('change', st => {
      if (st !== 'active') return;
      setReadyGone(false);
      clearTimeout(t);
      t = setTimeout(() => setReadyGone(true), READY_SHOW_MS);
    });
    return () => { clearTimeout(t); sub.remove(); };
  }, [isUpdatePending]);

  const visible = isDownloading || (isUpdatePending && !readyGone);

  // иконка мягко «дышит», пока полоска на экране (владелец: «чтобы хоть что-то двигалось»)
  const breath = useRef(new Animated.Value(0)).current;
  const [reduce, setReduce] = useState(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {}); }, []);
  useEffect(() => {
    if (!visible || reduce) return;
    const a = Animated.loop(Animated.sequence([
      Animated.timing(breath, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(breath, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [visible, reduce, breath]);
  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  if (!visible) return null;
  const ready = isUpdatePending && !isDownloading;
  const pct = !ready && downloadProgress != null ? Math.round(downloadProgress * 100) : null;
  return (
    <View pointerEvents="none" accessibilityLiveRegion="polite"
      style={{ position: 'absolute', top: insets.top + 6, left: 12, right: 12, zIndex: 1000, elevation: 1000, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 10, backgroundColor: k.surface, borderRadius: 999,
        paddingVertical: 6, paddingLeft: 6, paddingRight: 16, borderWidth: 1, borderColor: k.border,
        shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <LoaderIcon k={k} size={22} phase={ready ? 'done' : 'running'} progress={pct != null ? pct / 100 : undefined} />
        </Animated.View>
        <View style={{ flexShrink: 1 }}>
          <Txt t="labelStrong" color={k.text}>{ready ? 'Обновление скачано' : 'Загружаем обновление'}</Txt>
          <Txt t="caption" color={k.textSecondary}>{ready ? 'Закройте приложение полностью и откройте заново' : pct != null ? `Загружено ${pct}%` : 'Можно пользоваться'}</Txt>
        </View>
      </View>
    </View>
  );
}

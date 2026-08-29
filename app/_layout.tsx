import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, AppState, AppStateStatus, TouchableOpacity, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingScreen from './onboarding';
import { ThemeProvider, useTheme } from '../src/theme';
import { SyncProvider, useSyncStatus } from '../src/SyncContext';
import { formatSyncTime } from '../src/syncService';
import { setupNotifications } from '../src/examNotifications';
import { refreshLiveLesson } from '../src/liveLesson';
import UpdateBanner from '../src/UpdateBanner';

/**
 * Точка статуса синхронизации у шапки — вместо баннера, который раньше
 * висел на весь экран, пока идёт синхронизация (а офлайн-режим — штатный,
 * ожидаемый сценарий, и не должен выглядеть как непрерывное предупреждение).
 * Полный текст — по тапу на точку (раскрывается и сама гаснет через время)
 * либо коротким тостом САМ, когда состояние реально поменялось.
 */
function SyncStatusIndicator() {
  const { isSyncing, syncProgress, isOnline, lastSyncTime, offlineBannerText } = useSyncStatus();
  const C = useTheme();
  const insets = useSafeAreaInsets();

  const [bubbleText, setBubbleText] = useState<string | null>(null);
  const bubbleOpacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeBubble = useCallback(() => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    Animated.timing(bubbleOpacity, { toValue: 0, duration: 220, useNativeDriver: true })
      .start(({ finished }) => { if (finished) setBubbleText(null); });
  }, [bubbleOpacity]);

  const openBubble = useCallback((text: string, autoHide: boolean) => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    setBubbleText(text);
    Animated.timing(bubbleOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    if (autoHide) hideTimer.current = setTimeout(closeBubble, 2500);
  }, [bubbleOpacity, closeBubble]);

  // Тост показываем только на СМЕНЕ состояния, а не на всё время синхронизации/офлайна.
  const prevSyncing = useRef(isSyncing);
  useEffect(() => {
    if (isSyncing === prevSyncing.current) return;
    prevSyncing.current = isSyncing;
    openBubble(isSyncing ? (syncProgress || 'Синхронизация...') : '✓ Синхронизировано', true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSyncing]);

  const prevOnline = useRef(isOnline);
  useEffect(() => {
    if (isOnline === prevOnline.current) return;
    prevOnline.current = isOnline;
    openBubble(isOnline ? '✓ Снова онлайн' : offlineBannerText, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // Пока синхронизация идёт, текст шага меняется («Загружаем...» → «Сохраняем...») —
  // если тост уже открыт по этой же синхронизации, обновляем текст на лету.
  useEffect(() => {
    if (isSyncing && bubbleText !== null) setBubbleText(syncProgress || 'Синхронизация...');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncProgress]);

  const color = isSyncing ? '#f59e0b' : !isOnline ? '#ef4444' : '#22c55e';
  const statusLabel = isSyncing
    ? (syncProgress || 'Синхронизация...')
    : !isOnline
      ? offlineBannerText
      : lastSyncTime
        ? `Синхронизировано · ${formatSyncTime(lastSyncTime)}`
        : 'Ещё не синхронизировано';

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 16, right: 14, zIndex: 50, alignItems: 'flex-end' }}
    >
      <TouchableOpacity
        onPress={() => (bubbleText ? closeBubble() : openBubble(statusLabel, false))}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`Статус синхронизации: ${statusLabel}`}
        style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' }}
      />
      {bubbleText != null && (
        <Animated.View
          style={{
            opacity: bubbleOpacity, marginTop: 6, maxWidth: 220,
            backgroundColor: C.card, borderColor: C.border, borderWidth: 1,
            borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7,
          }}
        >
          <Text style={{ color: C.fg, fontSize: 11.5, fontWeight: '600' }}>{bubbleText}</Text>
        </Animated.View>
      )}
    </View>
  );
}

function AppTabs() {
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const C = useTheme();

  useEffect(() => {
    AsyncStorage.getItem('selected_group_id').then(id => {
      setNeedsOnboarding(!id);
      setReady(true);
    });
  }, []);

  // Страховка для строки «идёт пара»: обычно её пересобирает будильник на
  // границе пары, но в глубоком сне Android может задержать его на минуты.
  // При возврате в приложение пересобираем сразу.
  useEffect(() => {
    refreshLiveLesson();
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') refreshLiveLesson();
    });
    return () => sub.remove();
  }, []);

  if (!ready) return null;

  if (needsOnboarding) {
    return <OnboardingScreen onDone={() => setNeedsOnboarding(false)} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <SyncStatusIndicator />
      <Tabs
        screenOptions={{
          animation: 'fade',
          tabBarActiveTintColor: C.primary,
          tabBarInactiveTintColor: C.muted,
          tabBarStyle: {
            backgroundColor: C.tabBar,
            borderTopColor: C.tabBorder,
            height: 60,
            paddingBottom: 8,
          },
          headerStyle: { backgroundColor: C.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          tabBarLabelStyle: { fontSize: 10 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Расписание',
            tabBarLabel: 'Расписание',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="teachers"
          options={{
            title: 'Преподаватели',
            tabBarLabel: 'Педагоги',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="rooms"
          options={{
            title: 'Аудитории',
            tabBarLabel: 'Ауд.',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="school-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen name="changes" options={{ href: null, title: 'Изменения расписания' }} />
        <Tabs.Screen name="compare" options={{ href: null, title: 'Сравнить с группой' }} />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Мой кабинет',
            tabBarLabel: 'Кабинет',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen name="onboarding" options={{ href: null, headerShown: false }} />
      </Tabs>
      {/* Плавающая карточка обновления — поверх вкладок, поэтому после <Tabs> */}
      <UpdateBanner />
    </View>
  );
}

export default function Layout() {
  useEffect(() => {
    setupNotifications();
  }, []);

  return (
    <ThemeProvider>
      <SyncProvider>
        <AppTabs />
      </SyncProvider>
    </ThemeProvider>
  );
}

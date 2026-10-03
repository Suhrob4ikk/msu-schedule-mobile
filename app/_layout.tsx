import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, AppState, AppStateStatus, TouchableOpacity, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import OnboardingScreen from './onboarding';
import { ThemeProvider, useTheme } from '../src/theme';
import { SyncProvider, useSyncStatus } from '../src/SyncContext';
import { formatSyncTime } from '../src/syncService';
import { setupNotifications } from '../src/examNotifications';
import { refreshLiveLesson } from '../src/liveLesson';
import { syncWithServer } from '../src/pushToken';
import { getUnreadNotifCount, subscribeNotifHistory } from '../src/notificationHistory';
import { loadMyChanges, countUnseenChanges } from '../src/changesFeed';
import { emitScheduleUpdated, onScheduleUpdated } from '../src/scheduleEvents';
import { invalidateApiCache } from '../src/api';
import UpdateBanner from '../src/UpdateBanner';

/**
 * Push с сервера («вышла новая неделя», «расписание изменилось» — см.
 * backend/app/services/push.py) — сигнал, что данные на телефоне устарели.
 * Забываем закэшированные ответы и будим экран расписания и колокольчик.
 *
 * Свои локальные напоминания (зачёты/пары) отличаем по data.type — он есть
 * только у них. Сами изменения в локальный журнал больше не пишем: вкладка
 * «Изменения» берёт ленту с сервера (src/changesFeed.ts), там они видны,
 * даже если push смахнули, не открыв.
 */
function onRemotePush(content: Notifications.NotificationContent): void {
  if (content.data?.type) return; // наше локальное напоминание
  invalidateApiCache('/schedule/');
  emitScheduleUpdated();
}

function useRemotePushRefresh(): void {
  useEffect(() => {
    const sub1 = Notifications.addNotificationReceivedListener(n => onRemotePush(n.request.content));
    const sub2 = Notifications.addNotificationResponseReceivedListener(r => {
      onRemotePush(r.notification.request.content);
      router.push('/notifications');
    });
    return () => { sub1.remove(); sub2.remove(); };
  }, []);
}

/** Счётчик непрочитанных уведомлений для колокольчика в шапке. Обновляется
 *  по подписке (новая запись/прочтение) и при возврате приложения на передний
 *  план — колокольчик рисуется один раз для всех вкладок, своего useFocusEffect
 *  на экран у него нет. */
function useUnreadNotifCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let mounted = true;
    // Непрочитанные напоминания о зачётах + новые изменения своей группы
    const refresh = async () => {
      const [exams, changes] = await Promise.all([
        getUnreadNotifCount(),
        loadMyChanges().then(countUnseenChanges).catch(() => 0),
      ]);
      if (mounted) setCount(exams + changes);
    };
    refresh();
    const unsub = subscribeNotifHistory(refresh);
    const unsubPush = onScheduleUpdated(refresh);
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => { if (s === 'active') refresh(); });
    return () => { mounted = false; unsub(); unsubPush(); sub.remove(); };
  }, []);
  return count;
}

/** Колокольчик в шапке — то же, что кнопка «Уведомления» в кабинете, но
 *  виден сразу на любом экране, без двух тапов вглубь. */
function NotificationBell() {
  const count = useUnreadNotifCount();
  const C = useTheme();
  return (
    <TouchableOpacity
      onPress={() => router.push('/notifications')}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Уведомления, непрочитанных: ${count}` : 'Уведомления'}
      style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="notifications-outline" size={22} color={C.primaryFg} />
      {count > 0 && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', top: -3, right: -5, minWidth: 16, height: 16, borderRadius: 8,
            backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
            borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 9.5, fontWeight: '800' }}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

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
    <>
      {/* Колокольчик — отдельный плавающий блок с фиксированной позицией.
          Раньше сидел в одном ряду с точкой синхронизации, и когда всплывала
          подсказка, ряд раздувался по ширине и толкал колокольчик влево —
          он должен стоять на месте, а подсказка — просто лечь поверх него. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 10, right: 46, zIndex: 50 }}>
        <NotificationBell />
      </View>
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: insets.top + 18, right: 10, zIndex: 51, alignItems: 'flex-end' }}
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
    </>
  );
}

function AppTabs() {
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const C = useTheme();

  useRemotePushRefresh();

  useEffect(() => {
    AsyncStorage.getItem('selected_group_id').then(id => {
      setNeedsOnboarding(!id);
      setReady(true);
      // Уже зарегистрированные пользователи не проходят онбординг заново —
      // здесь они напоминают серверу о себе (регистрация + push-токен).
      if (id) syncWithServer();
    });
    // И при каждом возврате в приложение: после деплоя бэкенда база на
    // сервере пустая. Чаще раза в 30 минут не ходит (см. src/pushToken.ts).
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') syncWithServer();
    });
    return () => sub.remove();
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
          headerTintColor: C.primaryFg,
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
        <Tabs.Screen name="notifications" options={{ href: null, title: 'Уведомления' }} />
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

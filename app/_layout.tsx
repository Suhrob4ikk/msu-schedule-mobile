import { useEffect, useState, useRef, useCallback } from 'react';
import { View, AppState, AppStateStatus, TouchableOpacity, Animated, Linking, type ColorValue } from 'react-native';
import { Text } from '../src/OnestText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs, router, usePathname } from 'expo-router';
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
import { useUnreadNotifCount } from '../src/useUnreadNotifCount';
import { emitScheduleUpdated } from '../src/scheduleEvents';
import { invalidateApiCache } from '../src/api';
import UpdateBanner from '../src/UpdateBanner';
import { useAppearance } from '../src/appearance';
import { FONT } from '../src/schedule/tokens';
import {
  useFonts, Onest_400Regular, Onest_500Medium, Onest_600SemiBold, Onest_700Bold, Onest_800ExtraBold,
} from '@expo-google-fonts/onest';

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
  if (content.data?.kind === 'app_update') return; // «Вышла новая версия» — расписание ни при чём
  invalidateApiCache('/schedule/');
  emitScheduleUpdated();
}

const HANDLED_TAP_KEY = 'handled_notification_tap';

function useRemotePushRefresh(): void {
  useEffect(() => {
    const sub1 = Notifications.addNotificationReceivedListener(n => onRemotePush(n.request.content));
    const onTap = async (r: Notifications.NotificationResponse) => {
      // Один и тот же тап может прийти дважды: слушателем и через
      // getLastNotificationResponseAsync при холодном старте. А «последний
      // ответ» Android помнит и после перезапуска — без этой метки ссылка на
      // APK открывалась бы при каждом запуске приложения.
      const id = r.notification.request.identifier;
      if ((await AsyncStorage.getItem(HANDLED_TAP_KEY)) === id) return;
      await AsyncStorage.setItem(HANDLED_TAP_KEY, id);

      const content = r.notification.request.content;
      // «Вышла новая версия» — тап сразу открывает ссылку на скачивание APK
      const url = content.data?.url;
      if (content.data?.kind === 'app_update' && typeof url === 'string') {
        Linking.openURL(url).catch(() => null);
        return;
      }
      if (content.data?.type) return; // наше локальное напоминание
      onRemotePush(content);
      router.push('/notifications');
    };
    Notifications.getLastNotificationResponseAsync().then(r => { if (r) onTap(r); }).catch(() => null);
    const sub2 = Notifications.addNotificationResponseReceivedListener(onTap);
    return () => { sub1.remove(); sub2.remove(); };
  }, []);
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
        // Колокольчик лежит на заливке акцентом — счётчик в обратных цветах
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', top: -3, right: -5, minWidth: 16, height: 16, borderRadius: 8,
            backgroundColor: C.onAccent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
          }}
        >
          <Text style={{ color: C.accent, fontSize: 9.5, fontWeight: '800' }}>{count > 9 ? '9+' : count}</Text>
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

  const color = isSyncing ? C.statusSync : !isOnline ? C.statusOffline : C.statusOnline;
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
          style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, borderWidth: 1.5, borderColor: C.accentLine }}
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

/** Подпись нижней вкладки: Onest 12/16, 500 / 700 у активной, масштаб до ×1,3 (ТЗ, tab-label). */
function tabLabel(text: string) {
  return ({ focused, color }: { focused: boolean; color: ColorValue }) => (
    <Text
      maxFontSizeMultiplier={1.3}
      numberOfLines={1}
      style={{ fontFamily: focused ? FONT[700] : FONT[500], fontSize: 12, lineHeight: 16, color }}
    >
      {text}
    </Text>
  );
}

function AppTabs() {
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const C = useTheme();
  // Экраны «Табло» рисуют свою шапку со статусом связи и колокольчиком —
  // общую шапку и плавающую точку статуса на них прячем.
  const pathname = usePathname();
  const ownHeader = pathname === '/' || pathname === '/index' || pathname === '/appearance' || pathname === '/profile' || pathname === '/rooms' || pathname === '/teachers';

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
      {!ownHeader && <SyncStatusIndicator />}
      <Tabs
        screenOptions={{
          animation: 'fade',
          // Скрытые вкладки не перерисовываются, пока их не откроют. Иначе
          // смена акцента перекрашивала разом все открытые ранее вкладки —
          // ленту Расписания, строки Аудиторий, Педагогов — и при быстрых
          // тапах на «Внешнем виде» телефон подвисал.
          freezeOnBlur: true,
          // Активная вкладка — accent-text: акцент как цвет значка и текста
          tabBarActiveTintColor: C.primaryText,
          tabBarInactiveTintColor: C.muted,
          tabBarStyle: {
            backgroundColor: C.tabBar,
            borderTopColor: C.tabBorder,
            height: 60,
            paddingBottom: 8,
          },
          headerStyle: { backgroundColor: C.primary },
          headerTintColor: C.primaryFg,
          headerTitleStyle: { fontFamily: FONT[700] },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Расписание',
            tabBarLabel: tabLabel('Расписание'),
            headerShown: false,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="teachers"
          options={{
            title: 'Преподаватели',
            tabBarLabel: tabLabel('Педагоги'),
            headerShown: false,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="rooms"
          options={{
            title: 'Аудитории',
            tabBarLabel: tabLabel('Ауд.'),
            headerShown: false,
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
            tabBarLabel: tabLabel('Кабинет'),
            // Своя шапка со статусом связи и колокольчиком («Табло»)
            headerShown: false,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen name="onboarding" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="appearance" options={{ href: null, headerShown: false, title: 'Внешний вид' }} />
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

  // Оформление и шрифт — до первого кадра: иначе мелькнули бы синий акцент
  // и светлая тема, а текст перескочил бы со системного шрифта на Onest.
  const appearance = useAppearance();
  const [fontsLoaded, fontError] = useFonts({
    Onest_400Regular, Onest_500Medium, Onest_600SemiBold, Onest_700Bold, Onest_800ExtraBold,
  });
  if (!appearance || (!fontsLoaded && !fontError)) return null;

  return (
    <ThemeProvider>
      <SyncProvider>
        <AppTabs />
      </SyncProvider>
    </ThemeProvider>
  );
}

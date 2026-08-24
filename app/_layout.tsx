import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingScreen from './onboarding';
import { ThemeProvider, useTheme } from '../src/theme';
import { SyncProvider, useSyncStatus } from '../src/SyncContext';
import { setupNotifications } from '../src/examNotifications';
import { refreshLiveLesson } from '../src/liveLesson';
import UpdateBanner from '../src/UpdateBanner';

function SyncBanner() {
  const { isSyncing, syncProgress } = useSyncStatus();
  const C = useTheme();
  const insets = useSafeAreaInsets();
  if (!isSyncing) return null;
  return (
    // paddingTop с системным отступом — иначе текст залезает под часы и батарею
    <View style={[styles.syncBanner, { backgroundColor: C.primary, paddingTop: insets.top + 6 }]}>
      <Text style={styles.syncText}>
        {syncProgress || 'Синхронизация...'}
      </Text>
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
      <SyncBanner />
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
          headerStyle: { backgroundColor: '#0d9488' },
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

const styles = StyleSheet.create({
  syncBanner: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  syncText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 11,
    fontWeight: '600',
  },
});

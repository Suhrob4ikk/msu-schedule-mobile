import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingScreen from './onboarding';
import { ThemeProvider, useTheme } from '../src/theme';
import { SyncProvider, useSyncStatus } from '../src/SyncContext';
import { setupNotifications } from '../src/examNotifications';

function SyncBanner() {
  const { isSyncing, syncProgress } = useSyncStatus();
  const C = useTheme();
  if (!isSyncing) return null;
  return (
    <View style={[styles.syncBanner, { backgroundColor: C.primary }]}>
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

  if (!ready) return null;

  if (needsOnboarding) {
    return <OnboardingScreen onDone={() => setNeedsOnboarding(false)} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <SyncBanner />
      <Tabs
        screenOptions={{
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

/**
 * Переключатели Кабинета — логика из прежнего app/profile.tsx без изменений
 * (те же ключи AsyncStorage, те же разрешения), только в виде хуков.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import {
  requestNotificationPermission, cancelExamReminders, cancelLessonReminders,
  NOTIF_PREF_KEY, LESSON_NOTIF_PREF_KEY,
} from '../examNotifications';
import {
  isLiveLessonEnabled, setLiveLessonEnabled,
  isIgnoringBatteryOptimizations, requestIgnoreBatteryOptimizations,
} from '../liveLesson';

/** Зачёты и экзамены: включено = есть системное разрешение и не выключено локально. */
export function useExamReminders() {
  const [status, setStatus] = useState<'loading' | 'granted' | 'denied' | 'undetermined'>('loading');
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    (async () => {
      const { status: s } = await Notifications.getPermissionsAsync();
      setStatus(s as 'granted' | 'denied' | 'undetermined');
      setEnabled((await AsyncStorage.getItem(NOTIF_PREF_KEY)) !== '0');
    })();
  }, []);

  const toggle = async () => {
    if (status === 'granted') {
      const next = !enabled;
      setEnabled(next);
      await AsyncStorage.setItem(NOTIF_PREF_KEY, next ? '1' : '0');
      if (!next) await cancelExamReminders();
    } else if (status === 'denied') {
      Linking.openSettings(); // запрещено системой — в настройки телефона
    } else {
      const ok = await requestNotificationPermission();
      if (ok) {
        setStatus('granted'); setEnabled(true);
        await AsyncStorage.setItem(NOTIF_PREF_KEY, '1');
      } else {
        setStatus('denied');
      }
    }
  };

  return {
    ready: status !== 'loading',
    on: status === 'granted' && enabled,
    subtitle: status === 'denied' ? 'Запрещены в настройках телефона — нажмите, чтобы открыть' : 'Накануне в 20:00 и в день в 07:00',
    toggle,
  };
}

/** За 10 минут до пары. По умолчанию выключено. */
export function useLessonReminders() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { AsyncStorage.getItem(LESSON_NOTIF_PREF_KEY).then(v => setOn(v === '1')); }, []);
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (on) {
        setOn(false);
        await AsyncStorage.setItem(LESSON_NOTIF_PREF_KEY, '0');
        await cancelLessonReminders();
      } else {
        if (!(await requestNotificationPermission())) {
          Alert.alert('Нужно разрешение', 'Разрешите уведомления в настройках телефона, иначе напоминания не придут.');
          return;
        }
        setOn(true);
        // Сами напоминания встанут при возврате на вкладку расписания
        await AsyncStorage.setItem(LESSON_NOTIF_PREF_KEY, '1');
      }
    } finally {
      setBusy(false);
    }
  };
  return { on, toggle };
}

/** Строка «идёт пара» в шторке. По умолчанию выключено. */
export function useLiveLessonRow() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { isLiveLessonEnabled().then(setOn); }, []);
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const want = !on;
      const result = await setLiveLessonEnabled(want); // false — в разрешении отказали
      setOn(result);
      if (want && !result) {
        Alert.alert('Нужно разрешение', 'Разрешите уведомления в настройках телефона, иначе строка не появится.');
      }
    } finally {
      setBusy(false);
    }
  };
  return { on, toggle };
}

/**
 * «Разрешить работу в фоне» (только Android). Статус перечитывается при
 * возврате в Кабинет и при возврате в приложение из системных настроек.
 */
export function useBackgroundWork() {
  const [exempt, setExempt] = useState(true);
  const check = useCallback(() => { isIgnoringBatteryOptimizations().then(setExempt); }, []);
  useFocusEffect(check);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') check(); });
    return () => sub.remove();
  }, [check]);
  const open = async () => {
    if (!exempt) await requestIgnoreBatteryOptimizations();
    Alert.alert(
      'Если виджет всё равно отстаёт',
      'На Xiaomi, Redmi и POCO включите ещё: Настройки → Приложения → МГУ Расписание → Автозапуск, а в «Экономии заряда» выберите «Без ограничений».',
    );
  };
  return { available: Platform.OS === 'android', exempt, open };
}

/** Переключатель функции по ключу ('1' / '0'): «Пропуски», «Заметки к парам». */
export function useFeatureFlag(key: string) {
  const [on, setOn] = useState(false);
  const reload = useCallback(() => { AsyncStorage.getItem(key).then(v => setOn(v === '1')); }, [key]);
  useFocusEffect(reload);
  const toggle = () => {
    const next = !on;
    setOn(next);
    AsyncStorage.setItem(key, next ? '1' : '0').catch(() => null);
  };
  return { on, toggle };
}

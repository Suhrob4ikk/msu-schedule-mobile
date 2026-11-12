/**
 * Переключатели Кабинета (напоминаний о зачётах и перед парой нет — всегда включены, 12 ноя 2026)
 * (те же ключи AsyncStorage, те же разрешения), только в виде хуков.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import {
  isLiveLessonEnabled, setLiveLessonEnabled,
  isIgnoringBatteryOptimizations, requestIgnoreBatteryOptimizations,
} from '../liveLesson';

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

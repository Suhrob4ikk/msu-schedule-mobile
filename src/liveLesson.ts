/**
 * Постоянная строка «идёт пара»: предмет, аудитория и живой отсчёт до конца
 * пары в шторке уведомлений, а на Android 16 — ещё и плашкой прямо в
 * статус-баре. Видно, не разблокируя телефон и не открывая приложение.
 *
 * Всю работу делает нативная часть (modules/live-lesson): она читает
 * расписание из AsyncStorage (тот же ключ widget_data, что у виджета) и сама
 * будится на границах пар. Отсюда нужно только сказать «пересчитай» —
 * когда пользователь включил функцию или когда расписание обновилось.
 *
 * Функция **по умолчанию выключена**: постоянное уведомление без спроса
 * навязчиво, включать за человека такое нельзя.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import LiveLessonNative from '../modules/live-lesson';

/** Ключ читает и нативная часть (LiveLesson.kt) — имя менять только вместе. */
export const LIVE_LESSON_PREF_KEY = 'live_lesson_enabled';

export async function isLiveLessonEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(LIVE_LESSON_PREF_KEY)) === '1';
}

/**
 * Включить/выключить. При включении спрашиваем разрешение на уведомления:
 * без него уведомление просто не покажется, и человек решил бы, что сломалось.
 * Возвращает итоговое состояние — оно может не совпасть с запрошенным, если
 * в разрешении отказали.
 */
export async function setLiveLessonEnabled(enabled: boolean): Promise<boolean> {
  if (enabled) {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      if (asked.status !== 'granted') return false;
    }
  }

  await AsyncStorage.setItem(LIVE_LESSON_PREF_KEY, enabled ? '1' : '0');
  // Нативная часть сама решит показать или снять — она читает тот же ключ.
  await refreshLiveLesson();
  return enabled;
}

/**
 * Попросить нативную часть пересобрать уведомление. Вызывать после каждой
 * загрузки расписания (данные в AsyncStorage изменились) и при возврате в
 * приложение. Безопасно вызывать всегда: если функция выключена, нативная
 * часть просто снимет уведомление.
 */
export async function refreshLiveLesson(): Promise<void> {
  if (Platform.OS !== 'android' || !LiveLessonNative) return;
  try {
    await LiveLessonNative.refresh();
  } catch {
    // Уведомление — не то, из-за чего стоит ломать экран расписания
  }
}

/** Разрешено ли приложению работать в фоне без ограничений батареи. */
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (Platform.OS !== 'android' || !LiveLessonNative) return true;
  try {
    return await LiveLessonNative.isIgnoringBatteryOptimizations();
  } catch {
    return true;
  }
}

/** Системный диалог «не ограничивать батарею для этого приложения». */
export async function requestIgnoreBatteryOptimizations(): Promise<void> {
  if (Platform.OS !== 'android' || !LiveLessonNative) return;
  try {
    await LiveLessonNative.requestIgnoreBatteryOptimizations();
  } catch {
    // Нет — так нет, попросим ещё раз в другой раз
  }
}

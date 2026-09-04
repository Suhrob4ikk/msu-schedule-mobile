/**
 * Регистрация Expo push-токена — чтобы сервер мог разбудить приложение
 * мгновенно, когда изменилось расписание СВОЕЙ группы, а не только когда
 * человек сам его откроет.
 *
 * Работает поверх того же разрешения на уведомления, что уже запрашивается
 * для напоминаний о зачётах (requestNotificationPermission в
 * examNotifications.ts) — второго запроса на телефоне не будет.
 *
 * Требует, чтобы на телефоне был настроен FCM (google-services.json в сборке)
 * и чтобы у проекта в Expo были загружены учётные данные Firebase
 * (`eas credentials`) — без этого getExpoPushTokenAsync выбросит исключение.
 * Ловим и тихо выходим: без push приложение работает как раньше, только без
 * мгновенных уведомлений.
 */
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

// Тот же токен незачем слать на сервер повторно на каждом запуске —
// он меняется редко (переустановка, сброс данных приложения).
const LAST_SENT_KEY = 'expo_push_token_sent';

export async function syncPushToken(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const deviceId = await AsyncStorage.getItem('msu_device_id');
    if (!deviceId) return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    if ((await AsyncStorage.getItem(LAST_SENT_KEY)) === token) return;

    await api.setPushToken(deviceId, token);
    await AsyncStorage.setItem(LAST_SENT_KEY, token);
  } catch {
    // FCM не настроен на этом телефоне/сборке — обычное дело до тех пор,
    // пока проект не подключат к Firebase. Не мешаем остальному приложению.
  }
}

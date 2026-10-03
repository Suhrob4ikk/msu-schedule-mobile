/**
 * Напомнить серверу о себе: регистрация (имя + группа) и Expo push-токен —
 * чтобы сервер мог разбудить приложение, когда вышла новая неделя или
 * изменилось расписание своей группы.
 *
 * Почему при каждом запуске и возврате, а не один раз. База на Render
 * стирается при каждом деплое бэкенда. Раньше приложение запоминало «этот
 * токен уже отправлен» и больше его не слало — а сервер после деплоя не
 * знал ни пользователя, ни токена, и push не доходили ни до кого. Сервер
 * ещё и отвечал «не сохранил», а приложение всё равно считало токен
 * отправленным. Теперь шлём заново, не чаще раза в 30 минут: оба запроса
 * идемпотентны, регистрация — тихая (silent, без письма владельцу).
 *
 * Токен работает поверх того же разрешения на уведомления, что и напоминания
 * о зачётах (requestNotificationPermission в examNotifications.ts). Нужен
 * настроенный FCM (google-services.json в сборке + ключ Firebase в Expo,
 * `eas credentials`) — без него getExpoPushTokenAsync выбросит исключение;
 * тогда регистрация всё равно уйдёт, только без токена.
 */
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

const RESYNC_EVERY_MS = 30 * 60_000;
let lastSyncAt = 0;

export async function syncWithServer(force = false): Promise<void> {
  if (!force && Date.now() - lastSyncAt < RESYNC_EVERY_MS) return;

  const [[, deviceId], [, groupId], [, name]] = await AsyncStorage.multiGet(
    ['msu_device_id', 'selected_group_id', 'user_name'],
  );
  if (!deviceId || !groupId) return;

  const reg = await api.registerUser(deviceId, name?.trim() || 'Аноним', Number(groupId), true);
  if (!reg?.ok) return; // нет сети — попробуем при следующем возврате
  lastSyncAt = Date.now();

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (token) await api.setPushToken(deviceId, token);
  } catch {
    // FCM не настроен на этом телефоне/сборке — без push приложение работает
    // как раньше, только без мгновенных уведомлений.
  }
}

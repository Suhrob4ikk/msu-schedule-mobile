/**
 * Локальные уведомления о зачётах и экзаменах.
 * Работают без интернета и без Expo Push Token — через нативный планировщик.
 *
 * Когда запускать: после загрузки расписания (useFocusEffect в index.tsx).
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Локальный переключатель напоминаний (отдельно от системного разрешения).
export const NOTIF_PREF_KEY = 'notif_enabled';

const EXAM_KEYWORDS = ['зачет', 'зачёт', 'экзамен', 'экз'];
const NOTIFICATION_CHANNEL = 'msu-exams';

const DAY_OFFSETS: Record<string, number> = {
  понедельник: 0, вторник: 1, среда: 2, четверг: 3,
  пятница: 4, суббота: 5, воскресенье: 6,
};

const PAIR_TIMES: Record<string, string> = {
  I: '08:00', II: '09:45', III: '11:30', IV: '14:00', V: '15:45',
};

export function isExam(lesson: { lesson_type?: string | null; subject: string }): boolean {
  const lt = (lesson.lesson_type ?? '').toLowerCase();
  const subj = lesson.subject.toLowerCase();
  return EXAM_KEYWORDS.some(kw => lt.includes(kw) || subj.includes(kw));
}

function getExamDate(lesson: { day_of_week: string; lesson_date?: string | null }, weekStart: string): Date {
  if (lesson.lesson_date) return new Date(lesson.lesson_date + 'T00:00:00');
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + (DAY_OFFSETS[lesson.day_of_week] ?? 0));
  return d;
}

/** Настраивает канал Android и обработчик входящих уведомлений (вызвать один раз при старте). */
export async function setupNotifications(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL, {
      name: 'Зачёты и экзамены',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2563EB',
    });
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/** Запрашивает разрешение на уведомления. Возвращает true если разрешено. */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/** Отменяет все наши запланированные напоминания о зачётах. */
export async function cancelExamReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if ((n.content.data?.type as string) === 'exam') {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

/** Отменяет все запланированные напоминания о зачётах и ставит новые по расписанию. */
export async function scheduleExamReminders(
  lessons: Array<{ subject: string; day_of_week: string; pair_number: string; lesson_type?: string | null; lesson_date?: string | null }>,
  weekStart: string,
): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  // Уважаем локальный переключатель: если выключен — снимаем все напоминания
  const pref = await AsyncStorage.getItem(NOTIF_PREF_KEY);
  if (pref === '0') { await cancelExamReminders(); return; }

  // Отменяем только наши напоминания о зачётах
  await cancelExamReminders();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const lesson of lessons) {
    if (!isExam(lesson)) continue;
    const examDate = getExamDate(lesson, weekStart);
    if (examDate < today) continue;

    const time = PAIR_TIMES[lesson.pair_number] ?? '';
    const [h, m] = time.split(':').map(Number);
    const subject = lesson.subject;

    // Накануне вечером в 20:00
    const eveBefore = new Date(examDate);
    eveBefore.setDate(eveBefore.getDate() - 1);
    eveBefore.setHours(20, 0, 0, 0);
    if (eveBefore > new Date()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏰ Завтра зачёт!',
          body: `${subject}${time ? ` в ${time}` : ''}. Готовься, ты сможешь! 💪`,
          data: { type: 'exam' },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: eveBefore,
          channelId: NOTIFICATION_CHANNEL,
        },
      });
    }

    // В день экзамена в 7:00
    const dayOf = new Date(examDate);
    dayOf.setHours(7, 0, 0, 0);
    if (dayOf > new Date()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🍀 Сегодня зачёт!',
          body: `${subject}${time ? ` в ${time}` : ''}. Удачи тебе!`,
          data: { type: 'exam' },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: dayOf,
          channelId: NOTIFICATION_CHANNEL,
        },
      });
    }
  }
}

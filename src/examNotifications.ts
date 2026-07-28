/**
 * Локальные уведомления: зачёты/экзамены и напоминание перед парой.
 * Работают без интернета и без Expo Push Token — через нативный планировщик.
 *
 * Когда запускать: после загрузки расписания (useFocusEffect в index.tsx).
 *
 * Два независимых вида, у каждого свой переключатель и свой канал Android,
 * чтобы человек мог оставить только то, что ему нужно. Отменяем всегда
 * только «свои» уведомления — по полю data.type.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Локальный переключатель напоминаний (отдельно от системного разрешения).
export const NOTIF_PREF_KEY = 'notif_enabled';
// Напоминание перед парой — отдельно и ПО УМОЛЧАНИЮ ВЫКЛЮЧЕНО: это уведомления
// по несколько раз в день, включать их за человека нельзя.
export const LESSON_NOTIF_PREF_KEY = 'notif_lesson_enabled';
export const MINUTES_BEFORE_LESSON = 10;

const EXAM_KEYWORDS = ['зачет', 'зачёт', 'экзамен', 'экз'];
const NOTIFICATION_CHANNEL = 'msu-exams';
const LESSON_CHANNEL = 'msu-lessons';

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
    // Отдельный канал: человек может отключить напоминания перед парами
    // в настройках Android, не трогая уведомления о зачётах.
    await Notifications.setNotificationChannelAsync(LESSON_CHANNEL, {
      name: 'Напоминания перед парой',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 150],
      lightColor: '#0E9B72',
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

/** Отменяет запланированные напоминания перед парами. */
export async function cancelLessonReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if ((n.content.data?.type as string) === 'lesson') {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

type LessonLike = {
  subject: string;
  day_of_week: string;
  pair_number: string;
  lesson_date?: string | null;
  room?: { name: string } | null;
};

/**
 * Ставит напоминание за 10 минут до каждой будущей пары недели.
 * По умолчанию выключено — включается переключателем в кабинете.
 */
export async function scheduleLessonReminders(
  lessons: LessonLike[],
  weekStart: string,
): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const pref = await AsyncStorage.getItem(LESSON_NOTIF_PREF_KEY);
  if (pref !== '1') { await cancelLessonReminders(); return; }

  // Пересобираем весь набор: расписание могло измениться
  await cancelLessonReminders();

  const now = new Date();
  for (const lesson of lessons) {
    const time = PAIR_TIMES[lesson.pair_number];
    if (!time) continue;

    const day = getExamDate(lesson, weekStart);   // дата пары (та же логика)
    const [h, m] = time.split(':').map(Number);
    day.setHours(h, m, 0, 0);

    const fireAt = new Date(day.getTime() - MINUTES_BEFORE_LESSON * 60000);
    if (fireAt <= now) continue;   // пара уже началась или прошла

    const where = lesson.room?.name ? `Ауд. ${lesson.room.name}` : null;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Через ${MINUTES_BEFORE_LESSON} минут — ${lesson.subject}`,
        body: [where, `начало в ${time}`].filter(Boolean).join(' · '),
        data: { type: 'lesson' },
        sound: false,   // вибрация есть, звука нет — это подсказка, а не тревога
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
        channelId: LESSON_CHANNEL,
      },
    });
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

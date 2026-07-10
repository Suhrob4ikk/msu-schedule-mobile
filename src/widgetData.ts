import AsyncStorage from '@react-native-async-storage/async-storage';
import { Group, Lesson, DAYS_ORDER, shortGroupName } from './api';

// Данные для виджета на рабочем столе. Пишем компактный JSON в AsyncStorage
// (ключ widget_data) — нативный виджет (ScheduleWidget.kt) читает его напрямую
// из базы RKStorage, поэтому дополнительных библиотек не нужно.

const DAY_SHORT: Record<string, string> = {
  понедельник: 'Пн', вторник: 'Вт', среда: 'Ср',
  четверг: 'Чт', пятница: 'Пт', суббота: 'Сб', воскресенье: 'Вс',
};

const pad = (n: number) => String(n).padStart(2, '0');

export async function writeWidgetData(group: Group, lessons: Lesson[], weekStart: string): Promise<void> {
  const items = lessons
    .map(l => {
      // Дата пары: из данных или вычисляем от начала недели (в локальном времени)
      let date = l.lesson_date;
      if (!date) {
        const idx = DAYS_ORDER.indexOf(l.day_of_week);
        if (idx < 0) return null;
        const d = new Date(weekStart + 'T00:00:00');
        d.setDate(d.getDate() + idx);
        date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      }
      const startAt = new Date(`${date}T${l.pair_time_start}:00`).getTime();
      const endAt = new Date(`${date}T${l.pair_time_end}:00`).getTime();
      if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) return null;
      return {
        startAt,
        endAt,
        subject: l.subject,
        room: l.room?.name ?? '',
        label: `${DAY_SHORT[l.day_of_week] ?? ''} ${l.pair_time_start}–${l.pair_time_end}`,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.startAt - b.startAt);

  await AsyncStorage.setItem('widget_data', JSON.stringify({
    group: `${shortGroupName(group.name)} · ${group.year} курс`,
    updatedAt: Date.now(),
    lessons: items,
  }));
}

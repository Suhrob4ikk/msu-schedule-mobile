import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Lesson, shortGroupName } from './api';

// Фиксированные hex-цвета, не тема устройства — картинка должна выглядеть
// одинаково независимо от светлой/тёмной темы того, кто её отправил.
const BRAND = {
  bg: '#0b1220', card: '#121a2b', border: '#22304a',
  primary: '#0e9b72', fg: '#e7eaef', muted: '#8b94a3',
};

const DAY_LABELS_FULL: Record<string, string> = {
  понедельник: 'ПОНЕДЕЛЬНИК', вторник: 'ВТОРНИК', среда: 'СРЕДА',
  четверг: 'ЧЕТВЕРГ', пятница: 'ПЯТНИЦА', суббота: 'СУББОТА', воскресенье: 'ВОСКРЕСЕНЬЕ',
};

/**
 * Что писать в строке под предметом.
 *
 * В расписании группы человеку важно, КТО ведёт, — там преподаватель.
 * В расписании преподавателя он и так в заголовке карточки, и важно
 * другое — У КОГО пара. Поэтому там на том же месте группа.
 */
export type ShareSubtitle = 'teacher' | 'group';

interface Props {
  groupLabel: string;
  weekLabel: string;
  lessonsByDay: Record<string, Lesson[]>;
  subtitle?: ShareSubtitle;
}

/**
 * Невидимая (за пределами экрана) карточка расписания — снимается
 * react-native-view-shot в PNG и уходит в системное меню шаринга.
 * collapsable={false} обязателен на Android, иначе View схлопнется
 * при снимке и картинка получится пустой.
 */
const ScheduleShareCard = forwardRef<View, Props>(({ groupLabel, weekLabel, lessonsByDay, subtitle }, ref) => {
  const days = Object.entries(lessonsByDay);
  return (
    <View ref={ref} collapsable={false} style={s.wrap}>
      <View style={s.header}>
        <View style={s.logo}><Text style={s.logoText}>МГУ</Text></View>
        <View>
          <Text style={s.groupText}>{groupLabel}</Text>
          <Text style={s.weekText}>{weekLabel}</Text>
        </View>
      </View>

      {days.map(([day, lessons]) => (
        <View key={day} style={{ marginBottom: 18 }}>
          <Text style={s.dayTitle}>{DAY_LABELS_FULL[day] ?? day}</Text>
          {lessons.map(l => {
            const who = subtitle === 'group'
              ? (l.group ? `${shortGroupName(l.group.name)} · ${l.group.year} курс` : null)
              : l.teacher?.name;
            const meta = [l.lesson_type, l.room?.name ? `ауд. ${l.room.name}` : null, who]
              .filter(Boolean).join(' · ');
            return (
              <View key={l.id} style={s.row}>
                <View style={s.timeCol}>
                  <Text style={s.timeText}>{l.pair_time_start}</Text>
                  <Text style={s.timeText}>{l.pair_time_end}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.subject}>{l.subject}</Text>
                  {meta ? <Text style={s.meta}>{meta}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      ))}

      <Text style={s.footer}>МГУ Душанбе · Расписание занятий</Text>
    </View>
  );
});

export default ScheduleShareCard;

const s = StyleSheet.create({
  wrap: { width: 360, backgroundColor: BRAND.bg, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  logo: { width: 32, height: 32, borderRadius: 8, backgroundColor: BRAND.primary, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  groupText: { color: BRAND.fg, fontWeight: '700', fontSize: 15 },
  weekText: { color: BRAND.muted, fontSize: 11, marginTop: 2 },
  dayTitle: { color: BRAND.primary, fontWeight: '700', fontSize: 11, letterSpacing: 0.5, marginBottom: 6 },
  row: {
    flexDirection: 'row', gap: 10, backgroundColor: BRAND.card,
    borderColor: BRAND.border, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 6,
  },
  timeCol: { width: 40 },
  timeText: { color: BRAND.muted, fontSize: 11, fontWeight: '700' },
  subject: { color: BRAND.fg, fontWeight: '600', fontSize: 13 },
  meta: { color: BRAND.muted, fontSize: 11, marginTop: 2 },
  footer: { color: BRAND.muted, fontSize: 10, textAlign: 'center', marginTop: 4 },
});

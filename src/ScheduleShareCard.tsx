import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Lesson, shortGroupName } from './api';
import { useTheme } from './theme';

// Палитра картинки. Раньше здесь были жёстко зашитые тёмные цвета — «чтобы
// выглядело одинаково у всех». На практике человек в светлой теме нажимал
// «Поделиться» и получал тёмную картинку, что читалось как сбой. Теперь
// картинка совпадает с темой, в которой человек смотрит приложение.
//
// Цвета всё равно проставляются явно, а не наследуются: карточка снимается
// за пределами экрана, отдельно от дерева стилей самого экрана.

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
  const C = useTheme();
  const days = Object.entries(lessonsByDay);
  return (
    <View ref={ref} collapsable={false} style={[s.wrap, { backgroundColor: C.bg }]}>
      <View style={s.header}>
        <View style={[s.logo, { backgroundColor: C.primary }]}><Text style={s.logoText}>МГУ</Text></View>
        <View>
          <Text style={[s.groupText, { color: C.fg }]}>{groupLabel}</Text>
          <Text style={[s.weekText, { color: C.muted }]}>{weekLabel}</Text>
        </View>
      </View>

      {days.map(([day, lessons]) => (
        <View key={day} style={{ marginBottom: 18 }}>
          <Text style={[s.dayTitle, { color: C.primary }]}>{DAY_LABELS_FULL[day] ?? day}</Text>
          {lessons.map(l => {
            const who = subtitle === 'group'
              ? (l.group ? `${shortGroupName(l.group.name)} · ${l.group.year} курс` : null)
              : l.teacher?.name;
            const meta = [l.lesson_type, l.room?.name ? `ауд. ${l.room.name}` : null, who]
              .filter(Boolean).join(' · ');
            return (
              <View key={l.id} style={[s.row, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={s.timeCol}>
                  <Text style={[s.timeText, { color: C.muted }]}>{l.pair_time_start}</Text>
                  <Text style={[s.timeText, { color: C.muted }]}>{l.pair_time_end}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.subject, { color: C.fg }]}>{l.subject}</Text>
                  {meta ? <Text style={[s.meta, { color: C.muted }]}>{meta}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      ))}

      <Text style={[s.footer, { color: C.muted }]}>МГУ Душанбе · Расписание занятий</Text>
    </View>
  );
});

export default ScheduleShareCard;

const s = StyleSheet.create({
  wrap: { width: 360, padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  logo: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  // Логотип лежит на фирменном зелёном — белый в обеих темах.
  logoText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  groupText: { fontWeight: '700', fontSize: 15 },
  weekText: { fontSize: 11, marginTop: 2 },
  dayTitle: { fontWeight: '700', fontSize: 11, letterSpacing: 0.5, marginBottom: 6 },
  row: {
    flexDirection: 'row', gap: 10,
    borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 6,
  },
  timeCol: { width: 40 },
  timeText: { fontSize: 11, fontWeight: '700' },
  subject: { fontWeight: '600', fontSize: 13 },
  meta: { fontSize: 11, marginTop: 2 },
  footer: { fontSize: 10, textAlign: 'center', marginTop: 4 },
});

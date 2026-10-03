import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Change } from './api';
import { useTheme } from './theme';

/**
 * Карточка одного изменения расписания. Общая для «Истории изменений»
 * (app/changes.tsx) и вкладки «Изменения» в «Уведомлениях»
 * (app/notifications.tsx) — чтобы одно и то же выглядело одинаково.
 */

const CHANGE_TYPE_LABELS: Record<string, string> = {
  added: 'Добавлено',
  removed: 'Удалено',
  changed: 'Изменено',
  new_week: 'Новая неделя',
};

const CHANGE_TYPE_COLORS: Record<string, string> = {
  added: '#22c55e',
  removed: '#ef4444',
  changed: '#f59e0b',
  new_week: '#3b82f6',
};

const CHANGE_DAY_OFFSET: Record<string, number> = {
  понедельник: 0, вторник: 1, среда: 2, четверг: 3, пятница: 4, суббота: 5, воскресенье: 6,
};

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

// Точная дата изменения: начало недели + день («08.09»)
function changeDate(c: { week_start?: string | null; day_of_week?: string | null }): string {
  if (!c.week_start || !c.day_of_week) return '';
  const d = new Date(c.week_start + 'T00:00:00');
  d.setDate(d.getDate() + (CHANGE_DAY_OFFSET[c.day_of_week] ?? 0));
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** «5–10 окт» — учебная неделя пн–сб, как в push с сервера. */
function weekRange(weekStart: string): string {
  const a = new Date(weekStart + 'T00:00:00');
  const b = new Date(a);
  b.setDate(b.getDate() + 5);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}`;
}

export default function ChangeCard({ item, yearByGroupId }: {
  item: Change;
  /** Курс по id группы: сервер отдаёт голое название («ГЕОЛОГИЯ»), а групп
   *  с таким названием на разных курсах несколько. */
  yearByGroupId?: Record<number, number>;
}) {
  const C = useTheme();
  const color = CHANGE_TYPE_COLORS[item.change_type] || '#6b7280';
  const label = CHANGE_TYPE_LABELS[item.change_type] || item.change_type;
  const year = item.group_id != null ? yearByGroupId?.[item.group_id] : undefined;

  return (
    <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
      <View style={s.cardTop}>
        <View style={[s.typeBadge, { backgroundColor: color + '20' }]}>
          <Text style={[s.typeText, { color }]}>{label}</Text>
        </View>
        {item.faculty_code && (
          <View style={[s.facBadge, { backgroundColor: C.tag }]}>
            <Text style={[s.facText, { color: C.fg }]}>{item.faculty_code}</Text>
          </View>
        )}
        <Text style={[s.time, { color: C.muted }]}>{formatDate(item.detected_at)}</Text>
      </View>

      {item.group_name && (
        <Text style={[s.groupName, { color: C.fg }]}>
          {item.group_name}{year != null ? ` · ${year} курс` : ''}
        </Text>
      )}
      {item.day_of_week && item.pair_number && (
        <Text style={[s.meta, { color: C.muted }]}>
          {item.day_of_week.charAt(0).toUpperCase() + item.day_of_week.slice(1)}{changeDate(item) ? `, ${changeDate(item)}` : ''} · {item.pair_number} пара
        </Text>
      )}

      {item.change_type === 'removed' && item.old_value && (
        <View style={s.diffRow}>
          <Text style={[s.diffLabel, { color: C.muted }]}>Было:</Text>
          <Text style={[s.diffValue, s.removed]}>{item.old_value}</Text>
        </View>
      )}
      {item.change_type === 'added' && item.new_value && (
        <View style={s.diffRow}>
          <Text style={[s.diffLabel, { color: C.muted }]}>Добавлено:</Text>
          <Text style={[s.diffValue, s.added]}>{item.new_value}</Text>
        </View>
      )}
      {item.change_type === 'changed' && (
        <>
          {item.old_value && (
            <View style={s.diffRow}>
              <Text style={[s.diffLabel, { color: C.muted }]}>Было:</Text>
              <Text style={[s.diffValue, s.removed]}>{item.old_value}</Text>
            </View>
          )}
          {item.new_value && (
            <View style={s.diffRow}>
              <Text style={[s.diffLabel, { color: C.muted }]}>Стало:</Text>
              <Text style={[s.diffValue, s.added]}>{item.new_value}</Text>
            </View>
          )}
        </>
      )}
      {item.change_type === 'new_week' && (
        <Text style={[s.meta, { color: C.fg }]}>
          Вышло расписание{item.week_start ? ` на ${weekRange(item.week_start)}` : ''}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 0.5, elevation: 1, shadowOpacity: 0.04, shadowRadius: 3 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeText: { fontSize: 11, fontWeight: '700' },
  facBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  facText: { fontSize: 11, fontWeight: '600' },
  time: { fontSize: 11, marginLeft: 'auto' },
  groupName: { fontSize: 13, fontWeight: '600', marginBottom: 3 },
  meta: { fontSize: 12, marginBottom: 6 },
  diffRow: { flexDirection: 'row', gap: 6, marginTop: 4, alignItems: 'flex-start', flexWrap: 'wrap' },
  diffLabel: { fontSize: 12, minWidth: 52 },
  diffValue: { fontSize: 12, fontWeight: '500', flex: 1 },
  removed: { color: '#ef4444', textDecorationLine: 'line-through' },
  added: { color: '#16a34a' },
});

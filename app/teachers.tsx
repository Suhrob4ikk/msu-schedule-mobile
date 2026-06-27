import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { api, Teacher, Lesson, DAYS_ORDER, shortGroupName } from '../src/api';
import { useTheme } from '../src/theme';

const DAY_FULL: Record<string, string> = {
  понедельник: 'Понедельник', вторник: 'Вторник', среда: 'Среда',
  четверг: 'Четверг', пятница: 'Пятница', суббота: 'Суббота',
};

export default function TeachersScreen() {
  const C = useTheme();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selected, setSelected] = useState<Teacher | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [view, setView] = useState<'list' | 'schedule'>('list');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getTeachers()
      .then(setTeachers)
      .catch(() => setError('Не удалось загрузить список преподавателей'))
      .finally(() => setLoadingList(false));
  }, []);

  const loadTeacher = async (t: Teacher) => {
    setSelected(t);
    setLoading(true);
    setView('schedule');
    setError(null);
    try {
      setLessons(await api.getTeacherSchedule(t.id));
    } catch {
      setError('Не удалось загрузить расписание');
    } finally {
      setLoading(false);
    }
  };

  const filtered = teachers.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const byDay = DAYS_ORDER.reduce((acc, day) => {
    const dl = lessons.filter(l => l.day_of_week === day);
    if (dl.length) acc[day] = dl;
    return acc;
  }, {} as Record<string, Lesson[]>);

  if (view === 'schedule' && selected) {
    return (
      <View style={[s.container, { backgroundColor: C.bg }]}>
        <TouchableOpacity
          style={[s.backBtn, { backgroundColor: C.card, borderBottomColor: C.border }]}
          onPress={() => setView('list')}
        >
          <Text style={[s.backText, { color: C.primary }]}>← Все преподаватели</Text>
        </TouchableOpacity>
        <Text style={[s.teacherName, { color: C.fg }]}>{selected.name}</Text>
        {loading ? (
          <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 32 }} />
        ) : error ? (
          <Text style={s.errorText}>{error}</Text>
        ) : (
          <FlatList
            data={Object.entries(byDay)}
            keyExtractor={([day]) => day}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            renderItem={({ item: [day, dl] }) => (
              <View>
                <Text style={[s.dayHeader, { color: C.muted }]}>{DAY_FULL[day]}</Text>
                {dl.map(l => (
                  <View key={l.id} style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                      <Text style={[s.pairBadge, { color: C.primary, backgroundColor: C.blueBg }]}>
                        {l.pair_number} пара
                      </Text>
                      <Text style={[s.time, { color: C.muted }]}>{l.pair_time_start}–{l.pair_time_end}</Text>
                    </View>
                    <Text style={[s.subject, { color: C.fg }]}>{l.subject}</Text>
                    {l.group && <Text style={[s.meta, { color: C.muted }]}>{l.group.year} курс · {shortGroupName(l.group.name)}</Text>}
                    {l.room && <Text style={[s.meta, { color: C.muted }]}>Ауд. {l.room.name}</Text>}
                  </View>
                ))}
                {dl.length === 0 && (
                  <Text style={[s.empty, { color: C.muted }]}>Занятий нет</Text>
                )}
              </View>
            )}
            ListEmptyComponent={
              <Text style={[s.empty, { color: C.muted }]}>Занятий не найдено</Text>
            }
          />
        )}
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: C.bg }]}>
      <View style={[s.searchWrap, { backgroundColor: C.card, borderBottomColor: C.border }]}>
        <TextInput
          style={[s.search, { backgroundColor: C.tag, color: C.fg }]}
          placeholder="Поиск по фамилии..."
          placeholderTextColor={C.muted}
          value={search}
          onChangeText={setSearch}
        />
        <View style={[s.hint, { backgroundColor: C.tag }]}>
          <Text style={[s.hintText, { color: C.muted }]}>ℹ️  Найдите преподавателя по фамилии и нажмите на имя — появится его расписание на текущую неделю.</Text>
        </View>
      </View>
      {loadingList && <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 32 }} />}
      {error && !loadingList && <Text style={s.errorText}>{error}</Text>}
      {!loadingList && (
        <FlatList
          data={filtered}
          keyExtractor={t => String(t.id)}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.teacherItem, { backgroundColor: C.card, borderBottomColor: C.border }]}
              onPress={() => loadTeacher(item)}
            >
              <Text style={[s.teacherItemName, { color: C.fg }]}>{item.name}</Text>
              <Text style={[s.arrow, { color: C.muted }]}>›</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={[s.empty, { color: C.muted }]}>Ничего не найдено</Text>}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { padding: 12, borderBottomWidth: 1 },
  search: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginBottom: 8 },
  hint: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  hintText: { fontSize: 12, lineHeight: 17 },
  teacherItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1,
  },
  teacherItemName: { fontSize: 14 },
  arrow: { fontSize: 20 },
  backBtn: { padding: 14, borderBottomWidth: 1 },
  backText: { fontSize: 14 },
  teacherName: { fontSize: 17, fontWeight: '700', padding: 16 },
  dayHeader: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 4 },
  card: { borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 0.5, elevation: 1, shadowOpacity: 0.04, shadowRadius: 3 },
  pairBadge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  time: { fontSize: 11, alignSelf: 'center' },
  subject: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  meta: { fontSize: 12, marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 15 },
  errorText: { color: '#dc2626', textAlign: 'center', marginTop: 32, fontSize: 14, paddingHorizontal: 24 },
});

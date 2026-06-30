import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, ScrollView, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  api, Teacher, Lesson, DAYS_ORDER, shortGroupName,
  WeekOption, weekLabel, isCurrentWeek,
} from '../src/api';
import { useTheme } from '../src/theme';
import { useSyncStatus } from '../src/SyncContext';

const DAY_FULL: Record<string, string> = {
  понедельник: 'Понедельник', вторник: 'Вторник', среда: 'Среда',
  четверг: 'Четверг', пятница: 'Пятница', суббота: 'Суббота',
};

const DAY_OFFSET: Record<string, number> = {
  понедельник: 0, вторник: 1, среда: 2, четверг: 3, пятница: 4, суббота: 5,
};

// Цвета и подписи типов занятий — как на главном экране и в вебе
const TYPE_COLORS: Record<string, string> = {
  ЗАЧЕТ: '#f43f5e', ЭКЗАМЕН: '#f43f5e', ПРАКТИКА: '#6366f1', ПЗ: '#6366f1', ЛЕКЦИЯ: '#0d9488',
};
const TYPE_LABELS: Record<string, string> = {
  ЗАЧЕТ: 'Зачёт', ЭКЗАМЕН: 'Экзамен', ПРАКТИКА: 'Практика', ПЗ: 'Практика', ЛЕКЦИЯ: 'Лекция',
};

function getDayDate(dayName: string, weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + (DAY_OFFSET[dayName] ?? 0));
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

export default function TeachersScreen() {
  const C = useTheme();
  const { offlineBannerText, onlineAt } = useSyncStatus();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selected, setSelected] = useState<Teacher | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [refreshingList, setRefreshingList] = useState(false);
  const [refreshingSched, setRefreshingSched] = useState(false);
  const [view, setView] = useState<'list' | 'schedule'>('list');
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<WeekOption | null>(null);

  const selectedRef = useRef<Teacher | null>(null);
  const selectedWeekRef = useRef<WeekOption | null>(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => { selectedWeekRef.current = selectedWeek; }, [selectedWeek]);

  // Список преподавателей запрашиваем по неделе — как в веб-версии, чтобы списки
  // совпадали (сервер возвращает только тех, у кого есть пары в эту неделю).
  const loadTeachersList = async (weekStart?: string, silent = false) => {
    if (!silent) setLoadingList(true);
    try {
      const ws = await api.getWeeksAll();
      setWeeks(ws);
      AsyncStorage.setItem('cache_weeks_all', JSON.stringify(ws));
      const cur = ws.find(w => isCurrentWeek(w.week_start)) ?? ws.find(w => w.is_latest) ?? ws[0];
      const week = (weekStart && ws.find(w => w.week_start === weekStart)) || cur;
      if (week) setSelectedWeek(week);
      const ts = await api.getTeachers(week?.week_start);
      setTeachers(ts);
      if (week) AsyncStorage.setItem(`cache_teachers_${week.week_start}`, JSON.stringify(ts));
      setError(null);
      setIsOffline(false);
    } catch {
      if (silent) return; // keep whatever is shown
      // Fallback to cache
      const cachedWks = await AsyncStorage.getItem('cache_weeks_all');
      let week: WeekOption | null = selectedWeek;
      if (cachedWks) {
        const ws: WeekOption[] = JSON.parse(cachedWks);
        setWeeks(ws);
        const cur = ws.find(w => isCurrentWeek(w.week_start)) ?? ws.find(w => w.is_latest) ?? ws[0];
        week = (weekStart && ws.find(w => w.week_start === weekStart)) || cur;
        if (week) setSelectedWeek(week);
      }
      const cachedTs = week ? await AsyncStorage.getItem(`cache_teachers_${week.week_start}`) : null;
      if (cachedTs) {
        setTeachers(JSON.parse(cachedTs));
        setIsOffline(true);
      } else {
        setError('Не удалось загрузить список преподавателей');
      }
    } finally {
      setLoadingList(false);
      setRefreshingList(false);
    }
  };

  useEffect(() => { loadTeachersList(); }, []);

  // When internet comes back — silently refresh
  useEffect(() => {
    if (onlineAt === 0) return;
    const t = selectedRef.current;
    const w = selectedWeekRef.current;
    loadTeachersList(w?.week_start, true);
    if (t && w) loadTeacher(t, w, true);
  }, [onlineAt]);

  const loadTeacher = async (t: Teacher, week: WeekOption | null = selectedWeek, silent = false) => {
    if (!silent) { setSelected(t); setView('schedule'); setLoading(true); }
    setError(null);
    const cacheKey = `cache_teacher_${t.id}_${week?.week_start ?? 'default'}`;
    try {
      const data = await api.getTeacherSchedule(t.id, week?.week_start);
      setLessons(data);
      setIsOffline(false);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
    } catch {
      if (silent) return;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        setLessons(JSON.parse(cached));
        setIsOffline(true);
      } else {
        setError('Не удалось загрузить расписание');
      }
    } finally {
      setLoading(false);
    }
  };

  const switchWeek = (w: WeekOption) => {
    setSelectedWeek(w);
    loadTeachersList(w.week_start, false); // список преподавателей зависит от недели
    if (selected && view === 'schedule') {
      loadTeacher(selected, w);
    }
  };

  const onRefreshList = () => {
    setRefreshingList(true);
    loadTeachersList();
  };

  const onRefreshSchedule = async () => {
    if (!selected) return;
    setRefreshingSched(true);
    await loadTeacher(selected, selectedWeek);
    setRefreshingSched(false);
  };

  const filtered = teachers.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  const byDay = DAYS_ORDER.reduce((acc, day) => {
    const dl = lessons.filter(l => l.day_of_week === day);
    if (dl.length) acc[day] = dl;
    return acc;
  }, {} as Record<string, Lesson[]>);

  const weekSelector = weeks.length > 1 ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[s.weekBar, { borderBottomColor: C.border }]}
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}
    >
      {weeks.map(w => {
        const active = selectedWeek?.week_start === w.week_start;
        const cur = isCurrentWeek(w.week_start);
        return (
          <TouchableOpacity
            key={w.week_start}
            onPress={() => switchWeek(w)}
            style={[s.weekBtn, { backgroundColor: active ? C.primary : C.card, borderColor: active ? C.primary : C.border }]}
          >
            <Text style={[s.weekBtnText, { color: active ? '#fff' : C.fg }]}>{weekLabel(w.week_start)}</Text>
            {cur && <View style={[s.weekDot, { backgroundColor: active ? 'rgba(255,255,255,0.7)' : C.primary }]} />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  ) : null;

  if (view === 'schedule' && selected) {
    return (
      <View style={[s.container, { backgroundColor: C.bg }]}>
        <TouchableOpacity
          style={[s.backBtn, { backgroundColor: C.card, borderBottomColor: C.border }]}
          onPress={() => setView('list')}
        >
          <Text style={[s.backText, { color: C.primary }]}>← Все преподаватели</Text>
        </TouchableOpacity>
        {isOffline && (
          <View style={s.offlineBanner}>
            <Text style={s.offlineText}>{offlineBannerText}</Text>
          </View>
        )}
        <Text style={[s.teacherName, { color: C.fg }]}>{selected.name}</Text>
        {weekSelector}
        {loading ? (
          <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 32 }} />
        ) : error ? (
          <Text style={s.errorText}>{error}</Text>
        ) : (
          <FlatList
            data={Object.entries(byDay)}
            keyExtractor={([day]) => day}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            refreshControl={
              <RefreshControl refreshing={refreshingSched} onRefresh={onRefreshSchedule} tintColor={C.primary} colors={[C.primary]} />
            }
            renderItem={({ item: [day, dl] }) => (
              <View>
                <Text style={[s.dayHeader, { color: C.muted }]}>
                  {DAY_FULL[day]}{selectedWeek ? `, ${getDayDate(day, selectedWeek.week_start)}` : ''}
                </Text>
                {dl.map(l => (
                  <View key={l.id} style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <Text style={[s.pairBadge, { color: C.primary, backgroundColor: C.blueBg }]}>
                        {l.pair_number} пара
                      </Text>
                      <Text style={[s.time, { color: C.muted }]}>{l.pair_time_start}–{l.pair_time_end}</Text>
                      {l.lesson_type && (
                        <View style={[s.typeBadge, { backgroundColor: (TYPE_COLORS[l.lesson_type] || '#3b82f6') + '20' }]}>
                          <Text style={[s.typeText, { color: TYPE_COLORS[l.lesson_type] || '#3b82f6' }]}>
                            {TYPE_LABELS[l.lesson_type] || l.lesson_type}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={[s.subject, { color: C.fg }]}>{l.subject}</Text>
                    {l.group && <Text style={[s.meta, { color: C.muted }]}>{l.group.year} курс · {shortGroupName(l.group.name)}</Text>}
                    {l.room && <Text style={[s.meta, { color: C.muted }]}>Ауд. {l.room.name}</Text>}
                  </View>
                ))}
              </View>
            )}
            ListEmptyComponent={
              <Text style={[s.empty, { color: C.muted }]}>Занятий не найдено на этой неделе</Text>
            }
          />
        )}
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: C.bg }]}>
      {isOffline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineText}>{offlineBannerText}</Text>
        </View>
      )}
      <View style={[s.searchWrap, { backgroundColor: C.card, borderBottomColor: C.border }]}>
        <TextInput
          style={[s.search, { backgroundColor: C.tag, color: C.fg }]}
          placeholder="Поиск по фамилии..."
          placeholderTextColor={C.muted}
          value={search}
          onChangeText={setSearch}
        />
        <View style={[s.hint, { backgroundColor: C.tag }]}>
          <Text style={[s.hintText, { color: C.muted }]}>Найдите преподавателя по фамилии и нажмите на имя — появится его расписание.</Text>
        </View>
      </View>
      {weekSelector}
      {loadingList && <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 32 }} />}
      {error && !loadingList && <Text style={s.errorText}>{error}</Text>}
      {!loadingList && (
        <FlatList
          data={filtered}
          keyExtractor={t => t.name}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshingList} onRefresh={onRefreshList} tintColor={C.primary} colors={[C.primary]} />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.teacherItem, { backgroundColor: C.card, borderBottomColor: C.border }]}
              onPress={() => loadTeacher(item)}
            >
              <Text style={[s.teacherItemName, { color: C.fg }]}>{item.name}</Text>
              <Text style={[s.arrow, { color: C.muted }]}>›</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={[s.empty, { color: C.muted }]}>Нет преподавателей с занятиями на этой неделе</Text>}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  offlineBanner: { backgroundColor: '#f59e0b', padding: 10 },
  offlineText: { fontSize: 12, color: '#fff', fontWeight: '600', textAlign: 'center' },
  searchWrap: { padding: 12, borderBottomWidth: 1 },
  search: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginBottom: 8 },
  hint: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  hintText: { fontSize: 12, lineHeight: 17 },

  weekBar: { flexGrow: 0, flexShrink: 0, height: 62, borderBottomWidth: 1 },
  weekBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 20, marginRight: 8, borderWidth: 1,
  },
  weekBtnText: { fontSize: 13, fontWeight: '600' },
  weekDot: { width: 6, height: 6, borderRadius: 3 },

  teacherItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1,
  },
  teacherItemName: { fontSize: 14 },
  arrow: { fontSize: 20 },
  backBtn: { padding: 14, borderBottomWidth: 1 },
  backText: { fontSize: 14 },
  teacherName: { fontSize: 17, fontWeight: '700', padding: 16, paddingBottom: 0 },
  dayHeader: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 4 },
  card: { borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 0.5, elevation: 1, shadowOpacity: 0.04, shadowRadius: 3 },
  pairBadge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  time: { fontSize: 11, alignSelf: 'center' },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  typeText: { fontSize: 10, fontWeight: '600' },
  subject: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  meta: { fontSize: 12, marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 15 },
  errorText: { color: '#dc2626', textAlign: 'center', marginTop: 32, fontSize: 14, paddingHorizontal: 24 },
});

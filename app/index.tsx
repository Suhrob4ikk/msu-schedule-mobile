import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, StatusBar, RefreshControl, PanResponder, Animated,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import * as Haptics from 'expo-haptics';
import {
  api, Group, Lesson, TodayItem, WeekInfo,
  DAYS_ORDER, DAY_LABELS, shortGroupName,
} from '../src/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../src/theme';

const TYPE_COLORS: Record<string, string> = {
  ЗАЧЕТ: '#f59e0b', ЭКЗАМЕН: '#ef4444', ПРАКТИКА: '#8b5cf6', ЛЕКЦИЯ: '#3b82f6',
};
const TYPE_LABELS: Record<string, string> = {
  ЗАЧЕТ: 'Зачёт', ЭКЗАМЕН: 'Экзамен', ПРАКТИКА: 'Практика', ЛЕКЦИЯ: 'Лекция',
};

function weekRangeStr(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

function weekLabel(w: WeekInfo): string {
  const start = new Date(w.week_start + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (today >= start && today <= end) return 'Эта неделя';
  const dateStr = `${start.getDate()} ${['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'][start.getMonth()]}`;
  if (start > today && start.getTime() - today.getTime() <= 8 * 86400000)
    return `Следующая · ${dateStr}`;
  return dateStr;
}

function isCurrentWeek(weekStart: string): boolean {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today >= start && today <= end;
}

function getDayDate(dayName: string, weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00');
  const idx = DAYS_ORDER.indexOf(dayName);
  if (idx === -1) return '';
  const d = new Date(start);
  d.setDate(start.getDate() + idx);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View style={[skeletonStyles.card, { opacity }]}>
      <View style={skeletonStyles.line1} />
      <View style={skeletonStyles.line2} />
      <View style={skeletonStyles.line3} />
    </Animated.View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: { backgroundColor: '#e2e8f0', borderRadius: 12, padding: 14, marginBottom: 10 },
  line1: { height: 12, backgroundColor: '#cbd5e1', borderRadius: 4, width: '60%', marginBottom: 8 },
  line2: { height: 16, backgroundColor: '#cbd5e1', borderRadius: 4, width: '85%', marginBottom: 8 },
  line3: { height: 12, backgroundColor: '#cbd5e1', borderRadius: 4, width: '45%' },
});

function LessonCard({ lesson, C }: { lesson: Lesson; C: ReturnType<typeof useTheme> }) {
  const color = lesson.lesson_type ? (TYPE_COLORS[lesson.lesson_type] || '#3b82f6') : '#6b7280';
  const label = lesson.lesson_type ? (TYPE_LABELS[lesson.lesson_type] || lesson.lesson_type) : null;
  return (
    <View style={[cardStyles.card, { backgroundColor: C.card, borderWidth: 0.5, borderColor: C.border }]}>
      <View style={cardStyles.header}>
        <View style={[cardStyles.pairBadge, { backgroundColor: C.blueBg }]}>
          <Text style={[cardStyles.pairText, { color: C.primary }]}>
            {lesson.pair_number} пара · {lesson.pair_time_start}–{lesson.pair_time_end}
          </Text>
        </View>
        {label && (
          <View style={[cardStyles.typeBadge, { backgroundColor: color + '20' }]}>
            <Text style={[cardStyles.typeText, { color }]}>{label}</Text>
          </View>
        )}
      </View>
      <Text style={[cardStyles.subject, { color: C.fg }]}>{lesson.subject}</Text>
      <View style={cardStyles.meta}>
        {lesson.teacher && (
          <Text style={[cardStyles.metaText, { color: C.muted }]}>Преп.: {lesson.teacher.name}</Text>
        )}
        {lesson.room && (
          <Text style={[cardStyles.metaText, { color: C.muted }]}>Ауд. {lesson.room.name}</Text>
        )}
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: { borderRadius: 12, padding: 14, marginBottom: 10, elevation: 1, shadowOpacity: 0.04, shadowRadius: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  pairBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pairText: { fontSize: 11, fontWeight: '700' },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  typeText: { fontSize: 10, fontWeight: '600' },
  subject: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaText: { fontSize: 12 },
});

export default function ScheduleScreen() {
  const C = useTheme();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [weeks, setWeeks] = useState<WeekInfo[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<WeekInfo | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [nowItems, setNowItems] = useState<TodayItem[]>([]);
  const [selectedDay, setSelectedDay] = useState('all');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [countdown, setCountdown] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const nextItem = nowItems.find(i => i.is_next);
  const currentItem = nowItems.find(i => i.is_current);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!nextItem) { setCountdown(''); return; }
    const tick = () => {
      const now = new Date();
      const [h, m] = nextItem.pair_time_start.split(':').map(Number);
      const target = new Date(now);
      target.setHours(h, m, 0, 0);
      const diff = target.getTime() - now.getTime();
      if (diff <= 0) { setCountdown(''); return; }
      const totalMin = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      const hrs = Math.floor(totalMin / 60);
      const mins = totalMin % 60;
      setCountdown(hrs > 0 ? `${hrs}ч ${mins}м` : `${mins}:${String(secs).padStart(2, '0')}`);
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [nextItem]);

  const loadSchedule = useCallback(async (group: Group, weekId?: number, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    setIsOffline(false);

    try {
      let wks = weeks;
      if (wks.length === 0 || selectedGroup?.id !== group.id) {
        wks = await api.getGroupWeeks(group.id);
        setWeeks(wks);
      }

      let targetWeek: WeekInfo | undefined;
      if (weekId) {
        targetWeek = wks.find(w => w.id === weekId);
      } else {
        const today = new Date().toISOString().slice(0, 10);
        targetWeek = wks.find(w => {
          const end = new Date(w.week_start + 'T00:00:00');
          end.setDate(end.getDate() + 6);
          return today >= w.week_start && today <= end.toISOString().slice(0, 10);
        }) ?? wks.find(w => w.is_latest) ?? wks[0];
      }
      setSelectedWeek(targetWeek ?? null);

      const [sched, now] = await Promise.all([
        api.getGroupSchedule(group.id, targetWeek?.id),
        api.getNow(group.id),
      ]);
      setLessons(sched);
      setNowItems(now);

      // Кэшируем расписание
      if (targetWeek) {
        await AsyncStorage.setItem(
          `cache_schedule_${group.id}_${targetWeek.id}`,
          JSON.stringify(sched)
        );
      }
    } catch {
      // Пробуем загрузить из кэша
      const targetWeek = weeks.find(w => w.id === weekId) ?? weeks.find(w => w.is_latest);
      if (targetWeek) {
        const cached = await AsyncStorage.getItem(`cache_schedule_${group.id}_${targetWeek.id}`);
        if (cached) {
          setLessons(JSON.parse(cached));
          setSelectedWeek(targetWeek);
          setIsOffline(true);
        } else {
          setError('Нет соединения с сервером');
        }
      } else {
        setError('Нет соединения с сервером');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [weeks, selectedGroup]);

  const loadGroup = useCallback(async (group: Group, haptic = true) => {
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedGroup(group);
    setWeeks([]);
    setSelectedWeek(null);
    setSelectedDay('all');
    await AsyncStorage.setItem('selected_group_id', String(group.id));
    await loadSchedule(group);
  }, [loadSchedule]);

  const switchWeek = useCallback((week: WeekInfo) => {
    if (!selectedGroup || selectedWeek?.id === week.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedWeek(week);
    loadSchedule(selectedGroup, week.id);
  }, [selectedGroup, selectedWeek, loadSchedule]);

  const switchWeekByOffset = useCallback((offset: number) => {
    if (!selectedGroup || weeks.length === 0) return;
    const currentIdx = weeks.findIndex(w => w.id === selectedWeek?.id);
    const nextIdx = currentIdx + offset;
    if (nextIdx >= 0 && nextIdx < weeks.length) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      switchWeek(weeks[nextIdx]);
    }
  }, [selectedGroup, weeks, selectedWeek, switchWeek]);

  // Ref для PanResponder (фиксим stale closure)
  const switchWeekByOffsetRef = useRef(switchWeekByOffset);
  useEffect(() => { switchWeekByOffsetRef.current = switchWeekByOffset; }, [switchWeekByOffset]);

  const onRefresh = useCallback(() => {
    if (!selectedGroup) return;
    setRefreshing(true);
    loadSchedule(selectedGroup, selectedWeek?.id, true);
  }, [selectedGroup, selectedWeek, loadSchedule]);

  // Загружаем группы
  useEffect(() => {
    api.getGroups()
      .then(gs => { setGroups(gs); setGroupsLoaded(true); })
      .catch(() => setError('Нет соединения с сервером'));
  }, []);

  // При фокусе — загружаем сохранённую группу
  useFocusEffect(
    useCallback(() => {
      if (!groupsLoaded || groups.length === 0) return;
      AsyncStorage.getItem('selected_group_id').then(id => {
        if (!id) return;
        if (selectedGroup?.id === Number(id) && lessons.length > 0) return;
        const g = groups.find(x => x.id === Number(id));
        if (g) loadGroup(g, false);
      });
    }, [groupsLoaded, groups, selectedGroup, lessons.length, loadGroup])
  );

  // Свайп для переключения недели (через ref, чтобы не было stale closure)
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 25 && Math.abs(gs.dy) < Math.abs(gs.dx),
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -40) switchWeekByOffsetRef.current(1);
        else if (gs.dx > 40) switchWeekByOffsetRef.current(-1);
      },
    })
  ).current;

  const filtered = selectedDay === 'all'
    ? lessons
    : lessons.filter(l => l.day_of_week === selectedDay);

  const byDay = DAYS_ORDER.reduce((acc, day) => {
    const dl = filtered.filter(l => l.day_of_week === day);
    if (dl.length) acc[day] = dl;
    return acc;
  }, {} as Record<string, Lesson[]>);

  return (
    <ScrollView
      style={[s.container, { backgroundColor: C.bg }]}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={C.primary}
          colors={[C.primary]}
        />
      }
    >
      <StatusBar barStyle="light-content" backgroundColor="#2563eb" />

      {/* Баннер офлайн-режима */}
      {isOffline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineText}>
            Нет подключения — показываем сохранённое расписание
          </Text>
        </View>
      )}

      {/* Подсказка */}
      <View style={[s.hint, { backgroundColor: C.tag, borderColor: C.border }]}>
        <Text style={s.hintIcon}>ℹ️</Text>
        <Text style={[s.hintText, { color: C.muted }]}>Выберите группу → нажмите на день недели → смотрите пары. Листайте недели свайпом влево/вправо.</Text>
      </View>

      {/* Выбор группы */}
      <View style={s.section}>
        <Text style={[s.sectionTitle, { color: C.muted }]}>Группа</Text>
        <View style={[s.pickerWrap, { backgroundColor: C.card, borderColor: C.border }]}>
          <Picker
            selectedValue={selectedGroup?.id ?? ''}
            onValueChange={(val) => {
              const g = groups.find(x => x.id === val);
              if (g) loadGroup(g);
            }}
            style={[s.picker, { color: C.fg }]}
            dropdownIconColor={C.muted}
          >
            <Picker.Item label="— Выберите группу —" value="" color={C.muted} />
            {(['ЕНФ', 'ГФ'] as const).map(fac =>
              groups.filter(g => g.faculty_code === fac).map(g => (
                <Picker.Item
                  key={g.id}
                  label={`${g.year} курс — ${shortGroupName(g.name)}`}
                  value={g.id}
                  color={C.fg}
                />
              ))
            )}
          </Picker>
        </View>
      </View>

      {error && <Text style={s.error}>{error}</Text>}

      {/* Переключатель недель */}
      {selectedGroup && weeks.length > 1 && (
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: C.muted }]}>
            Неделя · свайп влево/вправо для переключения
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {weeks.map(w => {
              const active = selectedWeek?.id === w.id;
              const current = isCurrentWeek(w.week_start);
              return (
                <TouchableOpacity
                  key={w.id}
                  onPress={() => switchWeek(w)}
                  style={[
                    s.weekBtn,
                    { backgroundColor: active ? C.primary : C.card, borderColor: active ? C.primary : C.border },
                  ]}
                >
                  <Text style={[s.weekBtnText, { color: active ? '#fff' : C.fg }]}>
                    {weekLabel(w)}
                  </Text>
                  {current && (
                    <View style={[s.weekDot, { backgroundColor: active ? 'rgba(255,255,255,0.7)' : C.primary }]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Диапазон выбранной недели */}
      {selectedWeek && (
        <View style={[s.weekHeader, { backgroundColor: C.primary }]}>
          <Text style={s.weekLabel}>
            {isCurrentWeek(selectedWeek.week_start) ? 'Текущая неделя' : 'Неделя'}
          </Text>
          <Text style={s.weekRange}>{weekRangeStr(selectedWeek.week_start)}</Text>
        </View>
      )}

      {/* Что идёт сейчас */}
      {(currentItem || nextItem) && (
        <View style={s.nowRow}>
          {currentItem && (
            <View style={[s.nowCard, { backgroundColor: C.greenBg, borderLeftColor: C.green }]}>
              <View style={s.nowCardTop}>
                <View style={[s.nowDot, { backgroundColor: C.green }]} />
                <Text style={[s.nowTitle, { color: C.fg }]}>ИДЁТ СЕЙЧАС</Text>
                <View style={[s.nowPairBadge, { backgroundColor: C.card }]}>
                  <Text style={[s.nowPairText, { color: C.primary }]}>{currentItem.pair_number} пара</Text>
                </View>
              </View>
              <Text style={[s.nowSubject, { color: C.fg }]}>{currentItem.subject}</Text>
              <Text style={[s.nowMeta, { color: C.muted }]}>
                {currentItem.pair_time_start}–{currentItem.pair_time_end}
                {currentItem.teacher ? ` · ${currentItem.teacher}` : ''}
                {currentItem.room ? ` · ауд. ${currentItem.room}` : ''}
              </Text>
            </View>
          )}
          {nextItem && (
            <View style={[s.nowCard, { backgroundColor: C.blueBg, borderLeftColor: C.primary }]}>
              <View style={s.nowCardTop}>
                <Text style={[s.nowTitle, { color: C.fg }]}>СЛЕДУЮЩАЯ</Text>
                <View style={[s.nowPairBadge, { backgroundColor: C.card }]}>
                  <Text style={[s.nowPairText, { color: C.primary }]}>{nextItem.pair_number} пара</Text>
                </View>
                {countdown ? <Text style={[s.countdown, { color: C.primary }]}>{countdown}</Text> : null}
              </View>
              <Text style={[s.nowSubject, { color: C.fg }]}>{nextItem.subject}</Text>
              <Text style={[s.nowMeta, { color: C.muted }]}>
                {nextItem.pair_time_start}–{nextItem.pair_time_end}
                {nextItem.teacher ? ` · ${nextItem.teacher}` : ''}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Фильтр по дню */}
      {selectedGroup && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dayBar}>
          {['all', ...DAYS_ORDER].map(day => {
            const active = selectedDay === day;
            return (
              <TouchableOpacity
                key={day}
                onPress={() => setSelectedDay(day)}
                style={[
                  s.dayBtn,
                  { backgroundColor: active ? C.primary : C.card, borderColor: active ? C.primary : C.border },
                ]}
              >
                <Text style={[s.dayBtnText, { color: active ? '#fff' : C.fg }]}>
                  {day === 'all' ? 'Вся неделя' : DAY_LABELS[day]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Скелетон загрузки */}
      {loading && (
        <View>
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </View>
      )}

      {/* Расписание — со свайпом для переключения недель */}
      {!loading && (
        <View {...panResponder.panHandlers}>
          {Object.entries(byDay).map(([day, dayLessons]) => (
            <View key={day}>
              <Text style={[s.dayHeader, { color: C.primary }]}>
                {day.charAt(0).toUpperCase() + day.slice(1)}
                {selectedWeek ? `, ${getDayDate(day, selectedWeek.week_start)}` : ''}
              </Text>
              {dayLessons.map(l => <LessonCard key={l.id} lesson={l} C={C} />)}
            </View>
          ))}

          {selectedGroup && Object.keys(byDay).length === 0 && (
            <View style={s.emptyState}>
              <Text style={[s.emptyIcon, { color: C.muted }]}>📅</Text>
              <Text style={[s.emptyTitle, { color: C.fg }]}>Занятий не найдено</Text>
              <Text style={[s.emptyText, { color: C.muted }]}>
                {selectedDay !== 'all' ? 'В этот день пар нет' : 'На этой неделе занятий нет'}
              </Text>
            </View>
          )}
          {!selectedGroup && (
            <View style={s.emptyState}>
              <Text style={[s.emptyIcon, { color: C.muted }]}>📚</Text>
              <Text style={[s.emptyTitle, { color: C.fg }]}>Выберите группу выше</Text>
              <Text style={[s.emptyText, { color: C.muted }]}>Чтобы увидеть расписание</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },

  hint: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1 },
  hintIcon: { fontSize: 13, lineHeight: 18 },
  hintText: { flex: 1, fontSize: 12, lineHeight: 17 },

  offlineBanner: {
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  offlineText: { fontSize: 12, color: '#fff', fontWeight: '600', textAlign: 'center' },

  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },

  pickerWrap: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  picker: { height: 50 },

  weekBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, marginRight: 8, borderWidth: 1,
  },
  weekBtnText: { fontSize: 13, fontWeight: '500' },
  weekDot: { width: 6, height: 6, borderRadius: 3 },

  weekHeader: {
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  weekLabel: { fontSize: 12, color: '#bfdbfe', fontWeight: '500' },
  weekRange: { fontSize: 13, color: '#fff', fontWeight: '700' },

  nowRow: { gap: 10, marginBottom: 12 },
  nowCard: { borderRadius: 12, padding: 14, borderLeftWidth: 3 },
  nowCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  nowDot: { width: 8, height: 8, borderRadius: 4 },
  nowTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  nowPairBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  nowPairText: { fontSize: 11, fontWeight: '600' },
  countdown: { marginLeft: 'auto', fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  nowSubject: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  nowMeta: { fontSize: 12 },

  dayBar: { marginBottom: 12 },
  dayBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8, borderWidth: 1 },
  dayBtnText: { fontSize: 12, fontWeight: '500' },

  dayHeader: {
    fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 8, marginTop: 4,
  },

  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  emptyText: { fontSize: 13 },

  error: { color: '#dc2626', textAlign: 'center', marginVertical: 12 },
});

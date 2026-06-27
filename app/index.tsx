import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, StatusBar, RefreshControl, PanResponder, Animated,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  api, Group, Lesson, TodayItem, WeekInfo, Stats,
  DAYS_ORDER, DAY_LABELS,
} from '../src/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../src/theme';
import GroupSelector from '../src/GroupSelector';

const TYPE_COLORS: Record<string, string> = {
  ЗАЧЕТ: '#f59e0b', ЭКЗАМЕН: '#ef4444', ПРАКТИКА: '#1d4ed8', ПЗ: '#1d4ed8', ЛЕКЦИЯ: '#3b82f6',
};
const TYPE_LABELS: Record<string, string> = {
  ЗАЧЕТ: 'Зачёт', ЭКЗАМЕН: 'Экзамен', ПРАКТИКА: 'Практика', ПЗ: 'Практика', ЛЕКЦИЯ: 'Лекция',
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

function SkeletonCard({ C }: { C: ReturnType<typeof useTheme> }) {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View style={[{ backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: C.border }, { opacity }]}>
      <View style={{ height: 12, backgroundColor: C.border, borderRadius: 4, width: '60%', marginBottom: 8 }} />
      <View style={{ height: 16, backgroundColor: C.border, borderRadius: 4, width: '85%', marginBottom: 8 }} />
      <View style={{ height: 12, backgroundColor: C.border, borderRadius: 4, width: '45%' }} />
    </Animated.View>
  );
}

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
  const [stats, setStats] = useState<Stats | null>(null);
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

  const weeksRef = useRef<WeekInfo[]>([]);
  useEffect(() => { weeksRef.current = weeks; }, [weeks]);

  const loadSchedule = useCallback(async (group: Group, weekId?: number, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    setIsOffline(false);

    try {
      let wks = weeksRef.current;
      if (wks.length === 0 || selectedGroup?.id !== group.id) {
        wks = await api.getGroupWeeks(group.id);
        setWeeks(wks);
        weeksRef.current = wks;
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
      if (targetWeek) setSelectedWeek(targetWeek);

      const [sched, now, st] = await Promise.all([
        api.getGroupSchedule(group.id, targetWeek?.id),
        api.getNow(group.id),
        api.getStats(group.id).catch(() => null),
      ]);
      setLessons(sched);
      setNowItems(now);
      if (st) setStats(st);

      if (targetWeek) {
        await AsyncStorage.setItem(
          `cache_schedule_${group.id}_${targetWeek.id}`,
          JSON.stringify(sched)
        );
      }
    } catch {
      const wks = weeksRef.current;
      const targetWeek = wks.find(w => w.id === weekId) ?? wks.find(w => w.is_latest);
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
  }, [selectedGroup]);

  const loadGroup = useCallback(async (group: Group, haptic = true) => {
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedGroup(group);
    setWeeks([]);
    setSelectedWeek(null);
    setSelectedDay('all');
    setStats(null);
    await AsyncStorage.setItem('selected_group_id', String(group.id));
    await loadSchedule(group);
  }, [loadSchedule]);

  const switchWeek = useCallback((week: WeekInfo) => {
    if (!selectedGroup || selectedWeek?.id === week.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedWeek(week);
    setSelectedDay('all');
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

  // Загружаем группы (с кэшем для офлайн)
  useEffect(() => {
    api.getGroups()
      .then(gs => {
        setGroups(gs);
        setGroupsLoaded(true);
        AsyncStorage.setItem('cache_groups', JSON.stringify(gs));
      })
      .catch(async () => {
        const cached = await AsyncStorage.getItem('cache_groups');
        if (cached) {
          setGroups(JSON.parse(cached));
          setGroupsLoaded(true);
          setIsOffline(true);
        } else {
          setError('Нет соединения с сервером');
        }
      });
  }, []);

  // При фокусе — загружаем сохранённую группу (только если группа изменилась)
  useFocusEffect(
    useCallback(() => {
      if (!groupsLoaded || groups.length === 0) return;
      AsyncStorage.getItem('selected_group_id').then(id => {
        if (!id) return;
        if (selectedGroup?.id === Number(id)) return;
        const g = groups.find(x => x.id === Number(id));
        if (g) loadGroup(g, false);
      });
    }, [groupsLoaded, groups, selectedGroup, loadGroup])
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
      <StatusBar barStyle="light-content" backgroundColor="#0d9488" />

      {/* Баннер офлайн-режима */}
      {isOffline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineText}>
            Нет подключения — показываем сохранённое расписание
          </Text>
        </View>
      )}

      {/* Подсказка — только до выбора группы */}
      {!selectedGroup && (
        <View style={[s.hint, { backgroundColor: C.tag, borderColor: C.border }]}>
          <Text style={[s.hintText, { color: C.muted }]}>Выберите группу → нажмите на день недели → смотрите пары. Листайте недели свайпом влево/вправо.</Text>
        </View>
      )}

      {/* Выбор группы */}
      <View style={[s.groupCard, { backgroundColor: C.card, borderColor: C.border }]}>
        {!groupsLoaded ? (
          <ActivityIndicator color={C.primary} />
        ) : (
          <GroupSelector groups={groups} value={selectedGroup} onChange={loadGroup} C={C} />
        )}
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

      {/* Статистика недели */}
      {stats && stats.total_lessons_week >= 3 && (
        <View style={[s.statsRow, { backgroundColor: C.card, borderColor: C.border }]}>
          <View style={s.statItem}>
            <Text style={[s.statNum, { color: C.primary }]}>{stats.total_lessons_week}</Text>
            <Text style={[s.statLabel, { color: C.muted }]}>пар</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: C.border }]} />
          <View style={s.statItem}>
            <Text style={[s.statNum, { color: C.primary }]}>{stats.unique_subjects}</Text>
            <Text style={[s.statLabel, { color: C.muted }]}>предметов</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: C.border }]} />
          <View style={s.statItem}>
            <Text style={[s.statNum, { color: C.primary }]}>{stats.unique_teachers}</Text>
            <Text style={[s.statLabel, { color: C.muted }]}>педагогов</Text>
          </View>
          {stats.most_loaded_day && (
            <>
              <View style={[s.statDivider, { backgroundColor: C.border }]} />
              <View style={s.statItem}>
                <Text style={[s.statNum, { color: C.primary }]}>
                  {DAY_LABELS[stats.most_loaded_day] ?? stats.most_loaded_day.slice(0, 2).toUpperCase()}
                </Text>
                <Text style={[s.statLabel, { color: C.muted }]}>загружен</Text>
              </View>
            </>
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
          {[1, 2, 3].map(i => <SkeletonCard key={i} C={C} />)}
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
              <Text style={[s.emptyTitle, { color: C.fg }]}>Занятий не найдено</Text>
              <Text style={[s.emptyText, { color: C.muted }]}>
                {selectedDay !== 'all' ? 'В этот день пар нет' : 'На этой неделе занятий нет'}
              </Text>
            </View>
          )}
          {!selectedGroup && (
            <View style={s.emptyState}>
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

  hint: { borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1 },
  hintText: { fontSize: 12, lineHeight: 17 },

  offlineBanner: {
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  offlineText: { fontSize: 12, color: '#fff', fontWeight: '600', textAlign: 'center' },

  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },

  groupCard: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 0.5 },

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
  countdown: { marginLeft: 'auto', fontSize: 18, fontWeight: '800' },
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
  emptyTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  emptyText: { fontSize: 13 },

  error: { color: '#dc2626', textAlign: 'center', marginVertical: 12 },

  statsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    borderRadius: 12, borderWidth: 0.5, paddingVertical: 12, marginBottom: 12,
  },
  statItem: { alignItems: 'center', flex: 1 },
  statNum: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 10, marginTop: 2 },
  statDivider: { width: 0.5, height: 32 },
});

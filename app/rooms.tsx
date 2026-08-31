import React, { useState, useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, invalidateApiCache, DAYS_ORDER, PAIR_TIMES, WeekOption, weekLabel, isCurrentWeek, currentSlot } from '../src/api';
import { useTheme } from '../src/theme';
import { useSyncStatus } from '../src/SyncContext';

const DAY_SHORT: Record<string, string> = {
  понедельник: 'Пн', вторник: 'Вт', среда: 'Ср',
  четверг: 'Чт', пятница: 'Пт', суббота: 'Сб',
};

const DAY_OFFSET: Record<string, number> = {
  понедельник: 0, вторник: 1, среда: 2, четверг: 3, пятница: 4, суббота: 5,
};

function getDayDate(dayName: string, weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + (DAY_OFFSET[dayName] ?? 0));
  return String(d.getDate());
}

const DAYS = DAYS_ORDER.filter(d => d !== 'воскресенье');

export default function RoomsScreen() {
  const C = useTheme();
  const { offlineBannerText, onlineAt, isOnline } = useSyncStatus();
  // По умолчанию — сегодняшний день (в воскресенье показываем понедельник)
  const [day, setDay] = useState(() => {
    const jsDay = new Date().getDay();
    return jsDay >= 1 && jsDay <= 6 ? DAYS_ORDER[jsDay - 1] : 'понедельник';
  });
  const [pair, setPair] = useState('I');

  // Переход из расписания по тапу на аудиторию: «кто ещё занят в это время».
  // Параметры приходят из app/index.tsx (router.push с day и pair).
  const params = useLocalSearchParams<{ day?: string; pair?: string }>();
  useEffect(() => {
    if (!params.day && !params.pair) return;
    if (params.day && DAYS.includes(params.day)) setDay(params.day);
    if (params.pair && PAIR_TIMES[params.pair]) setPair(params.pair);
    // Гасим сразу после использования: иначе повторный тап по той же аудитории
    // не изменил бы параметры и день с парой не переключились бы обратно.
    router.setParams({ day: '', pair: '' });
  }, [params.day, params.pair]);

  const [rooms, setRooms] = useState<{
    room_name: string; is_free: boolean; occupied_by?: string;
    occupied_list?: string[]; conflict?: boolean;
  }[]>([]);
  const [loading, setLoading] = useState(false);
  // «Свободно сейчас» нажали вечером или в воскресенье — показываем пояснение
  const [noSlotHint, setNoSlotHint] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /** Недель узнать не удалось — работаем без week_start (последняя неделя). */
  const [weeksUnknown, setWeeksUnknown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<WeekOption | null>(null);

  const applyWeeks = (ws: WeekOption[]) => {
    if (!ws.length) return;
    setWeeks(ws);
    const cur = ws.find(w => isCurrentWeek(w.week_start)) ?? ws.find(w => w.is_latest) ?? ws[0];
    if (cur) setSelectedWeek(cur);
  };

  // Список недель — сначала с диска, потом с сервера. Экран не может показать
  // ни одной аудитории, пока не выбрана неделя, поэтому ждать здесь сеть
  // значило держать пользователя на пустом экране всё время ответа.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem('cache_weeks_all');
        if (cached && !cancelled) applyWeeks(JSON.parse(cached));
      } catch { /* битый кэш — подождём сервер */ }
      try {
        const ws = await api.getWeeksAll();
        if (cancelled) return;
        applyWeeks(ws);
        AsyncStorage.setItem('cache_weeks_all', JSON.stringify(ws)).catch(() => null);
        // База пуста (её стирает каждый деплой Render, и до первой
        // синхронизации недель действительно нет) — иначе экран навсегда
        // остался бы пустым: запрос аудиторий ждёт выбранной недели.
        if (!ws.length) setWeeksUnknown(true);
      } catch {
        // Офлайн: если и на диске недель не было, всё равно спросим
        // аудитории — бэкенд отдаст последнюю неделю сам.
        if (!cancelled) setWeeksUnknown(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const load = async (silent = false, week: WeekOption | null = selectedWeek) => {
    setError(null);
    setIsOffline(false);
    const cacheKey = `cache_rooms_${day}_${pair}_${week?.week_start}`;

    // Сначала кэш. Полная синхронизация складывает сюда все комбинации
    // день × пара × неделя, поэтому переключение дня и пары становится
    // мгновенным вместо запроса на каждый тап.
    let fromCache = false;
    if (!silent) {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) { setRooms(JSON.parse(cached)); fromCache = true; }
      } catch { /* битый кэш — подождём сервер */ }
      setLoading(!fromCache);
    }

    try {
      const data = await api.getFreeRooms(day, pair, week?.week_start);
      setRooms(data);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
    } catch {
      if (fromCache) { setIsOffline(true); return; }
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        setRooms(JSON.parse(cached));
        setIsOffline(true);
      } else if (!silent || rooms.length === 0) {
        setError('Нет данных для этой комбинации в офлайн-режиме');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (selectedWeek || weeksUnknown) load();
  }, [day, pair, selectedWeek, weeksUnknown]);

  // When internet comes back — silently re-fetch current selection
  useEffect(() => {
    if (onlineAt === 0 || (!selectedWeek && !weeksUnknown)) return;
    load(true);
  }, [onlineAt]);

  const switchWeek = (w: WeekOption) => {
    setSelectedWeek(w);
    load(false, w);
  };

  // Сбрасываем кэш в памяти: без этого повторный жест в течение TTL (3 мин)
  // молча отдавал бы те же данные, хотя человек тянет экран именно потому,
  // что подозревает их устаревшими.
  const onRefresh = () => {
    setRefreshing(true);
    invalidateApiCache('/schedule/free-rooms');
    load(true);
  };

  const free = rooms.filter(r => r.is_free);
  const busy = rooms.filter(r => !r.is_free);

  return (
    <ScrollView
      style={[s.container, { backgroundColor: C.bg }]}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} progressBackgroundColor={C.card} />}
    >
      {isOffline && isOnline && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineText}>{offlineBannerText}</Text>
        </View>
      )}

      {/* Быстрый переход к текущей паре — самый частый вопрос «где сейчас свободно» */}
      <TouchableOpacity
        onPress={() => {
          const slot = currentSlot();
          if (!slot) { setNoSlotHint(true); return; }
          setNoSlotHint(false);
          setDay(slot.day);
          setPair(slot.pair);
        }}
        activeOpacity={0.85}
        style={[s.nowBtn, { backgroundColor: C.primary }]}
      >
        <Text style={s.nowBtnText}>Свободно прямо сейчас</Text>
      </TouchableOpacity>
      {noSlotHint && (
        <Text style={[s.nowHint, { color: C.muted }]}>
          Сейчас занятий нет — вечер или выходной. Выбери день и пару вручную.
        </Text>
      )}

      {/* День */}
      <Text style={[s.sectionLabel, { color: C.muted }]}>День</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipBar} contentContainerStyle={s.chipContent}>
        {DAYS.map(d => {
          const active = day === d;
          return (
            <TouchableOpacity
              key={d}
              onPress={() => setDay(d)}
              style={[s.chip, { backgroundColor: active ? C.primary : C.card, borderColor: active ? C.primary : C.border }]}
            >
              <Text style={[s.chipText, { color: active ? '#fff' : C.fg }]}>{DAY_SHORT[d]}</Text>
              {selectedWeek && (
                <Text style={[s.chipDate, { color: active ? 'rgba(255,255,255,0.7)' : C.muted }]}>
                  {getDayDate(d, selectedWeek.week_start)}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Пара */}
      <Text style={[s.sectionLabel, { color: C.muted }]}>Пара</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipBar} contentContainerStyle={s.chipContent}>
        {Object.entries(PAIR_TIMES).map(([n, [start]]) => {
          const active = pair === n;
          return (
            <TouchableOpacity
              key={n}
              onPress={() => setPair(n)}
              style={[s.chip, s.pairChip, { backgroundColor: active ? C.primary : C.card, borderColor: active ? C.primary : C.border }]}
            >
              <Text style={[s.chipText, { color: active ? '#fff' : C.fg }]}>{n}</Text>
              <Text style={[s.chipSub, { color: active ? 'rgba(255,255,255,0.75)' : C.muted }]}>{start}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Неделя */}
      {weeks.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.weekBar} contentContainerStyle={s.weekContent}>
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
      )}

      {loading && <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 32 }} />}
      {error && <Text style={s.error}>{error}</Text>}

      {!loading && !error && (
        <>
          <Text style={[s.countHeader, { color: '#16a34a' }]}>Свободных: {free.length}</Text>
          {free.length === 0
            ? <Text style={[s.noRooms, { color: C.muted }]}>Нет свободных аудиторий</Text>
            : (
              <View style={s.freeGrid}>
                {free.map(r => (
                  <View key={r.room_name} style={[s.freeChip, { backgroundColor: C.greenBg, borderColor: C.green }]}>
                    <Text style={[s.freeChipText, { color: '#16a34a' }]}>{r.room_name}</Text>
                  </View>
                ))}
              </View>
            )
          }

          <Text style={[s.countHeader, { color: '#dc2626', marginTop: 12 }]}>Занятых: {busy.length}</Text>
          {busy.map(r => {
            const entries = r.occupied_list ?? (r.occupied_by ? [r.occupied_by] : []);
            return (
              <View key={r.room_name} style={[s.roomCard, { backgroundColor: C.redBg, borderLeftColor: C.red }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={[s.roomName, { color: C.fg }]}>{r.room_name}</Text>
                  {r.conflict && (
                    <View style={{ backgroundColor: '#dc2626', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                      <Text style={{ color: '#fff', fontSize: 9.5, fontWeight: '700' }}>
                        {entries.length} группы одновременно
                      </Text>
                    </View>
                  )}
                </View>
                {entries.map((e, i) => (
                  <Text key={i} style={[s.occupiedBy, { color: C.muted }]}>{e}</Text>
                ))}
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },

  offlineBanner: { backgroundColor: '#f59e0b', borderRadius: 10, padding: 10, marginBottom: 12 },
  offlineText: { fontSize: 12, color: '#fff', fontWeight: '600', textAlign: 'center' },

  sectionLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  nowBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 14 },
  nowBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  nowHint: { fontSize: 12, marginTop: -8, marginBottom: 14 },

  chipBar: { flexGrow: 0, marginBottom: 12 },
  chipContent: { paddingRight: 4, paddingBottom: 2 },
  chip: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 14, marginRight: 8, borderWidth: 1,
  },
  pairChip: { paddingHorizontal: 14 },
  chipText: { fontSize: 14, fontWeight: '700' },
  chipDate: { fontSize: 10, marginTop: 1 },
  chipSub: { fontSize: 10, marginTop: 2 },

  weekBar: { flexGrow: 0, marginBottom: 14 },
  weekContent: { paddingRight: 4, paddingVertical: 2 },
  weekBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, marginRight: 8, borderWidth: 1,
  },
  weekBtnText: { fontSize: 13, fontWeight: '600' },
  weekDot: { width: 6, height: 6, borderRadius: 3 },

  countHeader: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  freeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  freeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  freeChipText: { fontSize: 13, fontWeight: '600' },
  roomCard: { borderRadius: 10, padding: 12, marginBottom: 6, borderLeftWidth: 3 },
  roomName: { fontSize: 14, fontWeight: '600' },
  occupiedBy: { fontSize: 12, marginTop: 2 },
  noRooms: { fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  error: { color: '#dc2626', textAlign: 'center', marginTop: 24, fontSize: 14 },
});

import React, { useState, useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { View, Text, TextInput, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, invalidateApiCache, DAYS_ORDER, PAIR_TIMES, WeekOption, weekLabel, isCurrentWeek, currentSlot } from '../src/api';
import { useTheme, withAlpha } from '../src/theme';
import { useSyncStatus } from '../src/SyncContext';
import AppLoader from '../src/AppLoader';

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

/** Сортировка аудиторий по номеру — с первого этажа до последнего (100е,
 *  200е...), именованные («лабгеол» и т.п.) — после них по алфавиту.
 *  Тот же приём, что на сайте (byRoomNumber в frontend/src/app/rooms). */
function sortRooms<T extends { room_name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const na = parseInt(a.room_name, 10);
    const nb = parseInt(b.room_name, 10);
    const aIsNum = !Number.isNaN(na);
    const bIsNum = !Number.isNaN(nb);
    if (aIsNum && bIsNum) return na - nb || a.room_name.localeCompare(b.room_name, 'ru');
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    return a.room_name.localeCompare(b.room_name, 'ru');
  });
}

/**
 * Бэкенд отдаёт запись занятости одной строкой вида
 * «3 курс · ПМиИ: Кураторский час · Практика · Бобоев Ш.А.» — разбираем на
 * «группа: предмет» и «тип · препод» для двух строк в карточке. Тот же
 * разбор, что на сайте (splitOccupantEntry в frontend/src/app/rooms).
 */
function splitOccupantEntry(entry: string): { top: string; bottom: string } {
  const sep = entry.indexOf(': ');
  if (sep === -1) return { top: entry, bottom: '' };
  const group = entry.slice(0, sep);
  const rest = entry.slice(sep + 2).split(' · ');
  const subject = rest[0] ?? '';
  return { top: `${group}: ${subject}`, bottom: rest.slice(1).join(' · ') };
}

export default function RoomsScreen() {
  const C = useTheme();
  const { offlineBannerText, onlineAt, isOnline } = useSyncStatus();
  // По умолчанию — сегодняшний день (в воскресенье показываем понедельник)
  const [day, setDay] = useState(() => {
    const jsDay = new Date().getDay();
    return jsDay >= 1 && jsDay <= 6 ? DAYS_ORDER[jsDay - 1] : 'понедельник';
  });
  const [pair, setPair] = useState('I');
  const [search, setSearch] = useState('');
  // Аудитория, по которой открыта шторка с подробностями — по тапу на
  // конкретную аудиторию (как на сайте), а не общий тумблер на весь список:
  // разворачивать сразу все 15-20 занятых ради одной было неудобно.
  const [openRoom, setOpenRoom] = useState<string | null>(null);

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
    free_until?: string | null; occupied_until?: string | null;
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

  const searched = search.trim()
    ? rooms.filter(r => r.room_name.toLowerCase().includes(search.trim().toLowerCase()))
    : rooms;
  const free = sortRooms(searched.filter(r => r.is_free));
  const busy = sortRooms(searched.filter(r => !r.is_free));

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
        <Text style={[s.nowBtnText, { color: C.primaryFg }]}>Свободно прямо сейчас</Text>
      </TouchableOpacity>
      {noSlotHint && (
        <Text style={[s.nowHint, { color: C.muted }]}>
          Сейчас пар нет
        </Text>
      )}

      <TextInput
        style={[s.searchInput, { backgroundColor: C.inputBg, borderColor: C.inputBorder, color: C.fg }]}
        placeholder="Найти аудиторию, например 105..."
        placeholderTextColor={C.muted}
        value={search}
        onChangeText={setSearch}
      />

      {/* День — грид на всю ширину, не скролл: при горизонтальной прокрутке
          пилюли дней схлопывались/пропадали (тот же баг, что чинили на сайте). */}
      <Text style={[s.sectionLabel, { color: C.muted }]}>День</Text>
      <View style={s.gridRow}>
        {DAYS.map(d => {
          const active = day === d;
          return (
            <TouchableOpacity
              key={d}
              onPress={() => setDay(d)}
              style={[s.gridChip, { backgroundColor: active ? C.primary : C.card, borderColor: active ? C.primary : C.border }]}
            >
              <Text style={[s.chipText, { color: active ? C.primaryFg : C.fg }]}>{DAY_SHORT[d]}</Text>
              {selectedWeek && (
                <Text style={[s.chipDate, { color: active ? withAlpha(C.primaryFg, 0.7) : C.muted }]}>
                  {getDayDate(d, selectedWeek.week_start)}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Пара — тот же грид, 5 колонок */}
      <Text style={[s.sectionLabel, { color: C.muted, marginTop: 14 }]}>Пара</Text>
      <View style={s.gridRow}>
        {Object.entries(PAIR_TIMES).map(([n, [start]]) => {
          const active = pair === n;
          return (
            <TouchableOpacity
              key={n}
              onPress={() => setPair(n)}
              style={[s.gridChip, { backgroundColor: active ? C.primary : C.card, borderColor: active ? C.primary : C.border }]}
            >
              <Text style={[s.chipText, { color: active ? C.primaryFg : C.fg }]}>{n}</Text>
              <Text style={[s.chipSub, { color: active ? withAlpha(C.primaryFg, 0.75) : C.muted }]}>{start}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

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
                <Text style={[s.weekBtnText, { color: active ? C.primaryFg : C.fg }]}>{weekLabel(w.week_start)}</Text>
                {cur && <View style={[s.weekDot, { backgroundColor: active ? withAlpha(C.primaryFg, 0.7) : C.primary }]} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loading && <AppLoader />}
      {error && <Text style={s.error}>{error}</Text>}

      {!loading && !error && (
        <>
          <View style={s.statusHead}>
            <View style={[s.statusDot, { backgroundColor: C.green }]} />
            <Text style={[s.countHeader, { color: C.fg }]}>Свободных: {free.length}</Text>
          </View>
          {free.length === 0
            ? <Text style={[s.noRooms, { color: C.muted }]}>Нет свободных аудиторий</Text>
            : (
              <View style={s.freeGrid}>
                {free.map(r => (
                  <TouchableOpacity
                    key={r.room_name}
                    onPress={() => setOpenRoom(r.room_name)}
                    activeOpacity={0.7}
                    style={[s.freeChip, { backgroundColor: C.greenBg, borderColor: C.green }]}
                  >
                    <Text style={[s.freeChipText, { color: C.green }]}>{r.room_name}</Text>
                    <Text style={[s.freeChipSub, { color: C.green }]}>
                      {r.free_until ? `до ${r.free_until}` : 'весь день'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )
          }

          <View style={[s.statusHead, { marginTop: 16 }]}>
            <View style={[s.statusDot, { backgroundColor: C.red }]} />
            <Text style={[s.countHeader, { color: C.fg }]}>Занятых: {busy.length}</Text>
            {busy.length > 0 && (
              <Text style={[s.hintText, { color: C.muted }]}>нажмите, чтобы узнать кто</Text>
            )}
          </View>

          {/* Компактные чипы для всех занятых — тап по конкретной открывает
              шторку с подробностями (как на сайте). Точка в углу — накладка
              в расписании (две группы в одной аудитории одновременно). */}
          <View style={s.freeGrid}>
            {busy.map(r => (
              <TouchableOpacity
                key={r.room_name}
                onPress={() => setOpenRoom(r.room_name)}
                activeOpacity={0.7}
                style={[s.freeChip, { backgroundColor: C.redBg, borderColor: C.red }]}
              >
                <Text style={[s.freeChipText, { color: C.red }]}>{r.room_name}</Text>
                {r.occupied_until && (
                  <Text style={[s.freeChipSub, { color: C.red }]}>до {r.occupied_until}</Text>
                )}
                {r.conflict && <View style={[s.conflictDot, { backgroundColor: C.red, borderColor: C.bg }]} />}
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Подробности по конкретной аудитории — шторка снизу, тап на фон закрывает. */}
      {openRoom && (() => {
        const r = rooms.find(x => x.room_name === openRoom);
        if (!r) return null;
        const entries = r.occupied_list ?? (r.occupied_by ? [r.occupied_by] : []);
        const [pairStart, pairEnd] = PAIR_TIMES[pair] ?? ['', ''];
        return (
          <Modal transparent visible animationType="fade" onRequestClose={() => setOpenRoom(null)}>
            <Pressable style={s.sheetBackdrop} onPress={() => setOpenRoom(null)}>
              <Pressable style={[s.sheet, { backgroundColor: C.card }]} onPress={() => {}}>
                <View style={s.sheetHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.sheetTitle, { color: C.fg }]}>Аудитория {r.room_name}</Text>
                    <Text style={[s.sheetSubtitle, { color: C.muted }]}>
                      {day.charAt(0).toUpperCase() + day.slice(1)} · {pair} пара · {pairStart}–{pairEnd}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setOpenRoom(null)} hitSlop={10}>
                    <Ionicons name="close" size={22} color={C.muted} />
                  </TouchableOpacity>
                </View>

                {r.is_free ? (
                  <>
                    <View style={[s.statusPill, { backgroundColor: C.greenBg }]}>
                      <View style={[s.statusDot, { backgroundColor: C.green }]} />
                      <Text style={[s.statusPillText, { color: C.green }]}>
                        Свободна {r.free_until ? `до ${r.free_until}` : 'весь день'}
                      </Text>
                    </View>
                    <Text style={[s.sheetNote, { color: C.muted }]}>
                      {r.free_until
                        ? `После ${r.free_until} аудиторию занимает следующая пара.`
                        : 'До конца дня занятий в этой аудитории нет.'}
                    </Text>
                  </>
                ) : (
                  <>
                    <View style={[s.statusPill, { backgroundColor: C.redBg }]}>
                      <View style={[s.statusDot, { backgroundColor: C.red }]} />
                      <Text style={[s.statusPillText, { color: C.red }]}>
                        Занята {r.occupied_until ? `до ${r.occupied_until}` : ''}
                      </Text>
                    </View>

                    {r.conflict && (
                      <View style={[s.conflictBanner, { backgroundColor: C.examAccent }]}>
                        <Text style={s.conflictBannerText}>
                          В расписании накладка: {entries.length} группы в одной аудитории одновременно
                        </Text>
                      </View>
                    )}

                    <View style={{ gap: 8, marginTop: 12 }}>
                      {entries.map((e, i) => {
                        const { top, bottom } = splitOccupantEntry(e);
                        return (
                          <View key={i} style={[s.occupantRow, { backgroundColor: C.tag }]}>
                            <Text style={[s.occupantTop, { color: C.fg }]}>{top}</Text>
                            {bottom && <Text style={[s.occupantBottom, { color: C.muted }]}>{bottom}</Text>}
                          </View>
                        );
                      })}
                    </View>

                    {r.occupied_until && (
                      <Text style={[s.sheetNote, { color: C.muted }]}>
                        Освободится в {r.occupied_until}.
                      </Text>
                    )}
                  </>
                )}
              </Pressable>
            </Pressable>
          </Modal>
        );
      })()}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },

  offlineBanner: { backgroundColor: '#f59e0b', borderRadius: 10, padding: 10, marginBottom: 12 },
  offlineText: { fontSize: 12, color: '#fff', fontWeight: '600', textAlign: 'center' },

  sectionLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  nowBtn: { borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginBottom: 14 },
  nowBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  nowHint: { fontSize: 12, marginTop: -8, marginBottom: 14 },
  searchInput: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 14 },

  gridRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  gridChip: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 14, borderWidth: 1,
  },
  chipText: { fontSize: 14, fontWeight: '700' },
  chipDate: { fontSize: 10, marginTop: 1 },
  chipSub: { fontSize: 10, marginTop: 2 },

  weekBar: { flexGrow: 0, marginBottom: 14 },
  weekContent: { paddingRight: 4, paddingVertical: 2 },
  weekBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 999, marginRight: 8, borderWidth: 1,
  },
  weekBtnText: { fontSize: 13, fontWeight: '600' },
  weekDot: { width: 6, height: 6, borderRadius: 3 },

  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 999 },
  hintText: { marginLeft: 'auto', fontSize: 12 },
  countHeader: { fontSize: 14, fontWeight: '800' },
  freeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  freeChip: { minWidth: 74, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', position: 'relative' },
  freeChipText: { fontSize: 16, fontWeight: '800' },
  freeChipSub: { fontSize: 10, opacity: 0.85, marginTop: 2 },
  conflictDot: { position: 'absolute', top: -3, right: -3, width: 10, height: 10, borderRadius: 999, borderWidth: 2 },
  noRooms: { fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  error: { color: '#dc2626', textAlign: 'center', marginTop: 24, fontSize: 14 },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, maxHeight: '80%' },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '800' },
  sheetSubtitle: { fontSize: 12, marginTop: 2 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  statusPillText: { fontSize: 14, fontWeight: '700' },
  sheetNote: { fontSize: 12, marginTop: 12, lineHeight: 17 },
  conflictBanner: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10 },
  conflictBannerText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  occupantRow: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  occupantTop: { fontSize: 13, fontWeight: '600' },
  occupantBottom: { fontSize: 12, marginTop: 2 },
});

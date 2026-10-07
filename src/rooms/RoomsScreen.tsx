/**
 * Вкладка «Аудитории» в стиле «Табло» (ТЗ от 4 окт 2026): «куда пойти прямо
 * сейчас» без единого касания. По умолчанию — текущая пара, свободные
 * аудитории первым списком; день и пару выбирают в листе «Когда».
 *
 * Данные — ответы /schedule/free-rooms для пар I–V выбранного дня: из них
 * собирается день каждой аудитории (state.ts). Сначала кэш (ключи
 * cache_rooms_<день>_<пара>_<неделя>, их же заполняет bulk-sync), потом сеть.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, RefreshControl, ScrollView, StatusBar, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, invalidateApiCache, DAYS_ORDER, WeekOption } from '../api';
import { useThemeMode } from '../theme';
import { useBackTo } from '../backTo';
import { useOnlineAgain, useSyncStatus } from '../SyncContext';
import { useTokens, GUTTER, RADIUS, TOUCH_MIN, Tokens } from '../schedule/tokens';
import { Txt, Divider } from '../schedule/ui';
import { addDays, isoOf } from '../schedule/state';
import ScheduleHeader, { linkState } from '../schedule/ScheduleHeader';
import {
  PAIRS, RoomDay, RoomSlot, Slot, buildDay, stepLabel, stepSlot, headerSubtitle, nowKey, nowSlot, pairTitle, roomStatus, searchRooms,
} from './state';
import RoomCard from './RoomCard';
import RoomSheet from './RoomSheet';
import WhenSheet from './WhenSheet';
import RoomRow from './RoomRow';
import SearchField from './SearchField';
import { RoomTiles, TileSkeleton } from './RoomTiles';

const UPDATED_AT_KEY = 'rooms_updated_at';
/** Вид списка: 'tiles' (по умолчанию, с 2.0.2) или 'list'. Хранится на телефоне. */
const VIEW_KEY = 'rooms_view';
type RoomsView = 'tiles' | 'list';
const TICK_MS = 30_000;

type ByPair = Record<string, RoomSlot[] | undefined>;
const dataKey = (s: { dayIndex: number; weekStart: string }) => `${s.dayIndex}|${s.weekStart}`;
const cacheKey = (dayIndex: number, pair: string, weekStart: string) => `cache_rooms_${DAYS_ORDER[dayIndex]}_${pair}_${weekStart}`;

function SectionHead({ k, left, right }: { k: Tokens; left: string; right?: string }) {
  return (
    <View
      accessibilityRole="header"
      style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 8, paddingHorizontal: 4, paddingTop: 16, paddingBottom: 8 }}
    >
      <Txt t="overline" color={k.textSecondary}>{left}</Txt>
      {right ? <Txt t="overline" color={k.textSecondary}>{right}</Txt> : null}
    </View>
  );
}

/** Стрелка ‹ / › с подписью соседней пары; дальше некуда — бледная и не нажимается. */
function StepButton({ k, dir, from, to, onPress }: {
  k: Tokens; dir: 1 | -1; from: Slot; to: Slot | null; onPress: (s: Slot) => void;
}) {
  const label = to ? stepLabel(from, to) : null;
  const icon = dir < 0 ? 'chevron-back' : 'chevron-forward';
  return (
    <Pressable
      onPress={() => { if (to) { Haptics.selectionAsync(); onPress(to); } }}
      disabled={!to}
      accessibilityRole="button"
      accessibilityState={{ disabled: !to }}
      accessibilityLabel={to ? `${dir < 0 ? 'Предыдущая' : 'Следующая'} пара: ${label}` : dir < 0 ? 'Предыдущей пары нет' : 'Следующей пары нет'}
      style={({ pressed }) => ({
        minHeight: TOUCH_MIN, minWidth: TOUCH_MIN, paddingHorizontal: 12, borderRadius: RADIUS.pill,
        flexDirection: dir < 0 ? 'row' : 'row-reverse', alignItems: 'center', justifyContent: 'center', columnGap: 4,
        backgroundColor: k.surface, borderWidth: 1, borderColor: k.border,
        opacity: !to ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={18} color={k.text} />
      {label ? <Txt t="labelStrong" color={k.text} numberOfLines={1}>{label}</Txt> : null}
    </Pressable>
  );
}

export function RoomList({ days, pairIdx, k, onPress }: {
  days: RoomDay[]; pairIdx: number; k: Tokens; onPress: (room: string) => void;
}) {
  if (!days.length) return null;
  return (
    <View style={{ backgroundColor: k.card, borderRadius: RADIUS.card, overflow: 'hidden' }}>
      {days.map((d, i) => (
        <React.Fragment key={d.room}>
          {i > 0 && <Divider k={k} />}
          <RoomRow day={d} pairIdx={pairIdx} k={k} onPress={onPress} />
        </React.Fragment>
      ))}
    </View>
  );
}

/** Плитки или строки — по выбору человека. */
function Rooms({ view, days, pairIdx, k, onPress }: {
  view: RoomsView; days: RoomDay[]; pairIdx: number; k: Tokens; onPress: (room: string) => void;
}) {
  return view === 'tiles'
    ? <RoomTiles days={days} pairIdx={pairIdx} k={k} onPress={onPress} />
    : <RoomList days={days} pairIdx={pairIdx} k={k} onPress={onPress} />;
}

/** Пустое состояние: иконка, заголовок, пояснение и кнопка (или без неё). */
function Empty({ k, icon, title, text, action, onAction }: {
  k: Tokens; icon: React.ComponentProps<typeof Ionicons>['name']; title: string; text?: string;
  action?: string; onAction?: () => void;
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 16, rowGap: 8 }}>
      <Ionicons name={icon} size={36} color={k.textSecondary} />
      <Txt t="titleRow" color={k.text} style={{ textAlign: 'center' }}>{title}</Txt>
      {text ? <Txt t="small" color={k.textSecondary} style={{ textAlign: 'center' }}>{text}</Txt> : null}
      {action && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          style={{ marginTop: 8, minHeight: TOUCH_MIN, paddingHorizontal: 20, borderRadius: RADIUS.pill, backgroundColor: k.accent, justifyContent: 'center' }}
        >
          <Txt t="labelStrong" color={k.onAccent}>{action}</Txt>
        </Pressable>
      ) : null}
    </View>
  );
}


export default function RoomsScreenNew() {
  const k = useTokens();
  const { mode } = useThemeMode();
  const insets = useSafeAreaInsets();
  const { isOnline, isSyncing, lastSyncTime } = useSyncStatus();

  // ─── Часы и режим «Сейчас» ────────────────────────────────────────────
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), TICK_MS);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') setClock(new Date()); });
    return () => { clearInterval(id); sub.remove(); };
  }, []);
  const nowRaw = nowSlot(clock);
  // Объект «Сейчас» меняется только на границах пар — список не перерисовывается каждые 30 с
  const nowKeyStr = nowKey(nowRaw);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => nowRaw, [nowKeyStr]);

  /**
   * Ручной выбор держится, пока приложение запущено (при новом запуске —
   * снова «Сейчас»), и сбрасывается со сменой дня: приложение сутками висит
   * в памяти Android, и вчерашний выбор выглядел бы как сбой.
   */
  const [manual, setManual] = useState<{ slot: Slot; on: string } | null>(null);
  useEffect(() => {
    if (manual && manual.on !== isoOf(clock)) setManual(null);
  }, [clock, manual]);
  const slot: Slot = manual ? manual.slot : now;
  const pairIdx = PAIRS.indexOf(slot.pair);

  const pickSlot = useCallback((s: Slot) => setManual({ slot: s, on: isoOf(new Date()) }), []);
  const backToNow = useCallback(() => setManual(null), []);

  // ─── Недели ───────────────────────────────────────────────────────────
  const [weeks, setWeeks] = useState<WeekOption[] | null>(null);
  /** Списка недель нет ни в кэше, ни с сервера — грузим аудитории без проверки. */
  const [weeksUnknown, setWeeksUnknown] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('cache_weeks_all');
        if (raw && !cancelled) { const ws = JSON.parse(raw); if (ws.length) setWeeks(ws); }
      } catch { /* ждём сервер */ }
      try {
        const ws = await api.getWeeksAll();
        if (cancelled) return;
        if (ws.length) { setWeeks(ws); AsyncStorage.setItem('cache_weeks_all', JSON.stringify(ws)).catch(() => null); }
        else setWeeksUnknown(true);
      } catch {
        if (!cancelled) setWeeksUnknown(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const weekKnown = weeks ? weeks.some(w => w.week_start === slot.weekStart) : null;
  /** Неделя ещё не опубликована (вечер субботы, воскресенье) — сервер отдал бы «всё свободно». */
  const unpublished = weekKnown === false && !weeksUnknown;
  const canLoad = weekKnown === true || weeksUnknown;

  // ─── Аудитории выбранного дня ─────────────────────────────────────────
  const [data, setData] = useState<{ key: string; byPair: ByPair } | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const reqRef = useRef(0);
  // Как в «Педагогах»: тихий запрос показ кэша не отменяет — только новое
  // чтение кэша или ответ сети по этому же дню
  const paintRef = useRef(0);
  const netKeyRef = useRef('');

  useEffect(() => {
    AsyncStorage.getItem(UPDATED_AT_KEY).then(v => { if (v) setUpdatedAt(new Date(v)); }).catch(() => null);
  }, []);

  const load = useCallback(async (dayIndex: number, weekStart: string, silent = false) => {
    const req = ++reqRef.current;
    const stale = () => req !== reqRef.current;
    const key = dataKey({ dayIndex, weekStart });

    let painted = false;
    if (!silent) {
      const paint = ++paintRef.current;
      try {
        const cached = await AsyncStorage.multiGet(PAIRS.map(p => cacheKey(dayIndex, p, weekStart)));
        if (cached.every(([, v]) => v)) {
          const byPair: ByPair = {};
          PAIRS.forEach((p, i) => { byPair[p] = JSON.parse(cached[i][1]!); });
          if (paint === paintRef.current && netKeyRef.current !== key) { setData({ key, byPair }); painted = true; }
        }
      } catch { /* битый кэш — ждём сеть */ }
      if (painted) setLoading(false);
      else if (!stale()) setLoading(true);
    }

    try {
      const day = DAYS_ORDER[dayIndex];
      const res = await Promise.all(PAIRS.map(p => api.getFreeRooms(day, p, weekStart)));
      if (stale()) return;
      netKeyRef.current = key;
      const byPair: ByPair = {};
      PAIRS.forEach((p, i) => { byPair[p] = res[i]; });
      setData({ key, byPair });
      AsyncStorage.multiSet(PAIRS.map((p, i) => [cacheKey(dayIndex, p, weekStart), JSON.stringify(res[i])])).catch(() => null);
      const at = new Date();
      setUpdatedAt(at);
      AsyncStorage.setItem(UPDATED_AT_KEY, at.toISOString()).catch(() => null);
      setLoadFailed(false);
    } catch {
      if (!stale()) setLoadFailed(true);
    } finally {
      if (!stale()) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  const curKey = dataKey(slot);
  useEffect(() => {
    if (canLoad) load(slot.dayIndex, slot.weekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curKey, canLoad, load]);

  // Сеть вернулась — подгружаемся сами, без «Повторить»
  useOnlineAgain(() => { if (canLoad) load(slot.dayIndex, slot.weekStart, true); });

  const retry = useCallback(() => {
    invalidateApiCache('/schedule/free-rooms');
    load(slot.dayIndex, slot.weekStart);
  }, [load, slot.dayIndex, slot.weekStart]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    invalidateApiCache('/schedule/free-rooms');
    load(slot.dayIndex, slot.weekStart, true);
  }, [load, slot.dayIndex, slot.weekStart]);

  const days = useMemo(() => (data && data.key === curKey ? buildDay(data.byPair) : null), [data, curKey]);
  const free = useMemo(() => (days ?? []).filter(d => roomStatus(d, pairIdx).free), [days, pairIdx]);
  const busy = useMemo(() => (days ?? []).filter(d => !roomStatus(d, pairIdx).free), [days, pairIdx]);

  // ─── Вид: плитки или список ───────────────────────────────────────────
  const [view, setViewState] = useState<RoomsView>('tiles');
  useEffect(() => {
    AsyncStorage.getItem(VIEW_KEY).then(v => { if (v === 'list') setViewState('list'); }).catch(() => null);
  }, []);
  const toggleView = useCallback(() => {
    setViewState(v => {
      const next: RoomsView = v === 'tiles' ? 'list' : 'tiles';
      AsyncStorage.setItem(VIEW_KEY, next).catch(() => null);
      return next;
    });
  }, []);

  // ─── Поиск и листы ────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [sheetRoom, setSheetRoom] = useState<string | null>(null);
  const [whenOpen, setWhenOpen] = useState(false);
  const openRoom = useCallback((room: string) => setSheetRoom(room), []);
  const openWhen = useCallback(() => setWhenOpen(true), []);

  // Переход из Расписания по нажатию на аудиторию: ручной режим на день и
  // пару этой пары и сразу лист этой аудитории (см. openRoom в LessonRow).
  // back=teachers — пришли из расписания педагога: «Назад» вернёт туда.
  const params = useLocalSearchParams<{ day?: string; pair?: string; room?: string; week_start?: string; back?: string }>();
  const armBack = useBackTo();
  // Состояние, а не ref: если день тот же, что уже на экране, данные не
  // поменяются — и лист должен открыться по самой просьбе.
  const [pendingRoom, setPendingRoom] = useState<string | null>(null);
  useEffect(() => {
    if (!params.day || !params.pair) return;
    const dayIndex = DAYS_ORDER.indexOf(params.day);
    if (dayIndex >= 0 && dayIndex <= 5 && PAIRS.includes(params.pair)) {
      const n = new Date();
      const weekStart = params.week_start || addDays(isoOf(n), -((n.getDay() + 6) % 7));
      setQuery('');
      pickSlot({ date: addDays(weekStart, dayIndex), weekStart, dayIndex, pair: params.pair });
      setPendingRoom(params.room ? params.room.trim().toLowerCase() : null);
    }
    if (params.back === 'teachers') armBack('/teachers');
    // Гасим сразу: повторное нажатие на ту же аудиторию должно сработать снова
    router.setParams({ day: '', pair: '', room: '', week_start: '', back: '' });
  }, [params.day, params.pair, params.room, params.week_start, params.back, pickSlot, armBack]);
  // Лист открываем, когда данные нужного дня уже на экране
  useEffect(() => {
    const want = pendingRoom;
    if (!want || !days) return;
    // «601 702» — пара сразу в двух аудиториях: открываем первую
    const hit = days.find(d => d.room.toLowerCase() === want)
      ?? days.find(d => want.split(/\s+/).includes(d.room.toLowerCase()));
    setPendingRoom(null);
    if (hit) setSheetRoom(hit.room);
  }, [days, pendingRoom]);

  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle(mode === 'dark' ? 'light-content' : 'dark-content');
      return () => { StatusBar.setBarStyle(k.onAccent === '#FFFFFF' ? 'light-content' : 'dark-content'); };
    }, [mode, k.onAccent]),
  );

  // ─── Отрисовка ────────────────────────────────────────────────────────

  const sub = headerSubtitle(slot, manual ? null : now, clock);
  // «Эта» неделя — календарная; в воскресенье она уже прошла, но так и подписана
  const thisWeek = addDays(isoOf(clock), -((clock.getDay() + 6) % 7));
  const nextWeek = addDays(thisWeek, 7);
  const lastWeek = weeks?.some(w => w.week_start === nextWeek) ? nextWeek : thisWeek;
  const prevSlot = stepSlot(slot, -1, thisWeek, lastWeek);
  const nextSlot = stepSlot(slot, 1, thisWeek, lastWeek);
  const link = linkState({
    syncing: isSyncing || refreshing || (loading && !days),
    offline: !isOnline || loadFailed,
    stamps: [updatedAt, lastSyncTime],
    now: clock,
  });

  const found = days ? searchRooms(days.map(d => d.room), query) : null;

  let body: React.ReactNode;
  if (days && found) {
    // Поиск: точное совпадение — карточка с днём аудитории; остальное — строки
    // для выбранной пары, без деления на свободные и занятые.
    const exact = found.exact ? days.find(d => d.room === found.exact)! : null;
    const others = days.filter(d => found.others.includes(d.room));
    const q = query.trim();
    body = (
      <View style={{ paddingTop: 12 }}>
        {exact ? (
          <>
            <RoomCard
              day={exact}
              pairIdx={pairIdx}
              date={slot.date}
              k={k}
              onPickPair={i => pickSlot({ ...slot, pair: PAIRS[i] })}
              onWho={() => openRoom(exact.room)}
            />
            <SectionHead k={k} left={`Ещё с «${q}»`} right={others.length ? undefined : 'нет'} />
            <Rooms view={view} days={others} pairIdx={pairIdx} k={k} onPress={openRoom} />
          </>
        ) : others.length ? (
          <Rooms view={view} days={others} pairIdx={pairIdx} k={k} onPress={openRoom} />
        ) : (
          <Txt t="body" color={k.textSecondary} style={{ paddingHorizontal: 4, paddingTop: 8 }}>Аудитории «{q}» нет</Txt>
        )}
      </View>
    );
  } else if (days) {
    body = (
      <>
        <SectionHead k={k} left={`Свободны · ${free.length}`} right={`из ${days.length}`} />
        {free.length
          ? <Rooms view={view} days={free} pairIdx={pairIdx} k={k} onPress={openRoom} />
          : <Txt t="small" color={k.textSecondary} style={{ paddingHorizontal: 4 }}>Свободных аудиторий нет</Txt>}
        <SectionHead k={k} left={`Заняты · ${busy.length}`} />
        <Rooms view={view} days={busy} pairIdx={pairIdx} k={k} onPress={openRoom} />
      </>
    );
  } else if (unpublished) {
    body = <Empty k={k} icon="calendar-outline" title="Расписание на следующую неделю ещё не опубликовано" />;
  } else if ((loading || !canLoad) && view === 'tiles') {
    body = <TileSkeleton k={k} />;
  } else if (loading || !canLoad) {
    // Заглушки строк без мерцания
    body = (
      <View style={{ marginTop: 16, backgroundColor: k.card, borderRadius: RADIUS.card, overflow: 'hidden' }}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <React.Fragment key={i}>
            {i > 0 && <Divider k={k} />}
            <View style={{ minHeight: k.roomRowMin, flexDirection: 'row', alignItems: 'center', columnGap: 12, paddingHorizontal: 14 }}>
              <View style={{ width: 56, height: 22, borderRadius: 6, backgroundColor: k.surface2 }} />
              <View style={{ flex: 1, height: 14, borderRadius: 6, backgroundColor: k.surface2, maxWidth: 180 }} />
            </View>
          </React.Fragment>
        ))}
      </View>
    );
  } else if (!isOnline) {
    body = (
      <Empty
        k={k}
        icon="cloud-offline-outline"
        title="Нет данных об аудиториях"
        text="Список загрузится, когда появится сеть."
        action="Повторить"
        onAction={retry}
      />
    );
  } else {
    body = <Empty k={k} icon="alert-circle-outline" title="Не удалось загрузить аудитории" action="Повторить" onAction={retry} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: k.bg }}>
      <ScheduleHeader
        k={k}
        topInset={insets.top}
        subtitleLead={sub.lead}
        subtitle={sub.rest}
        title={pairTitle(slot.pair)}
        link={link}
        onOpen={openWhen}
        openLabel="Выбрать день и пару"
        smallSize={13}
      />

      <View style={{ paddingHorizontal: GUTTER, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', columnGap: 8 }}>
        <View style={{ flex: 1 }}>
          <SearchField k={k} value={query} onChange={setQuery} />
        </View>
        {/* Плитки ⇄ список: значок показывает, на что переключит */}
        <Pressable
          onPress={toggleView}
          accessibilityRole="button"
          accessibilityLabel={view === 'tiles' ? 'Показать списком' : 'Показать плитками'}
          style={{
            width: TOUCH_MIN, height: TOUCH_MIN, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
            backgroundColor: k.surface, borderWidth: 1, borderColor: k.border,
          }}
        >
          <Ionicons name={view === 'tiles' ? 'list-outline' : 'grid-outline'} size={20} color={k.text} />
        </Pressable>
      </View>

      {/* ‹ пред. пара · «Сейчас» · след. пара › — без листа «Когда» (просьба владельца, 7 окт 2026) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 8, paddingHorizontal: GUTTER, paddingTop: 8 }}>
        <StepButton k={k} dir={-1} from={slot} to={prevSlot} onPress={pickSlot} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          {manual && (
            <Pressable
              onPress={backToNow}
              accessibilityRole="button"
              accessibilityLabel="Вернуться к режиму «Сейчас»"
              style={{ minHeight: TOUCH_MIN, flexDirection: 'row', alignItems: 'center', columnGap: 6, paddingHorizontal: 16, borderRadius: RADIUS.pill, backgroundColor: k.accentSoft }}
            >
              <Ionicons name="time-outline" size={16} color={k.onAccentSoft} />
              <Txt t="labelStrong" color={k.onAccentSoft}>Сейчас</Txt>
            </Pressable>
          )}
        </View>
        <StepButton k={k} dir={1} from={slot} to={nextSlot} onPress={pickSlot} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accentText} colors={[k.accent]} progressBackgroundColor={k.surface} />
        }
      >
        {body}
      </ScrollView>

      <WhenSheet
        visible={whenOpen}
        onClose={() => setWhenOpen(false)}
        k={k}
        slot={slot}
        nowPair={now.pair}
        thisWeek={thisWeek}
        nextWeek={nextWeek}
        nextPublished={!!weeks?.some(w => w.week_start === nextWeek)}
        todayIso={isoOf(clock)}
        onNow={backToNow}
        onApply={pickSlot}
      />
      <RoomSheet
        day={sheetRoom && days ? days.find(d => d.room === sheetRoom) ?? null : null}
        initialPair={pairIdx}
        date={slot.date}
        weekStart={slot.weekStart}
        k={k}
        onClose={() => setSheetRoom(null)}
      />
    </View>
  );
}

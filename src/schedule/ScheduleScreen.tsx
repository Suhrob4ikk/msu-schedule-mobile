/**
 * Вкладка «Расписание», вариант «Табло» (ТЗ от 3 окт 2026). Неделя — одна
 * лента; текущая или следующая пара раскрыта прямо в ней.
 *
 * Загрузка данных — та же, что у старого экрана (app/index.tsx): сначала
 * кэш AsyncStorage (общий с полной синхронизацией), потом молча сеть.
 * «Что идёт сейчас» считается на телефоне (state.ts) — без сети и без
 * запросов /schedule/now.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, AppState, LayoutAnimation, LayoutChangeEvent, Platform, Pressable, RefreshControl,
  Animated, ScrollView, StatusBar, UIManager, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, invalidateApiCache, Group, Lesson, WeekInfo, shortGroupName, weekRangeStr } from '../api';
import { useThemeMode } from '../theme';
import { useSyncStatus } from '../SyncContext';
import { scheduleExamReminders, scheduleLessonReminders, NOTIF_PREF_KEY, LESSON_NOTIF_PREF_KEY } from '../examNotifications';
import { writeWidgetData } from '../widgetData';
import { refreshLiveLesson } from '../liveLesson';
import { skipKey, noteWeeklyKey, noteDatedKey } from '../studyData';
import { onScheduleUpdated } from '../scheduleEvents';
import { useBackTo } from '../backTo';
import CourseCheckBanner from '../CourseCheckBanner';
import ScheduleShareCard from '../ScheduleShareCard';
import { useTokens, GUTTER, RADIUS, TOUCH_MIN } from './tokens';
import {
  Block, DayData, WeekRel, addDays, buildWeek, computeFocus, doneTodayAt, headerTitle, isoOf,
  stampLabel, stateKey, weekIsOver, weekRel, weekStatsLine,
} from './state';
import { Txt } from './ui';
import ScheduleHeader, { linkState } from './ScheduleHeader';
import DaySection, { Marks } from './DaySection';
import DayBar from './DayBar';
import WeekSheet from './WeekSheet';
import DayPager from './DayPager';
import LessonSheet from './LessonSheet';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const UPDATED_AT_KEY = 'schedule_updated_at';
const TICK_MS = 30_000;
const EMPTY_MARKS: Marks = { notes: new Set(), skips: new Set() };

/** Раскрытие карточки при смене состояния — высота и прозрачность, 220 мс. */
const EXPAND_ANIM = {
  duration: 220,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};

const currentWeekOf = (wks: WeekInfo[], now: Date): WeekInfo =>
  wks.find(w => weekRel(w.week_start, now) === 'current') ?? wks.find(w => w.is_latest) ?? wks[0];

export default function ScheduleScreenNew() {
  const k = useTokens();
  const { mode } = useThemeMode();
  const insets = useSafeAreaInsets();
  const { isOnline, isSyncing, lastSyncTime, onlineAt } = useSyncStatus();

  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [myGroupId, setMyGroupId] = useState<number | null>(null);
  const [weeks, setWeeks] = useState<WeekInfo[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<WeekInfo | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Последний запрос не прошёл, хотя телефон считает, что сеть есть. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [featureAttendance, setFeatureAttendance] = useState(false);
  const [featureNotes, setFeatureNotes] = useState(false);
  const [marks, setMarks] = useState<Marks>(EMPTY_MARKS);

  const selectedGroupRef = useRef<Group | null>(null);
  const selectedWeekRef = useRef<WeekInfo | null>(null);
  const myGroupIdRef = useRef<number | null>(null);
  const lessonsRef = useRef<Lesson[]>([]);
  useEffect(() => { selectedGroupRef.current = selectedGroup; }, [selectedGroup]);
  useEffect(() => { selectedWeekRef.current = selectedWeek; }, [selectedWeek]);
  useEffect(() => { myGroupIdRef.current = myGroupId; }, [myGroupId]);
  useEffect(() => { lessonsRef.current = lessons; }, [lessons]);
  /** Неделю выбрали руками — тогда не перескакиваем по дате. Выбор живёт
   *  до конца дня: назавтра неделя снова выбирается по календарю, иначе
   *  приложение, сутками висящее в памяти, застревало бы на старой неделе. */
  const userPickedWeekRef = useRef(false);
  const pickedOnRef = useRef('');
  const picked = () => {
    if (userPickedWeekRef.current && pickedOnRef.current !== isoOf(new Date())) userPickedWeekRef.current = false;
    return userPickedWeekRef.current;
  };
  const regroupAsked = useRef(false);
  /** Номер запроса: ответ на устаревший (сменили группу/неделю) отбрасываем. */
  const reqRef = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem(UPDATED_AT_KEY).then(v => { if (v) setUpdatedAt(new Date(v)); }).catch(() => null);
  }, []);

  // ─── Часы: лента перерисовывается только на границах пар и в полночь ──
  const [now, setNow] = useState(() => new Date());
  const days: DayData[] = useMemo(
    () => (selectedWeek ? buildWeek(lessons, selectedWeek.week_start) : []),
    [lessons, selectedWeek],
  );
  const rel: WeekRel = selectedWeek ? weekRel(selectedWeek.week_start, now) : 'current';
  const daysRef = useRef(days);
  const keyRef = useRef('');
  // Пришла другая неделя/группа — часы освежаем сразу, а не на следующем тике
  useEffect(() => { setNow(new Date()); }, [days]);
  useEffect(() => {
    daysRef.current = days;
    keyRef.current = selectedWeek ? stateKey(now, days, rel) : '';
  }, [days, now, rel, selectedWeek]);

  const autoAdvanceRef = useRef<() => void>(() => {});
  const recheck = useCallback(() => {
    const w = selectedWeekRef.current;
    if (!w) return;
    const n = new Date();
    const r = weekRel(w.week_start, n);
    const key = stateKey(n, daysRef.current, r);
    if (key === keyRef.current) return;
    keyRef.current = key;
    LayoutAnimation.configureNext(EXPAND_ANIM);
    setNow(n);
    // Неделя кончилась прямо при открытом экране (суббота после последней пары)
    if (r === 'current' && !picked() && weekIsOver(n, daysRef.current)) autoAdvanceRef.current();
  }, []);

  useEffect(() => {
    const id = setInterval(recheck, TICK_MS);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') recheck(); });
    return () => { clearInterval(id); sub.remove(); };
  }, [recheck]);

  const focus = useMemo(() => computeFocus(now, days, rel), [now, days, rel]);
  const doneToday = rel === 'current' && doneTodayAt(now, days);

  // ─── Напоминания, виджет, строка «идёт пара» ──────────────────────────
  const remindersSigRef = useRef('');
  const applyReminders = useCallback(async (ls: Lesson[], weekStart: string) => {
    try {
      const prefs = await AsyncStorage.multiGet([NOTIF_PREF_KEY, LESSON_NOTIF_PREF_KEY]);
      const body = ls
        .map(l => `${l.lesson_date ?? l.day_of_week}${l.pair_number}${l.subject}${l.room?.name ?? ''}${l.lesson_type ?? ''}`)
        .join('|');
      const sig = `${prefs[0][1]}|${prefs[1][1]}|${weekStart}|${body}`;
      if (sig === remindersSigRef.current) return;
      remindersSigRef.current = sig;
      await scheduleExamReminders(ls, weekStart);
      await scheduleLessonReminders(ls, weekStart);
    } catch {
      remindersSigRef.current = '';
    }
  }, []);

  /**
   * Только для СВОЕЙ группы и только для недели, выбранной автоматически
   * (текущая или следующая, когда текущая кончилась) — иначе просмотр архива
   * или чужой группы подменял бы напоминания и виджет (см. CLAUDE.md).
   */
  const feedDevice = useCallback((group: Group, week: WeekInfo, ls: Lesson[]) => {
    if (group.id !== myGroupIdRef.current) return;
    const r = weekRel(week.week_start, new Date());
    if (r === 'past' || (r === 'future' && picked())) return;
    applyReminders(ls, week.week_start);
    writeWidgetData(group, ls, week.week_start).then(() => refreshLiveLesson()).catch(() => null);
  }, [applyReminders]);

  // Переключатели напоминаний живут в Кабинете — при возврате на вкладку
  // пересобираем напоминания из уже загруженных пар (если ничего не
  // изменилось, applyReminders сам ничего не делает).
  useFocusEffect(
    useCallback(() => {
      const g = selectedGroupRef.current;
      const w = selectedWeekRef.current;
      const ls = lessonsRef.current;
      if (!g || !w || !ls.length || g.id !== myGroupIdRef.current) return;
      const r = weekRel(w.week_start, new Date());
      if (r === 'past' || (r === 'future' && picked())) return;
      applyReminders(ls, w.week_start);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [applyReminders]),
  );

  // ─── Загрузка ─────────────────────────────────────────────────────────

  /**
   * Какую неделю показать: явно выбранную → выбранную раньше руками →
   * текущую; а если в текущей пар больше нет — следующую (ТЗ: «в субботу
   * после последней пары и в воскресенье — следующая неделя»).
   */
  const chooseWeek = useCallback(async (
    wks: WeekInfo[],
    explicitId: number | undefined,
    get: (w: WeekInfo) => Promise<Lesson[] | null>,
    explicitStart?: string,
  ): Promise<{ week: WeekInfo; lessons: Lesson[] } | null> => {
    if (!wks.length) return null;
    let target: WeekInfo | undefined;
    if (explicitId) target = wks.find(w => w.id === explicitId);
    if (!target && explicitStart) target = wks.find(w => w.week_start === explicitStart);
    if (!target && picked() && selectedWeekRef.current) {
      target = wks.find(w => w.week_start === selectedWeekRef.current!.week_start);
    }
    if (target) {
      const ls = await get(target);
      return ls ? { week: target, lessons: ls } : null;
    }
    const n = new Date();
    const cur = currentWeekOf(wks, n);
    const ls = await get(cur);
    if (!ls) return null;
    if (weekRel(cur.week_start, n) === 'current' && weekIsOver(n, buildWeek(ls, cur.week_start))) {
      const next = wks.find(w => w.week_start === addDays(cur.week_start, 7));
      if (next) {
        const nl = await get(next);
        if (nl) return { week: next, lessons: nl };
      }
    }
    return { week: cur, lessons: ls };
  }, []);

  const loadSchedule = useCallback(async (group: Group, weekId?: number, silent = false, weekStart?: string): Promise<boolean> => {
    const req = ++reqRef.current;
    const stale = () => req !== reqRef.current;
    setError(null);

    // 1. С диска — экран заполняется за миллисекунды
    let painted = false;
    if (!silent) {
      try {
        const raw = await AsyncStorage.getItem(`cache_weeks_${group.id}`);
        if (raw) {
          const wks: WeekInfo[] = JSON.parse(raw);
          const r = await chooseWeek(wks, weekId, async w => {
            const s = await AsyncStorage.getItem(`cache_schedule_${group.id}_${w.id}`);
            return s ? JSON.parse(s) : null;
          }, weekStart);
          if (r && !stale()) {
            setWeeks(wks);
            setSelectedWeek(r.week);
            setLessons(r.lessons);
            painted = true;
          }
        }
      } catch { /* битый кэш — ждём сеть */ }
      if (!stale()) setLoading(!painted);
    }

    // 2. Свежие данные
    try {
      const wks = await api.getGroupWeeks(group.id);
      if (stale()) return false;
      setWeeks(wks);
      AsyncStorage.setItem(`cache_weeks_${group.id}`, JSON.stringify(wks)).catch(() => null);
      const r = await chooseWeek(wks, weekId, async w => {
        const s = await api.getGroupSchedule(group.id, w.id);
        AsyncStorage.setItem(`cache_schedule_${group.id}_${w.id}`, JSON.stringify(s)).catch(() => null);
        return s;
      }, weekStart);
      if (stale()) return false;
      if (r) {
        setSelectedWeek(r.week);
        setLessons(r.lessons);
        feedDevice(group, r.week, r.lessons);
      } else {
        setLessons([]);
      }
      const at = new Date();
      setUpdatedAt(at);
      AsyncStorage.setItem(UPDATED_AT_KEY, at.toISOString()).catch(() => null);
      setLoadFailed(false);
      return true;
    } catch {
      if (stale()) return false;
      setLoadFailed(true);
      if (!painted && lessonsRef.current.length === 0) setError('Нет соединения с сервером');
      return false;
    } finally {
      if (!stale()) { setLoading(false); setRefreshing(false); }
    }
  }, [chooseWeek, feedDevice]);

  autoAdvanceRef.current = () => {
    const g = selectedGroupRef.current;
    if (g) loadSchedule(g, undefined, true);
  };

  const loadGroup = useCallback(async (group: Group, weekStart?: string) => {
    setSelectedGroup(group);
    selectedGroupRef.current = group;
    setWeeks([]);
    setSelectedWeek(null);
    setLessons([]);
    userPickedWeekRef.current = false;
    // Неделя задана переходом (чип группы у педагога) и она не текущая —
    // держим её, как выбранную руками, до конца дня
    if (weekStart && weekRel(weekStart, new Date()) !== 'current') {
      userPickedWeekRef.current = true;
      pickedOnRef.current = isoOf(new Date());
    }
    await AsyncStorage.setItem('schedule_view_group_id', String(group.id));
    await loadSchedule(group, undefined, false, weekStart);
  }, [loadSchedule]);

  const switchWeek = useCallback((week: WeekInfo) => {
    const g = selectedGroupRef.current;
    if (!g || selectedWeekRef.current?.id === week.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    userPickedWeekRef.current = true;
    pickedOnRef.current = isoOf(new Date());
    setSelectedWeek(week);
    selectedWeekRef.current = week;
    loadSchedule(g, week.id);
  }, [loadSchedule]);

  const onRefresh = useCallback(() => {
    const g = selectedGroupRef.current;
    if (!g) return;
    setRefreshing(true);
    invalidateApiCache('/schedule/');
    loadSchedule(g, picked() ? selectedWeekRef.current?.id : undefined, true);
  }, [loadSchedule]);

  // Возврат в приложение (>5 мин) и push «расписание изменилось» — перечитать
  const lastLoadAtRef = useRef(Date.now());
  useEffect(() => {
    const reload = () => {
      const g = selectedGroupRef.current;
      if (!g) return;
      lastLoadAtRef.current = Date.now();
      invalidateApiCache('/schedule/');
      loadSchedule(g, picked() ? selectedWeekRef.current?.id : undefined, true);
    };
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active' && Date.now() - lastLoadAtRef.current > 5 * 60_000) reload();
    });
    const off = onScheduleUpdated(reload);
    return () => { sub.remove(); off(); };
  }, [loadSchedule]);

  // Интернет вернулся — тихо обновляемся
  useEffect(() => {
    if (onlineAt === 0) return;
    const g = selectedGroupRef.current;
    if (g) loadSchedule(g, picked() ? selectedWeekRef.current?.id : undefined, true);
  }, [onlineAt, loadSchedule]);

  // Группы — сначала из кэша, потом с сервера
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem('cache_groups');
        if (cached && !cancelled) {
          const gs: Group[] = JSON.parse(cached);
          if (gs.length) { setGroups(gs); setGroupsLoaded(true); }
        }
      } catch { /* ждём сервер */ }
      try {
        const gs = await api.getGroups();
        if (cancelled) return;
        setGroups(gs);
        setGroupsLoaded(true);
        AsyncStorage.setItem('cache_groups', JSON.stringify(gs)).catch(() => null);
      } catch {
        if (cancelled) return;
        setLoadFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Переход с группой и неделей (чип группы у педагога, Уведомления, История) ───
  // group, week_start; date + pair — прокрутить к дню и открыть лист пары;
  // back=teachers|notifications|changes — «Назад» вернёт туда, откуда пришли.
  const params = useLocalSearchParams<{
    group?: string; week_start?: string; date?: string; pair?: string; back?: string;
  }>();
  const navTokenRef = useRef(0);
  const armBack = useBackTo();
  /** Какой день открыть и какую пару показать листом после перехода. */
  const pendingRef = useRef<{ date: string; pair: string; weekStart: string; until: number } | null>(null);
  useEffect(() => {
    const id = Number(params.group);
    if (!id || !groupsLoaded) return;
    const g = groups.find(x => x.id === id);
    navTokenRef.current += 1;
    if (params.back === 'teachers') armBack('/teachers');
    else if (params.back === 'notifications') armBack('/notifications');
    else if (params.back === 'changes') armBack('/changes');
    const ws = params.week_start || undefined;
    pendingRef.current = params.date
      ? { date: params.date, pair: params.pair ?? '', weekStart: ws ?? '', until: Date.now() + 8000 }
      : null;
    router.setParams({ group: '', week_start: '', date: '', pair: '', back: '' });
    if (!g) return;
    // Прокрутить заново, даже если группа и неделя те же
    scrolledFor.current = '';
    if (selectedGroupRef.current?.id === g.id) {
      const w = ws ? weeks.find(x => x.week_start === ws) : undefined;
      if (w && w.id !== selectedWeekRef.current?.id) {
        userPickedWeekRef.current = weekRel(w.week_start, new Date()) !== 'current';
        pickedOnRef.current = isoOf(new Date());
        setSelectedWeek(w);
        selectedWeekRef.current = w;
        loadSchedule(g, w.id);
      } else {
        requestAnimationFrame(tryInitialScroll);
      }
      return;
    }
    loadGroup(g, ws);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.group, groupsLoaded]);

  // На фокусе: своя группа, функции пропусков/заметок, цвет статус-бара
  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle(mode === 'dark' ? 'light-content' : 'dark-content');
      AsyncStorage.multiGet(['feature_attendance', 'feature_notes']).then(p => {
        setFeatureAttendance(p[0][1] === '1');
        setFeatureNotes(p[1][1] === '1');
      });
      if (groupsLoaded && groups.length) {
        const token = navTokenRef.current;
        AsyncStorage.multiGet(['selected_group_id', 'schedule_view_group_id']).then(pairs => {
          const myId = pairs[0][1];
          const viewId = pairs[1][1];
          if (myId) setMyGroupId(Number(myId));
          else if (!regroupAsked.current) {
            regroupAsked.current = true;
            Alert.alert(
              'Выберите группу',
              'Список групп обновился — выберите свою группу заново, и расписание вернётся.',
              [{ text: 'Выбрать', onPress: () => router.push('/profile') }],
            );
            return;
          }
          const target = Number(viewId ?? myId);
          // Пока читали, пришёл переход с группой (чип у педагога) — он главнее
          if (token !== navTokenRef.current) return;
          if (!target || selectedGroupRef.current?.id === target) return;
          const g = groups.find(x => x.id === target);
          if (g) loadGroup(g);
        });
      }
      // Остальные вкладки — с цветной шапкой: значки под цвет текста на акценте
      return () => { StatusBar.setBarStyle(k.onAccent === '#FFFFFF' ? 'light-content' : 'dark-content'); };
    }, [mode, k.onAccent, groupsLoaded, groups, loadGroup]),
  );

  const isMyGroup = selectedGroup != null && myGroupId != null && selectedGroup.id === myGroupId;
  // Открыта чужая группа — на виду кнопка «К моей группе» (просьба владельца, 2.0.2):
  // раньше путь назад был только в листе под заголовком.
  const myGroup = myGroupId != null ? groups.find(g => g.id === myGroupId) ?? null : null;
  const showMyGroup = myGroup != null && selectedGroup != null && !isMyGroup;
  const showAttendance = featureAttendance && isMyGroup;
  const showNotes = featureNotes && isMyGroup;

  // Значки «есть заметка» / «пропуск» в строках
  const loadMarks = useCallback(async () => {
    const ls = lessonsRef.current;
    if ((!showAttendance && !showNotes) || !ls.length) { setMarks(EMPTY_MARKS); return; }
    const keyed = ls.map(l => {
      const gid = l.group?.id ?? 'g';
      return {
        id: String(l.id),
        skip: l.lesson_date ? skipKey(gid, l.lesson_date, l.pair_number) : null,
        weekly: noteWeeklyKey(gid, l.day_of_week, l.pair_number),
        dated: l.lesson_date ? noteDatedKey(gid, l.lesson_date, l.pair_number) : null,
      };
    });
    const keys = keyed.flatMap(x => [x.skip, x.weekly, x.dated]).filter((x): x is string => !!x);
    try {
      const vals = new Map(await AsyncStorage.multiGet([...new Set(keys)]));
      const has = (key: string | null) => !!key && !!(vals.get(key) ?? '').trim();
      setMarks({
        notes: new Set(showNotes ? keyed.filter(x => has(x.weekly) || has(x.dated)).map(x => x.id) : []),
        skips: new Set(showAttendance ? keyed.filter(x => !!x.skip && vals.get(x.skip) != null).map(x => x.id) : []),
      });
    } catch { setMarks(EMPTY_MARKS); }
  }, [showAttendance, showNotes]);
  useEffect(() => { loadMarks(); }, [loadMarks, lessons]);

  // ─── Прокрутка ────────────────────────────────────────────────────────
  const scrollRef = useRef<ScrollView>(null);
  // Прокрутка ленты для большого названия дня (уменьшается и гаснет при уходе вверх)
  const scrollY = useRef(new Animated.Value(0)).current;
  const dayY = useRef<(number | undefined)[]>([]);
  const focusBox = useRef<{ day: number; y: number; h: number } | null>(null);
  const viewportH = useRef(0);
  const scrolledFor = useRef('');
  const lockRef = useRef(false);
  const [visibleDay, setVisibleDay] = useState(0);
  const visibleRef = useRef(0);
  const setVisible = (i: number) => { if (visibleRef.current !== i) { visibleRef.current = i; setVisibleDay(i); } };

  /**
   * При открытии сверху — заголовок сегодняшнего дня; если раскрытая
   * карточка из-за этого не помещается на экран — заголовок её дня.
   * Для другой недели — день раскрытой пары или понедельник.
   */
  const tryInitialScroll = useCallback(() => {
    const g = selectedGroupRef.current;
    const w = selectedWeekRef.current;
    if (!g || !w || !daysRef.current.length) return;
    const key = `${g.id}|${w.id}`;
    if (scrolledFor.current === key) return;
    const ys = dayY.current;
    for (let i = 0; i < 7; i++) if (ys[i] == null) return;
    if (!viewportH.current) return;
    // Переход из Уведомлений / Истории: нужный день и лист пары
    const pend = pendingRef.current;
    if (pend && Date.now() > pend.until) pendingRef.current = null;
    else if (pend) {
      const idx = daysRef.current.findIndex(d => d.date === pend.date);
      if (idx < 0) {
        // Эта неделя загружена, а дня в ней нет — переход не удался, ведём себя как обычно
        if (pend.weekStart && w.week_start !== pend.weekStart) return;
        pendingRef.current = null;
      } else {
        pendingRef.current = null;
        scrolledFor.current = key;
        scrollRef.current?.scrollTo({ y: Math.max(0, ys[idx]!), animated: false });
        lockRef.current = true;
        setVisible(idx);
        const b = pend.pair ? daysRef.current[idx].blocks.find(x => x.pairs.includes(pend.pair)) : undefined;
        if (b) setTimeout(() => setLessonSheet(b), 250);
        return;
      }
    }
    const n = new Date();
    const r = weekRel(w.week_start, n);
    const f = computeFocus(n, daysRef.current, r);
    const focusDay = f ? daysRef.current.findIndex(d => d.date === f.block.date) : -1;
    const fb = focusBox.current && focusBox.current.day === focusDay ? focusBox.current : null;
    if (f && !fb) return; // карточка ещё не измерена
    let target = focusDay >= 0 ? focusDay : 0;
    if (r === 'current') {
      const todayIdx = daysRef.current.findIndex(d => d.date === isoOf(n));
      const fits = !fb || (ys[fb.day]! + fb.y + fb.h - ys[todayIdx]!) <= viewportH.current;
      if (todayIdx >= 0 && fits) target = todayIdx;
    }
    if (target < 0) target = 0;
    scrolledFor.current = key;
    scrollRef.current?.scrollTo({ y: Math.max(0, ys[target]!), animated: false });
    lockRef.current = true;
    setVisible(target);
  }, []);

  // Сменилась группа при той же неделе — дни могли не пересчитать размеры
  // (onLayout не придёт), поэтому пробуем прокрутить и по смене данных.
  useEffect(() => {
    const id = setTimeout(tryInitialScroll, 60);
    return () => clearTimeout(id);
  }, [lessons, selectedWeek?.id, selectedGroup?.id, tryInitialScroll]);

  const onDayLayout = useCallback((i: number, e: LayoutChangeEvent) => {
    dayY.current[i] = e.nativeEvent.layout.y;
    requestAnimationFrame(tryInitialScroll);
  }, [tryInitialScroll]);

  const onFocusLayout = useCallback((day: number, e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    focusBox.current = { day, y, h: height };
    requestAnimationFrame(tryInitialScroll);
  }, [tryInitialScroll]);

  const onScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    if (lockRef.current) return;
    const y = e.nativeEvent.contentOffset.y;
    let idx = 0;
    dayY.current.forEach((dy, i) => { if (dy != null && dy <= y + 24) idx = i; });
    setVisible(idx);
  }, []);

  // ─── Вид: лентой или по дням (выбор человека, хранится на телефоне) ─────
  const [viewMode, setViewModeState] = useState<'list' | 'pages'>('list');
  useEffect(() => {
    AsyncStorage.getItem('schedule_view_mode').then(v => { if (v === 'pages') setViewModeState('pages'); }).catch(() => null);
  }, []);
  const [pageIdx, setPageIdx] = useState(0);
  // Прокрутка страниц «По дням» — по ней едет подсветка в ряду дней
  const pagerX = useRef(new Animated.Value(0)).current;
  const pagedFor = useRef('');
  const pagesOn = viewMode === 'pages' && lessons.length > 0 && days.length > 0;
  const setViewMode = useCallback((m: 'list' | 'pages') => {
    setViewModeState(m);
    scrolledFor.current = '';
    pagedFor.current = '';
    AsyncStorage.setItem('schedule_view_mode', m).catch(() => null);
  }, []);
  // Какой день открыть в режиме «По дням»: из уведомления, иначе сегодня / день раскрытой пары
  useEffect(() => {
    if (!pagesOn || !selectedGroup || !selectedWeek) return;
    const key = `${selectedGroup.id}|${selectedWeek.id}`;
    if (pagedFor.current === key) return;
    pagedFor.current = key;
    let target = -1;
    const pend = pendingRef.current;
    if (pend && Date.now() <= pend.until) {
      const idx = days.findIndex(d => d.date === pend.date);
      if (idx >= 0) {
        target = idx;
        pendingRef.current = null;
        const b = pend.pair ? days[idx].blocks.find(x => x.pairs.includes(pend.pair)) : undefined;
        if (b) setTimeout(() => setLessonSheet(b), 250);
      }
    }
    if (target < 0) {
      const f = computeFocus(new Date(), days, rel);
      const todayIdx = rel === 'current' ? days.findIndex(d => d.date === isoOf(new Date())) : -1;
      target = todayIdx >= 0 ? todayIdx : f ? days.findIndex(d => d.date === f.block.date) : 0;
    }
    const t = Math.max(0, target);
    setPageIdx(t);
    setVisible(t);
  }, [pagesOn, selectedGroup, selectedWeek, days, rel]);

  const pickDay = useCallback((i: number) => {
    if (pagesOn) { Haptics.selectionAsync(); setPageIdx(i); setVisible(i); return; }
    const y = dayY.current[i];
    if (y == null) return;
    Haptics.selectionAsync();
    // Подсветка — сразу на выбранный день; пока палец не тронет ленту,
    // промежуточные дни при анимированной прокрутке её не перебивают.
    lockRef.current = true;
    setVisible(i);
    scrollRef.current?.scrollTo({ y, animated: true });
  }, [pagesOn]);

  // ─── Действия ─────────────────────────────────────────────────────────
  const [headerSheet, setHeaderSheet] = useState(false);
  const [lessonSheet, setLessonSheet] = useState<Block | null>(null);
  const openHeaderSheet = useCallback(() => { Haptics.selectionAsync(); setHeaderSheet(true); }, []);
  const openLesson = useCallback((b: Block) => { Haptics.selectionAsync(); setLessonSheet(b); }, []);

  // «Поделиться расписанием» — картинка недели (тот же ScheduleShareCard, что раньше)
  const shareCardRef = useRef<View>(null);
  const sharingRef = useRef(false);
  const byDay = useMemo(() => {
    const out: Record<string, Lesson[]> = {};
    for (const d of days) if (d.blocks.length) out[d.day] = d.blocks.flatMap(b => b.lessons);
    return out;
  }, [days]);
  const share = useCallback(async () => {
    if (sharingRef.current) return;
    sharingRef.current = true;
    try {
      // Лист ещё закрывается — даём ему уехать, иначе он попадёт в кадр системного меню
      await new Promise(r => setTimeout(r, 250));
      const uri = await captureRef(shareCardRef, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Расписание' });
      }
    } catch {
      Alert.alert('Не получилось', 'Не удалось создать картинку. Попробуйте ещё раз.');
    } finally {
      sharingRef.current = false;
    }
  }, []);
  const onFocusPress = useCallback(() => { if (focus) openLesson(focus.block); }, [focus, openLesson]);

  const toMyGroup = useCallback(() => {
    if (!myGroup) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadGroup(myGroup);
  }, [myGroup, loadGroup]);

  const toThisWeek = useCallback(() => {
    const cur = weeks.length ? currentWeekOf(weeks, new Date()) : null;
    if (cur && weekRel(cur.week_start, new Date()) === 'current') switchWeek(cur);
  }, [weeks, switchWeek]);

  // ─── Статус связи ─────────────────────────────────────────────────────
  const link = linkState({
    syncing: isSyncing || refreshing, offline: !isOnline || loadFailed, stamps: [updatedAt, lastSyncTime], now,
  });

  // ─── Отрисовка ────────────────────────────────────────────────────────

  const subtitle = selectedGroup
    ? `${shortGroupName(selectedGroup.name)} · ${selectedGroup.year} курс${rel === 'current' && selectedWeek ? ' · эта неделя' : ''}`
    : 'Группа не выбрана';
  const title = selectedWeek ? headerTitle(selectedWeek.week_start, now) : selectedGroup ? 'Расписание' : 'Выберите группу';
  const hasThisWeek = weeks.some(w => weekRel(w.week_start, now) === 'current');
  const showThisWeek = selectedWeek != null && rel !== 'current' && hasThisWeek;
  // Место под плавающие кнопки внизу, чтобы они не закрывали последнюю пару
  const floatPad = showThisWeek || showMyGroup ? TOUCH_MIN + 12 : 0;

  return (
    <View style={{ flex: 1, backgroundColor: k.bg }}>
      <ScheduleHeader
        k={k}
        topInset={insets.top}
        subtitle={subtitle}
        title={title}
        link={link}
        onOpen={openHeaderSheet}
      />

      {/* Статистика — только когда открыта другая неделя. Отступ до первого
          заголовка дня (8 dp, «между блоками ленты» по ТЗ) даёт сам день. */}
      {selectedWeek && rel !== 'current' && lessons.length > 0 && (
        <View style={{ paddingHorizontal: GUTTER + 4 }}>
          <Txt t="caption" color={k.textSecondary}>
            <Txt t="captionStrong" color={k.text}>{weekStatsLine(days, lessons).split(' · ')[0]}</Txt>
            {' · '}{weekStatsLine(days, lessons).split(' · ').slice(1).join(' · ')}
          </Txt>
        </View>
      )}

      {/* Ряд дней — под шапкой и только в режиме «По дням»; в ленте дни листаются прокруткой */}
      {pagesOn && (
        <DayBar days={days} k={k} todayIso={isoOf(now)} visible={pageIdx} onPick={pickDay} atTop scrollX={pagerX} />
      )}

      {pagesOn ? (
        <>
          <View style={{ paddingHorizontal: GUTTER }}><CourseCheckBanner /></View>
          <DayPager
            key={`${selectedGroup?.id}|${selectedWeek?.id}`}
            days={days} k={k} now={now} rel={rel} focus={focus} doneToday={doneToday} marks={marks}
            index={pageIdx}
            onIndex={i => { setPageIdx(i); setVisible(i); }}
            scrollX={pagerX}
            refreshing={refreshing}
            onRefresh={onRefresh}
            bottomPad={24 + floatPad}
            onRowPress={openLesson}
            onFocusPress={onFocusPress}
            onExpire={recheck}
          />
        </>
      ) : (
      <Animated.ScrollView
        ref={scrollRef as React.Ref<any>}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 24 + floatPad }}
        onLayout={e => { viewportH.current = e.nativeEvent.layout.height; requestAnimationFrame(tryInitialScroll); }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true, listener: onScroll })}
        onScrollBeginDrag={() => { lockRef.current = false; }}
        scrollEventThrottle={32}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={k.accentText}
            colors={[k.accent]}
            progressBackgroundColor={k.surface}
          />
        }
      >
        <CourseCheckBanner />

        {error && !lessons.length && (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}>
            <Txt t="body" color={k.statusOffline}>{error}</Txt>
          </View>
        )}

        {!selectedGroup && groupsLoaded && (
          <Pressable
            onPress={openHeaderSheet}
            accessibilityRole="button"
            style={{ marginTop: 24, backgroundColor: k.card, borderRadius: RADIUS.card, padding: 16, alignItems: 'center' }}
          >
            <Txt t="body" color={k.accentText}>Выберите группу</Txt>
          </Pressable>
        )}

        {loading && !lessons.length && [0, 1, 2].map(i => (
          <View key={i} style={{ marginTop: 16, height: 120, borderRadius: RADIUS.card, backgroundColor: k.card }} />
        ))}

        {!loading && selectedWeek && lessons.length === 0 && !error && (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}>
            <Txt t="body" color={k.textSecondary}>На этой неделе занятий нет</Txt>
          </View>
        )}

        {lessons.length > 0 && days.map(d => (
          <DaySection
            key={d.date}
            d={d}
            k={k}
            now={now}
            rel={rel}
            focus={focus}
            doneToday={doneToday}
            marks={marks}
            scrollY={scrollY}
            onRowPress={openLesson}
            onFocusPress={onFocusPress}
            onExpire={recheck}
            onLayout={onDayLayout}
            onFocusLayout={onFocusLayout}
          />
        ))}
      </Animated.ScrollView>
      )}

      {/* Плавающие пилюли внизу: «К моей группе» и «К этой неделе» */}
      {(showThisWeek || showMyGroup) && (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 12, paddingHorizontal: GUTTER,
            flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 8, rowGap: 8,
          }}
        >
          {showMyGroup && (
            <Pressable
              onPress={toMyGroup}
              accessibilityRole="button"
              accessibilityLabel={`Вернуться к моей группе, ${shortGroupName(myGroup!.name)}, ${myGroup!.year} курс`}
              style={{
                minHeight: TOUCH_MIN, paddingHorizontal: 18, borderRadius: RADIUS.pill,
                flexDirection: 'row', alignItems: 'center', columnGap: 6, backgroundColor: k.accent,
                elevation: 4,
              }}
            >
              <Ionicons name="arrow-undo" size={16} color={k.onAccent} />
              <Txt t="labelStrong" color={k.onAccent} numberOfLines={1}>
                {`К моей группе · ${shortGroupName(myGroup!.name)}`}
              </Txt>
            </Pressable>
          )}
          {showThisWeek && (
          <Pressable
            onPress={toThisWeek}
            accessibilityRole="button"
            accessibilityLabel="К этой неделе"
            style={{
              minHeight: TOUCH_MIN, paddingHorizontal: 18, borderRadius: RADIUS.pill,
              flexDirection: 'row', alignItems: 'center', columnGap: 6, backgroundColor: k.text,
              elevation: 4,
            }}
          >
            <Ionicons name="chevron-up" size={16} color={k.bg} />
            <Txt t="labelStrong" color={k.bg}>К этой неделе</Txt>
          </Pressable>
          )}
        </View>
      )}

      {/* Невидимая карточка для снимка — за пределами экрана, но смонтирована */}
      {selectedGroup && selectedWeek && (
        <View style={{ position: 'absolute', left: -9999, top: 0 }} pointerEvents="none">
          <ScheduleShareCard
            ref={shareCardRef}
            groupLabel={`${shortGroupName(selectedGroup.name)} · ${selectedGroup.year} курс`}
            weekLabel={weekRangeStr(selectedWeek.week_start)}
            lessonsByDay={byDay}
          />
        </View>
      )}

      <WeekSheet
        visible={headerSheet}
        onClose={() => setHeaderSheet(false)}
        k={k}
        viewMode={viewMode}
        onViewMode={m => { setViewMode(m); setHeaderSheet(false); }}
        weeks={weeks}
        selectedWeek={selectedWeek}
        groups={groups}
        group={selectedGroup}
        myGroup={myGroup}
        onPickWeek={switchWeek}
        onPickGroup={g => { if (g.id !== selectedGroup?.id) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); loadGroup(g); } }}
        onShare={share}
        canShare={lessons.length > 0}
      />
      <LessonSheet
        block={lessonSheet}
        onClose={() => setLessonSheet(null)}
        k={k}
        showAttendance={showAttendance}
        showNotes={showNotes}
        onChanged={loadMarks}
      />

    </View>
  );
}

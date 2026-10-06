/**
 * Вкладка «Педагоги» в стиле «Табло» (ТЗ от 4 окт 2026): поиск по фамилии,
 * алфавитные секции со статусом «есть ли пара сейчас», недавние, переход по
 * букве. Экран педагога открывается поверх списка (список под ним не
 * выгружается — прокрутка сохраняется).
 *
 * Данные — сначала кэш (общий с полной синхронизацией), потом сеть. Статусы
 * строк считаются на телефоне из кэша расписаний педагогов (data.ts).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, AppState, BackHandler, Easing, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet,
  TextInput, View, useWindowDimensions,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { invalidateApiCache, Teacher, WeekOption } from '../api';
import { useThemeMode } from '../theme';
import { useOnlineAgain, useSyncStatus } from '../SyncContext';
import { useTokens, GUTTER, RADIUS, TOUCH_MIN, HEADER_H, Tokens } from '../schedule/tokens';
import { Txt, Divider, useReduceMotion } from '../schedule/ui';
import { isoOf } from '../schedule/state';
import { StatusPill, Bell, linkState } from '../schedule/ScheduleHeader';
import {
  buildSections, listSummary, listWeeks, matchesLabel, mergeTeacherLists, mondayOf, pushRecent,
  searchTeachers, similarTeachers,
} from './state';
import {
  cachedSchedules, cachedTeacherLists, cachedWeeksAll, fetchTeacherLists, fetchWeeksAll, readRecent,
  readUpdatedAt, statusStore, writeRecent, writeUpdatedAt,
} from './data';
import { TeacherCard } from './TeacherRow';
import LetterSheet from './LetterSheet';
import { EmptyState, SearchField } from './ui';
import TeacherScreen from './TeacherScreen';

const TICK_MS = 60_000;

function Overline({ k, children }: { k: Tokens; children: string }) {
  return (
    <View accessibilityRole="header" style={{ paddingHorizontal: 4, paddingTop: 12, paddingBottom: 8 }}>
      <Txt t="overline" color={k.textSecondary}>{children}</Txt>
    </View>
  );
}

export default function TeachersScreen() {
  const k = useTokens();
  const { mode } = useThemeMode();
  const insets = useSafeAreaInsets();
  const { isOnline, isSyncing, lastSyncTime } = useSyncStatus();

  // ─── Часы: раз в минуту — статусы видимых строк; сам экран — только в полночь ──
  const [today, setToday] = useState(() => isoOf(new Date()));
  useEffect(() => {
    const tick = () => {
      statusStore.tick();
      const d = isoOf(new Date());
      setToday(prev => (prev === d ? prev : d));
    };
    const id = setInterval(tick, TICK_MS);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') tick(); });
    return () => { clearInterval(id); sub.remove(); };
  }, []);
  const thisWeek = mondayOf(today);

  // ─── Список ───────────────────────────────────────────────────────────
  const [weeksAll, setWeeksAll] = useState<WeekOption[] | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const reqRef = useRef(0);
  // Кэш рисуем всегда, кроме двух случаев: уже пошло более новое чтение кэша
  // или пришёл ответ сети. Тихий запрос (silent) показ кэша НЕ отменяет —
  // раньше отменял, и без сети было «Нет подключения», хотя всё скачано.
  const paintRef = useRef(0);
  const netDayRef = useRef(''); // день, на который уже пришёл ответ сети

  useEffect(() => { readUpdatedAt().then(setUpdatedAt); }, []);

  const load = useCallback(async (silent = false) => {
    const req = ++reqRef.current;
    const stale = () => req !== reqRef.current;
    const day = isoOf(new Date());
    let painted = false;
    if (!silent) {
      const paint = ++paintRef.current;
      const wa = await cachedWeeksAll();
      const lists = await cachedTeacherLists(listWeeks(wa, day));
      if (paint === paintRef.current && netDayRef.current !== day && lists.some(Boolean)) {
        setWeeksAll(wa);
        setTeachers(mergeTeacherLists(lists));
        painted = true;
      }
      if (painted) setLoading(false);
      else if (!stale()) setLoading(true);
    }
    try {
      const wa = await fetchWeeksAll();
      const lists = await fetchTeacherLists(listWeeks(wa, day));
      if (stale()) return;
      netDayRef.current = day;
      setWeeksAll(wa);
      setTeachers(mergeTeacherLists(lists));
      const at = new Date();
      setUpdatedAt(at);
      writeUpdatedAt(at);
      setLoadFailed(false);
    } catch {
      if (!stale()) setLoadFailed(true);
    } finally {
      if (!stale()) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Сеть вернулась — тихо обновляемся, без «Повторить»
  useOnlineAgain(() => load(true));

  const retry = useCallback(() => {
    invalidateApiCache('/schedule/teachers');
    invalidateApiCache('/schedule/weeks-all');
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    invalidateApiCache('/schedule/teachers');
    invalidateApiCache('/schedule/weeks-all');
    load(true);
  }, [load]);

  // ─── Статусы — из кэша расписаний педагогов этой недели ───────────────
  // Перечитываем, когда сменился список, неделя или закончилась синхронизация.
  const idsKey = teachers.map(t => t.id).join(',');
  const syncSeenRef = useRef(lastSyncTime);
  useEffect(() => {
    let cancelled = false;
    const ids = teachers.map(t => t.id);
    cachedSchedules(ids, thisWeek).then(map => { if (!cancelled) statusStore.setAll(map); });
    // Пока список пуст, а синхронизация принесла данные — перечитать список
    // с диска. Только на НОВОЙ синхронизации, не при открытии экрана, и не
    // тихо: тихий запрос идёт лишь в сеть, а без сети это «Нет подключения».
    if (!teachers.length && lastSyncTime && lastSyncTime !== syncSeenRef.current) load();
    syncSeenRef.current = lastSyncTime;
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, thisWeek, lastSyncTime]);

  // ─── Недавние ─────────────────────────────────────────────────────────
  const [recentIds, setRecentIds] = useState<number[]>([]);
  useEffect(() => { readRecent().then(setRecentIds); }, []);
  const recent = useMemo(
    () => recentIds.map(id => teachers.find(t => t.id === id)).filter((t): t is Teacher => !!t),
    [recentIds, teachers],
  );

  // ─── Поиск ────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);
  const matches = useMemo(() => searchTeachers(teachers, query), [teachers, query]);
  const similar = useMemo(
    () => (matches && matches.length === 0 ? similarTeachers(teachers, query) : []),
    [matches, teachers, query],
  );
  const ranges = useMemo(() => new Map((matches ?? []).map(m => [m.teacher.id, m.range])), [matches]);

  // ─── Открыть педагога (экран выезжает справа поверх списка) ─────────────
  const { width } = useWindowDimensions();
  const reduce = useReduceMotion();
  const slide = useRef(new Animated.Value(0)).current; // 0 — на месте, 1 — за правым краем
  const [open, setOpen] = useState<{ teacher: Teacher; back?: 'schedule' } | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const openTeacher = useCallback((t: Teacher, back?: 'schedule') => {
    Haptics.selectionAsync();
    inputRef.current?.blur();
    setOpen({ teacher: t, back });
    slide.setValue(reduce ? 0 : 1);
    if (!reduce) Animated.timing(slide, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    setRecentIds(ids => {
      const next = pushRecent(ids, t.id);
      writeRecent(next);
      return next;
    });
  }, [reduce, slide]);
  const onRowPress = useCallback((t: Teacher) => openTeacher(t), [openTeacher]);

  /** Закрыть экран педагога. Открывали из Расписания — туда же и вернуться. */
  const closeTeacher = useCallback(() => {
    const cur = openRef.current;
    if (!cur) return;
    const done = () => setOpen(o => (o === cur ? null : o));
    if (reduce) done();
    else Animated.timing(slide, { toValue: 1, duration: 200, useNativeDriver: true }).start(done);
    if (cur.back === 'schedule') router.navigate('/');
  }, [reduce, slide]);

  // Нажатие на уже открытую вкладку «Педагоги» — назад к списку
  const navigation = useNavigation();
  useEffect(() => {
    const nav = navigation as unknown as { addListener: (e: string, cb: () => void) => () => void; isFocused: () => boolean };
    return nav.addListener('tabPress', () => { if (nav.isFocused() && openRef.current) closeTeacher(); });
  }, [navigation, closeTeacher]);

  // Переход из Расписания по нажатию на ФИО (см. openTeacher в schedule/LessonRow)
  const params = useLocalSearchParams<{ teacher?: string; name?: string; back?: string }>();
  useEffect(() => {
    const id = Number(params.teacher);
    if (!id) return;
    const t = teachers.find(x => x.id === id) ?? { id, name: params.name ?? '' };
    openTeacher(t, params.back === 'schedule' ? 'schedule' : undefined);
    // Гасим сразу: повторное нажатие на то же ФИО должно сработать снова
    router.setParams({ teacher: '', name: '', back: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.teacher]);

  // Системная «Назад»: экран педагога → список; клавиатуру закрывает сама
  // система, потом — очистка поиска
  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle(mode === 'dark' ? 'light-content' : 'dark-content');
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (openRef.current) { closeTeacher(); return true; }
        if (query) { setQuery(''); return true; }
        return false;
      });
      return () => {
        sub.remove();
        StatusBar.setBarStyle(k.onAccent === '#FFFFFF' ? 'light-content' : 'dark-content');
      };
    }, [mode, k.onAccent, query, closeTeacher]),
  );

  // ─── Прокрутка и буквы ────────────────────────────────────────────────
  const sections = useMemo(() => buildSections(teachers), [teachers]);
  const scrollRef = useRef<ScrollView>(null);
  const letterY = useRef(new Map<string, number>());
  const scrollY = useRef(0);
  const viewportH = useRef(0);
  const [letterOpen, setLetterOpen] = useState(false);
  const [currentLetter, setCurrentLetter] = useState<string | null>(null);

  const onScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
    statusStore.setViewport(scrollY.current, viewportH.current);
  }, []);

  const openLetters = useCallback(() => {
    Haptics.selectionAsync();
    // Текущая буква — секция, заголовок которой уже прилип к верху
    let cur: string | null = null;
    for (const s of sections) {
      const y = letterY.current.get(s.letter);
      if (y != null && y <= scrollY.current + 4) cur = s.letter;
    }
    setCurrentLetter(cur ?? sections[0]?.letter ?? null);
    setLetterOpen(true);
  }, [sections]);

  const pickLetter = useCallback((l: string) => {
    setLetterOpen(false);
    const y = letterY.current.get(l);
    if (y != null) scrollRef.current?.scrollTo({ y, animated: true });
  }, []);

  // ─── Статус связи ─────────────────────────────────────────────────────
  const link = linkState({
    syncing: isSyncing || refreshing || (loading && !teachers.length),
    offline: !isOnline || loadFailed,
    stamps: [updatedAt, lastSyncTime],
    now: new Date(),
  });
  const noData = !teachers.length && !loading;

  // ─── Содержимое ленты (плоский список — для липких заголовков букв) ──
  const children: React.ReactElement[] = [];
  const sticky: number[] = [];

  if (teachers.length && !matches) {
    children.push(
      <View key="summary" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 8, rowGap: 4, paddingLeft: 4, paddingTop: 4 }}>
        <Txt t="teacherStatus" color={k.textSecondary} style={{ flexShrink: 1 }}>{listSummary(teachers.length, new Date())}</Txt>
        <Pressable
          onPress={openLetters}
          accessibilityRole="button"
          accessibilityLabel="Перейти к букве"
          style={({ pressed }) => ({
            minHeight: TOUCH_MIN, minWidth: TOUCH_MIN, paddingHorizontal: 16, borderRadius: RADIUS.pill,
            alignItems: 'center', justifyContent: 'center', backgroundColor: k.accentSoft, opacity: pressed ? 0.85 : 1,
            marginLeft: 'auto',
          })}
        >
          <Txt t="labelStrong" color={k.onAccentSoft}>А–Я</Txt>
        </Pressable>
      </View>,
    );
    if (recent.length) {
      children.push(<Overline key="recent-title" k={k}>Недавние</Overline>);
      children.push(<TeacherCard key="recent" k={k} group="recent" teachers={recent} onPress={onRowPress} />);
    }
    for (const s of sections) {
      sticky.push(children.length);
      children.push(
        <View
          key={`h:${s.letter}`}
          accessibilityRole="header"
          onLayout={e => { letterY.current.set(s.letter, e.nativeEvent.layout.y); }}
          style={{ backgroundColor: k.bg, paddingTop: 10, paddingBottom: 6, paddingHorizontal: 4 }}
        >
          <Txt t="letter" color={k.accentText}>{s.letter}</Txt>
        </View>,
      );
      children.push(<TeacherCard key={`s:${s.letter}`} k={k} group={`s:${s.letter}`} teachers={s.teachers} onPress={onRowPress} />);
    }
  } else if (teachers.length && matches) {
    if (matches.length) {
      children.push(
        <View key="count" style={{ paddingHorizontal: 4, paddingTop: 4, paddingBottom: 8 }}>
          <Txt t="teacherStatus" color={k.textSecondary} accessibilityLiveRegion="polite">{matchesLabel(matches.length)}</Txt>
        </View>,
      );
      children.push(
        <TeacherCard key="found" k={k} group="found" teachers={matches.map(m => m.teacher)} ranges={ranges} onPress={onRowPress} />,
      );
    } else {
      children.push(
        <View key="none" style={{ paddingTop: 72, paddingBottom: 16 }}>
          <EmptyState k={k} icon="search" title="Ничего не найдено" text={`по запросу «${query.trim()}»`} live />
        </View>,
      );
      if (similar.length) {
        children.push(<Overline key="similar-title" k={k}>Похожая фамилия</Overline>);
        children.push(<TeacherCard key="similar" k={k} group="similar" teachers={similar} onPress={onRowPress} />);
      }
    }
  } else if (loading) {
    children.push(
      <View key="skeleton" style={{ marginTop: 16, backgroundColor: k.card, borderRadius: 18, overflow: 'hidden' }}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <React.Fragment key={i}>
            {i > 0 && <Divider k={k} />}
            <View style={{ minHeight: 64, justifyContent: 'center', rowGap: 8, paddingHorizontal: 14 }}>
              <View style={{ height: 14, width: 160, borderRadius: 6, backgroundColor: k.surface2 }} />
              <View style={{ height: 10, width: 110, borderRadius: 5, backgroundColor: k.surface2 }} />
            </View>
          </React.Fragment>
        ))}
      </View>,
    );
  } else if (!isOnline) {
    children.push(
      <View key="offline" style={{ paddingTop: 120 }}>
        <EmptyState
          k={k}
          icon="cloud-offline-outline"
          title="Нет подключения"
          text="Список педагогов загрузится, когда появится сеть."
          action="Повторить"
          onAction={retry}
        />
      </View>,
    );
  } else if (loadFailed) {
    children.push(
      <View key="failed" style={{ paddingTop: 120 }}>
        <EmptyState k={k} icon="alert-circle-outline" title="Не удалось загрузить список педагогов" action="Повторить" onAction={retry} />
      </View>,
    );
  } else {
    children.push(
      <View key="empty" style={{ paddingTop: 120 }}>
        <EmptyState k={k} icon="people-outline" title="Педагогов с парами пока нет" text="Расписание на эту неделю ещё не опубликовано." />
      </View>,
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: k.bg }}>
      <View
        importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}
        style={{ flex: 1 }}
      >
        {/* Шапка: поле растягивается; при крупном шрифте статус и колокольчик — второй строкой */}
        <View style={{ paddingTop: insets.top, backgroundColor: k.bg }}>
          <View
            style={{
              minHeight: HEADER_H, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
              paddingTop: 6, paddingBottom: 2, paddingLeft: GUTTER - 4, paddingRight: GUTTER - 8, columnGap: 8, rowGap: 4,
            }}
          >
            <SearchField k={k} value={query} onChange={setQuery} disabled={noData} inputRef={inputRef} />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' }}>
              <StatusPill s={link} k={k} />
              <Bell k={k} />
            </View>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 4, paddingBottom: 24 }}
          stickyHeaderIndices={sticky}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onLayout={e => { viewportH.current = e.nativeEvent.layout.height; statusStore.setViewport(scrollY.current, viewportH.current); }}
          onScroll={onScroll}
          scrollEventThrottle={100}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accentText} colors={[k.accent]} progressBackgroundColor={k.surface} />
          }
        >
          {children}
        </ScrollView>
      </View>

      <LetterSheet
        visible={letterOpen}
        onClose={() => setLetterOpen(false)}
        k={k}
        letters={sections.map(s => s.letter)}
        current={currentLetter}
        total={teachers.length}
        onPick={pickLetter}
      />

      {open && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { transform: [{ translateX: Animated.multiply(slide, width) }] }]}
        >
          <TeacherScreen
            key={open.teacher.id}
            teacher={teachers.find(t => t.id === open.teacher.id) ?? open.teacher}
            k={k}
            weeksAll={weeksAll}
            onBack={closeTeacher}
          />
        </Animated.View>
      )}
    </View>
  );
}

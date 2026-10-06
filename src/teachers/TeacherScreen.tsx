/**
 * Расписание педагога — открывается поверх списка. Повторяет «Табло» из
 * вкладки «Расписание», только в строках вместо ФИО — группы.
 *
 * Неделя — «Эта» / «Следующая» (по календарю). В воскресенье, а в субботу
 * после последней пары педагога — сразу следующая, если она опубликована
 * (как в «Расписании», решение владельца). Данные — кэш, потом сеть.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, AppState, LayoutAnimation, LayoutChangeEvent, Pressable, RefreshControl, ScrollView, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { invalidateApiCache, Lesson, Teacher, WeekOption } from '../api';
import { useOnlineAgain, useSyncStatus } from '../SyncContext';
import { Tokens, GUTTER, RADIUS, TOUCH_MIN, HEADER_H, FONT } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import { addDays, isoOf, weekRel } from '../schedule/state';
import { StatusPill, Bell, linkState } from '../schedule/ScheduleHeader';
import {
  TDay, buildTeacherWeek, defaultWeek, emptyWeekInfo, mondayOf, teacherFocus, teacherStateKey, teacherSummary,
  weekRange,
} from './state';
import { cachedTeacherWeek, fetchTeacherWeek, statusStore } from './data';
import TDaySection from './TDaySection';
import { EmptyState } from './ui';

const TICK_MS = 30_000;
type Which = 'this' | 'next';

const EXPAND_ANIM = {
  duration: 220,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};

function WeekSegment({ k, which, thisWs, nextWs, onPick }: {
  k: Tokens; which: Which; thisWs: string; nextWs: string; onPick: (w: Which) => void;
}) {
  const items: Array<{ w: Which; title: string; range: string }> = [
    { w: 'this', title: 'Эта неделя', range: weekRange(thisWs) },
    { w: 'next', title: 'Следующая', range: weekRange(nextWs) },
  ];
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: k.surface2, borderRadius: RADIUS.sm, padding: 3, columnGap: 3 }}>
      {items.map(it => {
        const on = it.w === which;
        return (
          <Pressable
            key={it.w}
            onPress={() => onPick(it.w)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${it.title}, ${it.range}`}
            style={{
              flex: 1, minHeight: TOUCH_MIN, borderRadius: RADIUS.sm - 3, paddingVertical: 4, paddingHorizontal: 6,
              alignItems: 'center', justifyContent: 'center', backgroundColor: on ? k.bg : 'transparent',
            }}
          >
            <Txt t="labelStrong" color={on ? k.text : k.textSecondary} style={{ textAlign: 'center' }}>{it.title}</Txt>
            <Txt t="caption" color={k.textSecondary} style={{ textAlign: 'center' }}>{it.range}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TeacherScreen({ teacher, k, weeksAll, onBack }: {
  teacher: Teacher;
  k: Tokens;
  weeksAll: WeekOption[] | null;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { isOnline, isSyncing, lastSyncTime } = useSyncStatus();

  const [now, setNow] = useState(() => new Date());
  const today = isoOf(now);
  const thisWs = mondayOf(today);
  const nextWs = addDays(thisWs, 7);
  /** null — список недель неизвестен (тогда пробуем загрузить). */
  const nextPublished = weeksAll ? weeksAll.some(w => w.week_start === nextWs) : null;

  // ─── Данные двух недель ───────────────────────────────────────────────
  // undefined — ещё нет; null у следующей — не опубликована
  const [thisLs, setThisLs] = useState<Lesson[] | undefined>(undefined);
  const [nextLs, setNextLs] = useState<Lesson[] | null | undefined>(undefined);
  const [failed, setFailed] = useState<{ this: boolean; next: boolean }>({ this: false, next: false });
  const [netBusy, setNetBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const reqRef = useRef(0);
  // Как в списке: тихий запрос показ кэша не отменяет — только новое чтение кэша или ответ сети
  const paintRef = useRef(0);
  const netKeyRef = useRef(''); // недели, на которые уже пришёл ответ сети

  const load = useCallback(async (silent = false) => {
    const req = ++reqRef.current;
    const stale = () => req !== reqRef.current;
    if (!silent) {
      const paint = ++paintRef.current;
      const [c1, c2] = await Promise.all([cachedTeacherWeek(teacher.id, thisWs), cachedTeacherWeek(teacher.id, nextWs)]);
      if (paint === paintRef.current && netKeyRef.current !== `${thisWs}|${nextWs}`) {
        if (c1) setThisLs(c1);
        if (c2) setNextLs(c2);
      }
      if (stale()) return;
    }
    setNetBusy(true);
    const [r1, r2] = await Promise.allSettled([
      fetchTeacherWeek(teacher.id, thisWs),
      nextPublished === false ? Promise.resolve(null) : fetchTeacherWeek(teacher.id, nextWs),
    ]);
    if (stale()) return;
    if (r1.status === 'fulfilled' || r2.status === 'fulfilled') netKeyRef.current = `${thisWs}|${nextWs}`;
    if (r1.status === 'fulfilled') {
      setThisLs(r1.value);
      statusStore.setOne(teacher.id, r1.value);
    }
    if (r2.status === 'fulfilled') setNextLs(r2.value);
    setFailed({ this: r1.status === 'rejected', next: r2.status === 'rejected' });
    if (r1.status === 'fulfilled' || r2.status === 'fulfilled') setUpdatedAt(new Date());
    setNetBusy(false);
    setRefreshing(false);
  }, [teacher.id, thisWs, nextWs, nextPublished]);

  useEffect(() => { load(); }, [load]);
  useOnlineAgain(() => load(true));
  // Следующая неделя оказалась неопубликованной — так и показываем
  useEffect(() => { if (nextPublished === false) setNextLs(null); }, [nextPublished]);

  const retry = useCallback(() => {
    invalidateApiCache(`/schedule/teacher/${teacher.id}`);
    load();
  }, [load, teacher.id]);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    invalidateApiCache(`/schedule/teacher/${teacher.id}`);
    load(true);
  }, [load, teacher.id]);

  const thisDays = useMemo(() => (thisLs ? buildTeacherWeek(thisLs, thisWs) : null), [thisLs, thisWs]);
  const nextDays = useMemo(() => (nextLs ? buildTeacherWeek(nextLs, nextWs) : nextLs), [nextLs, nextWs]);

  // ─── Какая неделя ─────────────────────────────────────────────────────
  const [which, setWhich] = useState<Which | null>(null);
  useEffect(() => {
    if (which || !thisDays) return;
    const published = nextPublished ?? !!(nextLs && nextLs.length);
    setWhich(defaultWeek(new Date(), thisDays, published));
  }, [which, thisDays, nextPublished, nextLs]);
  const shown: Which = which ?? 'this';
  const ws = shown === 'this' ? thisWs : nextWs;
  const lessons = shown === 'this' ? thisLs : nextLs;
  const days: TDay[] = useMemo(
    () => (shown === 'this' ? thisDays : nextDays) ?? buildTeacherWeek([], ws),
    [shown, thisDays, nextDays, ws],
  );
  const rel = weekRel(ws, now);

  // ─── Часы: лента перерисовывается только на границах пар ──────────────
  const daysRef = useRef(days);
  const relRef = useRef(rel);
  const wsRef = useRef(ws);
  const keyRef = useRef('');
  useEffect(() => {
    daysRef.current = days;
    relRef.current = rel;
    wsRef.current = ws;
    keyRef.current = teacherStateKey(now, days, rel);
  }, [days, now, rel, ws]);
  const recheck = useCallback(() => {
    const n = new Date();
    const key = teacherStateKey(n, daysRef.current, weekRel(wsRef.current, n));
    if (key === keyRef.current) return;
    keyRef.current = key;
    LayoutAnimation.configureNext(EXPAND_ANIM);
    setNow(n);
  }, []);
  useEffect(() => {
    const id = setInterval(recheck, TICK_MS);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') recheck(); });
    return () => { clearInterval(id); sub.remove(); };
  }, [recheck]);

  const focus = useMemo(() => teacherFocus(now, days, rel), [now, days, rel]);
  const withPairs = days.filter(d => d.blocks.length);
  const summary = lessons ? teacherSummary(days, rel, now) : null;

  // ─── Прокрутка ────────────────────────────────────────────────────────
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const dayY = useRef<(number | undefined)[]>([]);
  const focusBox = useRef<{ day: number; y: number; h: number } | null>(null);
  const viewportH = useRef(0);
  const scrolledFor = useRef('');
  const lockRef = useRef(false);
  const [visibleDay, setVisibleDay] = useState(() => (now.getDay() + 6) % 7);
  const visibleRef = useRef(visibleDay);
  const setVisible = (i: number) => { if (visibleRef.current !== i) { visibleRef.current = i; setVisibleDay(i); } };

  /**
   * При открытии — с начала (ФИО и неделя видны). Если раскрытая карточка
   * так не помещается на экран — к заголовку её дня. При смене недели —
   * к началу недели (ТЗ).
   */
  const tryInitialScroll = useCallback(() => {
    if (!which || !lessons) return;
    const key = `${teacher.id}|${which}`;
    if (scrolledFor.current === key || !viewportH.current) return;
    const f = teacherFocus(new Date(), daysRef.current, relRef.current);
    const fd = f ? daysRef.current.findIndex(d => d.date === f.block.date) : -1;
    if (fd >= 0) {
      const y = dayY.current[fd];
      const fb = focusBox.current && focusBox.current.day === fd ? focusBox.current : null;
      if (y == null || !fb) return; // ещё не измерено
      scrolledFor.current = key;
      lockRef.current = true;
      setVisible(fd);
      if (y + fb.y + fb.h > viewportH.current) scrollRef.current?.scrollTo({ y: Math.max(0, y - 4), animated: false });
      return;
    }
    scrolledFor.current = key;
    const first = daysRef.current.find(d => d.blocks.length);
    if (first) setVisible(first.dayIndex);
  }, [which, lessons, teacher.id]);

  useEffect(() => {
    const id = setTimeout(tryInitialScroll, 60);
    return () => clearTimeout(id);
  }, [lessons, which, tryInitialScroll]);

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
    let idx = -1;
    daysRef.current.forEach(d => {
      const dy = dayY.current[d.dayIndex];
      if (d.blocks.length && dy != null && dy <= y + 24) idx = d.dayIndex;
    });
    if (idx < 0) idx = daysRef.current.find(d => d.blocks.length)?.dayIndex ?? 0;
    setVisible(idx);
  }, []);

  const pickWeek = useCallback((w: Which) => {
    if (w === which) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dayY.current = [];
    focusBox.current = null;
    scrolledFor.current = `${teacher.id}|${w}`; // к началу недели, без автопрокрутки
    setWhich(w);
    setNow(new Date());
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    const first = (w === 'this' ? thisDays : nextDays)?.find(d => d.blocks.length);
    lockRef.current = false;
    setVisible(first ? first.dayIndex : 0);
  }, [which, teacher.id, thisDays, nextDays]);

  // ─── Статус связи ─────────────────────────────────────────────────────
  const wFailed = shown === 'this' ? failed.this : failed.next;
  const link = linkState({
    syncing: isSyncing || refreshing || (netBusy && lessons === undefined),
    offline: !isOnline || wFailed,
    stamps: [updatedAt, lastSyncTime],
    now,
  });

  // ─── Тело ─────────────────────────────────────────────────────────────
  let body: React.ReactNode;
  if (shown === 'next' && nextLs === null) {
    body = (
      <View style={{ marginTop: 12, backgroundColor: k.card, borderRadius: RADIUS.lg, paddingVertical: 20, paddingHorizontal: 16 }}>
        <EmptyState k={k} icon="calendar-outline" title="Расписание на следующую неделю ещё не опубликовано" />
      </View>
    );
  } else if (lessons === undefined) {
    body = wFailed ? (
      <View style={{ marginTop: 12, backgroundColor: k.card, borderRadius: RADIUS.lg, paddingVertical: 20, paddingHorizontal: 16 }}>
        <EmptyState
          k={k}
          icon="cloud-offline-outline"
          title={isOnline ? 'Не удалось загрузить расписание' : 'Нет подключения'}
          text={isOnline ? undefined : 'Расписание загрузится, когда появится сеть.'}
          action="Повторить"
          onAction={retry}
        />
      </View>
    ) : (
      [0, 1].map(i => <View key={i} style={{ marginTop: 16, height: 120, borderRadius: RADIUS.card, backgroundColor: k.card }} />)
    );
  } else if (!withPairs.length) {
    const info = emptyWeekInfo(shown, shown === 'this' ? nextDays : undefined);
    body = (
      <View style={{ marginTop: 12, backgroundColor: k.card, borderRadius: RADIUS.lg, paddingVertical: 20, paddingHorizontal: 16 }}>
        <EmptyState
          k={k}
          icon="calendar-clear-outline"
          title={info.title}
          text={info.nearest ? (
            <>
              {info.nearest.lead}
              <Txt t="bodySmall" color={k.text} style={{ fontFamily: FONT[700] }}>{info.nearest.strong}</Txt>
              {info.nearest.tail}
            </>
          ) : info.text ?? undefined}
          action={info.showNext ? 'Показать следующую неделю' : undefined}
          onAction={() => pickWeek('next')}
          ghost
        />
      </View>
    );
  } else {
    body = null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: k.bg }}>
      {/* Шапка: «Назад», статус связи, колокольчик */}
      <View style={{ paddingTop: insets.top, backgroundColor: k.bg }}>
        <View style={{ minHeight: HEADER_H, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingLeft: GUTTER - 8, paddingRight: GUTTER - 8, columnGap: 8 }}>
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Назад"
            style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="arrow-back" size={24} color={k.text} />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' }}>
            <StatusPill s={link} k={k} />
            <Bell k={k} />
          </View>
        </View>
      </View>

      <Animated.ScrollView
        ref={scrollRef as React.Ref<any>}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 24 }}
        onLayout={e => { viewportH.current = e.nativeEvent.layout.height; requestAnimationFrame(tryInitialScroll); }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true, listener: onScroll })}
        onScrollBeginDrag={() => { lockRef.current = false; }}
        scrollEventThrottle={32}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accentText} colors={[k.accent]} progressBackgroundColor={k.surface} />
        }
      >
        <View style={{ paddingHorizontal: 4, paddingBottom: 10 }}>
          <Txt
            t="teacherTitle"
            color={k.text}
            accessibilityRole="header"
            android_hyphenationFrequency="full"
            textBreakStrategy="highQuality"
          >
            {teacher.name || thisLs?.[0]?.teacher?.name || 'Педагог'}
          </Txt>
          <Txt t="small" color={k.textSecondary} style={{ marginTop: 4, fontFamily: FONT[400] }}>
            {summary ? (
              <>
                {summary.strong ? <Txt t="smallStrong" color={k.text}>{summary.strong}</Txt> : null}
                {summary.rest}
              </>
            ) : ' '}
          </Txt>
        </View>

        <WeekSegment k={k} which={shown} thisWs={thisWs} nextWs={nextWs} onPick={pickWeek} />

        {body}
        {withPairs.map(d => (
          <TDaySection
            key={d.date}
            d={d}
            k={k}
            now={now}
            rel={rel}
            focus={focus}
            scrollY={scrollY}
            onExpire={recheck}
            onLayout={onDayLayout}
            onFocusLayout={onFocusLayout}
          />
        ))}
      </Animated.ScrollView>

    </View>
  );
}

/**
 * «Уведомления» в стиле «Табло» — входящие: изменения своей группы и
 * «новая неделя» своего факультета с сервера за 30 дней + пришедшие
 * напоминания о зачётах (src/notifications/data.ts). Прочитано — локально.
 *
 * Открывается поверх текущей вкладки (скрытая вкладка, src/notifications/nav.ts).
 * Фильтр при каждом открытии — «Все»; при возврате из Расписания — тот же.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, AppState, BackHandler, Linking, RefreshControl, ScrollView, StatusBar, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Group } from '../api';
import { useSyncStatus } from '../SyncContext';
import { useThemeMode } from '../theme';
import { useTokens, GUTTER, RADIUS } from '../schedule/tokens';
import { linkState } from '../schedule/ScheduleHeader';
import { EmptyState } from '../teachers/ui';
import {
  Filter, InboxItem, KIND_LABEL, ReadState, buildDiff, changeA11y, changeDate, changeKind, countdownLabel, examA11y,
  examPlace, examTitle, groupByDay, groupLabel, inFilter, isUnread, newLabel, timeLabel, unreadCounts, unreadSpoken,
  whenTitle,
} from './state';
import {
  inboxItems, loadGroups, refreshInbox, setItemsRead, setItemsUnread, useInbox, weekStatsFromCache,
} from './data';
import { backFromNotifications, notificationsOpenSeq, openHistory, openInSchedule } from './nav';
import {
  DateHeader, DayCard, EventRow, FILTERS, FilterChip, HistoryButton, MarkAllButton, OverlayHeader, PermissionRow,
  ScreenTitle, UndoBar,
} from './ui';

const NO_READ: ReadState = { baseline: Number.POSITIVE_INFINITY, read: {} };
const UNDO_MS = 5000;

const EMPTY_FILTER: Record<Exclude<Filter, 'all'>, string> = {
  exam: 'Напоминаний о зачётах и экзаменах нет',
  schedule: 'Изменений расписания нет',
};

export default function NotificationsScreen() {
  const k = useTokens();
  const { mode } = useThemeMode();
  const insets = useSafeAreaInsets();
  const { isOnline, isSyncing, lastSyncTime } = useSyncStatus();
  const s = useInbox();

  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState<Filter>('all');
  const [groups, setGroups] = useState<Group[]>([]);
  const [perm, setPerm] = useState<{ granted: boolean; canAsk: boolean }>({ granted: true, canAsk: false });
  const [refreshing, setRefreshing] = useState(false);
  const [undo, setUndo] = useState<string[] | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [weekStats, setWeekStats] = useState<Record<string, string>>({});
  const scrollRef = useRef<ScrollView>(null);
  const seenSeq = useRef(-1);

  const checkPerm = useCallback(() => {
    Notifications.getPermissionsAsync()
      .then(p => setPerm({ granted: p.status === 'granted', canAsk: p.canAskAgain !== false }))
      .catch(() => null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      // Открыли заново (колокольчик, Кабинет, push) — фильтр «Все» и начало ленты
      if (seenSeq.current !== notificationsOpenSeq()) {
        seenSeq.current = notificationsOpenSeq();
        setFilter('all');
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }
      refreshInbox();
      loadGroups().then(setGroups);
      checkPerm();
      StatusBar.setBarStyle(mode === 'dark' ? 'light-content' : 'dark-content');
      const back = BackHandler.addEventListener('hardwareBackPress', () => { backFromNotifications(); return true; });
      const app = AppState.addEventListener('change', st => { if (st === 'active') { checkPerm(); setNow(new Date()); } });
      return () => {
        back.remove();
        app.remove();
        StatusBar.setBarStyle(k.onAccent === '#FFFFFF' ? 'light-content' : 'dark-content');
      };
    }, [mode, k.onAccent, checkPerm]),
  );

  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  // «20 пар · 7 предметов» у новой недели — из кэша расписания своей группы
  useEffect(() => {
    const gid = s.groupId;
    if (gid == null || !s.changes) return;
    const weeks = [...new Set(s.changes.filter(c => c.change_type === 'new_week' && c.week_start).map(c => c.week_start!))];
    Promise.all(weeks.map(async ws => [ws, await weekStatsFromCache(gid, ws)] as const)).then(pairs => {
      setWeekStats(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => !!p[1])));
    });
  }, [s.changes, s.groupId]);

  const read = s.read ?? NO_READ;
  const items = useMemo(() => inboxItems(s, now), [s, now]);
  const counts = useMemo(() => unreadCounts(items, read), [items, read]);
  const shown = useMemo(() => items.filter(it => inFilter(it, filter)), [items, filter]);
  const days = useMemo(() => groupByDay(shown, it => it.at, now), [shown, now]);
  const my = groups.find(g => g.id === s.groupId) ?? null;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshInbox({ force: true }).catch(() => null);
    setNow(new Date());
    setRefreshing(false);
  }, []);

  const toTop = useCallback(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), []);

  const markAll = useCallback(() => {
    const ids = shown.filter(it => isUnread(it, read));
    if (!ids.length) return;
    setItemsRead(ids);
    setUndo(ids.map(it => it.id));
    AccessibilityInfo.announceForAccessibility(`Отмечено ${ids.length}`);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  }, [shown, read]);

  const doUndo = useCallback(() => {
    if (!undo) return;
    setItemsUnread(undo);
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, [undo]);

  const enablePush = useCallback(async () => {
    if (perm.canAsk) {
      const r = await Notifications.requestPermissionsAsync().catch(() => null);
      if (r?.status === 'granted') { setPerm({ granted: true, canAsk: true }); return; }
    }
    Linking.openSettings().catch(() => null);
  }, [perm.canAsk]);

  const openItem = useCallback((it: InboxItem) => {
    setItemsRead([it]);
    const gid = s.groupId;
    if (gid == null) return;
    if (it.kind === 'exam') {
      openInSchedule({ group: gid, weekStart: it.exam.weekStart, date: it.exam.date, pair: it.exam.pair, back: 'notifications' });
      return;
    }
    const c = it.change;
    if (changeKind(c.change_type) === 'new_week') openInSchedule({ group: gid, weekStart: c.week_start, back: 'notifications' });
    else openInSchedule({ group: gid, weekStart: c.week_start, date: changeDate(c), pair: c.pair_number, back: 'notifications' });
  }, [s.groupId]);

  const renderItem = (it: InboxItem) => {
    const unread = isUnread(it, read);
    if (it.kind === 'exam') {
      const e = it.exam;
      return (
        <EventRow
          key={it.id}
          k={k}
          unread={unread}
          badge={{ kind: 'exam', label: e.kind }}
          time={timeLabel(it.at)}
          title={examTitle(e)}
          subject={e.subject}
          extra={examPlace(e)}
          countdown={countdownLabel(e.date, now)}
          a11y={examA11y(e, { unread, now })}
          onPress={() => openItem(it)}
        />
      );
    }
    const c = it.change;
    const kind = changeKind(c.change_type) ?? 'changed';
    const diff = buildDiff(c);
    const extra = kind === 'new_week' && c.week_start ? weekStats[c.week_start] ?? null : null;
    return (
      <EventRow
        key={it.id}
        k={k}
        unread={unread}
        badge={{ kind, label: KIND_LABEL[kind] }}
        time={timeLabel(it.at)}
        title={whenTitle(c)}
        subject={diff.subject}
        extra={extra}
        diff={diff}
        a11y={changeA11y(c, { unread, extra, now })}
        onPress={() => openItem(it)}
      />
    );
  };

  const link = linkState({
    syncing: isSyncing || refreshing || s.loading, offline: !isOnline || s.failed, stamps: [s.updatedAt, lastSyncTime], now,
  });
  const history = <View style={{ marginTop: 16 }}><HistoryButton k={k} onPress={() => openHistory('/notifications')} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: k.bg }}>
      <OverlayHeader k={k} topInset={insets.top} link={link} onBack={backFromNotifications} bellActive onBell={toTop} />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 24 + (undo ? 64 : 0) }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accentText} colors={[k.accent]} progressBackgroundColor={k.surface} />
        }
      >
        <ScreenTitle k={k} title="Уведомления" lead={my ? groupLabel(my) : ''} strong={counts.all ? newLabel(counts.all) : null} />

        {!perm.granted && <PermissionRow k={k} onEnable={enablePush} />}

        {items.length === 0 ? (
          // б · уведомлений нет — без фильтров
          <>
            <View style={{ backgroundColor: k.card, borderRadius: RADIUS.lg, paddingVertical: 24, paddingHorizontal: 16, marginTop: 4 }}>
              <EmptyState k={k} icon="notifications-outline" title="Уведомлений нет" text="За последние 30 дней ничего не приходило." />
            </View>
            {history}
          </>
        ) : (
          <>
            <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 }}>
              {FILTERS.map(f => (
                <FilterChip
                  key={f.f}
                  k={k}
                  label={f.label}
                  count={counts[f.f]}
                  selected={filter === f.f}
                  onPress={() => setFilter(f.f)}
                  spoken={counts[f.f] ? `${f.label}, ${unreadSpoken(counts[f.f])}` : f.label}
                />
              ))}
              {counts[filter] > 0 && <MarkAllButton k={k} onPress={markAll} />}
            </View>

            {shown.length === 0 ? (
              // б′ · пустой фильтр — фильтры остаются
              <View style={{ backgroundColor: k.card, borderRadius: RADIUS.lg, paddingVertical: 24, paddingHorizontal: 16, marginTop: 8 }}>
                <EmptyState
                  k={k}
                  icon={filter === 'exam' ? 'school-outline' : 'calendar-outline'}
                  title={EMPTY_FILTER[filter as Exclude<Filter, 'all'>]}
                />
              </View>
            ) : (
              days.map(d => {
                const fresh = d.items.filter(it => isUnread(it, read)).length;
                return (
                  <View key={d.key} style={{ marginTop: 4 }}>
                    <DateHeader k={k} title={d.title} right={fresh ? newLabel(fresh) : null} />
                    <DayCard k={k}>{d.items.map(renderItem)}</DayCard>
                  </View>
                );
              })
            )}
            {history}
          </>
        )}
      </ScrollView>

      {undo && <UndoBar k={k} count={undo.length} onUndo={doUndo} bottom={12} />}
    </View>
  );
}

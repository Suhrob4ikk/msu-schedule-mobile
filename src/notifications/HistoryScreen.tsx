/**
 * «История изменений» в стиле «Табло» — журнал сервера (/schedule/changes),
 * без отметок «прочитано» и без влияния на счётчик.
 *
 * «Моя группа» — тот же ответ, что у Уведомлений (src/notifications/data.ts),
 * только без срока 30 дней. «Все факультеты» — один запрос на 200 записей,
 * выбор группы или факультета и «порции по 2 недели» — на телефоне (сервер
 * ни порций, ни ?before= не умеет). Выбор сегмента и группы живёт до конца сеанса.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, FlatList, Pressable, RefreshControl, StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Group } from '../api';
import { useSyncStatus } from '../SyncContext';
import { useThemeMode } from '../theme';
import { useTokens, Tokens, GUTTER, RADIUS, TOUCH_MIN, FONT } from '../schedule/tokens';
import { Txt, Divider } from '../schedule/ui';
import { linkState } from '../schedule/ScheduleHeader';
import BottomSheet from '../schedule/BottomSheet';
import { EmptyState } from '../teachers/ui';
import {
  ChangeRec, DayGroup, GroupPick, KIND_LABEL, Scope, buildDiff, changeA11y, changeDate, changeKind, changesLabel,
  groupByDay, groupLabel, groupLine, historyList, pageSlice, pickLabel, recordsLabel, shortDate, timeLabel,
  todaySummary, whenTitle,
} from './state';
import { cachedAllChanges, fetchAllChanges, loadGroups, refreshInbox, useInbox } from './data';
import { backFromHistory, openInSchedule } from './nav';
import {
  DateHeader, DayCard, EventRow, GroupPickerButton, OverlayHeader, ScreenTitle, Segment, SkeletonCard, TailNote,
} from './ui';

const atOf = (c: ChangeRec) => Date.parse(c.detected_at);
/** Сервер отдаёт не больше 200 записей — если пришло столько, раньше могли быть ещё. */
const SERVER_LIMIT = 200;

// Выбор живёт до конца сеанса (ТЗ: «запоминается на время сеанса»)
let sessionScope: Scope = 'my';
let sessionPick: GroupPick = null;

const SCOPES: Array<{ v: Scope; label: string }> = [
  { v: 'my', label: 'Моя группа' },
  { v: 'all', label: 'Все факультеты' },
];

/** Нижний лист «Все группы»: факультеты → группы; одна группа или весь факультет. */
function GroupSheet({ k, visible, onClose, groups, pick, onPick }: {
  k: Tokens; visible: boolean; onClose: () => void; groups: Group[]; pick: GroupPick; onPick: (p: GroupPick) => void;
}) {
  const faculties = useMemo(() => {
    const m = new Map<string, { code: string; name: string; groups: Group[] }>();
    for (const g of groups) {
      const f = m.get(g.faculty_code) ?? { code: g.faculty_code, name: g.faculty_name, groups: [] };
      f.groups.push(g);
      m.set(g.faculty_code, f);
    }
    return [...m.values()]
      .sort((a, b) => a.code.localeCompare(b.code, 'ru'))
      .map(f => ({ ...f, groups: f.groups.sort((a, b) => a.year - b.year || groupLabel(a).localeCompare(groupLabel(b), 'ru')) }));
  }, [groups]);

  const row = (key: string, title: string, selected: boolean, onPress: () => void, strong?: boolean, sub?: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        minHeight: TOUCH_MIN, flexDirection: 'row', alignItems: 'center', columnGap: 12,
        paddingVertical: 8, paddingHorizontal: 4, backgroundColor: pressed ? k.surface2 : 'transparent', borderRadius: RADIUS.sm,
      })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt t={strong ? 'labelStrong' : 'rowValue'} color={k.text} style={strong ? undefined : { fontFamily: FONT[500] }}>{title}</Txt>
        {sub ? <Txt t="caption" color={k.textSecondary}>{sub}</Txt> : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={22} color={k.accentText} /> : null}
    </Pressable>
  );

  const isFac = (code: string) => !!pick && 'faculty' in pick && pick.faculty === code;
  const isGroup = (id: number) => !!pick && 'group' in pick && pick.group === id;
  const choose = (p: GroupPick) => { onPick(p); onClose(); };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Txt t="titleCard" color={k.text} accessibilityRole="header">Группа</Txt>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Закрыть"
        style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center', marginRight: -12 }}
      >
        <Ionicons name="close" size={22} color={k.text} />
      </Pressable>
    </View>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} k={k} label="Выбор группы" header={header} topGap={64}>
      <View accessibilityRole="radiogroup">
        {row('all', 'Все группы', !pick, () => choose(null), true)}
        {faculties.map(f => (
          <View key={f.code} style={{ marginTop: 8 }}>
            <Divider k={k} />
            {row(`f:${f.code}`, f.code, isFac(f.code), () => choose({ faculty: f.code }), true, `${f.name} · все группы`)}
            {f.groups.map(g => row(`g:${g.id}`, groupLabel(g), isGroup(g.id), () => choose({ group: g.id })))}
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

export default function HistoryScreen() {
  const k = useTokens();
  const { mode } = useThemeMode();
  const insets = useSafeAreaInsets();
  const { isOnline, isSyncing, lastSyncTime } = useSyncStatus();
  const inbox = useInbox();

  const [now, setNow] = useState(() => new Date());
  const [scope, setScopeState] = useState<Scope>(sessionScope);
  const [pick, setPickState] = useState<GroupPick>(sessionPick);
  const [pages, setPages] = useState(1);
  const [sheet, setSheet] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // «Все факультеты»: undefined — не читали; null — кэша нет
  const [all, setAll] = useState<ChangeRec[] | null | undefined>(undefined);
  const allRef = useRef(all);
  allRef.current = all;
  const [allState, setAllState] = useState<{ loading: boolean; failed: boolean; at: Date | null }>({ loading: false, failed: false, at: null });

  const loadAll = useCallback(async (force = false) => {
    if (allRef.current === undefined) {
      const c = await cachedAllChanges();
      if (allRef.current === undefined) setAll(c);
    }
    setAllState(st => ({ ...st, loading: true }));
    try {
      const data = await fetchAllChanges(force);
      setAll(data);
      setAllState({ loading: false, failed: false, at: new Date() });
    } catch {
      setAllState(st => ({ ...st, loading: false, failed: true }));
    }
  }, []);

  const setScope = useCallback((v: Scope) => {
    sessionScope = v;
    setScopeState(v);
    setPages(1);
    if (v === 'all') loadAll();
  }, [loadAll]);
  const setPick = useCallback((p: GroupPick) => { sessionPick = p; setPickState(p); setPages(1); }, []);

  const listRef = useRef<FlatList<DayGroup<ChangeRec>>>(null);
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      refreshInbox();
      loadGroups().then(setGroups);
      if (sessionScope === 'all') loadAll();
      StatusBar.setBarStyle(mode === 'dark' ? 'light-content' : 'dark-content');
      const back = BackHandler.addEventListener('hardwareBackPress', () => { backFromHistory(); return true; });
      return () => {
        back.remove();
        StatusBar.setBarStyle(k.onAccent === '#FFFFFF' ? 'light-content' : 'dark-content');
      };
    }, [mode, k.onAccent, loadAll]),
  );

  // Сменили сегмент или группу — к началу списка
  useEffect(() => { listRef.current?.scrollToOffset({ offset: 0, animated: false }); }, [scope, pick]);

  const groupsById = useMemo(() => new Map(groups.map(g => [g.id, g])), [groups]);
  const my = groupsById.get(inbox.groupId ?? -1) ?? null;
  const source = scope === 'my' ? inbox.changes : all;
  const list = useMemo(() => historyList(source ?? [], scope, my, pick, groupsById), [source, scope, my, pick, groupsById]);
  const paged = useMemo(() => pageSlice(list, atOf, pages), [list, pages]);
  const days = useMemo(() => groupByDay(paged.shown, atOf, now), [paged.shown, now]);

  const failed = scope === 'my' ? inbox.failed : allState.failed;
  const loading = scope === 'my' ? inbox.loading : allState.loading;
  const offline = !isOnline || failed;
  const noData = source == null; // ни кэша, ни ответа

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (scope === 'my') await refreshInbox({ force: true }).catch(() => null);
    else await loadAll(true);
    setNow(new Date());
    setRefreshing(false);
  }, [scope, loadAll]);

  const retry = useCallback(() => {
    if (scope === 'my') refreshInbox({ force: true });
    else loadAll(true);
  }, [scope, loadAll]);

  /** Группа, чьё расписание открыть для «новой недели» факультета. */
  const weekGroup = useCallback((faculty: string): number | null => {
    if (my && my.faculty_code === faculty) return my.id;
    if (pick && 'group' in pick && groupsById.get(pick.group)?.faculty_code === faculty) return pick.group;
    const first = groups.filter(g => g.faculty_code === faculty).sort((a, b) => a.year - b.year)[0];
    return first?.id ?? null;
  }, [my, pick, groups, groupsById]);

  const onRow = useCallback((c: ChangeRec): (() => void) | undefined => {
    if (changeKind(c.change_type) === 'new_week') {
      const gid = weekGroup(c.faculty_code);
      return gid == null ? undefined : () => openInSchedule({ group: gid, weekStart: c.week_start, back: 'changes' });
    }
    if (c.group_id == null) return undefined;
    const gid = c.group_id;
    return () => openInSchedule({ group: gid, weekStart: c.week_start, date: changeDate(c), pair: c.pair_number, back: 'changes' });
  }, [weekGroup]);

  const renderRow = (c: ChangeRec) => {
    const kind = changeKind(c.change_type) ?? 'changed';
    const diff = buildDiff(c);
    const line = scope === 'all' ? groupLine(c, groupsById) : null;
    const mine = scope === 'all' && my != null && c.group_id === my.id;
    return (
      <EventRow
        key={c.id}
        k={k}
        unread={false}
        badge={{ kind, label: KIND_LABEL[kind] }}
        time={timeLabel(atOf(c))}
        group={line}
        groupMine={mine}
        title={whenTitle(c)}
        subject={diff.subject}
        diff={diff}
        a11y={changeA11y(c, { unread: false, group: line ? `${line}${mine ? ', ваша группа' : ''}` : null, now })}
        onPress={onRow(c)}
      />
    );
  };

  const link = linkState({
    syncing: isSyncing || refreshing || loading,
    offline,
    stamps: [scope === 'my' ? inbox.updatedAt : allState.at, lastSyncTime],
    now,
  });

  const lead = scope === 'my' ? (my ? groupLabel(my) : '') : pickLabel(pick, groupsById);
  const header = (
    <View>
      <ScreenTitle k={k} title="История изменений" lead={lead} strong={list.length ? recordsLabel(list.length) : null} />
      <Segment k={k} items={SCOPES} value={scope} onPick={setScope} />
      {scope === 'all' && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, marginTop: 8, paddingLeft: 4 }}>
          <Txt t="small" color={k.textSecondary} style={{ fontFamily: FONT[400], flexShrink: 1 }}>{todaySummary(list, now)}</Txt>
          <GroupPickerButton k={k} label={pickLabel(pick, groupsById)} onPress={() => setSheet(true)} />
        </View>
      )}
    </View>
  );

  let empty: React.ReactNode = null;
  if (noData && offline && !loading) {
    // е · нет сети и нет сохранённых записей
    empty = (
      <View style={{ paddingTop: 48 }}>
        <EmptyState
          k={k}
          icon="cloud-offline-outline"
          title="Нет подключения"
          text="История изменений загрузится, когда появится сеть."
          action="Повторить"
          onAction={retry}
        />
      </View>
    );
  } else if (noData) {
    empty = <><SkeletonCard k={k} /><SkeletonCard k={k} /></>;
  } else if (scope === 'my' && !my && inbox.groupId == null) {
    empty = (
      <EmptyCard k={k}>
        <EmptyState
          k={k}
          icon="people-outline"
          title="Группа не выбрана"
          text="Выберите группу в Кабинете."
          action="Посмотреть все факультеты"
          onAction={() => setScope('all')}
          ghost
        />
      </EmptyCard>
    );
  } else {
    // д · изменений нет
    empty = (
      <EmptyCard k={k}>
        <EmptyState
          k={k}
          icon="time-outline"
          title="Изменений пока не было"
          action={scope === 'my' ? 'Посмотреть все факультеты' : undefined}
          onAction={() => setScope('all')}
          ghost
        />
      </EmptyCard>
    );
  }

  let footer: React.ReactNode = null;
  if (paged.shown.length && !paged.hasMore) {
    const oldest = atOf(paged.shown[paged.shown.length - 1]);
    if (offline) footer = <TailNote k={k} text={`Записи раньше ${shortDate(oldest)} загрузятся, когда появится сеть`} />;
    else if ((source?.length ?? 0) < SERVER_LIMIT) footer = <TailNote k={k} text="Более ранних записей нет" />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: k.bg }}>
      <OverlayHeader k={k} topInset={insets.top} link={link} onBack={backFromHistory} />
      <FlatList
        ref={listRef}
        data={days}
        keyExtractor={d => d.key}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 24 }}
        ListHeaderComponent={header}
        ListEmptyComponent={<>{empty}</>}
        ListFooterComponent={<>{footer}</>}
        renderItem={({ item }) => (
          <View style={{ marginTop: 4 }}>
            <DateHeader k={k} title={item.title} right={changesLabel(item.items.length)} />
            <DayCard k={k}>{item.items.map(renderRow)}</DayCard>
          </View>
        )}
        onEndReached={() => { if (paged.hasMore) setPages(p => p + 1); }}
        onEndReachedThreshold={0.6}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={k.accentText} colors={[k.accent]} progressBackgroundColor={k.surface} />
        }
      />

      <GroupSheet k={k} visible={sheet} onClose={() => setSheet(false)} groups={groups} pick={pick} onPick={setPick} />
    </View>
  );
}

function EmptyCard({ k, children }: { k: Tokens; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 12, backgroundColor: k.card, borderRadius: RADIUS.lg, paddingVertical: 24, paddingHorizontal: 16 }}>
      {children}
    </View>
  );
}


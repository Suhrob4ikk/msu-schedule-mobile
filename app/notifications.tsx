import React, { useCallback, useState } from 'react';
import { View, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Text } from '../src/OnestText';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type Colors } from '../src/theme';
import { Change, invalidateApiCache } from '../src/api';
import { getNotifHistory, markCategoryRead, notifyNotifHistoryChanged, NotifEntry } from '../src/notificationHistory';
import { loadMyChanges, markChangesSeen } from '../src/changesFeed';
import ChangeCard from '../src/ChangeCard';

type Tab = 'exam' | 'change';

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; color: (C: Colors) => string }[] = [
  { key: 'exam', label: 'Зачёты и экзамены', icon: 'school-outline', color: C => C.primaryText },
  { key: 'change', label: 'Изменения', icon: 'refresh-outline', color: C => C.statusSync },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

/**
 * «Зачёты и экзамены» — локальный журнал напоминаний (src/notificationHistory.ts).
 * «Изменения» — лента своей группы с сервера, вместе с «новой неделей»
 * (src/changesFeed.ts): раньше и она была локальным журналом пришедших push
 * и почти всегда пустовала — смахнутый push в журнал не попадал.
 */
export default function NotificationsScreen() {
  const C = useTheme();
  const [exams, setExams] = useState<NotifEntry[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [tab, setTab] = useState<Tab>('exam');
  const [refreshing, setRefreshing] = useState(false);

  const loadChanges = useCallback(async () => {
    const data = await loadMyChanges();
    setChanges(data);
    return data;
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getNotifHistory().then(all => {
        if (!cancelled) setExams(all.filter(e => e.category === 'exam'));
      });
      loadChanges();
      return () => { cancelled = true; };
    }, [loadChanges]),
  );

  // Открыли вкладку — считаем всё в ней прочитанным (колокольчик гаснет).
  useFocusEffect(
    useCallback(() => {
      if (tab === 'exam') {
        markCategoryRead('exam').then(() => {
          setExams(prev => prev.map(e => ({ ...e, read: true })));
        });
      } else if (changes.length) {
        markChangesSeen(changes).then(notifyNotifHistoryChanged);
      }
    }, [tab, changes]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    invalidateApiCache('/schedule/changes');
    await loadChanges().catch(() => null);
    setRefreshing(false);
  };

  const counts: Record<Tab, number> = { exam: exams.length, change: changes.length };
  const activeMeta = TABS.find(t => t.key === tab)!;

  const header = (
    <View style={s.header}>
      <Text style={[s.headerTitle, { color: C.fg }]}>Уведомления</Text>
      <View style={s.tabRow}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              activeOpacity={0.7}
              style={[s.tabChip, { backgroundColor: active ? C.primary : C.card, borderColor: active ? C.primary : C.border }]}
            >
              <Ionicons name={t.icon} size={14} color={active ? C.primaryFg : C.muted} style={{ marginRight: 6 }} />
              <Text style={[s.tabText, { color: active ? C.primaryFg : C.fg }]}>
                {t.label}{counts[t.key] > 0 ? ` · ${counts[t.key]}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const empty = (
    <View style={s.center}>
      <Ionicons name={activeMeta.icon} size={32} color={C.muted} style={{ marginBottom: 8, opacity: 0.5 }} />
      <Text style={[s.empty, { color: C.muted }]}>Пока ничего нет</Text>
    </View>
  );

  if (tab === 'change') {
    return (
      <FlatList
        style={[s.container, { backgroundColor: C.bg }]}
        contentContainerStyle={s.content}
        data={changes}
        keyExtractor={c => String(c.id)}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.primaryText}
            colors={[C.primaryText]} progressBackgroundColor={C.card}
          />
        }
        renderItem={({ item }) => <ChangeCard item={item} />}
      />
    );
  }

  return (
    <FlatList
      style={[s.container, { backgroundColor: C.bg }]}
      contentContainerStyle={s.content}
      data={exams}
      keyExtractor={e => e.id}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      renderItem={({ item }) => (
        <View style={[s.card, { backgroundColor: C.card, borderColor: C.border, borderLeftColor: activeMeta.color(C) }]}>
          <View style={s.cardTop}>
            <Text style={[s.title, { color: C.fg }]}>{item.title}</Text>
            {!item.read && <View style={[s.unreadDot, { backgroundColor: activeMeta.color(C) }]} />}
          </View>
          <Text style={[s.body, { color: C.muted }]}>{item.body}</Text>
          <Text style={[s.time, { color: C.muted }]}>{formatDate(item.date)}</Text>
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  center: { paddingVertical: 48, alignItems: 'center', justifyContent: 'center' },
  header: { marginBottom: 16 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  tabRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  tabChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  tabText: { fontSize: 12, fontWeight: '600' },
  card: { borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 0.5, borderLeftWidth: 3, elevation: 1, shadowOpacity: 0.04, shadowRadius: 3 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 14, fontWeight: '700', flex: 1 },
  unreadDot: { width: 7, height: 7, borderRadius: 3.5 },
  body: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  time: { fontSize: 11, marginTop: 8 },
  empty: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
});

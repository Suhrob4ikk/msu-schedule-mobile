import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme';
import { getNotifHistory, markCategoryRead, NotifCategory, NotifEntry } from '../src/notificationHistory';

const TABS: { key: NotifCategory; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'exam', label: 'Зачёты и экзамены', icon: 'school-outline', color: '#2563EB' },
  { key: 'change', label: 'Изменения', icon: 'refresh-outline', color: '#f59e0b' },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export default function NotificationsScreen() {
  const C = useTheme();
  const [entries, setEntries] = useState<NotifEntry[]>([]);
  const [tab, setTab] = useState<NotifCategory>('exam');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getNotifHistory().then(all => { if (!cancelled) setEntries(all); });
      return () => { cancelled = true; };
    }, []),
  );

  // Открыл вкладку — считаем всё в ней прочитанным (бейдж в кабинете гаснет).
  useFocusEffect(
    useCallback(() => {
      markCategoryRead(tab).then(() => {
        setEntries(prev => prev.map(e => (e.category === tab ? { ...e, read: true } : e)));
      });
    }, [tab]),
  );

  const counts: Record<NotifCategory, number> = {
    exam: entries.filter(e => e.category === 'exam').length,
    change: entries.filter(e => e.category === 'change').length,
    other: entries.filter(e => e.category === 'other').length,
  };
  const list = entries.filter(e => e.category === tab);
  const activeMeta = TABS.find(t => t.key === tab)!;

  return (
    <FlatList
      style={[s.container, { backgroundColor: C.bg }]}
      contentContainerStyle={s.content}
      data={list}
      keyExtractor={e => e.id}
      ListHeaderComponent={
        <View style={s.header}>
          <Text style={[s.headerTitle, { color: C.fg }]}>Уведомления</Text>
          <Text style={[s.headerSub, { color: C.muted }]}>
            То, что приходило на телефон — напоминания и изменения расписания. Хранится только на этом устройстве.
          </Text>
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
      }
      ListEmptyComponent={
        <View style={s.center}>
          <Ionicons name={activeMeta.icon} size={32} color={C.muted} style={{ marginBottom: 8, opacity: 0.5 }} />
          <Text style={[s.empty, { color: C.muted }]}>Пока пусто</Text>
          <Text style={[s.emptySub, { color: C.muted }]}>
            {tab === 'exam'
              ? 'Здесь появятся напоминания, как только они будут запланированы.'
              : 'Здесь появятся уведомления об изменениях в расписании.'}
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const meta = TABS.find(t => t.key === item.category) ?? { color: C.muted };
        return (
          <View style={[s.card, { backgroundColor: C.card, borderColor: C.border, borderLeftColor: meta.color }]}>
            <View style={s.cardTop}>
              <Text style={[s.title, { color: C.fg }]}>{item.title}</Text>
              {!item.read && <View style={[s.unreadDot, { backgroundColor: meta.color }]} />}
            </View>
            <Text style={[s.body, { color: C.muted }]}>{item.body}</Text>
            <Text style={[s.time, { color: C.muted }]}>{formatDate(item.date)}</Text>
          </View>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  center: { paddingVertical: 48, alignItems: 'center', justifyContent: 'center' },
  header: { marginBottom: 16 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 2, lineHeight: 17 },
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
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 4, paddingHorizontal: 24, lineHeight: 18 },
});

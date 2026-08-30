import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, invalidateApiCache, Change, shortGroupName } from '../src/api';
import { useTheme } from '../src/theme';

const CHANGE_TYPE_LABELS: Record<string, string> = {
  added: 'Добавлено',
  removed: 'Удалено',
  changed: 'Изменено',
  new_week: 'Новая неделя',
};

const CHANGE_TYPE_COLORS: Record<string, string> = {
  added: '#22c55e',
  removed: '#ef4444',
  changed: '#f59e0b',
  new_week: '#3b82f6',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

const CHANGE_DAY_OFFSET: Record<string, number> = {
  понедельник: 0, вторник: 1, среда: 2, четверг: 3, пятница: 4, суббота: 5, воскресенье: 6,
};

// Точная дата изменения: начало недели + день («08.09»)
function changeDate(c: { week_start?: string | null; day_of_week?: string | null }): string {
  if (!c.week_start || !c.day_of_week) return '';
  const d = new Date(c.week_start + 'T00:00:00');
  d.setDate(d.getDate() + (CHANGE_DAY_OFFSET[c.day_of_week] ?? 0));
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ChangesScreen() {
  const C = useTheme();
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profileGroupId, setProfileGroupId] = useState<number | null>(null);
  const [profileGroupLabel, setProfileGroupLabel] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);

  const load = async (groupId: number | null, silent = false) => {
    setError(null);
    const cacheKey = `cache_changes_${groupId ?? 'all'}`;

    // Лента изменений тоже сохраняется на устройстве: без этого экран в
    // офлайне был просто ошибкой, а при живой сети — спиннером на всё время
    // ответа спящего Render.
    let fromCache = false;
    if (!silent) {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) { setChanges(JSON.parse(cached)); fromCache = true; }
      } catch { /* битый кэш — подождём сервер */ }
      if (fromCache) setLoading(false);
    }

    try {
      const data = await api.getChanges(groupId ?? undefined);
      setChanges(data);
      AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => null);
      // Отмечаем момент просмотра — по нему в кабинете гаснет бейдж «новое».
      if (data[0]?.detected_at) await AsyncStorage.setItem('changes_last_seen', data[0].detected_at);
    } catch {
      if (!fromCache) setError('Не удалось загрузить изменения');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem('selected_group_id');
      let id: number | null = null;
      if (saved) {
        id = Number(saved);
        setProfileGroupId(id);
        setOnlyMine(true); // группа выбрана — по умолчанию фильтруем на неё
      }
      // Ленту грузим сразу. Раньше здесь сначала ЖДАЛИ список групп ради
      // подписи над фильтром — из-за этого сам список изменений появлялся
      // на один round-trip позже, чем мог бы.
      load(id);
      if (id !== null) {
        api.getGroups()
          .then(groups => {
            const g = groups.find(x => x.id === id);
            if (g) setProfileGroupLabel(`${shortGroupName(g.name)} · ${g.year} курс`);
          })
          .catch(() => null);
      }
    })();
  }, []);

  const selectMine = () => { setOnlyMine(true); load(profileGroupId); };
  const selectAll = () => { setOnlyMine(false); load(null); };
  // Сбрасываем кэш в памяти: лента изменений — ровно то, ради чего тянут экран.
  const onRefresh = () => {
    setRefreshing(true);
    invalidateApiCache('/schedule/changes');
    load(onlyMine ? profileGroupId : null, true);
  };

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: C.bg }]}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={[s.container, { backgroundColor: C.bg }]}
      contentContainerStyle={s.content}
      data={changes}
      keyExtractor={c => String(c.id)}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={C.primary}
          colors={[C.primary]} progressBackgroundColor={C.card}
        />
      }
      ListHeaderComponent={
        <View style={s.header}>
          <Text style={[s.headerTitle, { color: C.fg }]}>История изменений</Text>
          <Text style={[s.headerSub, { color: C.muted }]}>Здесь видно что изменилось в расписании с последнего обновления.</Text>
          {profileGroupId != null && (
            <View style={s.filterRow}>
              <TouchableOpacity
                onPress={selectMine}
                activeOpacity={0.7}
                style={[s.filterChip, { backgroundColor: onlyMine ? C.primary : C.card, borderColor: onlyMine ? C.primary : C.border }]}
              >
                <Text style={[s.filterText, { color: onlyMine ? '#fff' : C.fg }]}>
                  Моя группа{profileGroupLabel ? ` · ${profileGroupLabel}` : ''}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={selectAll}
                activeOpacity={0.7}
                style={[s.filterChip, { backgroundColor: !onlyMine ? C.primary : C.card, borderColor: !onlyMine ? C.primary : C.border }]}
              >
                <Text style={[s.filterText, { color: !onlyMine ? '#fff' : C.fg }]}>Все факультеты</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        error ? (
          <View style={s.center}>
            <Text style={s.error}>{error}</Text>
            <TouchableOpacity onPress={() => load(onlyMine ? profileGroupId : null)} style={[s.retryBtn, { backgroundColor: C.primary }]}>
              <Text style={s.retryText}>Повторить</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.center}>
            <Text style={[s.empty, { color: C.muted }]}>
              {onlyMine ? 'У твоей группы изменений пока нет' : 'Изменений пока нет'}
            </Text>
            <Text style={[s.emptySub, { color: C.muted }]}>
              {onlyMine ? 'Старые записи видно только во «Все факультеты»' : 'Они появятся после первого обновления'}
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => {
        const color = CHANGE_TYPE_COLORS[item.change_type] || '#6b7280';
        const label = CHANGE_TYPE_LABELS[item.change_type] || item.change_type;
        return (
          <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={s.cardTop}>
              <View style={[s.typeBadge, { backgroundColor: color + '20' }]}>
                <Text style={[s.typeText, { color }]}>{label}</Text>
              </View>
              {item.faculty_code && (
                <View style={[s.facBadge, { backgroundColor: C.tag }]}>
                  <Text style={[s.facText, { color: C.fg }]}>{item.faculty_code}</Text>
                </View>
              )}
              <Text style={[s.time, { color: C.muted }]}>{formatDate(item.detected_at)}</Text>
            </View>

            {item.group_name && (
              <Text style={[s.groupName, { color: C.fg }]}>👥 {item.group_name}</Text>
            )}
            {item.day_of_week && item.pair_number && (
              <Text style={[s.meta, { color: C.muted }]}>
                {item.day_of_week.charAt(0).toUpperCase() + item.day_of_week.slice(1)}{changeDate(item) ? `, ${changeDate(item)}` : ''} · {item.pair_number} пара
              </Text>
            )}

            {item.change_type === 'removed' && item.old_value && (
              <View style={s.diffRow}>
                <Text style={[s.diffLabel, { color: C.muted }]}>Было:</Text>
                <Text style={[s.diffValue, s.removed]}>{item.old_value}</Text>
              </View>
            )}
            {item.change_type === 'added' && item.new_value && (
              <View style={s.diffRow}>
                <Text style={[s.diffLabel, { color: C.muted }]}>Добавлено:</Text>
                <Text style={[s.diffValue, s.added]}>{item.new_value}</Text>
              </View>
            )}
            {item.change_type === 'changed' && (
              <>
                {item.old_value && (
                  <View style={s.diffRow}>
                    <Text style={[s.diffLabel, { color: C.muted }]}>Было:</Text>
                    <Text style={[s.diffValue, s.removed]}>{item.old_value}</Text>
                  </View>
                )}
                {item.new_value && (
                  <View style={s.diffRow}>
                    <Text style={[s.diffLabel, { color: C.muted }]}>Стало:</Text>
                    <Text style={[s.diffValue, s.added]}>{item.new_value}</Text>
                  </View>
                )}
              </>
            )}
            {item.change_type === 'new_week' && item.new_value && (
              <Text style={[s.meta, { color: C.muted }]}>{item.new_value}</Text>
            )}
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
  headerSub: { fontSize: 12, marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  filterText: { fontSize: 12, fontWeight: '600' },
  card: { borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 0.5, elevation: 1, shadowOpacity: 0.04, shadowRadius: 3 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeText: { fontSize: 11, fontWeight: '700' },
  facBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  facText: { fontSize: 11, fontWeight: '600' },
  time: { fontSize: 11, marginLeft: 'auto' },
  groupName: { fontSize: 13, fontWeight: '600', marginBottom: 3 },
  meta: { fontSize: 12, marginBottom: 6 },
  diffRow: { flexDirection: 'row', gap: 6, marginTop: 4, alignItems: 'flex-start', flexWrap: 'wrap' },
  diffLabel: { fontSize: 12, minWidth: 52 },
  diffValue: { fontSize: 12, fontWeight: '500', flex: 1 },
  removed: { color: '#ef4444', textDecorationLine: 'line-through' },
  added: { color: '#16a34a' },
  empty: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 4 },
  error: { color: '#dc2626', textAlign: 'center', marginBottom: 16, fontSize: 14 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '600' },
});

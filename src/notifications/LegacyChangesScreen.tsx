/**
 * Прежний экран «История изменений» (до 1.9.44) — ни к чему не подключён.
 * Удалить, когда владелец скажет «оставляем» про новый (src/notifications/HistoryScreen.tsx).
 */
import React, { useState, useEffect } from 'react';
import {
  View, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from 'react-native';
import { Text } from '../OnestText';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, invalidateApiCache, Change, shortGroupName } from '../api';
import { useTheme } from '../theme';
import AppLoader from '../AppLoader';
import ChangeCard from '../ChangeCard';
import { CHANGES_SEEN_KEY } from '../changesFeed';


export default function ChangesScreen() {
  const C = useTheme();
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profileGroupId, setProfileGroupId] = useState<number | null>(null);
  const [profileGroupLabel, setProfileGroupLabel] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  // Курс по id группы — для подписи в карточке изменения. Сервер отдаёт
  // только group_id и голое название («ГЕОЛОГИЯ»), а групп с одинаковым
  // названием на разных курсах несколько — без курса не понять, о ком речь.
  const [yearByGroupId, setYearByGroupId] = useState<Record<number, number>>({});

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
      if (data[0]?.detected_at) await AsyncStorage.setItem(CHANGES_SEEN_KEY, data[0].detected_at);
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
      // Список групп нужен всегда (для курса в карточках), не только тем,
      // у кого выбрана своя группа.
      api.getGroups()
        .then(groups => {
          setYearByGroupId(Object.fromEntries(groups.map(g => [g.id, g.year])));
          if (id !== null) {
            const g = groups.find(x => x.id === id);
            if (g) setProfileGroupLabel(`${shortGroupName(g.name)} · ${g.year} курс`);
          }
        })
        .catch(() => null);
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
        <AppLoader />
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
          tintColor={C.primaryText}
          colors={[C.primaryText]} progressBackgroundColor={C.card}
        />
      }
      ListHeaderComponent={
        <View style={s.header}>
          <Text style={[s.headerTitle, { color: C.fg }]}>Изменения</Text>
          {profileGroupId != null && (
            <View style={s.filterRow}>
              <TouchableOpacity
                onPress={selectMine}
                activeOpacity={0.7}
                style={[s.filterChip, { backgroundColor: onlyMine ? C.primary : C.card, borderColor: onlyMine ? C.primary : C.border }]}
              >
                <Text style={[s.filterText, { color: onlyMine ? C.primaryFg : C.fg }]}>
                  Моя группа{profileGroupLabel ? ` · ${profileGroupLabel}` : ''}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={selectAll}
                activeOpacity={0.7}
                style={[s.filterChip, { backgroundColor: !onlyMine ? C.primary : C.card, borderColor: !onlyMine ? C.primary : C.border }]}
              >
                <Text style={[s.filterText, { color: !onlyMine ? C.primaryFg : C.fg }]}>Все факультеты</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        error ? (
          <View style={s.center}>
            <Text style={[s.error, { color: C.statusOffline }]}>{error}</Text>
            <TouchableOpacity onPress={() => load(onlyMine ? profileGroupId : null)} style={[s.retryBtn, { backgroundColor: C.primary }]}>
              <Text style={[s.retryText, { color: C.primaryFg }]}>Повторить</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.center}>
            <Text style={[s.empty, { color: C.muted }]}>Изменений пока нет</Text>
          </View>
        )
      }
      renderItem={({ item }) => <ChangeCard item={item} yearByGroupId={yearByGroupId} />}
    />
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  center: { paddingVertical: 48, alignItems: 'center', justifyContent: 'center' },
  header: { marginBottom: 16 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  filterText: { fontSize: 12, fontWeight: '600' },
  empty: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  error: { textAlign: 'center', marginBottom: 16, fontSize: 14 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  retryText: { fontWeight: '600' },
});

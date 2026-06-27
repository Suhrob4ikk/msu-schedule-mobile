import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { api, DAYS_ORDER, PAIR_TIMES } from '../src/api';
import { useTheme } from '../src/theme';

const DAY_LABELS: Record<string, string> = {
  понедельник: 'Понедельник', вторник: 'Вторник', среда: 'Среда',
  четверг: 'Четверг', пятница: 'Пятница', суббота: 'Суббота',
};

export default function RoomsScreen() {
  const C = useTheme();
  const [day, setDay] = useState('понедельник');
  const [pair, setPair] = useState('I');
  const [rooms, setRooms] = useState<{ room_name: string; is_free: boolean; occupied_by?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await api.getFreeRooms(day, pair);
      setRooms(data);
    } catch {
      setError('Не удалось загрузить данные об аудиториях');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [day, pair]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const free = rooms.filter(r => r.is_free);
  const busy = rooms.filter(r => !r.is_free);

  return (
    <ScrollView
      style={[s.container, { backgroundColor: C.bg }]}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}
    >
      <View style={s.pickerRow}>
        <View style={[s.pickerWrap, { flex: 1.5, backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[s.label, { color: C.muted }]}>День</Text>
          <Picker selectedValue={day} onValueChange={setDay} style={[s.picker, { color: C.fg }]} dropdownIconColor={C.muted}>
            {DAYS_ORDER.map(d => <Picker.Item key={d} label={DAY_LABELS[d]} value={d} color={C.fg} />)}
          </Picker>
        </View>
        <View style={[s.pickerWrap, { flex: 1, backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[s.label, { color: C.muted }]}>Пара</Text>
          <Picker selectedValue={pair} onValueChange={setPair} style={[s.picker, { color: C.fg }]} dropdownIconColor={C.muted}>
            {Object.entries(PAIR_TIMES).map(([n, [start]]) => (
              <Picker.Item key={n} label={`${n} (${start})`} value={n} color={C.fg} />
            ))}
          </Picker>
        </View>
      </View>

      <View style={[s.hint, { backgroundColor: C.tag, borderColor: C.border }]}>
        <Text style={[s.hintText, { color: C.muted }]}>ℹ️  Выберите день и номер пары — увидите свободные (🟢) и занятые (🔴) аудитории. Потяните вниз для обновления.</Text>
      </View>

      {loading && <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 32 }} />}

      {error && (
        <Text style={s.error}>{error}</Text>
      )}

      {!loading && !error && rooms.length === 0 && (
        <View style={s.empty}>
          <Text style={[s.emptyText, { color: C.muted }]}>Потяните вниз для обновления</Text>
        </View>
      )}

      {!loading && !error && (
        <>
          <Text style={[s.sectionHeader, { color: '#16a34a' }]}>🟢 Свободных: {free.length}</Text>
          {free.map(r => (
            <View key={r.room_name} style={[s.roomCard, { backgroundColor: C.greenBg, borderLeftColor: C.green }]}>
              <Text style={[s.roomName, { color: C.fg }]}>{r.room_name}</Text>
            </View>
          ))}
          {free.length === 0 && (
            <Text style={[s.noRooms, { color: C.muted }]}>Нет свободных аудиторий</Text>
          )}

          <Text style={[s.sectionHeader, { color: '#dc2626', marginTop: 12 }]}>🔴 Занятых: {busy.length}</Text>
          {busy.map(r => (
            <View key={r.room_name} style={[s.roomCard, { backgroundColor: C.redBg, borderLeftColor: C.red }]}>
              <Text style={[s.roomName, { color: C.fg }]}>{r.room_name}</Text>
              {r.occupied_by && <Text style={[s.occupiedBy, { color: C.muted }]}>{r.occupied_by}</Text>}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  pickerRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  pickerWrap: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  label: { fontSize: 11, paddingTop: 8, paddingLeft: 12 },
  picker: { height: 50 },
  sectionHeader: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  roomCard: { borderRadius: 10, padding: 12, marginBottom: 6, borderLeftWidth: 3 },
  roomName: { fontSize: 14, fontWeight: '600' },
  occupiedBy: { fontSize: 12, marginTop: 2 },
  noRooms: { fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  empty: { paddingVertical: 48, alignItems: 'center' },
  emptyText: { fontSize: 14 },
  error: { color: '#dc2626', textAlign: 'center', marginTop: 24, fontSize: 14 },
  hint: { borderRadius: 8, padding: 10, marginBottom: 12, borderWidth: 1 },
  hintText: { fontSize: 12, lineHeight: 17 },
});

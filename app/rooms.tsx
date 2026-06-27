import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { api, DAYS_ORDER, PAIR_TIMES, WeekOption, weekLabel, isCurrentWeek } from '../src/api';
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
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<WeekOption | null>(null);

  useEffect(() => {
    api.getWeeksAll()
      .then(ws => {
        setWeeks(ws);
        const cur = ws.find(w => isCurrentWeek(w.week_start)) ?? ws.find(w => w.is_latest) ?? ws[0];
        if (cur) setSelectedWeek(cur);
      })
      .catch(() => {});
  }, []);

  const load = async (silent = false, week: WeekOption | null = selectedWeek) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await api.getFreeRooms(day, pair, week?.week_start);
      setRooms(data);
    } catch {
      setError('Не удалось загрузить данные об аудиториях');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (selectedWeek) load();
  }, [day, pair, selectedWeek]);

  const switchWeek = (w: WeekOption) => {
    setSelectedWeek(w);
    load(false, w);
  };

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
            {DAYS_ORDER.filter(d => d !== 'воскресенье').map(d => <Picker.Item key={d} label={DAY_LABELS[d]} value={d} color={C.fg} />)}
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

      {/* Выбор недели */}
      {weeks.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.weekBar} contentContainerStyle={{ paddingRight: 4 }}>
          {weeks.map(w => {
            const active = selectedWeek?.week_start === w.week_start;
            const cur = isCurrentWeek(w.week_start);
            return (
              <TouchableOpacity
                key={w.week_start}
                onPress={() => switchWeek(w)}
                style={[s.weekBtn, { backgroundColor: active ? C.primary : C.card, borderColor: active ? C.primary : C.border }]}
              >
                <Text style={[s.weekBtnText, { color: active ? '#fff' : C.fg }]}>{weekLabel(w.week_start)}</Text>
                {cur && <View style={[s.weekDot, { backgroundColor: active ? 'rgba(255,255,255,0.7)' : C.primary }]} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <View style={[s.hint, { backgroundColor: C.tag, borderColor: C.border }]}>
        <Text style={[s.hintText, { color: C.muted }]}>Выберите день и номер пары — увидите свободные и занятые аудитории. Потяните вниз для обновления.</Text>
      </View>

      {loading && <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 32 }} />}

      {error && (
        <Text style={s.error}>{error}</Text>
      )}

      {!loading && !error && (
        <>
          <Text style={[s.sectionHeader, { color: '#16a34a' }]}>Свободных: {free.length}</Text>
          {free.map(r => (
            <View key={r.room_name} style={[s.roomCard, { backgroundColor: C.greenBg, borderLeftColor: C.green }]}>
              <Text style={[s.roomName, { color: C.fg }]}>{r.room_name}</Text>
            </View>
          ))}
          {free.length === 0 && (
            <Text style={[s.noRooms, { color: C.muted }]}>Нет свободных аудиторий</Text>
          )}

          <Text style={[s.sectionHeader, { color: '#dc2626', marginTop: 12 }]}>Занятых: {busy.length}</Text>
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
  pickerRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  pickerWrap: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  label: { fontSize: 11, paddingTop: 8, paddingLeft: 12 },
  picker: { height: 50 },

  weekBar: { flexGrow: 0, marginBottom: 10 },
  weekBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 10, marginRight: 8, borderWidth: 1,
  },
  weekBtnText: { fontSize: 12, fontWeight: '500' },
  weekDot: { width: 6, height: 6, borderRadius: 3 },

  sectionHeader: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  roomCard: { borderRadius: 10, padding: 12, marginBottom: 6, borderLeftWidth: 3 },
  roomName: { fontSize: 14, fontWeight: '600' },
  occupiedBy: { fontSize: 12, marginTop: 2 },
  noRooms: { fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  error: { color: '#dc2626', textAlign: 'center', marginTop: 24, fontSize: 14 },
  hint: { borderRadius: 8, padding: 10, marginBottom: 12, borderWidth: 1 },
  hintText: { fontSize: 12, lineHeight: 17 },
});

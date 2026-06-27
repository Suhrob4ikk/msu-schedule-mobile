import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { api, Group, shortGroupName } from '../src/api';
import { useTheme } from '../src/theme';

type Props = { onDone?: () => void };

export default function OnboardingScreen({ onDone }: Props = {}) {
  const C = useTheme();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<Group | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getGroups()
      .then(g => { setGroups(g); setLoading(false); })
      .catch(() => { setError('Нет соединения с сервером'); setLoading(false); });
  }, []);

  const initials = name.trim()
    ? name.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const handleStart = async () => {
    if (!selected) return;
    setSaving(true);
    await AsyncStorage.setItem('selected_group_id', String(selected.id));
    await AsyncStorage.setItem('user_name', name.trim());
    let deviceId = await AsyncStorage.getItem('msu_device_id');
    if (!deviceId) {
      deviceId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      await AsyncStorage.setItem('msu_device_id', deviceId);
    }
    await api.registerUser(deviceId, name.trim() || 'Аноним', selected.id).catch(() => null);
    setSaving(false);
    if (onDone) { onDone(); } else { router.replace('/'); }
  };

  const byFaculty = (fac: string) => groups.filter(g => g.faculty_code === fac);

  return (
    <ScrollView
      style={[s.root, { backgroundColor: C.bg }]}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar barStyle="dark-content" />

      {/* Лого */}
      <View style={s.logoRow}>
        <View style={[s.logoBox, { backgroundColor: C.primary }]}>
          <Text style={s.logoText}>МГУ</Text>
        </View>
        <View>
          <Text style={[s.logoTitle, { color: C.fg }]}>МГУ Душанбе</Text>
          <Text style={[s.logoSub, { color: C.muted }]}>Расписание занятий</Text>
        </View>
      </View>

      {/* Аватар */}
      <View style={[s.avatar, { backgroundColor: C.primary, opacity: name.trim() ? 1 : 0.35 }]}>
        <Text style={s.avatarText}>{initials}</Text>
      </View>
      {name.trim() && <Text style={[s.displayName, { color: C.fg }]}>{name.trim()}</Text>}
      {selected && (
        <Text style={[s.displayGroup, { color: C.muted }]}>
          {selected.year} курс · {shortGroupName(selected.name)}
        </Text>
      )}

      <View style={s.form}>
        <Text style={[s.label, { color: C.muted }]}>ИМЯ</Text>
        <TextInput
          style={[s.input, { backgroundColor: C.card, borderColor: C.border, color: C.fg }]}
          placeholder="Введи своё имя..."
          placeholderTextColor={C.muted}
          value={name}
          onChangeText={setName}
          autoFocus
          returnKeyType="done"
        />

        <Text style={[s.label, { color: C.muted, marginTop: 16 }]}>ГРУППА</Text>

        {loading && <ActivityIndicator color={C.primary} style={{ marginVertical: 12 }} />}
        {error && <Text style={s.errorText}>{error}</Text>}

        {!loading && !error && (
          <>
            {(['ЕНФ', 'ГФ'] as const).map(fac => (
              <View key={fac}>
                <Text style={[s.facLabel, { color: C.muted }]}>
                  {fac === 'ЕНФ' ? 'Естественнонаучный факультет' : 'Гуманитарный факультет'}
                </Text>
                {byFaculty(fac).map(g => (
                  <TouchableOpacity
                    key={g.id}
                    style={[
                      s.groupItem,
                      { backgroundColor: C.card, borderColor: C.border },
                      selected?.id === g.id && { backgroundColor: C.blueBg, borderColor: C.primary },
                    ]}
                    onPress={() => setSelected(g)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      s.groupText,
                      { color: C.fg },
                      selected?.id === g.id && { color: C.primary, fontWeight: '600' },
                    ]}>
                      {g.year} курс — {shortGroupName(g.name)}
                    </Text>
                    {selected?.id === g.id && (
                      <Text style={[s.checkmark, { color: C.primary }]}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </>
        )}

        <TouchableOpacity
          style={[s.btn, { backgroundColor: C.primary }, (!selected || saving) && s.btnDisabled]}
          onPress={handleStart}
          disabled={!selected || saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Начать</Text>
          }
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 24, paddingBottom: 60, alignItems: 'center' },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 28, marginTop: 16, alignSelf: 'flex-start' },
  logoBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  logoTitle: { fontWeight: '700', fontSize: 15 },
  logoSub: { fontSize: 12 },

  avatar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '700' },
  displayName: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  displayGroup: { fontSize: 13, marginBottom: 16 },

  form: { width: '100%', marginTop: 16 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6, textTransform: 'uppercase' },
  input: { borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, borderWidth: 0.5 },

  facLabel: { fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  groupItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13,
    marginBottom: 6, borderWidth: 0.5,
  },
  groupText: { fontSize: 14 },
  checkmark: { fontSize: 16, fontWeight: '700' },

  btn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  errorText: { color: '#dc2626', textAlign: 'center', marginVertical: 12, fontSize: 14 },
});

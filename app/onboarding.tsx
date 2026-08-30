import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { api, Group, shortGroupName } from '../src/api';
import GroupSelector from '../src/GroupSelector';
import { useTheme, useThemeMode } from '../src/theme';
import { requestNotificationPermission } from '../src/examNotifications';
import { markGroupChosen } from '../src/features';

type Props = { onDone?: () => void };

export default function OnboardingScreen({ onDone }: Props = {}) {
  const C = useTheme();
  const { mode } = useThemeMode();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<Group | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGroups = useCallback(() => {
    setLoading(true);
    setError(null);
    api.getGroups()
      .then(g => { setGroups(g); setLoading(false); })
      .catch(() => { setError('Нет соединения с сервером'); setLoading(false); });
  }, []);

  useEffect(() => { loadGroups(); }, []);

  const initials = name.trim()
    ? name.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const handleStart = async () => {
    if (!selected) return;
    setSaving(true);
    await AsyncStorage.setItem('selected_group_id', String(selected.id));
    await markGroupChosen(); // новичку про смену курса напоминать не нужно
    await AsyncStorage.setItem('user_name', name.trim());
    let deviceId = await AsyncStorage.getItem('msu_device_id');
    if (!deviceId) {
      deviceId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      await AsyncStorage.setItem('msu_device_id', deviceId);
    }
    await api.registerUser(deviceId, name.trim() || 'Аноним', selected.id).catch(() => null);
    // Запрашиваем разрешение на уведомления сразу после регистрации
    await requestNotificationPermission();
    setSaving(false);
    if (onDone) { onDone(); } else { router.replace('/'); }
  };

  return (
    <ScrollView
      style={[s.root, { backgroundColor: C.bg }]}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* У онбординга нет зелёной шапки — строка состояния лежит прямо на фоне
          экрана, поэтому её цвет зависит от темы. Раньше здесь сравнивался
          #f5f5f0 — фон из старой палитры, которого давно нет: условие никогда
          не срабатывало, и в светлой теме часы и батарея были белым по белому. */}
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />

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
        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity onPress={loadGroups} style={[s.retryBtn, { borderColor: C.primary }]}>
              <Text style={[s.retryText, { color: C.primary }]}>Повторить</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && (
          <GroupSelector groups={groups} value={selected} onChange={setSelected} C={C} />
        )}

        <TouchableOpacity
          style={[s.btn, { backgroundColor: C.primary }, (!selected || !name.trim() || saving) && s.btnDisabled]}
          onPress={handleStart}
          disabled={!selected || !name.trim() || saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Начать</Text>
          }
        </TouchableOpacity>
        {(!name.trim() || !selected) && (
          <Text style={[s.requiredHint, { color: C.muted }]}>
            {!name.trim() && !selected
              ? 'Введи имя и выбери группу'
              : !name.trim()
              ? 'Введи своё имя'
              : 'Выбери группу'}
          </Text>
        )}
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

  btn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  errorBox: { alignItems: 'center', marginVertical: 12 },
  errorText: { color: '#dc2626', textAlign: 'center', fontSize: 14, marginBottom: 10 },
  retryBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 8 },
  retryText: { fontSize: 14, fontWeight: '600' },
  requiredHint: { textAlign: 'center', fontSize: 12, marginTop: 10 },
});

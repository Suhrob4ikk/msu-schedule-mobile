import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { api, Group, shortGroupName } from '../src/api';
import { useTheme } from '../src/theme';

export default function ProfileScreen() {
  const C = useTheme();
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getGroups().then(setGroups).catch(() => {});
    AsyncStorage.multiGet(['user_name', 'selected_group_id']).then(pairs => {
      const n = pairs.find(([k]) => k === 'user_name')?.[1];
      const gid = pairs.find(([k]) => k === 'selected_group_id')?.[1];
      if (n) setName(n);
      if (gid) setSelectedGroupId(Number(gid));
    });
  }, []);

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  const initials = name.trim()
    ? name.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const handleSave = async () => {
    if (!selectedGroupId) {
      Alert.alert('Выберите группу', 'Без группы мы не сможем показать расписание.');
      return;
    }
    setSaving(true);
    await AsyncStorage.setItem('user_name', name.trim());
    await AsyncStorage.setItem('selected_group_id', String(selectedGroupId));

    let deviceId = await AsyncStorage.getItem('msu_device_id');
    if (!deviceId) {
      deviceId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      await AsyncStorage.setItem('msu_device_id', deviceId);
    }
    await api.registerUser(deviceId, name.trim() || 'Аноним', selectedGroupId);

    setSaving(false);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      router.push('/');
    }, 1000);
  };

  return (
    <ScrollView
      style={[s.container, { backgroundColor: C.bg }]}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Аватар */}
      <View style={s.avatarSection}>
        <View style={[s.avatar, { backgroundColor: C.primary, opacity: name.trim() ? 1 : 0.4 }]}>
          <Text style={s.avatarText}>{initials}</Text>
        </View>
        {name.trim() && <Text style={[s.displayName, { color: C.fg }]}>{name.trim()}</Text>}
        {selectedGroup && (
          <Text style={[s.displayGroup, { color: C.muted }]}>
            {selectedGroup.year} курс · {shortGroupName(selectedGroup.name)}
          </Text>
        )}
      </View>

      {/* Форма */}
      <View style={[s.form, { backgroundColor: C.card, borderColor: C.border }]}>
        <Text style={[s.label, { color: C.muted }]}>ИМЯ</Text>
        <TextInput
          style={[s.input, { backgroundColor: C.inputBg, borderColor: C.inputBorder, color: C.fg }]}
          placeholder="Введи своё имя..."
          placeholderTextColor={C.muted}
          value={name}
          onChangeText={setName}
          returnKeyType="done"
        />

        <Text style={[s.label, { color: C.muted, marginTop: 16 }]}>ГРУППА</Text>
        <View style={[s.pickerWrap, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
          <Picker
            selectedValue={selectedGroupId ?? ''}
            onValueChange={val => val !== '' && setSelectedGroupId(Number(val))}
            style={[s.picker, { color: C.fg }]}
            dropdownIconColor={C.muted}
          >
            <Picker.Item label="— Выберите группу —" value="" color={C.muted} />
            {(['ЕНФ', 'ГФ'] as const).map(fac =>
              groups.filter(g => g.faculty_code === fac).map(g => (
                <Picker.Item
                  key={g.id}
                  label={`${g.year} курс — ${g.name}`}
                  value={g.id}
                  color={C.fg}
                />
              ))
            )}
          </Picker>
        </View>

        <View style={[s.hint, { backgroundColor: C.tag }]}>
          <Text style={[s.hintText, { color: C.muted }]}>Укажи своё имя и выбери группу. После сохранения приложение само перейдёт на расписание.</Text>
        </View>

        <TouchableOpacity
          style={[s.saveBtn, { backgroundColor: C.primary }, (!selectedGroupId || saving) && s.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!selectedGroupId || saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.saveBtnText}>{saved ? '✓ Сохранено' : 'Сохранить'}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Инфо о приложении */}
      <View style={s.about}>
        <Text style={[s.aboutTitle, { color: C.muted }]}>МГУ Душанбе · Расписание</Text>
        <Text style={[s.aboutText, { color: C.muted }]}>Синхронизация с msu.tj каждые 2 часа</Text>
        <Text style={[s.version, { color: C.border }]}>v1.0.0</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 60 },

  avatarSection: { alignItems: 'center', marginBottom: 32, marginTop: 8 },
  avatar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '700' },
  displayName: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  displayGroup: { fontSize: 13 },

  form: { borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 0.5, elevation: 2, shadowOpacity: 0.04, shadowRadius: 6 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6, textTransform: 'uppercase' },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
  pickerWrap: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  picker: { height: 52 },

  saveBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  hint: { borderRadius: 8, padding: 10, marginBottom: 12 },
  hintText: { fontSize: 12, lineHeight: 17 },
  about: { alignItems: 'center', gap: 4 },
  aboutTitle: { fontSize: 13, fontWeight: '600' },
  aboutText: { fontSize: 12, textAlign: 'center' },
  version: { fontSize: 11, marginTop: 4 },
});

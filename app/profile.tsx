import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Alert, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { api, Group, shortGroupName } from '../src/api';
import { useTheme, useThemeMode } from '../src/theme';
import GroupSelector from '../src/GroupSelector';
import { Ionicons } from '@expo/vector-icons';
import { requestNotificationPermission } from '../src/examNotifications';
import * as Notifications from 'expo-notifications';
import { useSyncStatus } from '../src/SyncContext';
import { formatSyncTime } from '../src/syncService';

// Снять блокировку в сентябре 2026 — поменять на false
const FEATURES_LOCKED = true;

function NotificationRow() {
  const C = useTheme();
  const [status, setStatus] = useState<'loading' | 'granted' | 'denied' | 'default'>('loading');

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status: s }) => setStatus(s as any));
  }, []);

  const enable = async () => {
    const ok = await requestNotificationPermission();
    setStatus(ok ? 'granted' : 'denied');
  };

  if (status === 'loading') return null;

  return (
    <TouchableOpacity
      onPress={status === 'default' ? enable : undefined}
      activeOpacity={status === 'default' ? 0.7 : 1}
      style={[ft.row, { backgroundColor: C.card, borderColor: C.border }]}
    >
      <View style={ft.text}>
        <Text style={[ft.label, { color: C.fg }]}>Уведомления о зачётах / экзаменах</Text>
        <Text style={[ft.desc, { color: C.muted }]}>
          {status === 'granted'
            ? 'Придёт напоминание накануне и в день зачёта'
            : status === 'denied'
            ? 'Разрешите уведомления в настройках телефона'
            : 'Нажмите чтобы включить напоминания о зачётах'}
        </Text>
      </View>
      <View style={[ft.track, { backgroundColor: status === 'granted' ? C.primary : C.border }]}>
        <View style={[ft.thumb, { transform: [{ translateX: status === 'granted' ? 20 : 2 }] }]} />
      </View>
    </TouchableOpacity>
  );
}

function FeatureToggle({ label, description, storageKey }: { label: string; description: string; storageKey: string }) {
  const C = useTheme();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(storageKey).then(v => setEnabled(v === '1'));
  }, [storageKey]);
  const toggle = async () => {
    if (FEATURES_LOCKED) return;
    const next = !enabled;
    setEnabled(next);
    await AsyncStorage.setItem(storageKey, next ? '1' : '0');
  };
  return (
    <TouchableOpacity
      onPress={toggle}
      style={[ft.row, { backgroundColor: C.card, borderColor: C.border, opacity: FEATURES_LOCKED ? 0.6 : 1 }]}
      activeOpacity={FEATURES_LOCKED ? 1 : 0.7}
    >
      <View style={ft.text}>
        <View style={ft.labelRow}>
          <Text style={[ft.label, { color: C.fg }]}>{label}</Text>
          {FEATURES_LOCKED && (
            <View style={[ft.badge, { backgroundColor: C.tag }]}>
              <Text style={[ft.badgeText, { color: C.muted }]}>С сентября</Text>
            </View>
          )}
        </View>
        <Text style={[ft.desc, { color: C.muted }]}>
          {FEATURES_LOCKED ? 'Функция откроется в сентябре 2026' : description}
        </Text>
      </View>
      <View style={[ft.track, { backgroundColor: (!FEATURES_LOCKED && enabled) ? C.primary : C.border }]}>
        <View style={[ft.thumb, { transform: [{ translateX: (!FEATURES_LOCKED && enabled) ? 20 : 2 }] }]} />
      </View>
    </TouchableOpacity>
  );
}

const ft = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, borderWidth: 0.5, marginBottom: 10 },
  text: { flex: 1, marginRight: 12 },
  label: { fontSize: 14, fontWeight: '600' },
  desc: { fontSize: 12, marginTop: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '600' },
  track: { width: 44, height: 24, borderRadius: 12, position: 'relative' },
  thumb: { position: 'absolute', top: 2, width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 },
});

export default function ProfileScreen() {
  const C = useTheme();
  const { mode, toggle } = useThemeMode();
  const { isSyncing, syncProgress, lastSyncTime, triggerSync } = useSyncStatus();
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    api.getGroups().then(setGroups).catch(() => {});
    AsyncStorage.multiGet(['user_name', 'selected_group_id']).then(pairs => {
      const n = pairs.find(([k]) => k === 'user_name')?.[1];
      const gid = pairs.find(([k]) => k === 'selected_group_id')?.[1];
      if (n) setName(n);
      if (gid) setSelectedGroupId(Number(gid));
      // Если группы нет — сразу переходим в режим редактирования
      if (!gid) setIsEditing(true);
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
    setIsEditing(false);
    setTimeout(() => {
      setSaved(false);
      router.push('/');
    }, 800);
  };

  const handleChangeGroup = () => {
    Alert.alert(
      'Изменить данные?',
      'Можно поменять имя или группу — например при переходе на новый курс.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Изменить', onPress: () => setIsEditing(true) },
      ]
    );
  };

  const handleSync = async () => {
    if (isSyncing) return;
    setSyncMsg(null);
    const ok = await triggerSync();
    setSyncMsg(ok
      ? { ok: true, text: '✓ Расписание обновлено' }
      : { ok: false, text: '✗ Не удалось обновить — проверьте интернет' });
    setTimeout(() => setSyncMsg(null), 4000);
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

      {isEditing ? (
        /* ─── Режим редактирования ─── */
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
          {groups.length === 0 ? (
            <ActivityIndicator color={C.primary} style={{ marginVertical: 12 }} />
          ) : (
            <GroupSelector
              groups={groups}
              value={groups.find(g => g.id === selectedGroupId) ?? null}
              onChange={g => setSelectedGroupId(g.id)}
              C={C}
            />
          )}

          <View style={[s.hint, { backgroundColor: C.tag }]}>
            <Text style={[s.hintText, { color: C.muted }]}>Выбери свою группу. После сохранения приложение перейдёт на расписание.</Text>
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

          {selectedGroupId && (
            <TouchableOpacity onPress={() => setIsEditing(false)} style={s.cancelBtn}>
              <Text style={[s.cancelText, { color: C.muted }]}>Отмена</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        /* ─── Режим просмотра ─── */
        <TouchableOpacity
          onPress={handleChangeGroup}
          style={[s.changeBtn, { backgroundColor: C.card, borderColor: C.border }]}
          activeOpacity={0.7}
        >
          <Ionicons name="pencil-outline" size={16} color={C.muted} style={{ marginRight: 8 }} />
          <Text style={[s.changeBtnText, { color: C.muted }]}>Изменить имя или группу</Text>
        </TouchableOpacity>
      )}

      {/* Переключение темы */}
      <TouchableOpacity
        onPress={toggle}
        style={[s.themeBtn, { backgroundColor: C.card, borderColor: C.border }]}
        activeOpacity={0.7}
      >
        <Ionicons
          name={mode === 'dark' ? 'sunny-outline' : 'moon-outline'}
          size={18}
          color={C.fg}
          style={{ marginRight: 8 }}
        />
        <Text style={[s.themeBtnText, { color: C.fg }]}>
          {mode === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        </Text>
      </TouchableOpacity>

      {/* Дополнительные возможности */}
      <View style={s.section}>
        <Text style={[s.sectionTitle, { color: C.muted }]}>Дополнительные возможности</Text>
        <NotificationRow />
        <FeatureToggle
          label="Посещаемость"
          description="Отмечать был ли на каждой паре"
          storageKey="feature_attendance"
        />
        <FeatureToggle
          label="Заметки к парам"
          description="Добавлять текстовые заметки к занятиям"
          storageKey="feature_notes"
        />
      </View>

      {/* Синхронизация */}
      <View style={s.section}>
        <Text style={[s.sectionTitle, { color: C.muted }]}>Синхронизация</Text>
        <TouchableOpacity
          onPress={handleSync}
          disabled={isSyncing}
          activeOpacity={0.7}
          style={[s.syncBtn, { backgroundColor: C.primary, opacity: isSyncing ? 0.7 : 1 }]}
        >
          {isSyncing ? (
            <>
              <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
              <Text style={s.syncBtnText}>{syncProgress || 'Синхронизация...'}</Text>
            </>
          ) : (
            <>
              <Ionicons name="refresh" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={s.syncBtnText}>Обновить расписание</Text>
            </>
          )}
        </TouchableOpacity>
        <Text
          style={[
            s.syncStatus,
            { color: syncMsg ? (syncMsg.ok ? '#16a34a' : '#dc2626') : C.muted },
          ]}
        >
          {syncMsg
            ? syncMsg.text
            : lastSyncTime
            ? `Последнее обновление: ${formatSyncTime(lastSyncTime)}`
            : 'Ещё не синхронизировано'}
        </Text>
      </View>

      {/* Режим разработчика — открывает скрытую веб-панель /dev (вход по паролю) */}
      <TouchableOpacity
        onPress={() => Linking.openURL('https://frontend-ten-nu-80.vercel.app/dev')}
        activeOpacity={0.6}
        style={{ alignSelf: 'center', paddingVertical: 8, marginBottom: 8 }}
      >
        <Text style={{ color: C.muted, fontSize: 12, opacity: 0.6 }}>Режим разработчика</Text>
      </TouchableOpacity>

      {/* Инфо о приложении */}
      <View style={s.about}>
        <Text style={[s.aboutTitle, { color: C.muted }]}>МГУ Душанбе · Расписание</Text>
        <Text style={[s.aboutText, { color: C.muted }]}>Автообновление с msu.tj каждые 2 часа</Text>
        <Text style={[s.version, { color: C.border }]}>v1.2.4</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, paddingBottom: 60 },

  avatarSection: { alignItems: 'center', marginBottom: 28, marginTop: 8 },
  avatar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '700' },
  displayName: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  displayGroup: { fontSize: 13 },

  changeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, paddingVertical: 13, marginBottom: 16, borderWidth: 0.5,
  },
  changeBtnText: { fontSize: 14, fontWeight: '500' },

  form: { borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 0.5, elevation: 2, shadowOpacity: 0.04, shadowRadius: 6 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6, textTransform: 'uppercase' },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },

  saveBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontSize: 14 },

  hint: { borderRadius: 8, padding: 10, marginTop: 16, marginBottom: 4 },
  hintText: { fontSize: 12, lineHeight: 17 },
  themeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, paddingVertical: 14, marginBottom: 24, borderWidth: 0.5,
  },
  themeBtnText: { fontSize: 15, fontWeight: '600' },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  syncBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, paddingVertical: 14,
  },
  syncBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  syncStatus: { fontSize: 12, textAlign: 'center', marginTop: 8 },
  about: { alignItems: 'center', gap: 4 },
  aboutTitle: { fontSize: 13, fontWeight: '600' },
  aboutText: { fontSize: 12, textAlign: 'center' },
  version: { fontSize: 11, marginTop: 4 },
});

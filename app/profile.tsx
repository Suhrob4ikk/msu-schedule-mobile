import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Alert, Linking, Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { api, Group, shortGroupName } from '../src/api';
import { useTheme, useThemeMode } from '../src/theme';
import GroupSelector from '../src/GroupSelector';
import { Ionicons } from '@expo/vector-icons';
import {
  requestNotificationPermission, cancelExamReminders, cancelLessonReminders,
  NOTIF_PREF_KEY, LESSON_NOTIF_PREF_KEY, MINUTES_BEFORE_LESSON,
} from '../src/examNotifications';
import * as Notifications from 'expo-notifications';
import { useSyncStatus } from '../src/SyncContext';
import { formatSyncTime } from '../src/syncService';

import { featuresUnlocked, daysUntilUnlock, markGroupChosen } from '../src/features';
import { collectSkips, collectNotes, type SkipStats as SkipStatsType } from '../src/studyData';
import { isLiveLessonEnabled, setLiveLessonEnabled } from '../src/liveLesson';

// Автооткрытие 1 сентября 2026 — см. src/features.ts.
// ВАЖНО: не выносить в константу модуля — она вычислялась бы один раз при старте
// приложения. Android держит приложение в памяти сутками, поэтому кабинет
// показывал бы «закрыто» и после 1 сентября, пока приложение не выгрузят
// полностью. Проверяем на каждый рендер экрана.

// Источник — app.json → expo.extra.webUrl (та же логика, что и API_BASE в src/api.ts)
const WEB_URL =
  (Constants.expoConfig?.extra?.webUrl as string | undefined) ??
  'https://frontend-ten-nu-80.vercel.app';

function NotificationRow() {
  const C = useTheme();
  const [status, setStatus] = useState<'loading' | 'granted' | 'denied' | 'default'>('loading');
  const [enabled, setEnabled] = useState(true); // локальный переключатель

  useEffect(() => {
    (async () => {
      const { status: s } = await Notifications.getPermissionsAsync();
      setStatus(s as any);
      const pref = await AsyncStorage.getItem(NOTIF_PREF_KEY);
      setEnabled(pref !== '0');
    })();
  }, []);

  // Включено = есть системное разрешение И не выключено локально
  const isOn = status === 'granted' && enabled;

  const onToggle = async () => {
    if (status === 'granted') {
      // Разрешение есть — переключаем локальный флаг (вкл/выкл напоминания)
      const next = !enabled;
      setEnabled(next);
      await AsyncStorage.setItem(NOTIF_PREF_KEY, next ? '1' : '0');
      if (!next) await cancelExamReminders();
    } else if (status === 'denied') {
      // Системой запрещено — отправляем в настройки телефона
      Linking.openSettings();
    } else {
      // Ещё не спрашивали — запрашиваем разрешение
      const ok = await requestNotificationPermission();
      if (ok) {
        setStatus('granted'); setEnabled(true);
        await AsyncStorage.setItem(NOTIF_PREF_KEY, '1');
      } else {
        setStatus('denied');
      }
    }
  };

  if (status === 'loading') return null;

  const desc = status === 'denied'
    ? 'Запрещены в настройках телефона — нажмите, чтобы открыть'
    : isOn
    ? 'Придёт напоминание накануне и в день зачёта'
    : status === 'granted'
    ? 'Выключено — нажмите, чтобы включить'
    : 'Нажмите, чтобы включить напоминания о зачётах';

  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      style={[ft.row, { backgroundColor: C.card, borderColor: C.border }]}
    >
      <View style={ft.text}>
        <Text style={[ft.label, { color: C.fg }]}>Уведомления о зачётах / экзаменах</Text>
        <Text style={[ft.desc, { color: C.muted }]}>{desc}</Text>
      </View>
      <View style={[ft.track, { backgroundColor: isOn ? C.primary : C.border }]}>
        <View style={[ft.thumb, { transform: [{ translateX: isOn ? 20 : 2 }] }]} />
      </View>
    </TouchableOpacity>
  );
}

/** Напоминание за 10 минут до пары. По умолчанию выключено — это уведомления
 *  по несколько раз в день, включать их за человека нельзя. */
function LessonReminderRow() {
  const C = useTheme();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(LESSON_NOTIF_PREF_KEY).then(v => setEnabled(v === '1'));
  }, []);

  const onToggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (enabled) {
        setEnabled(false);
        await AsyncStorage.setItem(LESSON_NOTIF_PREF_KEY, '0');
        await cancelLessonReminders();
      } else {
        // Без системного разрешения включать нечего — сначала спрашиваем
        const ok = await requestNotificationPermission();
        if (!ok) {
          Alert.alert('Нужно разрешение', 'Разреши уведомления в настройках телефона, иначе напоминания не придут.');
          return;
        }
        setEnabled(true);
        await AsyncStorage.setItem(LESSON_NOTIF_PREF_KEY, '1');
        // Сами напоминания встанут при следующей загрузке расписания
        Alert.alert('Готово', `Напомним за ${MINUTES_BEFORE_LESSON} минут до каждой пары. Открой расписание, чтобы напоминания встали.`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      style={[ft.row, { backgroundColor: C.card, borderColor: C.border }]}
    >
      <View style={ft.text}>
        <Text style={[ft.label, { color: C.fg }]}>Напоминать перед парой</Text>
        <Text style={[ft.desc, { color: C.muted }]}>
          {enabled
            ? `Придёт за ${MINUTES_BEFORE_LESSON} минут до начала — с предметом и аудиторией`
            : `Уведомление за ${MINUTES_BEFORE_LESSON} минут до каждой пары`}
        </Text>
      </View>
      <View style={[ft.track, { backgroundColor: enabled ? C.primary : C.border }]}>
        <View style={[ft.thumb, { transform: [{ translateX: enabled ? 20 : 2 }] }]} />
      </View>
    </TouchableOpacity>
  );
}

/** Постоянная строка «идёт пара» в шторке и в статус-баре. Тоже по умолчанию
 *  выключено: висящее уведомление без спроса — навязчиво. */
function LiveLessonRow() {
  const C = useTheme();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isLiveLessonEnabled().then(setEnabled);
  }, []);

  const onToggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const want = !enabled;
      // Вернёт false, если в разрешении на уведомления отказали
      const result = await setLiveLessonEnabled(want);
      setEnabled(result);
      if (want && !result) {
        Alert.alert('Нужно разрешение', 'Разреши уведомления в настройках телефона, иначе строка не появится.');
      } else if (want) {
        Alert.alert(
          'Готово',
          'Пока идёт пара, в шторке будет строка с предметом, аудиторией и отсчётом до конца. Появится с началом ближайшей пары.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      style={[ft.row, { backgroundColor: C.card, borderColor: C.border }]}
    >
      <View style={ft.text}>
        <Text style={[ft.label, { color: C.fg }]}>Показывать текущую пару</Text>
        <Text style={[ft.desc, { color: C.muted }]}>
          {enabled
            ? 'Предмет, аудитория и отсчёт до конца пары — видно, не открывая приложение'
            : 'Строка в шторке уведомлений, пока идёт пара'}
        </Text>
      </View>
      <View style={[ft.track, { backgroundColor: enabled ? C.primary : C.border }]}>
        <View style={[ft.thumb, { transform: [{ translateX: enabled ? 20 : 2 }] }]} />
      </View>
    </TouchableOpacity>
  );
}

function FeatureToggle({ label, description, storageKey }: { label: string; description: string; storageKey: string }) {
  const C = useTheme();
  const [enabled, setEnabled] = useState(false);
  const locked = !featuresUnlocked();
  useEffect(() => {
    AsyncStorage.getItem(storageKey).then(v => setEnabled(v === '1'));
  }, [storageKey]);
  const toggle = async () => {
    if (locked) return;
    const next = !enabled;
    setEnabled(next);
    await AsyncStorage.setItem(storageKey, next ? '1' : '0');
  };
  return (
    <TouchableOpacity
      onPress={toggle}
      style={[ft.row, { backgroundColor: C.card, borderColor: C.border, opacity: locked ? 0.6 : 1 }]}
      activeOpacity={locked ? 1 : 0.7}
    >
      <View style={ft.text}>
        <View style={ft.labelRow}>
          <Text style={[ft.label, { color: C.fg }]}>{label}</Text>
          {locked && (
            <View style={[ft.badge, { backgroundColor: C.tag }]}>
              <Text style={[ft.badgeText, { color: C.muted }]}>с 1 сентября</Text>
            </View>
          )}
        </View>
        <Text style={[ft.desc, { color: C.muted }]}>
          {locked ? `${description} · откроется 1 сентября, осталось ${daysUntilUnlock()} дн.` : description}
        </Text>
      </View>
      <View style={[ft.track, { backgroundColor: (!locked && enabled) ? C.primary : C.border }]}>
        <View style={[ft.thumb, { transform: [{ translateX: (!locked && enabled) ? 20 : 2 }] }]} />
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

/** Склонение: 1 пара, 2 пары, 5 пар */
function pluralPairs(n: number): string {
  const d10 = n % 10, d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return 'пара';
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return 'пары';
  return 'пар';
}

async function exportMyData() {
  const st = await collectSkips();
  const notes = await collectNotes();
  const lines: string[] = ['МГУ Расписание — мои данные', ''];
  if (st.total > 0) {
    lines.push(`Пропущено: ${st.total} ${pluralPairs(st.total)}`);
    st.bySubject.forEach(([s2, n]) => lines.push(`  ${s2} — ${n}`));
    lines.push('');
  }
  if (notes.length > 0) {
    lines.push('Заметки к парам:');
    notes.forEach(n => lines.push('• ' + n.slot + ': ' + n.text));
  }
  if (st.total === 0 && notes.length === 0) lines.push('Пока нет ни пропусков, ни заметок.');
  try { await Share.share({ message: lines.join('\n') }); } catch {}
}

function SkipStats() {
  const C = useTheme();
  const [st, setSt] = useState<SkipStatsType | null>(null);
  useEffect(() => { collectSkips().then(setSt).catch(() => null); }, []);
  if (!st) return null;

  // Пропусков нет — это хорошая новость, показываем её, а не пустоту
  if (st.total === 0) {
    return (
      <View style={[ft.row, { backgroundColor: C.card, borderColor: C.border, flexDirection: 'column', alignItems: 'stretch' }]}>
        <Text style={[ft.label, { color: C.fg }]}>Пропуски</Text>
        <Text style={[ft.desc, { color: C.muted }]}>
          Пока ни одного пропуска. Отмечай пропущенные пары в расписании — здесь будет видно, сколько их по каждому предмету.
        </Text>
      </View>
    );
  }

  return (
    <View style={[ft.row, { backgroundColor: C.card, borderColor: C.border, flexDirection: 'column', alignItems: 'stretch' }]}>
      <Text style={[ft.label, { color: C.fg }]}>Пропуски</Text>
      <Text style={[ft.desc, { color: C.muted }]}>
        Всего пропущено: <Text style={{ color: '#d43a40', fontWeight: '700' }}>{st.total} {pluralPairs(st.total)}</Text>
      </Text>
      <View style={{ marginTop: 10, gap: 4 }}>
        {st.bySubject.map(([subject, n]) => (
          <View key={subject} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ fontSize: 12, color: C.fg, flex: 1 }} numberOfLines={1}>{subject}</Text>
            <Text style={{ fontSize: 12, color: C.muted }}>{n}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

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
  // Считаем на каждый рендер, а не один раз при старте приложения — см.
  // комментарий у импорта featuresUnlocked.
  const featuresLocked = !featuresUnlocked();

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
    // Отмечаем момент выбора: по нему решаем, спрашивать ли про курс после
    // смены учебного года (новичков спрашивать не нужно).
    await markGroupChosen();
    // Сменили СВОЮ группу — сбрасываем «какую смотрю», чтобы расписание открылось на новой
    await AsyncStorage.removeItem('schedule_view_group_id');

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
        <LessonReminderRow />
        <LiveLessonRow />
        <FeatureToggle
          label="Пропуски"
          description="Отмечай только пары, которые пропустил. Здесь будет видно, сколько пропусков накопилось по каждому предмету"
          storageKey="feature_attendance"
        />
        <FeatureToggle
          label="Заметки к парам"
          description="Домашка и что принести. Заметку можно закрепить за парой — тогда она появится в этот день каждую неделю"
          storageKey="feature_notes"
        />
      </View>

      {/* Статистика, экспорт и история изменений */}
      <View style={s.section}>
        {!featuresLocked && <SkipStats />}
        {!featuresLocked && (
          <TouchableOpacity
            onPress={exportMyData}
            activeOpacity={0.7}
            style={[s.changeBtn, { backgroundColor: C.card, borderColor: C.border, marginBottom: 10 }]}
          >
            <Ionicons name="share-outline" size={16} color={C.muted} style={{ marginRight: 8 }} />
            <Text style={[s.changeBtnText, { color: C.muted }]}>Поделиться заметками и посещаемостью</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => router.push('/changes')}
          activeOpacity={0.7}
          style={[s.changeBtn, { backgroundColor: C.card, borderColor: C.border, marginBottom: 0 }]}
        >
          <Ionicons name="time-outline" size={16} color={C.muted} style={{ marginRight: 8 }} />
          <Text style={[s.changeBtnText, { color: C.muted }]}>История изменений расписания</Text>
        </TouchableOpacity>
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
        onPress={() => Linking.openURL(`${WEB_URL}/dev`)}
        activeOpacity={0.6}
        style={{ alignSelf: 'center', paddingVertical: 8, marginBottom: 8 }}
      >
        <Text style={{ color: C.muted, fontSize: 12, opacity: 0.6 }}>Режим разработчика</Text>
      </TouchableOpacity>

      {/* Инфо о приложении */}
      <View style={s.about}>
        <Text style={[s.aboutTitle, { color: C.muted }]}>МГУ Душанбе · Расписание</Text>
        <Text style={[s.aboutText, { color: C.muted }]}>Автообновление с msu.tj каждые 2 часа</Text>
        <Text style={[s.version, { color: C.border }]}>v1.9.0</Text>
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

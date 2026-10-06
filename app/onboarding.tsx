/**
 * Первый вход в стиле «Табло»: имя, группа и цвет приложения. Цвет по умолчанию —
 * изумруд; выбрать другой можно тут же, а потом изменить в любое время:
 * Кабинет → «Внешний вид».
 */
import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StatusBar, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { api, Group, shortGroupName, rememberGroup } from '../src/api';
import GroupSelector from '../src/GroupSelector';
import { useThemeMode } from '../src/theme';
import type { Colors } from '../src/theme';
import { requestNotificationPermission } from '../src/examNotifications';
import { syncWithServer } from '../src/pushToken';
import { markGroupChosen } from '../src/features';
import { NAME_MAX, setUserName } from '../src/userName';
import { useTokens, RADIUS, TOUCH_MIN, type as typeStyle } from '../src/schedule/tokens';
import { ACCENT_PRESETS, AccentPresetId } from '../src/schedule/colors';
import { Txt } from '../src/schedule/ui';
import { setAppearance, useSelectedAppearance } from '../src/appearance';

type Props = { onDone?: () => void };

export default function OnboardingScreen({ onDone }: Props = {}) {
  const k = useTokens();
  const { mode } = useThemeMode();
  const look = useSelectedAppearance();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selected, setSelected] = useState<Group | null>(null);
  const [name, setName] = useState('');
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Новичку по умолчанию — изумруд (у кого уже есть настройки, сюда не попадают)
  useEffect(() => {
    setAppearance(prev => (prev.accent.preset === 'blue' && !prev.accent.custom
      ? { ...prev, accent: { preset: 'emerald', custom: null } } : prev));
  }, []);

  const loadGroups = useCallback(() => {
    setLoading(true);
    setError(null);
    api.getGroups()
      .then(g => { setGroups(g); setLoading(false); })
      .catch(() => { setError('Нет соединения с сервером'); setLoading(false); });
  }, []);
  useEffect(() => { loadGroups(); }, [loadGroups]);

  const pickAccent = (id: AccentPresetId) => setAppearance(prev => ({ ...prev, accent: { preset: id, custom: null } }));

  const ready = !!selected && !!name.trim() && !saving;

  const handleStart = async () => {
    if (!selected) return;
    setSaving(true);
    await AsyncStorage.setItem('selected_group_id', String(selected.id));
    // Рядом с номером запоминаем название и курс: если номер когда-нибудь
    // разойдётся со списком групп, восстановимся по ним (см. src/api.ts).
    await rememberGroup(selected);
    await markGroupChosen(); // новичку про смену курса напоминать не нужно
    await setUserName(name);
    let deviceId = await AsyncStorage.getItem('msu_device_id');
    if (!deviceId) {
      deviceId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      await AsyncStorage.setItem('msu_device_id', deviceId);
    }
    await api.registerUser(deviceId, name.trim() || 'Аноним', selected.id).catch(() => null);
    // Разрешение на уведомления — сразу после регистрации, и тут же push-токен,
    // чтобы об изменении расписания узнать мгновенно.
    await requestNotificationPermission();
    await syncWithServer(true);
    setSaving(false);
    if (onDone) { onDone(); } else { router.replace('/'); }
  };

  // GroupSelector общий со старыми экранами и ждёт старую палитру — даём её из токенов
  const legacy = {
    primary: k.accent, primaryFg: k.onAccent, card: k.surface2, border: k.border, fg: k.text, muted: k.textSecondary,
  } as unknown as Colors;

  const hint = !name.trim() && !selected ? 'Введите имя и выберите группу' : !name.trim() ? 'Введите имя' : !selected ? 'Выберите группу' : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: k.bg }}
      contentContainerStyle={{ padding: 16, paddingTop: 40, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Лого и приветствие */}
      <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 12 }}>
        <View style={{ width: 48, height: 48, borderRadius: RADIUS.md, backgroundColor: k.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Txt t="labelStrong" color={k.onAccent}>МГУ</Txt>
        </View>
        <View style={{ flex: 1 }}>
          <Txt t="titleCard" color={k.text}>МГУ Душанбе</Txt>
          <Txt t="small" color={k.textSecondary}>Расписание занятий</Txt>
        </View>
      </View>
      <Txt t="display" color={k.text} style={{ fontSize: 30, lineHeight: 36, letterSpacing: 0, marginTop: 28 }}>Добро пожаловать</Txt>
      <Txt t="body" color={k.textSecondary} style={{ marginTop: 4 }}>Три шага, и расписание ваше.</Txt>

      {/* 1. Имя */}
      <View style={{ backgroundColor: k.surface, borderRadius: RADIUS.lg, padding: 16, marginTop: 20, rowGap: 8 }}>
        <Txt t="overline" color={k.textSecondary}>Имя</Txt>
        <TextInput
          value={name}
          onChangeText={setName}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Как вас зовут"
          placeholderTextColor={k.textSecondary}
          returnKeyType="done"
          maxLength={NAME_MAX}
          maxFontSizeMultiplier={2}
          accessibilityLabel="Имя"
          style={[typeStyle(16, 22, 500), {
            color: k.text, backgroundColor: k.surface2, borderRadius: 14, minHeight: TOUCH_MIN,
            paddingHorizontal: 14, borderWidth: 2, borderColor: focused ? k.accentText : 'transparent',
          }]}
        />
      </View>

      {/* 2. Группа */}
      <View style={{ backgroundColor: k.surface, borderRadius: RADIUS.lg, padding: 16, marginTop: 12 }}>
        <Txt t="overline" color={k.textSecondary} style={{ marginBottom: 8 }}>Группа</Txt>
        {loading && <ActivityIndicator color={k.accentText} style={{ marginVertical: 12 }} />}
        {error && (
          <View style={{ alignItems: 'center', rowGap: 10, paddingVertical: 8 }}>
            <Txt t="body" color={k.statusOffline} style={{ textAlign: 'center' }}>{error}</Txt>
            <Pressable
              onPress={loadGroups}
              accessibilityRole="button"
              style={{ minHeight: TOUCH_MIN, paddingHorizontal: 20, borderRadius: RADIUS.pill, backgroundColor: k.accent, justifyContent: 'center' }}
            >
              <Txt t="labelStrong" color={k.onAccent}>Повторить</Txt>
            </Pressable>
          </View>
        )}
        {!loading && !error && <GroupSelector groups={groups} value={selected} onChange={setSelected} C={legacy} />}
        {selected && (
          <Txt t="small" color={k.textSecondary} style={{ marginTop: 10 }}>
            Выбрано: {shortGroupName(selected.name)}, {selected.year} курс
          </Txt>
        )}
      </View>

      {/* 3. Цвет */}
      <View style={{ backgroundColor: k.surface, borderRadius: RADIUS.lg, padding: 16, marginTop: 12 }}>
        <Txt t="overline" color={k.textSecondary} style={{ marginBottom: 12 }}>Цвет приложения</Txt>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 4, rowGap: 4 }}>
          {ACCENT_PRESETS.map(p => {
            const on = look.accent.preset === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => pickAccent(p.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Цвет: ${p.name}`}
                style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: p.hex, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 3 : 0, borderColor: k.text }}>
                  {on && <Ionicons name="checkmark" size={20} color={k.text} />}
                </View>
              </Pressable>
            );
          })}
        </View>
        <Txt t="small" color={k.textSecondary} style={{ marginTop: 10 }}>
          Цвет можно изменить в любое время: Кабинет → «Внешний вид».
        </Txt>
      </View>

      <Pressable
        onPress={handleStart}
        disabled={!ready}
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready }}
        style={{
          marginTop: 20, minHeight: 52, borderRadius: RADIUS.md, backgroundColor: k.accent,
          alignItems: 'center', justifyContent: 'center', opacity: ready ? 1 : 0.4,
        }}
      >
        {saving ? <ActivityIndicator color={k.onAccent} /> : <Txt t="labelStrong" color={k.onAccent}>Начать</Txt>}
      </Pressable>
      {hint && <Txt t="small" color={k.textSecondary} style={{ textAlign: 'center', marginTop: 10 }}>{hint}</Txt>}
    </ScrollView>
  );
}

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { api } from './api';
import { useTheme } from './theme';

const DISMISSED_KEY = 'update_dismissed_version';

/** Сравнивает версии вида "1.4.4" — true, если a новее b. */
function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Плавающая карточка «доступно обновление» — внизу, над панелью вкладок.
 * Наверх её ставить нельзя: там системная строка (часы, батарея), баннер
 * налезал бы на неё и сдвигал всё приложение вниз.
 */
export default function UpdateBanner() {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<{ version: string; download_url: string | null } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const installed = Constants.expoConfig?.version;
        if (!installed) return;
        const latest = await api.getLatestVersion();
        if (!latest?.version || !isNewer(latest.version, installed)) return;

        const dismissedVersion = await AsyncStorage.getItem(DISMISSED_KEY);
        if (dismissedVersion === latest.version) { setDismissed(true); return; }
        setInfo(latest);
      } catch {
        // Нет сети или GitHub недоступен — баннер просто не показываем.
      }
    })();
  }, []);

  const dismiss = async () => {
    if (info) await AsyncStorage.setItem(DISMISSED_KEY, info.version);
    setDismissed(true);
  };

  if (!info || dismissed) return null;

  // высота панели вкладок (60) + системный отступ снизу + зазор
  const bottom = 60 + insets.bottom + 12;

  return (
    <View style={[s.wrap, { bottom }]} pointerEvents="box-none">
      <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
        <View style={[s.iconBox, { backgroundColor: C.primary }]}>
          <Ionicons name="arrow-up" size={15} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: C.fg }]} numberOfLines={1}>
            Версия {info.version}
          </Text>
          <Text style={[s.sub, { color: C.muted }]} numberOfLines={1}>
            Доступно обновление
          </Text>
        </View>
        {info.download_url && (
          <TouchableOpacity
            onPress={() => Linking.openURL(info.download_url!)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Скачать версию ${info.version}`}
            style={[s.btn, { backgroundColor: C.primary }]}
          >
            <Text style={s.btnText}>Скачать</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={dismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Скрыть уведомление об обновлении"
          style={s.close}
        >
          <Ionicons name="close" size={16} color={C.muted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12,
    // тень, чтобы карточка читалась поверх расписания
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  iconBox: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 13.5, fontWeight: '700' },
  sub: { fontSize: 11.5, marginTop: 1 },
  btn: { borderRadius: 9, paddingHorizontal: 14, paddingVertical: 7 },
  btnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  close: { padding: 2 },
});

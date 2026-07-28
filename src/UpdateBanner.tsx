import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
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

export default function UpdateBanner() {
  const C = useTheme();
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
        if (dismissedVersion === latest.version) {
          setDismissed(true);
          return;
        }
        setInfo(latest);
      } catch {
        // Нет сети или GitHub недоступен — баннер просто не показываем,
        // это не критичная функция.
      }
    })();
  }, []);

  const dismiss = async () => {
    if (info) await AsyncStorage.setItem(DISMISSED_KEY, info.version);
    setDismissed(true);
  };

  if (!info || dismissed) return null;

  return (
    <View style={[styles.row, { backgroundColor: C.primary }]}>
      <Ionicons name="arrow-up-circle-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
      <Text style={styles.text}>
        Доступна версия {info.version} — обнови приложение
      </Text>
      {info.download_url && (
        <TouchableOpacity onPress={() => Linking.openURL(info.download_url!)} style={styles.btn}>
          <Text style={styles.btnText}>Скачать</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={dismiss} style={styles.close} hitSlop={8}>
        <Ionicons name="close" size={16} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 12,
  },
  text: { flex: 1, color: '#fff', fontSize: 12.5, fontWeight: '600' },
  btn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 8 },
  btnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  close: { marginLeft: 8, padding: 2 },
});

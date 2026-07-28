import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './theme';

/**
 * Одноразовая подсказка после включения «Пропусков» или «Заметок».
 * Объясняет, что делать, ровно один раз — потом больше не появляется.
 */
export default function FeatureHint({ skips, notes }: { skips: boolean; notes: boolean }) {
  const C = useTheme();
  const [visible, setVisible] = useState(false);
  const key = `hint_seen_${skips ? 's' : ''}${notes ? 'n' : ''}`;

  useEffect(() => {
    if (!skips && !notes) { setVisible(false); return; }
    AsyncStorage.getItem(key).then(v => setVisible(v !== '1'));
  }, [key, skips, notes]);

  if (!visible) return null;

  const dismiss = () => {
    AsyncStorage.setItem(key, '1');
    setVisible(false);
  };

  return (
    <View style={[s.box, { backgroundColor: C.card, borderColor: C.border }]}>
      <Ionicons name="information-circle-outline" size={20} color={C.primary} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        {skips && (
          <Text style={[s.text, { color: C.muted }]}>
            <Text style={{ fontWeight: '700', color: C.fg }}>Пропуски. </Text>
            Отмечай только пары, которые пропустил — если был, нажимать ничего не надо.
            Кнопка появляется у пар, которые уже прошли. Итог по предметам — в «Моём кабинете».
          </Text>
        )}
        {notes && (
          <Text style={[s.text, { color: C.muted, marginTop: skips ? 8 : 0 }]}>
            <Text style={{ fontWeight: '700', color: C.fg }}>Заметки. </Text>
            Домашка, что принести, где встречаемся. По умолчанию заметка закрепляется за парой
            и появляется каждую неделю — это можно выключить при написании.
          </Text>
        )}
      </View>
      <TouchableOpacity onPress={dismiss} hitSlop={10} accessibilityLabel="Скрыть подсказку">
        <Ionicons name="close" size={16} color={C.muted} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12,
  },
  text: { fontSize: 12, lineHeight: 17 },
});

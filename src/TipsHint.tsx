import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './theme';

const KEY = 'hint_seen_tips_reminders_widget';

/**
 * Разовая подсказка про напоминания о зачётах и виджет на рабочий стол.
 * Специально не на расписании — там и так тесно на маленьком экране, а тут
 * человек и так уже смотрит на переключатели, которые эта подсказка
 * объясняет. Один раз, крестик — и больше не появится (см. FeatureHint —
 * тот же паттерн, только без привязки к включённым функциям).
 */
export default function TipsHint() {
  const C = useTheme();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(v => setVisible(v !== '1'));
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    AsyncStorage.setItem(KEY, '1');
    setVisible(false);
  };

  return (
    <View style={[s.box, { backgroundColor: C.card, borderColor: C.border }]}>
      <Ionicons name="bulb-outline" size={18} color={C.primary} style={{ marginTop: 1 }} />
      <Text style={[s.text, { color: C.muted }]}>
        Включи напоминания о зачётах ниже — не пропустишь. А ещё у приложения есть виджет
        на рабочий стол: долгое нажатие на пустом месте экрана → виджеты → МГУ Душанбе.
      </Text>
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
  text: { fontSize: 12, lineHeight: 17, flex: 1 },
});

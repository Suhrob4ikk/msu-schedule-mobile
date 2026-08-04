import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './theme';
import { shouldAskCourseCheck, COURSE_CHECK_DISMISSED_KEY } from './features';

/**
 * Одноразовая подсказка после начала учебного года: «проверь курс».
 *
 * Нужна потому, что группа — это связка «направление + курс», и 1 сентября
 * в сохранённой группе оказываются пары нового набора. Без подсказки студент
 * увидит чужое расписание и решит, что приложение врёт.
 */
export default function CourseCheckBanner() {
  const C = useTheme();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    shouldAskCourseCheck().then(setVisible);
  }, []);

  const dismiss = async () => {
    await AsyncStorage.setItem(COURSE_CHECK_DISMISSED_KEY, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <View style={[s.card, { backgroundColor: C.card, borderColor: C.border, borderLeftColor: C.primary }]}>
      <View style={s.row}>
        <Ionicons name="school-outline" size={20} color={C.primary} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: C.fg }]}>Начался новый учебный год</Text>
          <Text style={[s.desc, { color: C.muted }]}>
            Проверь, что выбран нужный курс — он не переключается сам. Если в прошлом
            году ты был на первом курсе, теперь нужен второй.
          </Text>
          <View style={s.actions}>
            <TouchableOpacity
              onPress={() => router.push('/profile')}
              activeOpacity={0.8}
              style={[s.btn, { backgroundColor: C.primary }]}
            >
              <Text style={[s.btnText, { color: C.primaryFg }]}>Проверить группу</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={dismiss}
              activeOpacity={0.8}
              style={[s.btn, { borderWidth: 1, borderColor: C.border }]}
            >
              <Text style={[s.btnText, { color: C.muted }]}>Курс верный</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 12, borderWidth: 1, borderLeftWidth: 3,
    padding: 14, marginBottom: 10,
  },
  row: { flexDirection: 'row', gap: 10 },
  title: { fontSize: 14, fontWeight: '700' },
  desc: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  btn: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  btnText: { fontSize: 13, fontWeight: '600' },
});

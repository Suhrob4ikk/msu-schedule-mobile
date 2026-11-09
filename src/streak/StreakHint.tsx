/**
 * Подсказки снизу (как на сайте, components/streak/StreakLayer.tsx) — каждая один раз, над нижними вкладками:
 * - на 7, 14, 20 и 21 днях с заходом (всего, не подряд); на 7-м, если серия не сохранена, — «Сохранить»;
 * - «Похоже, вы заходите и с другого устройства» — когда сервер видит то же имя в той же группе на другом,
 *   не связанном устройстве (например, на сайте) → «Объединить» (идея владельца, 8 ноя 2026).
 * Кнопка открывает Кабинет и шторку огонька (с «Сохранить серию» сверху).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTokens, FONT } from '../schedule/tokens';
import Flame from './Flame';
import { STREAK_HINTS_KEY, STREAK_HINT_DAYS, openStreakSheet, useStreak } from './streak';

const TEXT: Record<number, [string, string]> = {
  7: ['7 дней с расписанием', 'Ещё 14 дней — и здесь откроется кое-что новое.'],
  14: ['14 дней с расписанием', 'Осталось 7 дней.'],
  20: ['20 дней с расписанием', 'В следующий раз здесь откроется кое-что новое.'],
  21: ['21 день с расписанием', 'Вам открылись достижения.'],
};
const SAVE: [string, string] = ['7 дней с расписанием', 'Сохраните серию — тогда она не пропадёт на новом телефоне или после переустановки.'];
const TWIN: [string, string] = ['Похоже, вы заходите и с другого устройства', 'Объедините серии — понадобится код из 6 цифр.'];
const TWIN_KEY = 'streak_twin_asked';

export default function StreakHint() {
  const st = useStreak();
  const k = useTokens();
  const [hint, setHint] = useState<number | 'twin' | null>(null);
  const unsaved = !!st && !st.login && st.linked <= 1;

  useEffect(() => {
    if (!st || !STREAK_HINT_DAYS.includes(st.total)) return;
    let alive = true;
    AsyncStorage.getItem(STREAK_HINTS_KEY).then(v => {
      const shown: number[] = JSON.parse(v ?? '[]');
      if (!alive || shown.includes(st.total)) return;
      setTimeout(() => { if (alive) setHint(st.total); }, 1500);
      AsyncStorage.setItem(STREAK_HINTS_KEY, JSON.stringify([...shown, st.total])).catch(() => {});
    }).catch(() => {});
    return () => { alive = false; };
  }, [st]);

  useEffect(() => {
    if (!st || st.test || !st.twin || !unsaved) return;
    let alive = true;
    AsyncStorage.getItem(TWIN_KEY).then(v => {
      if (!alive || v) return;
      setTimeout(() => { if (alive) setHint('twin'); }, 2500);
      AsyncStorage.setItem(TWIN_KEY, '1').catch(() => {});
    }).catch(() => {});
    return () => { alive = false; };
  }, [st, unsaved]);

  if (hint === null) return null;
  const save = hint === 'twin' || (hint === 7 && unsaved);
  const [title, text] = hint === 'twin' ? TWIN : save ? SAVE : TEXT[hint];
  const action = hint === 'twin' ? 'Объединить' : save ? 'Сохранить' : hint === 21 ? 'Открыть' : null;
  return (
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: 72, flexDirection: 'row', alignItems: 'center', columnGap: 10,
      paddingLeft: 12, paddingRight: 4, paddingVertical: 8, borderRadius: 16, backgroundColor: k.surface, borderWidth: 1, borderColor: k.border,
      shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 8, zIndex: 40 }}>
      <Flame n={hint === 'twin' ? 7 : hint} size={30} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONT[700], fontSize: 14, color: k.text }}>{title}</Text>
        <Text style={{ fontFamily: FONT[500], fontSize: 13, color: k.textSecondary }}>{text}</Text>
      </View>
      {action && (
        <Pressable onPress={() => { setHint(null); router.navigate('/profile'); openStreakSheet(save ? 'save' : undefined); }}
          style={{ height: 36, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center', backgroundColor: k.accent }}>
          <Text style={{ fontFamily: FONT[700], fontSize: 14, color: k.onAccent }}>{action}</Text>
        </Pressable>
      )}
      <Pressable onPress={() => setHint(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Закрыть" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 20, color: k.textSecondary }}>×</Text>
      </Pressable>
    </View>
  );
}

/**
 * Подсказка снизу на 15, 25, 29 и 30 днях серии — один раз на каждую (как на сайте). На 30 — «Открыть»
 * открывает лист огонька. Над нижними вкладками, поверх экрана.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTokens, FONT } from '../schedule/tokens';
import Flame from './Flame';
import { STREAK_HINTS_KEY, STREAK_HINT_DAYS, openStreakSheet, useStreak } from './streak';

const TEXT: Record<number, [string, string]> = {
  15: ['15 дней подряд', 'Через 15 дней здесь откроется кое-что новое.'],
  25: ['25 дней подряд', 'Осталось 5 дней — не прерывайте серию.'],
  29: ['29 дней подряд', 'Завтра здесь откроется кое-что новое.'],
  30: ['30 дней подряд', 'Вам открылись достижения.'],
};

export default function StreakHint() {
  const st = useStreak();
  const k = useTokens();
  const [hint, setHint] = useState<number | null>(null);

  useEffect(() => {
    if (!st || !STREAK_HINT_DAYS.includes(st.streak)) return;
    let alive = true;
    AsyncStorage.getItem(STREAK_HINTS_KEY).then(v => {
      const shown: number[] = JSON.parse(v ?? '[]');
      if (!alive || shown.includes(st.streak)) return;
      setTimeout(() => { if (alive) setHint(st.streak); }, 1500);
      AsyncStorage.setItem(STREAK_HINTS_KEY, JSON.stringify([...shown, st.streak])).catch(() => {});
    }).catch(() => {});
    return () => { alive = false; };
  }, [st]);

  if (hint === null) return null;
  const [title, text] = TEXT[hint];
  return (
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: 72, flexDirection: 'row', alignItems: 'center', columnGap: 10,
      paddingLeft: 12, paddingRight: 4, paddingVertical: 8, borderRadius: 16, backgroundColor: k.surface, borderWidth: 1, borderColor: k.border,
      shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 8, zIndex: 40 }}>
      <Flame n={hint} size={30} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONT[700], fontSize: 14, color: k.text }}>{title}</Text>
        <Text style={{ fontFamily: FONT[500], fontSize: 13, color: k.textSecondary }}>{text}</Text>
      </View>
      {hint === 30 && (
        <Pressable onPress={() => { setHint(null); openStreakSheet(); }} style={{ height: 36, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center', backgroundColor: k.accent }}>
          <Text style={{ fontFamily: FONT[700], fontSize: 14, color: k.onAccent }}>Открыть</Text>
        </Pressable>
      )}
      <Pressable onPress={() => setHint(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Закрыть" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 20, color: k.textSecondary }}>×</Text>
      </Pressable>
    </View>
  );
}

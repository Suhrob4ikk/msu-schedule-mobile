/**
 * Баннер «Новое достижение» сверху любой вкладки — как на сайте (components/streak/StreakLayer.tsx). Один раз на
 * достижение (`ach_seen`); в первый раз всё, что уже было получено, запоминается молча. «Три недели» не показываем —
 * для неё своя подсказка на 21-м дне. Нажатие — Кабинет и шторка огонька. Здесь же — какие призы открыты
 * достижениями (src/prizes/prizes.ts → saveUnlocked): раздел открывается с 21-го дня, до этого призов нет.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import { saveUnlocked } from '../prizes/prizes';
import { dushanbeNow, isoOf } from '../holiday/holidays';
import { STREAK_GOAL, openStreakSheet, useStreak } from './streak';
import { achItems, type AchItem } from './BadgeGrid';

const SEEN = 'ach_seen';

export default function AchToast() {
  const st = useStreak();
  const k = useTokens();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<AchItem | null>(null);
  const list = useMemo(() => (st ? achItems(st.achievements, st.test, st.total, isoOf(dushanbeNow())) : []), [st]);

  useEffect(() => {
    if (!st) { void saveUnlocked([]); return; }
    const open = st.total >= STREAK_GOAL || list.some(a => a.id === 'weeks3' && a.got);
    void saveUnlocked(open ? list.filter(a => a.got && a.prize).map(a => a.prize!) : []);
    if (!open) return;
    let alive = true, timer: ReturnType<typeof setTimeout> | null = null;
    AsyncStorage.getItem(SEEN).then(raw => {
      if (!alive) return;
      const got = list.filter(a => a.got).map(a => a.id);
      let seen: string[] = raw ? JSON.parse(raw) : got.filter(id => id !== 'weeks3');
      if (!raw) AsyncStorage.setItem(SEEN, JSON.stringify(seen)).catch(() => {});
      const fresh = list.find(a => a.got && !seen.includes(a.id) && a.id !== 'weeks3');
      if (!fresh) return;
      timer = setTimeout(() => {
        setToast(fresh);
        seen = [...seen, fresh.id];
        AsyncStorage.setItem(SEEN, JSON.stringify(seen)).catch(() => {});
      }, 1500);
    }).catch(() => {});
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [st, list]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 8000); return () => clearTimeout(t); }, [toast]);

  if (!toast) return null;
  return (
    <Pressable onPress={() => { setToast(null); router.navigate('/profile'); openStreakSheet(); }} accessibilityRole="button" accessibilityLiveRegion="polite"
      style={{ position: 'absolute', top: insets.top + 10, left: 14, right: 14, zIndex: 60, elevation: 12, flexDirection: 'row', alignItems: 'center', columnGap: 12,
        padding: 12, borderRadius: 18, backgroundColor: k.surface, borderWidth: 1, borderColor: k.border,
        shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }}>
      <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: k.accent }}>
        <Txt t="titleCard" color={k.onAccent}>★</Txt>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt t="overline" color={k.accentText}>Новое достижение</Txt>
        <Txt t="titleCard" color={k.text}>{toast.name}</Txt>
        {toast.prize ? <Txt t="small" color={k.textSecondary}>Открыт приз — посмотрите в Кабинете</Txt> : null}
      </View>
    </Pressable>
  );
}

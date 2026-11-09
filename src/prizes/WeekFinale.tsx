/**
 * Приз «Финал недели» — как на сайте (components/prizes/WeekFinale.tsx; открывает достижение «Летописец»): один раз за
 * неделю, когда закончилась последняя пара своей группы на этой неделе, — конфетти и итог: сколько пар и часов, серия.
 * Внизу — вышло ли расписание на следующую неделю (владелец: в субботу его могут выложить раньше, чем кончатся пары,
 * поэтому не обещаем «выйдет днём»). Показывается на «Расписании» своей группы, эта неделя, не позже 36 ч после пары.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, View, useWindowDimensions } from 'react-native';
import type { Tokens } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import type { DayData } from '../schedule/state';
import { ConfettiPiece } from '../holiday/HolidayParticles';
import { daysWord, useStreak } from '../streak/streak';
import { usePrizes } from './prizes';

const SEEN = 'week_finale_seen';

export default function WeekFinale({ days, weekStart, now, nextWeekOut, k, active }: {
  days: DayData[]; weekStart: string | null; now: Date; nextWeekOut: boolean; k: Tokens; active: boolean;
}) {
  const { final } = usePrizes();
  const st = useStreak();
  const { width: w, height: h } = useWindowDimensions();
  const [show, setShow] = useState(false);
  const [reduce, setReduce] = useState(false);
  const blocks = days.flatMap(d => d.blocks);
  const lastEnd = blocks.length ? Math.max(...blocks.map(b => b.endAt)) : 0;
  const pairs = days.reduce((n, d) => n + d.pairCount, 0);

  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {}); }, []);
  useEffect(() => {
    if (!final || !active || !weekStart || !lastEnd) return;
    const t = now.getTime();
    if (t < lastEnd || t - lastEnd > 36 * 3600_000) return;
    let alive = true;
    AsyncStorage.getItem(SEEN).then(v => {
      if (!alive || v === weekStart) return;
      AsyncStorage.setItem(SEEN, weekStart).catch(() => {});
      setShow(true);
    }).catch(() => {});
    return () => { alive = false; };
  }, [final, active, weekStart, now, lastEnd]);

  if (!show) return null;
  const streak = st?.streak ?? 0;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => setShow(false)}>
      <Pressable onPress={() => setShow(false)} style={{ flex: 1, backgroundColor: 'rgba(8,10,20,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        {!reduce && <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>{Array.from({ length: 70 }, (_, i) => <ConfettiPiece key={i} w={w} h={h} i={i} />)}</View>}
        <View style={{ width: '100%', maxWidth: 380, padding: 22, borderRadius: 24, backgroundColor: k.surface, rowGap: 12, alignItems: 'center' }}>
          <Txt t="overline" color={k.accentText}>Последняя пара недели позади</Txt>
          <Txt t="titleScreen" color={k.text} style={{ fontSize: 26, lineHeight: 30 }}>Неделя закрыта</Txt>
          <View style={{ flexDirection: 'row', columnGap: 8, alignSelf: 'stretch' }}>
            {([[String(pairs), 'пар'], [`${Math.round(pairs * 1.5)} ч`, 'учёбы'], [String(streak), `${daysWord(streak)} подряд`]] as const).map(([v, l]) => (
              <View key={l} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14, backgroundColor: k.surface2 }}>
                <Txt t="titleCard" color={k.text}>{v}</Txt>
                <Txt t="caption" color={k.textSecondary}>{l}</Txt>
              </View>
            ))}
          </View>
          <Txt t="small" color={k.textSecondary} style={{ textAlign: 'center' }}>
            {nextWeekOut ? 'Расписание на следующую неделю уже есть — откройте «Следующая неделя».' : 'Расписание на следующую неделю ещё не вышло — пришлём уведомление, как появится.'}
          </Txt>
          <View style={{ height: 42, paddingHorizontal: 18, borderRadius: 12, justifyContent: 'center', backgroundColor: k.accent }}>
            <Txt t="button" color={k.onAccent}>Хороших выходных</Txt>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

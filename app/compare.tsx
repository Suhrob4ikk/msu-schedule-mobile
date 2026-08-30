import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  api, Group, Lesson, DAYS_ORDER, PAIR_TIMES, PAIR_NUMBERS, shortGroupName,
  WeekInfo, isCurrentWeek,
} from '../src/api';
import { useTheme, useThemeMode } from '../src/theme';
import GroupSelector from '../src/GroupSelector';

const DAY_SHORT: Record<string, string> = {
  понедельник: 'Пн', вторник: 'Вт', среда: 'Ср',
  четверг: 'Чт', пятница: 'Пт', суббота: 'Сб',
};

const DAYS = DAYS_ORDER.filter(d => d !== 'воскресенье');

// Фиолетовый для «занята у сравниваемой группы» — те же значения, что и
// .lesson-tag-practice в globals.css на вебе (там это уже проверенный акцент,
// просто применённый здесь к другому смыслу). Своей мягкой подложки под этот
// цвет в theme.ts нет, поэтому берём готовую пару light/dark локально.
const OTHER_BUSY = {
  light: { bg: '#ecebfb', border: '#d3d0fa' },
  dark: { bg: 'rgba(140,135,243,0.18)', border: 'rgba(140,135,243,0.32)' },
};

/** Ключ занятого слота: «вторник|III» */
const slotKey = (day: string, pair: string) => `${day}|${pair}`;

const busySlots = (lessons: Lesson[]) =>
  new Set(lessons.map(l => slotKey(l.day_of_week, l.pair_number)));

export default function CompareScreen() {
  const C = useTheme();
  const { mode } = useThemeMode();
  const otherBusyColors = OTHER_BUSY[mode];
  const [groups, setGroups] = useState<Group[]>([]);
  const [myGroup, setMyGroup] = useState<Group | null>(null);
  const [otherGroup, setOtherGroup] = useState<Group | null>(null);
  const [myLessons, setMyLessons] = useState<Lesson[]>([]);
  const [otherLessons, setOtherLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem('selected_group_id');
      try {
        const gs = await api.getGroups();
        setGroups(gs);
        if (saved) setMyGroup(gs.find(g => g.id === Number(saved)) ?? null);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!myGroup || !otherGroup) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        // week_id у каждой группы свой (привязан к факультету), поэтому
        // текущую неделю ищем отдельно для каждой.
        const currentWeekId = async (g: Group) => {
          const wks: WeekInfo[] = await api.getGroupWeeks(g.id);
          const cur = wks.find(w => isCurrentWeek(w.week_start)) ?? wks.find(w => w.is_latest) ?? wks[0];
          return cur?.id;
        };
        const [myWeek, otherWeek] = await Promise.all([
          currentWeekId(myGroup), currentWeekId(otherGroup),
        ]);
        const [mine, theirs] = await Promise.all([
          api.getGroupSchedule(myGroup.id, myWeek),
          api.getGroupSchedule(otherGroup.id, otherWeek),
        ]);
        if (cancelled) return;
        setMyLessons(mine);
        setOtherLessons(theirs);
      } catch {} finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [myGroup, otherGroup]);

  const mineBusy = useMemo(() => busySlots(myLessons), [myLessons]);
  const theirsBusy = useMemo(() => busySlots(otherLessons), [otherLessons]);

  // Только учебные дни: если пар нет ни у кого, день выходной —
  // «свободны» там не значит «можно встретиться».
  const activeDays = useMemo(
    () => DAYS.filter(d => PAIR_NUMBERS.some(p => mineBusy.has(slotKey(d, p)) || theirsBusy.has(slotKey(d, p)))),
    [mineBusy, theirsBusy],
  );

  const commonFree = useMemo(() => {
    let n = 0;
    for (const d of activeDays) {
      for (const p of PAIR_NUMBERS) {
        if (!mineBusy.has(slotKey(d, p)) && !theirsBusy.has(slotKey(d, p))) n++;
      }
    }
    return n;
  }, [activeDays, mineBusy, theirsBusy]);

  return (
    <ScrollView style={[s.container, { backgroundColor: C.bg }]} contentContainerStyle={s.content}>
      <Text style={[s.title, { color: C.fg }]}>Сравнить с другой группой</Text>
      <Text style={[s.sub, { color: C.muted }]}>
        {myGroup
          ? `Когда у тебя (${shortGroupName(myGroup.name)} · ${myGroup.year} курс) и у выбранной группы одновременно нет пар.`
          : 'Сначала укажи свою группу в кабинете.'}
      </Text>

      {myGroup && (
        <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[s.label, { color: C.muted }]}>С КЕМ СРАВНИТЬ</Text>
          <GroupSelector groups={groups} value={otherGroup} onChange={setOtherGroup} C={C} collapsible />
        </View>
      )}

      {myGroup && otherGroup && loading && (
        <ActivityIndicator color={C.primary} style={{ marginTop: 28 }} />
      )}

      {myGroup && otherGroup && !loading && activeDays.length === 0 && (
        <View style={s.empty}>
          <Text style={[s.emptyTitle, { color: C.fg }]}>Занятий нет ни у одной из групп</Text>
          <Text style={[s.emptyText, { color: C.muted }]}>Сессия или каникулы — сравнивать нечего</Text>
        </View>
      )}

      {myGroup && otherGroup && !loading && activeDays.length > 0 && (
        <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
          <Text style={[s.countText, { color: C.fg }]}>
            Общих свободных пар: <Text style={{ color: C.primary, fontWeight: '800' }}>{commonFree}</Text>
          </Text>

          {/* Шапка с номерами пар */}
          <View style={s.gridRow}>
            <View style={s.dayCol} />
            {PAIR_NUMBERS.map(p => (
              <View key={p} style={s.cellWrap}>
                <Text style={[s.pairNum, { color: C.fg }]}>{p}</Text>
                <Text style={[s.pairTime, { color: C.muted }]}>{PAIR_TIMES[p][0]}</Text>
              </View>
            ))}
          </View>

          {activeDays.map(day => (
            <View key={day} style={s.gridRow}>
              <View style={s.dayCol}>
                <Text style={[s.dayText, { color: C.fg }]}>{DAY_SHORT[day]}</Text>
              </View>
              {PAIR_NUMBERS.map(p => {
                const mine = mineBusy.has(slotKey(day, p));
                const theirs = theirsBusy.has(slotKey(day, p));
                // Четыре состояния: оба свободны / занята моя / занята
                // сравниваемая / заняты обе. Раньше «моя» и «их» красились
                // одним и тем же красным — на телефоне тап-по-квадрату не
                // покажет подсказку, как hover на вебе, поэтому цвет должен
                // различаться сам, без наведения.
                const bg = !mine && !theirs ? C.greenBg
                  : mine && theirs ? C.tag
                    : mine ? C.redBg : otherBusyColors.bg;
                const border = !mine && !theirs ? C.green
                  : mine && theirs ? C.border
                    : mine ? C.red : otherBusyColors.border;
                return (
                  <View key={p} style={s.cellWrap}>
                    <View style={[s.cell, { backgroundColor: bg, borderColor: border }]} />
                  </View>
                );
              })}
            </View>
          ))}

          <View style={[s.legend, { borderTopColor: C.border }]}>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: C.greenBg, borderColor: C.green }]} />
              <Text style={[s.legendText, { color: C.muted }]}>оба свободны</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: C.redBg, borderColor: C.red }]} />
              <Text style={[s.legendText, { color: C.muted }]}>занята твоя</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: otherBusyColors.bg, borderColor: otherBusyColors.border }]} />
              <Text style={[s.legendText, { color: C.muted }]}>
                занята {otherGroup ? `${shortGroupName(otherGroup.name)} · ${otherGroup.year} курс` : 'их'}
              </Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: C.tag, borderColor: C.border }]} />
              <Text style={[s.legendText, { color: C.muted }]}>заняты обе</Text>
            </View>
          </View>
        </View>
      )}

      {myGroup && !otherGroup && (
        <View style={s.empty}>
          <Text style={[s.emptyTitle, { color: C.fg }]}>Выбери группу выше</Text>
          <Text style={[s.emptyText, { color: C.muted }]}>Покажем, когда вы оба свободны</Text>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 4, marginBottom: 16, lineHeight: 17 },
  card: { borderRadius: 14, borderWidth: 0.5, padding: 14, marginBottom: 14 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },
  countText: { fontSize: 14, marginBottom: 12 },
  gridRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  dayCol: { width: 32 },
  dayText: { fontSize: 13, fontWeight: '700' },
  cellWrap: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  cell: { width: '100%', aspectRatio: 1, borderRadius: 7, borderWidth: 1 },
  pairNum: { fontSize: 12, fontWeight: '700' },
  pairTime: { fontSize: 9 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 3, borderWidth: 1 },
  legendText: { fontSize: 11 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptyText: { fontSize: 13, marginTop: 4, textAlign: 'center' },
});

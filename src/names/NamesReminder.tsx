/**
 * Напоминание «Помогите узнать полные имена N преподавателей вашей группы» — как на сайте
 * (components/tablo/names/GlobalNamesReminder.tsx + NamesReminder.tsx): закреплено над нижним меню на всех
 * вкладках. Кого спрашивать — преподаватели своей группы на этой неделе, у кого полного имени нет, кому человек
 * ещё не ответил и кого не прятал (×). Нажатие — шторка с опросом по каждому (NamePoll). Крестик прячет строку
 * до следующего понедельника; закрытая шторка — нет (просьба владельца 8 окт 2026).
 * Пока строка видна, плавающие кнопки экранов («К сегодня»…) поднимаются над ней — useNamesReminderShown().
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api';
import { dushanbeNow, isoOf } from '../holiday/holidays';
import { mondayOf } from '../teachers/state';
import { answerOf, isHidden, personsOf, plural, useFullNames } from '../fullNames';
import { useTokens } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import BottomSheet from '../schedule/BottomSheet';
import NamePoll from './NamePoll';

const CLOSED_KEY = 'fn_reminder_closed'; // понедельник недели, на которую строку закрыли крестиком
/** Высота строки с отступом — на столько поднимаются плавающие кнопки экранов. */
export const REMINDER_LIFT = 64;

// Видна ли строка — для плавающих кнопок экранов
let shown = false;
const subs = new Set<(v: boolean) => void>();
function setShown(v: boolean) { if (v !== shown) { shown = v; subs.forEach(f => f(v)); } }
export function useNamesReminderShown(): boolean {
  const [v, setV] = useState(shown);
  useEffect(() => { subs.add(setV); setV(shown); return () => { subs.delete(setV); }; }, []);
  return v;
}

export default function NamesReminder() {
  const k = useTokens();
  const pathname = usePathname();
  const data = useFullNames();
  const [teachers, setTeachers] = useState<string[]>([]);
  const [ask, setAsk] = useState<string[]>([]);
  const [closed, setClosed] = useState(true);
  const [sheet, setSheet] = useState(false);
  const monday = mondayOf(isoOf(dushanbeNow()));

  useEffect(() => {
    AsyncStorage.getItem(CLOSED_KEY).then(v => setClosed(v === monday)).catch(() => setClosed(true));
  }, [monday]);

  // Преподаватели своей группы на этой неделе (ответы api — из кэша, сеть не дёргаем лишний раз)
  useEffect(() => {
    let alive = true;
    (async () => {
      const [[, gid], [, dev]] = await AsyncStorage.multiGet(['selected_group_id', 'msu_device_id']);
      if (!gid || !dev) return;
      const weeks = await api.getGroupWeeks(Number(gid));
      const w = weeks.find(x => x.week_start === monday);
      const lessons = w ? await api.getGroupSchedule(Number(gid), w.id) : [];
      const list = [...new Set(lessons.flatMap(l => personsOf(l.teacher?.name)))].sort((a, b) => a.localeCompare(b, 'ru'));
      if (alive) setTeachers(list);
    })().catch(() => { /* нет сети — без напоминания */ });
    return () => { alive = false; };
  }, [pathname, monday]);

  // Кого спрашивать; пока открыта шторка — список не меняем, иначе ответивший тут же исчезал бы из неё
  useEffect(() => {
    if (sheet || !data) return;
    let alive = true;
    Promise.all(teachers.map(async t => (!data.names[t] && !(await answerOf(t)) && !(await isHidden(t)) ? t : null)))
      .then(r => { if (alive) setAsk(r.filter((t): t is string => !!t)); })
      .catch(() => null);
    return () => { alive = false; };
  }, [teachers, data, sheet]);

  const hiddenHere = pathname === '/onboarding' || pathname === '/messages' || pathname === '/appearance';
  const visible = !closed && !!data && ask.length > 0 && !hiddenHere;
  useEffect(() => { setShown(visible); }, [visible]);
  useEffect(() => () => setShown(false), []);

  if (!data || closed || hiddenHere || (ask.length === 0 && !sheet)) return null;
  const n = ask.length;

  return (
    <>
      {n > 0 ? (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: 72, zIndex: 40, elevation: 8, flexDirection: 'row', alignItems: 'center',
          borderRadius: 14, backgroundColor: k.surface, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }}>
          <View style={{ ...StyleFill, borderRadius: 14, backgroundColor: k.accentSoft }} pointerEvents="none" />
          <Pressable onPress={() => setSheet(true)} accessibilityRole="button"
            style={{ flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', columnGap: 10, paddingVertical: 6, paddingLeft: 12 }}>
            <Ionicons name="people-outline" size={20} color={k.accentText} />
            <Txt t="smallSemi" color={k.accentText} style={{ flex: 1 }}>
              {`Помогите узнать полные имена ${n} ${plural(n, 'преподавателя', 'преподавателей', 'преподавателей')} вашей группы`}
            </Txt>
            <Ionicons name="chevron-forward" size={20} color={k.accentText} />
          </Pressable>
          <Pressable onPress={() => { AsyncStorage.setItem(CLOSED_KEY, monday).catch(() => null); setClosed(true); }}
            accessibilityRole="button" accessibilityLabel="Скрыть до следующей недели"
            style={{ width: 44, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={18} color={k.accentText} />
          </Pressable>
        </View>
      ) : null}
      <BottomSheet visible={sheet} onClose={() => setSheet(false)} k={k} label="Полные имена преподавателей"
        header={
          <View style={{ paddingBottom: 8 }}>
            <Txt t="sheetTitle" color={k.text}>Полные имена преподавателей</Txt>
            <Txt t="small" color={k.textSecondary} style={{ marginTop: 2 }}>Ответьте, про кого знаете. Не знаете — нажмите ×</Txt>
          </View>
        }>
        <View style={{ paddingBottom: 16, rowGap: 4 }}>
          {ask.length === 0 ? <Txt t="body" color={k.text}>Готово — спасибо!</Txt> : null}
          {ask.map(t => (
            <NamePoll key={t} teacher={t} variants={data.variants[t] ?? []} k={k} named ownGroup
              onHide={() => setAsk(a => a.filter(x => x !== t))} />
          ))}
        </View>
      </BottomSheet>
    </>
  );
}

const StyleFill = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 };

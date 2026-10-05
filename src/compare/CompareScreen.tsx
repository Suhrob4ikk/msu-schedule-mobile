/**
 * «Сравнить с группой» в стиле «Табло» (2.0.2, просьба владельца). Прежний
 * экран показывал два заголовка подряд («Сравнить с группой» в шапке и
 * «Сравнить с другой группой» ниже) и две подписи («С КЕМ СРАВНИТЬ» и «ГРУППА»).
 *
 * Теперь: своя шапка с «Назад» в Кабинет, одна строка «С кем», переключатель
 * «Эта неделя / Следующая», итог, сетка «день × пара» в смысловых цветах
 * (как на вкладке «Аудитории»), подписи цветов с названиями групп. Нажатие на
 * клетку показывает, что в это время у каждой группы.
 *
 * Данные — как у остальных экранов: сначала кэш (cache_weeks_<группа>,
 * cache_schedule_<группа>_<неделя>), потом сеть. week_id у каждой группы свой
 * (привязан к факультету) — неделю ищем по понедельнику отдельно для каждой.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, Group, Lesson, WeekInfo, PAIR_TIMES, shortGroupName } from '../api';
import { useThemeMode } from '../theme';
import { useTokens, Tokens, RADIUS, TOUCH_MIN, GUTTER, shadePair } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import BottomSheet from '../schedule/BottomSheet';
import { DIR_ORDER } from '../GroupSelector';
import {
  PAIRS, DAY_SHORT, CellKind, Which, addDaysIso, buildGrid, commonLabel, defaultWhich, mondayOf, slotLine,
  slotTitle, weekFor, weekRange,
} from './state';

const label = (g: Group) => `${shortGroupName(g.name)} · ${g.year} курс`;

async function cachedJson<T>(key: string): Promise<T | null> {
  try { const s = await AsyncStorage.getItem(key); return s ? JSON.parse(s) as T : null; } catch { return null; }
}

/** Недели группы: сеть, при её отсутствии — кэш. */
async function weeksOf(g: Group): Promise<WeekInfo[]> {
  try {
    const ws = await api.getGroupWeeks(g.id);
    AsyncStorage.setItem(`cache_weeks_${g.id}`, JSON.stringify(ws)).catch(() => null);
    return ws;
  } catch {
    return (await cachedJson<WeekInfo[]>(`cache_weeks_${g.id}`)) ?? [];
  }
}

/** Пары группы за неделю: кэш сразу, сеть — если кэша нет или он старый. */
async function lessonsOf(g: Group, w: WeekInfo): Promise<Lesson[]> {
  const key = `cache_schedule_${g.id}_${w.id}`;
  try {
    const ls = await api.getGroupSchedule(g.id, w.id);
    AsyncStorage.setItem(key, JSON.stringify(ls)).catch(() => null);
    return ls;
  } catch {
    const cached = await cachedJson<Lesson[]>(key);
    if (cached) return cached;
    throw new Error('нет сети и кэша');
  }
}

/** Цвета клетки — смысловые, от акцента не зависят: розовый акцент не спутается с «занята». */
function cellColors(kind: CellKind, k: Tokens): { bg: string; fg: string } {
  const sky = shadePair('sky', k.mode);
  switch (kind) {
    case 'free': return { bg: k.roomFreeBg, fg: k.roomFreeText };
    case 'mine': return { bg: k.roomBusyBg, fg: k.roomBusyText };
    case 'theirs': return { bg: sky.bg, fg: sky.text };
    default: return { bg: k.surface2, fg: k.border };
  }
}

function Card({ k, children, style }: { k: Tokens; children: React.ReactNode; style?: object }) {
  return <View style={[{ backgroundColor: k.card, borderRadius: RADIUS.card, padding: 16, marginTop: 12 }, style]}>{children}</View>;
}

function WeekSegment({ k, which, thisWs, nextWs, nextOk, onPick }: {
  k: Tokens; which: Which; thisWs: string; nextWs: string; nextOk: boolean; onPick: (w: Which) => void;
}) {
  const items: { w: Which; title: string; range: string; ok: boolean }[] = [
    { w: 'this', title: 'Эта неделя', range: weekRange(thisWs), ok: true },
    { w: 'next', title: 'Следующая', range: nextOk ? weekRange(nextWs) : 'ещё не вышла', ok: nextOk },
  ];
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: k.surface2, borderRadius: RADIUS.sm, padding: 3, columnGap: 3, marginTop: 12 }}>
      {items.map(it => {
        const on = it.w === which;
        return (
          <Pressable
            key={it.w}
            onPress={() => { if (it.ok && !on) { Haptics.selectionAsync(); onPick(it.w); } }}
            disabled={!it.ok}
            accessibilityRole="tab"
            accessibilityState={{ selected: on, disabled: !it.ok }}
            accessibilityLabel={`${it.title}, ${it.range}`}
            style={{
              flex: 1, minHeight: TOUCH_MIN, borderRadius: RADIUS.sm - 3, alignItems: 'center', justifyContent: 'center',
              paddingVertical: 4, backgroundColor: on ? k.surface : 'transparent', opacity: it.ok ? 1 : 0.5,
            }}
          >
            <Txt t="labelStrong" color={on ? k.text : k.textSecondary}>{it.title}</Txt>
            <Txt t="caption" color={k.textSecondary}>{it.range}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Выбор группы: направление → курс; курс сразу применяет и закрывает лист. */
function GroupSheet({ k, visible, groups, value, exclude, onPick, onClose }: {
  k: Tokens; visible: boolean; groups: Group[]; value: Group | null; exclude: number | null;
  onPick: (g: Group) => void; onClose: () => void;
}) {
  const directions = useMemo(() => {
    const has = new Set(groups.map(g => shortGroupName(g.name)));
    return DIR_ORDER.filter(d => has.has(d));
  }, [groups]);
  const [dir, setDir] = useState<string | null>(value ? shortGroupName(value.name) : null);
  useEffect(() => { if (visible) setDir(value ? shortGroupName(value.name) : null); }, [visible, value]);
  const inDir = groups.filter(g => shortGroupName(g.name) === dir).sort((a, b) => a.year - b.year);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      k={k}
      label="С какой группой сравнить"
      topGap={64}
      header={(
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: TOUCH_MIN }}>
          <Txt t="sheetTitle" color={k.text} accessibilityRole="header" style={{ flex: 1 }}>С кем сравнить</Txt>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center', marginRight: -12 }}
          >
            <Ionicons name="close" size={24} color={k.text} />
          </Pressable>
        </View>
      )}
    >
      <Txt t="overline" color={k.textSecondary} style={{ marginTop: 8, marginBottom: 6 }}>Направление</Txt>
      <View style={{ borderRadius: RADIUS.sm, borderWidth: 1, borderColor: k.border, overflow: 'hidden' }}>
        {directions.map((d, i) => {
          const sel = d === dir;
          return (
            <Pressable
              key={d}
              onPress={() => { Haptics.selectionAsync(); setDir(d); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={`Направление ${d}`}
              style={{
                minHeight: TOUCH_MIN, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center',
                backgroundColor: sel ? k.accentSoft : 'transparent',
                borderTopWidth: i > 0 ? 1 : 0, borderTopColor: k.border,
              }}
            >
              <Txt t={sel ? 'button' : 'body'} color={sel ? k.onAccentSoft : k.text} style={{ flex: 1 }}>{d}</Txt>
              {sel && <Ionicons name="checkmark" size={18} color={k.onAccentSoft} />}
            </Pressable>
          );
        })}
      </View>

      {dir && (
        <>
          <Txt t="overline" color={k.textSecondary} style={{ marginTop: 16, marginBottom: 6 }}>Курс</Txt>
          <View style={{ flexDirection: 'row', columnGap: 8, marginBottom: 8 }}>
            {inDir.map(g => {
              const sel = value?.id === g.id;
              const mine = g.id === exclude;
              return (
                <Pressable
                  key={g.id}
                  onPress={() => { Haptics.selectionAsync(); onPick(g); onClose(); }}
                  disabled={mine}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel, disabled: mine }}
                  accessibilityLabel={mine ? `${g.year} курс — ваша группа` : `${g.year} курс`}
                  style={{
                    flex: 1, minHeight: TOUCH_MIN, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: sel ? k.accent : k.surface2, opacity: mine ? 0.4 : 1,
                  }}
                >
                  <Txt t="buttonLg" color={sel ? k.onAccent : k.text}>{String(g.year)}</Txt>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </BottomSheet>
  );
}

export default function CompareScreen() {
  const k = useTokens();
  const { mode } = useThemeMode();
  const insets = useSafeAreaInsets();

  const [groups, setGroups] = useState<Group[]>([]);
  const [myGroup, setMyGroup] = useState<Group | null>(null);
  const [myLoaded, setMyLoaded] = useState(false);
  const [other, setOther] = useState<Group | null>(null);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem('selected_group_id').catch(() => null);
      let gs = await cachedJson<Group[]>('cache_groups');
      try { gs = await api.getGroups(); } catch { /* остаёмся на кэше */ }
      if (gs) {
        setGroups(gs);
        if (saved) setMyGroup(gs.find(g => g.id === Number(saved)) ?? null);
      }
      setMyLoaded(true);
    })();
  }, []);

  // ─── Недели ───────────────────────────────────────────────────────────
  const [now] = useState(() => new Date());
  const thisWs = mondayOf(now);
  const nextWs = addDaysIso(thisWs, 7);
  const [weeks, setWeeks] = useState<{ mine: WeekInfo[]; theirs: WeekInfo[] } | null>(null);
  const [which, setWhich] = useState<Which | null>(null);

  useEffect(() => {
    if (!myGroup || !other) return;
    let cancelled = false;
    setWeeks(null);
    Promise.all([weeksOf(myGroup), weeksOf(other)]).then(([mine, theirs]) => {
      if (cancelled) return;
      setWeeks({ mine, theirs });
      const nextOk = !!weekFor(mine, nextWs) && !!weekFor(theirs, nextWs);
      setWhich(prev => (prev === 'next' && !nextOk ? 'this' : prev ?? defaultWhich(now, nextOk)));
    });
    return () => { cancelled = true; };
  }, [myGroup, other, nextWs, now]);

  const nextOk = !!weeks && !!weekFor(weeks.mine, nextWs) && !!weekFor(weeks.theirs, nextWs);
  const ws = which === 'next' ? nextWs : thisWs;

  // ─── Пары выбранной недели ────────────────────────────────────────────
  const [data, setData] = useState<{ key: string; mine: Lesson[]; theirs: Lesson[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const dataKey = myGroup && other && weeks && which ? `${myGroup.id}|${other.id}|${ws}` : null;

  useEffect(() => {
    if (!dataKey || !myGroup || !other || !weeks) return;
    let cancelled = false;
    setFailed(false);
    // Этой недели у группы нет в списке (каникулы) — сравниваем последнюю опубликованную, как раньше
    const pick = (list: WeekInfo[]) => weekFor(list, ws) ?? (which === 'this' ? list.find(w => w.is_latest) ?? list[0] ?? null : null);
    const wm = pick(weeks.mine);
    const wt = pick(weeks.theirs);
    (async () => {
      try {
        const [mine, theirs] = await Promise.all([
          wm ? lessonsOf(myGroup, wm) : Promise.resolve([]),
          wt ? lessonsOf(other, wt) : Promise.resolve([]),
        ]);
        if (!cancelled) setData({ key: dataKey, mine, theirs });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [dataKey, myGroup, other, weeks, ws, which]);

  const ready = data && data.key === dataKey ? data : null;
  const grid = useMemo(() => (ready ? buildGrid(ready.mine, ready.theirs) : null), [ready]);
  const [picked, setPicked] = useState<{ day: string; pair: string } | null>(null);
  useEffect(() => { setPicked(null); }, [dataKey]);

  // ─── Навигация ────────────────────────────────────────────────────────
  const back = useCallback(() => { router.navigate('/profile'); }, []);
  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle(mode === 'dark' ? 'light-content' : 'dark-content');
      const sub = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
      return () => {
        sub.remove();
        StatusBar.setBarStyle(k.onAccent === '#FFFFFF' ? 'light-content' : 'dark-content');
      };
    }, [mode, k.onAccent, back]),
  );

  const todayDay = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'][now.getDay()];
  const myName = myGroup ? shortGroupName(myGroup.name) : '';
  const otherName = other ? shortGroupName(other.name) : '';
  // Одно направление разных курсов — без курса названия совпали бы
  const sameDir = myName === otherName;
  const myShort = sameDir && myGroup ? `${myName} ${myGroup.year}` : myName;
  const otherShort = sameDir && other ? `${otherName} ${other.year}` : otherName;

  let body: React.ReactNode = null;
  if (!myLoaded) {
    body = <ActivityIndicator color={k.accentText} style={{ marginTop: 32 }} />;
  } else if (!myGroup) {
    body = (
      <Card k={k}>
        <Txt t="titleRow" color={k.text}>Своя группа не выбрана</Txt>
        <Pressable
          onPress={back}
          accessibilityRole="button"
          style={{ marginTop: 12, minHeight: TOUCH_MIN, borderRadius: RADIUS.pill, backgroundColor: k.accent, alignItems: 'center', justifyContent: 'center' }}
        >
          <Txt t="labelStrong" color={k.onAccent}>Выбрать в Кабинете</Txt>
        </Pressable>
      </Card>
    );
  } else {
    body = (
      <>
        {/* С кем — одна строка, нажатие открывает выбор */}
        <Pressable
          onPress={() => setSheet(true)}
          accessibilityRole="button"
          accessibilityLabel={other ? `Сравнить с ${label(other)}, изменить` : 'Выбрать группу для сравнения'}
          style={({ pressed }) => ({
            marginTop: 4, minHeight: 64, borderRadius: RADIUS.card, paddingHorizontal: 16, paddingVertical: 10,
            flexDirection: 'row', alignItems: 'center', columnGap: 12,
            backgroundColor: pressed ? k.surface2 : k.card,
          })}
        >
          <View style={{ flex: 1 }}>
            <Txt t="caption" color={k.textSecondary}>{`${label(myGroup)} и`}</Txt>
            <Txt t="titleCard" color={other ? k.text : k.accentText}>{other ? label(other) : 'Выберите группу'}</Txt>
          </View>
          <Ionicons name="chevron-down" size={20} color={k.textSecondary} />
        </Pressable>

        {other && which && (
          <WeekSegment k={k} which={which} thisWs={thisWs} nextWs={nextWs} nextOk={nextOk} onPick={setWhich} />
        )}

        {other && !grid && !failed && <ActivityIndicator color={k.accentText} style={{ marginTop: 32 }} />}
        {other && failed && !grid && (
          <Card k={k}><Txt t="body" color={k.textSecondary}>Расписание загрузится, когда появится сеть.</Txt></Card>
        )}

        {grid && grid.days.length === 0 && (
          <Card k={k}><Txt t="titleRow" color={k.text}>{which === 'next' ? 'На следующей неделе' : 'На этой неделе'} пар нет ни у одной группы</Txt></Card>
        )}

        {grid && grid.days.length > 0 && (
          <Card k={k}>
            <Txt t="titleCard" color={k.text}>{commonLabel(grid.commonFree)}</Txt>

            {/* Номера пар */}
            <View style={{ flexDirection: 'row', marginTop: 12, marginBottom: 4 }}>
              <View style={{ width: 32 }} />
              {PAIRS.map(p => (
                <View key={p} style={{ flex: 1, alignItems: 'center' }}>
                  <Txt t="captionStrong" color={k.text}>{p}</Txt>
                  <Txt t="caption" color={k.textSecondary} maxFontSizeMultiplier={1.3}>{PAIR_TIMES[p][0]}</Txt>
                </View>
              ))}
            </View>

            {grid.days.map(day => {
              const today = which === 'this' && day === todayDay;
              return (
                <View key={day} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <View style={{ width: 32 }}>
                    <Txt t="labelStrong" color={today ? k.accentText : k.text}>{DAY_SHORT[day]}</Txt>
                  </View>
                  {PAIRS.map(p => {
                    const kind = grid.cell(day, p);
                    const c = cellColors(kind, k);
                    const sel = picked?.day === day && picked.pair === p;
                    return (
                      <Pressable
                        key={p}
                        onPress={() => { Haptics.selectionAsync(); setPicked(sel ? null : { day, pair: p }); }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: sel }}
                        accessibilityLabel={`${slotTitle(day, p, PAIR_TIMES)}: ${myShort} — ${slotLine(ready!.mine, day, p)}, ${otherShort} — ${slotLine(ready!.theirs, day, p)}`}
                        style={{ flex: 1, paddingHorizontal: 2 }}
                      >
                        <View
                          style={{
                            aspectRatio: 1, borderRadius: 8, backgroundColor: c.bg,
                            borderWidth: sel ? 2 : 1, borderColor: sel ? k.text : c.fg,
                          }}
                        />
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}

            {/* Что в выбранной клетке */}
            {picked && ready && (
              <View style={{ marginTop: 8, padding: 12, borderRadius: RADIUS.sm, backgroundColor: k.surface2, rowGap: 4 }}>
                <Txt t="labelStrong" color={k.text}>{slotTitle(picked.day, picked.pair, PAIR_TIMES)}</Txt>
                <Txt t="small" color={k.textSecondary}>
                  <Txt t="smallStrong" color={k.text}>{myShort}</Txt>{` — ${slotLine(ready.mine, picked.day, picked.pair)}`}
                </Txt>
                <Txt t="small" color={k.textSecondary}>
                  <Txt t="smallStrong" color={k.text}>{otherShort}</Txt>{` — ${slotLine(ready.theirs, picked.day, picked.pair)}`}
                </Txt>
              </View>
            )}

            {/* Подписи цветов: два столбца */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: k.border }}>
              {([
                ['free', 'оба свободны'],
                ['both', 'заняты обе'],
                ['mine', `занята ${myShort}`],
                ['theirs', `занята ${otherShort}`],
              ] as [CellKind, string][]).map(([kind, text]) => {
                const c = cellColors(kind, k);
                return (
                  <View key={kind} style={{ width: '50%', flexDirection: 'row', alignItems: 'center', columnGap: 6, paddingRight: 8 }}>
                    <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: c.bg, borderWidth: 1, borderColor: c.fg }} />
                    <Txt t="caption" color={k.textSecondary} style={{ flexShrink: 1 }}>{text}</Txt>
                  </View>
                );
              })}
            </View>
          </Card>
        )}
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: k.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: k.bg }}>
        <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: GUTTER }}>
          <Pressable
            onPress={back}
            accessibilityRole="button"
            accessibilityLabel="Назад"
            style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="arrow-back" size={24} color={k.text} />
          </Pressable>
          <Txt t="titleScreen" color={k.text} accessibilityRole="header" style={{ marginLeft: 4, flexShrink: 1 }}>
            Сравнить с группой
          </Txt>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 4, paddingBottom: insets.bottom + 32 }}>
        {body}
      </ScrollView>

      <GroupSheet
        k={k}
        visible={sheet}
        groups={groups}
        value={other}
        exclude={myGroup?.id ?? null}
        onPick={g => { setOther(g); setWhich(null); }}
        onClose={() => setSheet(false)}
      />
    </View>
  );
}

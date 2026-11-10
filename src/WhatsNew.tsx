/**
 * Сторис «Что нового» (9 ноя 2026, тексты — src/whatsNewSlides.ts, как на сайте components/WhatsNew.tsx). На весь экран,
 * нажатие — дальше, левая треть — назад, × и системная «Назад» — закрыть. Последний экран — личный прогресс огонька.
 * Сам открывается один раз на выпуск (WHATS_NEW_ID), когда огонёк виден (useStreak не null) и группа выбрана;
 * иначе — openWhatsNew() (Кабинет → «Что нового», «Тестовый режим»). Подключён в app/_layout.tsx.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { FONT } from './schedule/tokens';
import { useStreak } from './streak/streak';
import { SLIDES, WHATS_NEW_ID, WHATS_NEW_SEEN_KEY, daysWordRu, progressLine, type Pic } from './whatsNewSlides';

const LAST = SLIDES.length;
/** Каждая история идёт сама 10 с (владелец 9 ноя 2026). Нажатие в середине — пауза и снова дальше, у правого края —
 *  следующая, у левого — предыдущая (без кнопок — решение владельца), как на сайте. */
const SLIDE_MS = 10_000;
const EDGE = 0.25;
let opener: (() => void) | null = null;
export function openWhatsNew(): void { opener?.(); }

const W = '#FFFFFF';
const T = ({ s, w = 500, c = W, o = 1, st }: { s: number; w?: 500 | 600 | 700 | 800; c?: string; o?: number; st?: object }) =>
  ({ fontFamily: FONT[w], fontSize: s, lineHeight: Math.round(s * 1.3), color: c, opacity: o, ...st });
const glass = 'rgba(255,255,255,0.15)';

function Picture({ pic }: { pic: Pic }) {
  switch (pic) {
    case 'tab': return (
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', backgroundColor: glass, borderRadius: 18, paddingVertical: 14 }}>
        {['Расписание', 'Педагоги', 'Ауд.', 'Кабинет'].map((t, i) => (
          <View key={t}>
            <Text style={T({ s: 12, w: i === 3 ? 700 : 500, o: i === 3 ? 1 : 0.65 })}>{t}</Text>
            {i === 3 && <View style={{ position: 'absolute', top: -14, right: -16, backgroundColor: '#ff7a1a', borderRadius: 9, paddingHorizontal: 7 }}><Text style={T({ s: 11, w: 800 })}>3</Text></View>}
          </View>
        ))}
      </View>);
    case 'notes': return (
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', columnGap: 12 }}>
        {[['ТЕЛЕФОН', 118], ['САЙТ', 158]].map(([l, w]) => (
          <View key={l} style={{ width: w as number, backgroundColor: W, borderRadius: 14, padding: 10 }}>
            <Text style={T({ s: 10, w: 600, c: '#5d6373' })}>{l}</Text>
            <Text style={T({ s: 13, c: '#11131a' })}>Численные методы</Text>
            <Text style={T({ s: 13, w: 600, c: '#11131a', st: { backgroundColor: '#fff4d6', borderRadius: 8, padding: 5, marginTop: 5, overflow: 'hidden' } })}>Сдать лабу 3</Text>
          </View>
        ))}
      </View>);
    case 'code': return (
      <View style={{ alignItems: 'center', rowGap: 14 }}>
        <View style={{ flexDirection: 'row', columnGap: 6 }}>{'481290'.split('').map((d, i) => (
          <View key={i} style={{ width: 40, height: 52, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}><Text style={T({ s: 26, w: 800 })}>{d}</Text></View>))}</View>
        <Text style={T({ s: 14, w: 600 })}>Приложение  ⇄  Сайт</Text>
      </View>);
    case 'vote': return (
      <View style={{ rowGap: 8 }}>
        {([['Объявления группы', 'Староста пишет «пара отменена» — видит вся группа', 58, true], ['Сводка дня', 'Утром одной карточкой: изменения, окна, свободные аудитории', 42, false]] as const).map(([t, d, p, on]) => (
          <View key={t} style={{ overflow: 'hidden', borderRadius: 12, backgroundColor: glass, borderWidth: on ? 2 : 0, borderColor: W }}>
            <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${p}%`, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 10, columnGap: 8 }}>
              <View style={{ flex: 1 }}><Text style={T({ s: 14.5, w: 700 })}>{t}</Text><Text style={T({ s: 12.5 })}>{d}</Text></View>
              <Text style={T({ s: 14, w: 700 })}>{p}%</Text>
            </View>
          </View>))}
      </View>);
    case 'early': return (
      <View style={{ rowGap: 10, alignItems: 'flex-start' }}>
        <Text style={T({ s: 13, w: 800, c: '#7a3d00', st: { backgroundColor: W, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, overflow: 'hidden' } })}>Ранний доступ</Text>
        <View style={{ alignSelf: 'stretch', backgroundColor: W, borderRadius: 16, padding: 12 }}>
          <Text style={T({ s: 11, w: 800, c: '#b35c00' })}>РАНЬШЕ ВСЕХ</Text>
          <Text style={T({ s: 15.5, w: 700, c: '#11131a' })}>Сводка дня</Text>
          <Text style={T({ s: 14, c: '#11131a' })}>Изменения, окна и свободные аудитории — одной карточкой утром.</Text>
        </View>
      </View>);
    case 'prizes': return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[['Табло', 'минуты перелистываются · 21 день'], ['Другой огонёк', '8 видов пламени · 30 дней'], ['Живое небо', 'рассвет и закат в шапке · 40 дней'], ['Волна', 'пара наполняется светом · 50 дней']].map(([t, d]) => (
          <View key={t} style={{ width: '48%', flexGrow: 1, backgroundColor: glass, borderRadius: 14, padding: 12 }}>
            <Text style={T({ s: 14.5, w: 700 })}>{t}</Text><Text style={T({ s: 12.5, o: 0.85 })}>{d}</Text>
          </View>))}
      </View>);
    case 'term': return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {[['#1aa37a', '312', 'пар за семестр'], ['#e0565b', '58', 'пар численных методов'], ['#3f7be0', '105', 'ваша аудитория'], ['#f0a030', '47', 'дней рекорд']].map(([c, n, l]) => (
          <View key={n} style={{ width: '48%', flexGrow: 1, backgroundColor: c, borderRadius: 12, padding: 10 }}>
            <Text style={T({ s: 24, w: 800 })}>{n}</Text><Text style={T({ s: 12.5, w: 600 })}>{l}</Text>
          </View>))}
      </View>);
    case 'names': return (
      <View style={{ backgroundColor: W, borderRadius: 16, padding: 12, rowGap: 3 }}>
        <Text style={T({ s: 16, w: 700, c: '#11131a' })}>Численные методы</Text>
        <Text style={T({ s: 14, c: '#5d6373' })}>Джумаев Э.Х. › · ауд. 105</Text>
        <Text style={T({ s: 14.5, w: 600, c: '#2F62EA' })}>Джумаев Эраж Хакназарович</Text>
      </View>);
    case 'chat': return (
      <View style={{ rowGap: 8 }}>
        <Text style={T({ s: 14.5, c: '#11131a', st: { alignSelf: 'flex-end', maxWidth: '82%', backgroundColor: W, borderRadius: 16, padding: 10, overflow: 'hidden' } })}>В четверг у нас другая аудитория, не 105</Text>
        <View style={{ alignSelf: 'flex-start', maxWidth: '82%', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 16, padding: 10 }}>
          <Text style={T({ s: 12, w: 700, o: 0.8 })}>Разработчик</Text><Text style={T({ s: 14.5 })}>Спасибо, поправили</Text>
        </View>
      </View>);
    case 'widget': return (
      // Виджет «Плитки» с 9 ноя 2026 — одна карточка: статус и отсчёт, предмет крупно, время и аудитория
      <View style={{ backgroundColor: '#0E9B72', borderRadius: 22, padding: 16, rowGap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={T({ s: 12, w: 700, c: '#0b0d10' })}>Идёт · III пара</Text>
          <Text style={T({ s: 12, c: '#0b0d10' })}>осталось <Text style={T({ s: 12, w: 800, c: '#0b0d10' })}>45:12</Text></Text>
        </View>
        <Text style={T({ s: 26, w: 800, c: '#0b0d10', st: { lineHeight: 29 } })}>Численные методы</Text>
        <Text style={T({ s: 12, c: 'rgba(11,13,16,0.66)' })}>Практика · Хайбуллоев Д.А.</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 }}>
          <Text style={T({ s: 14, w: 700, c: '#0b0d10' })}>11:30 – 13:00</Text>
          <Text style={T({ s: 12, c: '#0b0d10' })}>ауд. <Text style={T({ s: 24, w: 800, c: '#0b0d10' })}>702</Text></Text>
        </View>
        <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
          <View style={{ width: '49%', height: 5, borderRadius: 3, backgroundColor: '#0b0d10' }} />
        </View>
      </View>);
    default: return null;
  }
}

export default function WhatsNew() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const path = usePathname();
  const st = useStreak();
  const [i, setI] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const prog = useRef(new Animated.Value(0)).current;
  const progVal = useRef(0);
  useEffect(() => { const id = prog.addListener(({ value }) => { progVal.current = value; }); return () => prog.removeListener(id); }, [prog]);
  // новая история — полоска с нуля, без паузы
  useEffect(() => { prog.setValue(0); progVal.current = 0; setPaused(false); }, [i, prog]);
  // идёт сама; на паузе — стоит, потом продолжает с того же места
  useEffect(() => {
    if (i === null || paused) return;
    const a = Animated.timing(prog, { toValue: 1, duration: Math.max(0, (1 - progVal.current) * SLIDE_MS), easing: Easing.linear, useNativeDriver: false });
    a.start(({ finished }) => { if (finished && i < LAST) setI(i + 1); });
    return () => a.stop();
  }, [i, paused, prog]);
  const total = st?.total ?? 0;

  const close = useCallback(() => { setI(null); AsyncStorage.setItem(WHATS_NEW_SEEN_KEY, WHATS_NEW_ID).catch(() => null); }, []);
  useEffect(() => { opener = () => setI(0); return () => { opener = null; }; }, []);

  // Сам — один раз на выпуск, когда огонёк виден и группа выбрана
  useEffect(() => {
    if (!st || i !== null || path === '/onboarding') return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const [[, gid], [, seen]] = await AsyncStorage.multiGet(['selected_group_id', WHATS_NEW_SEEN_KEY]);
        if (alive && gid && seen !== WHATS_NEW_ID) setI(0);
      } catch { /* нет хранилища */ }
    }, 2500);
    return () => { alive = false; clearTimeout(t); };
  }, [st, i, path]);

  if (i === null) return null;
  const last = i === LAST;
  const s = last ? null : SLIDES[i];
  const bg: [string, string] = s ? s.bg : ['#6b2a07', '#f07a1a'];
  const pr = progressLine(total);
  const tap = (x: number) => {
    if (x < width * EDGE) setI(n => (n ? n - 1 : 0));
    else if (x > width * (1 - EDGE)) { if (!last) setI(n => (n ?? 0) + 1); }
    else setPaused(v => !v);
  };

  return (
    <Modal visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <LinearGradient colors={bg} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1 }} onPress={e => tap(e.nativeEvent.pageX)} accessibilityRole="button"
          accessibilityLabel={last ? 'Ваш огонёк' : `${s!.title}. Нажмите справа — дальше, слева — назад`}>
          <View style={{ position: 'absolute', left: 14, right: 14, top: insets.top + 12, flexDirection: 'row', columnGap: 4 }}>
            {Array.from({ length: LAST + 1 }, (_, j) => (
              <View key={j} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
                {j < i ? <View style={{ flex: 1, backgroundColor: W }} />
                  : j === i ? <Animated.View style={{ height: 3, backgroundColor: W, width: prog.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} /> : null}
              </View>))}
          </View>
          <ScrollView key={i} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingTop: insets.top + 80, paddingBottom: insets.bottom + 28 }}
            showsVerticalScrollIndicator={false}>
            {s ? (
              <>
                <Text style={T({ s: 13, w: 700, o: 0.8, st: { letterSpacing: 1.4, textTransform: 'uppercase' } })}>{s.over}</Text>
                <Text style={T({ s: 32, w: 800, st: { lineHeight: 36, marginTop: 8 } })}>{s.title}</Text>
                {s.text ? <Text style={T({ s: 16, o: 0.93, st: { marginTop: 12, lineHeight: 22 } })}>{s.text}</Text> : null}
                {s.pic ? (
                  <View style={{ marginTop: 20 }}>
                    <Picture pic={s.pic} />
                    {s.pic === 'vote' || s.pic === 'early' || s.pic === 'term'
                      ? <Text style={T({ s: 12, w: 600, o: 0.7, st: { marginTop: 8 } })}>Для примера</Text> : null}
                  </View>
                ) : null}
                {s.rules ? (
                  <View style={{ marginTop: 18, rowGap: 8 }}>{s.rules.map(([a, b]) => (
                    <View key={b} style={{ flexDirection: 'row', alignItems: 'center', columnGap: 10, backgroundColor: glass, borderRadius: 14, padding: 10 }}>
                      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}><Text style={T({ s: 13, w: 800 })}>{a}</Text></View>
                      <Text style={T({ s: 15, w: 600, st: { flex: 1 } })}>{b}</Text>
                    </View>))}</View>
                ) : null}
                {s.how ? (
                  <View style={{ marginTop: 18, backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: 14, padding: 12 }}>
                    <Text style={T({ s: 11, w: 800, o: 0.8, st: { letterSpacing: 1, marginBottom: 4 } })}>КАК ПОЛЬЗОВАТЬСЯ</Text>
                    {s.how.map((h, j) => <Text key={j} style={T({ s: 15, st: { marginVertical: 3, lineHeight: 21 } })}>{s.how!.length > 1 ? `${j + 1}. ${h}` : h}</Text>)}
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <Text style={T({ s: 13, w: 700, o: 0.8, st: { letterSpacing: 1.4 } })}>ВАШ ОГОНЁК</Text>
                <Text style={T({ s: 84, w: 800, st: { lineHeight: 88, marginTop: 8 } })}>{total}</Text>
                <Text style={T({ s: 32, w: 800, st: { lineHeight: 36 } })}>{pr ? `${daysWordRu(total)} из ${pr.goal}` : daysWordRu(total)}</Text>
                <Text style={T({ s: 16, o: 0.93, st: { marginTop: 12, lineHeight: 22 } })}>
                  {pr ? `Ещё ${pr.left} ${pr.left === 1 ? 'учебный день' : pr.left < 5 ? 'учебных дня' : 'учебных дней'} — и ${pr.what}.` : 'Всё уже открыто — включайте призы в Кабинете.'}
                </Text>
                {pr ? (
                  <View style={{ marginTop: 16, height: 10, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' }}>
                    <View style={{ height: 10, width: `${Math.round((total / pr.goal) * 100)}%`, backgroundColor: W, borderRadius: 6 }} />
                  </View>
                ) : null}
                <Text style={T({ s: 14, o: 0.8, st: { marginTop: 12 } })}>Эти экраны можно открыть снова: Кабинет → «Что нового».</Text>
                <Pressable onPress={close} accessibilityRole="button"
                  style={({ pressed }) => ({ marginTop: 22, height: 52, borderRadius: 16, backgroundColor: W, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
                  <Text style={T({ s: 16, w: 700, c: '#7a3d00' })}>Понятно</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
          <Text pointerEvents="none" style={T({ s: 15, w: 800, st: { position: 'absolute', left: 18, top: insets.top + 30 } })}>Что нового</Text>
          {paused ? (
            <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 32, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={T({ s: 12, w: 700, st: { letterSpacing: 1 } })}>ПАУЗА</Text>
            </View>
          ) : null}
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Закрыть" hitSlop={8}
            style={{ position: 'absolute', right: 10, top: insets.top + 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={T({ s: 28, w: 500, st: { lineHeight: 30 } })}>×</Text>
          </Pressable>
        </Pressable>
      </LinearGradient>
    </Modal>
  );
}


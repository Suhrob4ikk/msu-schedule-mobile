/**
 * Огонёк серии в приложении — как на сайте (вариант В, выбор владельца 8 ноя 2026; спека — docs/Огонёк — логика.md
 * репозитория сайта): число с пламенем на вкладке «Кабинет» (`StreakTabBadge`), в Кабинете пламя на аватаре
 * (`StreakAvatar`) и «N дней подряд» под группой (`StreakInline`); нажатие — шторка (`StreakSheetHost`).
 * В шторке ни правил, ни легенды, ни полосы «До нового» (владелец, 1 и 8 ноя 2026): пламя в кольце, серия, рекорд,
 * заморозка, неделя; до 21 дня — что откроется; после — достижения и призы; внизу «Сохранить серию» (код из 6 цифр,
 * логин и пароль). Считает сервер (src/streak/streak.ts). Только в тестовом режиме.
 */
import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import BottomSheet from '../schedule/BottomSheet';
import { FONT, RADIUS, useTokens, type Tokens } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import FlameArt from '../prizes/FlameArt';
import { FLAME_NAMES, savePrizes, usePrizes, type FlameKind } from '../prizes/prizes';
import SkyBand, { useSky } from '../prizes/SkyBand';
import { FlipCountdown, LiveWave } from '../prizes/FocusPrizes';
import { Toggle } from '../profile/rows';
import { dushanbeNow, isoOf } from '../holiday/holidays';
import BadgeGrid, { achItems, type AchItem } from './BadgeGrid';
import {
  STREAK_GOAL, daysWord, onOpenStreakSheet, openStreakSheet, pairClaim, pairStart, readServerStreak, reloadStreak,
  streakAccount, useStreak, type DayMark, type StreakState,
} from './streak';

const DOW = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const FROST = '#4AA3D8';
const DAY_MARKS = [STREAK_GOAL, 30, 40, 50];

/** Число с пламенем на вкладке «Кабинет». */
export function StreakTabBadge() {
  const st = useStreak();
  const k = useTokens();
  const prizes = usePrizes();
  if (!st || st.streak <= 0) return null;
  // пламя того же вида, что на аватаре и в шторке (приз «Другой огонёк») — владелец 9 ноя 2026: «цвета разные»
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: -6, left: 14, flexDirection: 'row', alignItems: 'center', height: 18,
      paddingLeft: 1, paddingRight: 6, borderRadius: 9, backgroundColor: k.surface, borderWidth: 1, borderColor: k.border }}>
      <FlameArt kind={prizes.flame} size={15} dark={k.mode !== 'light'} still />
      <Txt t="captionStrong" color={k.text} style={{ fontSize: 11, lineHeight: 14 }}>{st.streak}</Txt>
    </View>
  );
}

/** Аватар в Кабинете: с огоньком — кнопка, пламя на краю круга. */
export function StreakAvatar({ k, children }: { k: Tokens; children: React.ReactNode }) {
  const st = useStreak();
  const prizes = usePrizes();
  if (!st) return <>{children}</>;
  return (
    <Pressable onPress={() => openStreakSheet()} accessibilityRole="button" accessibilityLabel={`Серия: ${st.streak} ${daysWord(st.streak)} подряд`}>
      {children}
      {st.streak > 0 && (
        <View pointerEvents="none" style={{ position: 'absolute', right: -9, bottom: -8 }}>
          <FlameArt kind={prizes.flame} size={30} dark={k.mode !== 'light'} />
        </View>
      )}
    </Pressable>
  );
}

/** «8 дней подряд» под группой — то же нажатие. */
export function StreakInline({ k }: { k: Tokens }) {
  const st = useStreak();
  if (!st) return null;
  return (
    <Pressable onPress={() => openStreakSheet()} hitSlop={6} accessibilityRole="button">
      <Txt t="labelStrong" color={k.accentText}>{st.streak} {daysWord(st.streak)} подряд</Txt>
    </Pressable>
  );
}

/** Шторка — одна на Кабинет; открывают аватар, «N дней подряд», подсказки. */
export function StreakSheetHost({ k }: { k: Tokens }) {
  const st = useStreak();
  const [open, setOpen] = useState<null | { section?: 'save' }>(null);
  useEffect(() => onOpenStreakSheet(section => setOpen({ section })), []);
  if (!st) return null;
  return (
    <BottomSheet visible={!!open} onClose={() => setOpen(null)} k={k} label="Серия">
      {open && <StreakPanel st={st} k={k} saveFirst={open.section === 'save'} />}
    </BottomSheet>
  );
}

function dotStyle(mark: DayMark, k: Tokens) {
  switch (mark) {
    case 'visit': return { bg: k.accent, fg: k.onAccent, border: 'transparent' };
    case 'frozen': return { bg: FROST, fg: '#FFFFFF', border: 'transparent' };
    case 'off': return { bg: k.surface2, fg: k.textSecondary, border: 'transparent' };
    case 'missed': return { bg: 'transparent', fg: k.statusOffline, border: k.statusOffline };
    case 'today': return { bg: 'transparent', fg: k.accentText, border: k.accent };
    default: return { bg: 'transparent', fg: k.textSecondary, border: 'transparent' };
  }
}

function StreakPanel({ st, k, saveFirst }: { st: StreakState; k: Tokens; saveFirst: boolean }) {
  const prizes = usePrizes();
  const dark = k.mode !== 'light';
  const next = DAY_MARKS.find(m => m > st.total);
  const prev = [0, ...DAY_MARKS].filter(m => m <= st.total).pop() ?? 0;
  const ring = next ? (st.total - prev) / (next - prev) : 1;
  const R = 40, C = 2 * Math.PI * R;
  const list = achItems(st.achievements, st.test, st.total, isoOf(dushanbeNow()));
  const open = st.total >= STREAK_GOAL || list.some(a => a.id === 'weeks3' && a.got);
  // Тяжёлое (12 знаков, призы, примеры) — после того, как шторка выехала: иначе открытие подтормаживало (владелец, 9 ноя 2026)
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 320); return () => clearTimeout(t); }, []);
  return (
    <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
      {saveFirst && <SaveBox k={k} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 14, marginTop: saveFirst ? 16 : 0 }}>
        <View style={{ width: 88, height: 88, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={88} height={88} viewBox="0 0 88 88" style={{ position: 'absolute' }}>
            <Circle cx={44} cy={44} r={R} stroke={k.surface2} strokeWidth={5} fill="none" />
            <Circle cx={44} cy={44} r={R} stroke={k.accent} strokeWidth={5} fill="none" strokeLinecap="round"
              strokeDasharray={`${Math.max(0.02, ring) * C} ${C}`} transform="rotate(-90 44 44)" />
          </Svg>
          <FlameArt kind={prizes.flame} size={52} dark={dark} />
        </View>
        <View>
          <Txt t="bigCount" color={k.text} style={{ fontSize: 52, lineHeight: 56 }}>{st.streak}</Txt>
          <Txt t="small" color={k.textSecondary}>{daysWord(st.streak)} подряд</Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', columnGap: 8, marginVertical: 14 }}>
        <View style={{ flex: 1, backgroundColor: k.surface2, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 10 }}>
          <Txt t="titleCard" color={k.text}>{st.best}</Txt>
          <Txt t="caption" color={k.textSecondary}>рекорд</Txt>
        </View>
        <View style={{ flex: 1, backgroundColor: k.surface2, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', columnGap: 8 }}>
          <Ionicons name="snow-outline" size={18} color={st.freezeLeft ? FROST : k.textSecondary} />
          <Txt t="small" color={k.textSecondary}>{st.freezeLeft ? 'заморозка есть' : 'заморозка потрачена'}</Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {st.week.map((d, i) => {
          const s = dotStyle(d.mark, k);
          return (
            <View key={d.iso} style={{ alignItems: 'center', rowGap: 4 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: s.bg, borderWidth: 2, borderColor: s.border }}>
                <Txt t="captionStrong" color={s.fg}>{Number(d.iso.slice(8))}</Txt>
              </View>
              <Txt t="caption" color={k.textSecondary}>{DOW[i]}</Txt>
            </View>
          );
        })}
      </View>
      {!ready ? <View style={{ height: 240 }} /> : !open ? <PrizeTeaser k={k} left={Math.max(0, STREAK_GOAL - st.total)} /> : (
        <>
          <Txt t="sectionTitle" color={k.textSecondary} style={{ marginTop: 20, marginBottom: 8 }}>
            Достижения · {list.filter(a => a.got).length} из {list.length}
          </Txt>
          <BadgeGrid list={list} k={k} />
          <PrizeSwitches k={k} list={list} />
        </>
      )}
      {!saveFirst && ready && <View style={{ marginTop: 16 }}><SaveBox k={k} /></View>}
      {st.test && <Txt t="caption" color={k.textSecondary} style={{ marginTop: 10 }}>Тест: серия подставлена в «Тестовом режиме».</Txt>}
    </View>
  );
}

/** До 21-го дня: что откроется — призы с замком, по нажатию живой пример (как на сайте; идея владельца:
 *  «показать, что они могут получить»). */
function PrizeTeaser({ k, left }: { k: Tokens; left: number }) {
  const [pv, setPv] = useState<string | null>(null);
  const items: [string, string][] = [['frame', 'Волна'], ['sky', 'Живое небо'], ['flip', 'Табло'], ['flame', 'Другой огонёк']];
  return (
    <View style={{ marginTop: 18 }}>
      <Txt t="sectionTitle" color={k.textSecondary} style={{ marginBottom: 8 }}>Через {left} {daysWord(left)} с расписанием</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {items.map(([id, name]) => (
          <Pressable key={id} onPress={() => setPv(pv === id ? null : id)} accessibilityRole="button" accessibilityState={{ expanded: pv === id }}
            style={{ flexDirection: 'row', alignItems: 'center', columnGap: 5, height: 32, paddingHorizontal: 11, borderRadius: 16,
              backgroundColor: pv === id ? k.accentSoft : k.surface2 }}>
            <Ionicons name="lock-closed-outline" size={13} color={pv === id ? k.onAccentSoft : k.textSecondary} />
            <Txt t="chip" color={pv === id ? k.onAccentSoft : k.textSecondary}>{name}</Txt>
          </Pressable>
        ))}
      </View>
      {pv && <View style={{ marginTop: 10 }}><PrizeDemo id={pv} k={k} frame="accent" flip /></View>}
    </View>
  );
}

/** Живой пример приза: рамка и табло — на карточке идущей пары, небо — полоса шапки, огонёк — виды пламени. */
function PrizeDemo({ id, k, frame, flip }: { id: string; k: Tokens; frame: 'off' | 'accent' | 'rainbow'; flip: boolean }) {
  if (id === 'sky') return <SkyDemo k={k} />;
  if (id === 'flame') return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-around', padding: 8, borderRadius: 16, backgroundColor: k.surface2 }}>
      {(['blue', 'violet', 'rainbow', 'plasma'] as FlameKind[]).map(f => <FlameArt key={f} kind={f} size={44} dark={k.mode !== 'light'} />)}
    </View>
  );
  return <DemoFocus k={k} frame={id === 'frame' ? (frame === 'off' ? 'accent' : frame) : 'off'} flip={id === 'flip'} />;
}

function SkyDemo({ k }: { k: Tokens }) {
  const { now } = useSky();
  return (
    <View style={{ height: 64, borderRadius: 14, overflow: 'hidden', justifyContent: 'center', paddingHorizontal: 14, backgroundColor: k.bg }}>
      <SkyBand now={now} dark={k.mode !== 'light'} bg={k.bg} />
      <Txt t="titleRow" color={now.night > 0.3 ? '#FFFFFF' : k.text}>МГУ Душанбе</Txt>
    </View>
  );
}

/** Карточка идущей пары — как на «Расписании»: видно, как приз выглядит в деле. */
function DemoFocus({ k, frame, flip }: { k: Tokens; frame: 'off' | 'accent' | 'rainbow'; flip: boolean }) {
  // через 4 с «47» перелистнётся на «46» — видно, как работает «Табло»
  const [target] = useState(() => Date.now() + (46 * 60 + 4) * 1000);
  // пример «Волны» — ускоренный: пара «проходит» за 40 секунд, чтобы было видно движение
  const [demo] = useState(() => ({ from: Date.now() - 19_000, to: Date.now() + 21_000 }));
  const wave = frame !== 'off';
  return (
    <View pointerEvents="none" style={{ borderRadius: RADIUS.lg, backgroundColor: k.accent, padding: 16, rowGap: 10, overflow: 'hidden' }}>
      {wave && <LiveWave from={demo.from} to={demo.to} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ paddingHorizontal: 10, height: 26, borderRadius: 13, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' }}>
          <Txt t="captionStrong" color={k.onAccent}>Идёт · II пара</Txt>
        </View>
        {flip ? <FlipCountdown targetAt={target} label="осталось" color={k.onAccent} />
          : <Txt t="labelStrong" color={k.onAccent}>осталось 46 мин</Txt>}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View><Txt t="display" color={k.onAccent} style={{ fontSize: 32, lineHeight: 34 }}>09:45</Txt><Txt t="small" color={k.onAccent}>до 11:15</Txt></View>
        <View style={{ alignItems: 'flex-end' }}><Txt t="overline" color={k.onAccent}>Аудитория</Txt><Txt t="display" color={k.onAccent} style={{ fontSize: 32, lineHeight: 34 }}>602</Txt></View>
      </View>
      <Txt t="titleRow" color={k.onAccent}>Численные методы</Txt>
      {!wave && (
        <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
          <View style={{ height: 6, width: '48%', backgroundColor: k.onAccent }} />
        </View>
      )}
    </View>
  );
}

/** Открытые достижениями призы — переключатель, «Показать пример», где это видно (как на сайте; владелец:
 *  «пусть сами решают» и «нажимаю галочки, а сам не понимаю, что случилось»). */
function PrizeSwitches({ k, list }: { k: Tokens; list: AchItem[] }) {
  const p = usePrizes();
  const [pv, setPv] = useState<string | null>(null);
  const un = new Set(list.filter(a => a.got && a.prize).map(a => a.prize as string));
  if (!['frame', 'sky', 'flip', 'flame'].some(id => un.has(id))) return null;
  const chip = (on: boolean, label: string, f: () => void) => (
    <Pressable key={label} onPress={f} style={{ height: 30, paddingHorizontal: 10, borderRadius: 15, justifyContent: 'center', backgroundColor: on ? k.accent : k.card }}>
      <Txt t="chip" color={on ? k.onAccent : k.text}>{label}</Txt>
    </Pressable>
  );
  const showBtn = (id: string) => (
    <Pressable onPress={() => setPv(pv === id ? null : id)} hitSlop={6} accessibilityRole="button">
      <Txt t="link" color={k.accentText}>{pv === id ? 'Скрыть пример' : 'Показать пример'}</Txt>
    </Pressable>
  );
  const where = (t: string) => <Txt t="caption" color={k.textSecondary}>{t}</Txt>;
  const head = (title: string, sub: string, on: boolean, f: () => void) => (
    <Pressable onPress={f} style={{ flexDirection: 'row', alignItems: 'center', columnGap: 12 }} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={title}>
      <View style={{ flex: 1 }}>
        <Txt t="titleRow" color={k.text}>{title}</Txt>
        <Txt t="small" color={k.textSecondary}>{sub}</Txt>
      </View>
      <Toggle k={k} on={on} />
    </Pressable>
  );
  const box = { padding: 14, rowGap: 8 } as const;
  const line = { borderTopWidth: 1, borderTopColor: k.border } as const;
  return (
    <View style={{ marginTop: 18 }}>
      <Txt t="sectionTitle" color={k.textSecondary} style={{ marginBottom: 8 }}>Призы</Txt>
      <View style={{ borderRadius: 16, backgroundColor: k.surface2, overflow: 'hidden' }}>
        {un.has('frame') && (
          <View style={box}>
            {head('Волна', 'Идущая пара наполняется светом, по краю бежит волна', p.frame !== 'off', () => savePrizes({ frame: p.frame === 'off' ? 'accent' : 'off' }))}
            {pv === 'frame' && <DemoFocus k={k} frame={p.frame} flip={false} />}
            {pv === 'frame' && p.frame === 'off' && where('Приз выключен — так карточка выглядит без него')}
            {showBtn('frame')}
            {where('Где: «Расписание», карточка идущей пары')}
          </View>
        )}
        {un.has('sky') && (
          <View style={[box, line]}>
            {head('Живое небо', 'Шапка — небо Душанбе сейчас: солнце, облака, закат, звёзды', p.sky, () => savePrizes({ sky: !p.sky }))}
            {pv === 'sky' && <SkyDemo k={k} />}
            {showBtn('sky')}
            {where('Где: шапка «Расписания» (в праздник — праздничная)')}
          </View>
        )}
        {un.has('flip') && (
          <View style={[box, line]}>
            {head('Табло', 'Минуты до конца пары перелистываются, как на табло', p.flip, () => savePrizes({ flip: !p.flip }))}
            {pv === 'flip' && <DemoFocus k={k} frame="off" flip={p.flip} />}
            {pv === 'flip' && !p.flip && where('Приз выключен — так карточка выглядит без него')}
            {showBtn('flip')}
            {where('Где: «Расписание», карточка пары')}
          </View>
        )}
        {un.has('flame') && (
          <View style={[box, line]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 10 }}>
              <View style={{ flex: 1 }}><Txt t="titleRow" color={k.text}>Другой огонёк</Txt><Txt t="small" color={k.textSecondary}>{FLAME_NAMES[p.flame]}</Txt></View>
              <FlameArt kind={p.flame} size={52} dark={k.mode !== 'light'} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {(Object.keys(FLAME_NAMES) as FlameKind[]).map(f => chip(p.flame === f, FLAME_NAMES[f], () => savePrizes({ flame: f })))}
            </View>
            {where('Где: Кабинет и эта шторка')}
          </View>
        )}
        {/* «Финал недели», «Итоги семестра» и «Ранний доступ» не выключаются — в списке им делать нечего (владелец, 1 ноя 2026) */}
      </View>
    </View>
  );
}

/** «Сохранить серию»: код из 6 цифр между своими устройствами (сайт и приложение) и логин с паролем. */
function SaveBox({ k }: { k: Tokens }) {
  const st = useStreak();
  const [mode, setMode] = useState<'none' | 'show' | 'enter' | 'new' | 'in'>('none');
  const [code, setCode] = useState<{ code: string; expires: number } | null>(null);
  const [left, setLeft] = useState(0);
  const [l, setL] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  // показан код: отсчёт и раз в 4 с — не связались ли уже
  useEffect(() => {
    if (mode !== 'show' || !code) return;
    let before = 1;
    readServerStreak().then(s => { before = s.linked ?? 1; }).catch(() => {});
    const upd = () => setLeft(Math.max(0, Math.round((code.expires - Date.now()) / 1000)));
    upd();
    const tick = setInterval(upd, 1000);
    const poll = setInterval(async () => {
      if (Date.now() > code.expires) return;
      await reloadStreak();
      if (((await readServerStreak()).linked ?? 1) > before) { setMode('none'); setCode(null); }
    }, 4000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [mode, code]);
  if (!st) return null;
  const saved = st.owner || !!st.login || st.linked > 1;
  const reset = (m: typeof mode) => { setMode(m); setErr(''); setL(''); setPw(''); };
  const run = async (f: () => Promise<string>) => { setBusy(true); setErr(''); const e = await f(); setBusy(false); if (e) setErr(e); else { setMode('none'); setPw(''); setL(''); } };
  const show = async () => {
    setBusy(true); setErr('');
    const r = await pairStart();
    setBusy(false);
    if (typeof r === 'string') setErr(r); else { setCode(r); setMode('show'); }
  };
  const link = (title: string, f: () => void) => (
    <Pressable key={title} onPress={f} disabled={busy} hitSlop={6}><Txt t="link" color={k.accentText}>{title}</Txt></Pressable>
  );
  const main = (title: string, f: () => void, disabled = false) => (
    <Pressable onPress={f} disabled={busy || disabled} style={{ height: 42, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center', backgroundColor: k.accent, opacity: busy || disabled ? 0.5 : 1 }}>
      <Txt t="button" color={k.onAccent}>{title}</Txt>
    </Pressable>
  );
  const input = (value: string, set: (v: string) => void, ph: string, extra: object = {}) => (
    <TextInput value={value} onChangeText={set} placeholder={ph} placeholderTextColor={k.textSecondary} autoCapitalize="none" autoCorrect={false}
      style={{ height: 46, paddingHorizontal: 12, borderRadius: 12, backgroundColor: k.card, color: k.text, borderWidth: 1, borderColor: k.border,
        fontFamily: FONT[600], fontSize: 16 }} {...extra} />
  );
  const cancel = link('Отмена', () => { reset('none'); setCode(null); });
  return (
    <View style={{ padding: 14, borderRadius: 16, backgroundColor: k.surface2, rowGap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 6 }}>
        {saved && <Ionicons name="checkmark" size={18} color={k.accentText} />}
        <Txt t="titleRow" color={k.text}>{saved ? 'Серия сохранена' : 'Сохранить серию'}</Txt>
      </View>
      {st.owner ? <Txt t="small" color={k.textSecondary}>Ваших устройств: {st.linked}</Txt>
        : st.login ? <Txt t="small" color={k.textSecondary}>Под логином {st.login}{st.linked > 1 ? ` · общая для ${st.linked} устройств` : ''}</Txt>
        : st.linked > 1 ? <Txt t="small" color={k.textSecondary}>Общая для {st.linked} устройств</Txt> : null}
      {mode === 'none' && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 10 }}>
          {saved ? link('Связать ещё устройство', () => void show()) : main('Связать с другим устройством', () => void show())}
          {!st.owner && link('Ввести код', () => reset('enter'))}
          {!st.owner && (st.login ? link('Выйти', () => void run(() => streakAccount('logout'))) : link('Логин и пароль', () => reset('new')))}
        </View>
      )}
      {mode === 'show' && code && (
        <>
          <Txt t="display" color={k.text} style={{ letterSpacing: 3 }}>{code.code.slice(0, 3)} {code.code.slice(3)}</Txt>
          <Txt t="small" color={k.textSecondary}>{left > 0
            ? `Введите его на другом устройстве: Кабинет → огонёк → «Ввести код». Осталось ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
            : 'Код устарел'}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 14 }}>{left <= 0 && main('Новый код', () => void show())}{cancel}</View>
        </>
      )}
      {mode === 'enter' && (
        <>
          {input(l, v => setL(v.replace(/\D/g, '').slice(0, 6)), 'Код из 6 цифр', { keyboardType: 'number-pad', maxLength: 6, autoFocus: true })}
          <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 14 }}>{main('Связать', () => void run(() => pairClaim(l)), l.length !== 6)}{cancel}</View>
        </>
      )}
      {(mode === 'new' || mode === 'in') && (
        <>
          {input(l, setL, 'Логин', { maxLength: 24, autoComplete: 'username' })}
          {input(pw, setPw, 'Пароль', { maxLength: 64, secureTextEntry: true, autoComplete: mode === 'new' ? 'new-password' : 'current-password' })}
          {mode === 'new' && <Txt t="small" color={k.textSecondary}>Пригодится на новом телефоне. Забудете пароль — напишите разработчику на сайте.</Txt>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 8 }}>
            {main(mode === 'new' ? 'Сохранить' : 'Войти', () => void run(() => streakAccount(mode === 'new' ? 'account' : 'login', l, pw)), l.length < 3 || pw.length < 6)}
            {mode === 'new' && link('У меня уже есть', () => setMode('in'))}
            {cancel}
          </View>
        </>
      )}
      {err ? <Txt t="smallStrong" color={k.statusOffline}>{err}</Txt> : null}
    </View>
  );
}

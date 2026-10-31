/**
 * Огонёк с числом серии в шапке Расписания, рядом с колокольчиком (как на сайте). Нажатие — лист:
 * серия, рекорд, заморозка, неделя кружками, «До нового: N из 30», правила. Только в тестовом режиме.
 */
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import BottomSheet from '../schedule/BottomSheet';
import { RADIUS, type Tokens } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import Flame from './Flame';
import { STREAK_GOAL, daysWord, onOpenStreakSheet, useStreak, type DayMark, type StreakState } from './streak';

const DOW = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const FROST = '#4AA3D8';

export default function FlameChip({ k }: { k: Tokens }) {
  const st = useStreak();
  const [open, setOpen] = useState(false);
  useEffect(() => onOpenStreakSheet(() => setOpen(true)), []);
  if (!st) return null;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Серия: ${st.streak} ${daysWord(st.streak)}`}
        style={{ flexDirection: 'row', alignItems: 'center', columnGap: 3, height: 32, paddingLeft: 6, paddingRight: 10, marginLeft: 6,
          borderRadius: RADIUS.pill, borderWidth: 1, borderColor: k.border, backgroundColor: k.surface }}>
        <Flame n={st.streak} size={20} />
        <Txt t="countNum" color={st.streak ? k.text : k.textSecondary}>{st.streak}</Txt>
      </Pressable>
      <BottomSheet visible={open} onClose={() => setOpen(false)} k={k} label="Серия">
        <StreakPanel st={st} k={k} />
      </BottomSheet>
    </>
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

function StreakPanel({ st, k }: { st: StreakState; k: Tokens }) {
  const left = Math.max(0, STREAK_GOAL - st.streak);
  return (
    <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 12 }}>
        <View style={{ width: 64, alignItems: 'center' }}><Flame n={Math.max(st.streak, 1)} size={56} /></View>
        <View>
          <Txt t="bigCount" color={k.text}>{st.streak}</Txt>
          <Txt t="small" color={k.textSecondary}>{daysWord(st.streak)} подряд</Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', columnGap: 8, marginVertical: 14 }}>
        {[[String(st.best), 'рекорд'], [st.freezeLeft ? '1' : '0', 'заморозка на неделю']].map(([v, l]) => (
          <View key={l} style={{ flex: 1, backgroundColor: k.surface2, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 10 }}>
            <Txt t="titleCard" color={k.text}>{v}</Txt>
            <Txt t="caption" color={k.textSecondary}>{l}</Txt>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 }}>
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
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4, marginTop: 6, marginBottom: 12 }}>
        {([['заходили', k.accent], ['спасла заморозка', FROST], ['без пар', k.surface2], ['пропуск', null]] as const).map(([l, c]) => (
          <View key={l} style={{ flexDirection: 'row', alignItems: 'center', columnGap: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c ?? 'transparent', borderWidth: c ? 0 : 2, borderColor: k.statusOffline }} />
            <Txt t="caption" color={k.textSecondary}>{l}</Txt>
          </View>
        ))}
      </View>
      {st.streak < STREAK_GOAL ? (
        <View>
          <View style={{ height: 10, borderRadius: 6, backgroundColor: k.surface2, overflow: 'hidden' }}>
            <View style={{ height: 10, borderRadius: 6, width: `${(st.streak / STREAK_GOAL) * 100}%`, backgroundColor: k.accent }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Txt t="small" color={k.textSecondary}>До нового: {st.streak} из {STREAK_GOAL}</Txt>
            <Txt t="small" color={k.textSecondary}>{left} {daysWord(left)}</Txt>
          </View>
        </View>
      ) : (
        <Txt t="small" color={k.textSecondary}><Txt t="smallStrong" color={k.text}>Достижения открыты. </Txt>В тестовой версии их ещё нет — появятся в следующем обновлении.</Txt>
      )}
      <View style={{ marginTop: 12, rowGap: 3 }}>
        {['Каждый день, когда вы открыли приложение, — плюс один, даже в воскресенье.',
          'День без пар можно пропустить — серия не прервётся.',
          'Пропущенный учебный день обнуляет серию. Один пропуск в неделю спасает заморозка.'].map(t => (
          <Txt key={t} t="small" color={k.textSecondary}>• {t}</Txt>
        ))}
      </View>
      {st.test && <Txt t="caption" color={k.textSecondary} style={{ marginTop: 10 }}>Тест: серия подставлена в «Тестовом режиме».</Txt>}
    </View>
  );
}

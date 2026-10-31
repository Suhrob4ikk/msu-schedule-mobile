/**
 * «Тестовый режим» для владельца и тестировщиков: Кабинет → долгое нажатие на номер версии внизу.
 * Включает праздник (src/holiday/holidays.ts) и огонёк серии (src/streak/streak.ts) так же, как на сайте
 * ссылки `?holiday=…` и `?streak=…`. Студенты сюда не попадают случайно: подсказки о жесте нигде нет.
 */
import { Pressable, View } from 'react-native';
import BottomSheet from './schedule/BottomSheet';
import { RADIUS, type Tokens } from './schedule/tokens';
import { Txt } from './schedule/ui';
import { HOLIDAYS, setTestHoliday, useHoliday, type HolidayId } from './holiday/holidays';
import { setStreakTest, useStreak } from './streak/streak';

function Chip({ k, on, label, onPress }: { k: Tokens; on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ minHeight: 40, paddingHorizontal: 14, justifyContent: 'center', borderRadius: RADIUS.md, backgroundColor: on ? k.accent : k.surface2 }}>
      <Txt t="labelStrong" color={on ? k.onAccent : k.text}>{label}</Txt>
    </Pressable>
  );
}

export default function TestModeSheet({ visible, onClose, k }: { visible: boolean; onClose: () => void; k: Tokens }) {
  const { holiday, test } = useHoliday();
  const st = useStreak();
  const cur: HolidayId | null = test && holiday ? holiday.id : null;
  const streakOpts: [string, null | 'on' | number][] = [['Выкл', null], ['Настоящий счёт', 'on'], ['1', 1], ['7', 7], ['15', 15], ['25', 25], ['29', 29], ['30', 30], ['60', 60]];
  return (
    <BottomSheet visible={visible} onClose={onClose} k={k} label="Тестовый режим">
      <View style={{ paddingHorizontal: 20, paddingBottom: 28, rowGap: 10 }}>
        <Txt t="sheetTitle" color={k.text}>Тестовый режим</Txt>
        <Txt t="small" color={k.textSecondary}>Только для проверки. Студенты без этого ничего не увидят.</Txt>
        <Txt t="sectionTitle" color={k.textSecondary} style={{ marginTop: 6 }}>Праздник</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip k={k} on={!cur} label="Выкл" onPress={() => { void setTestHoliday(null); }} />
          {HOLIDAYS.map(h => <Chip key={h.id} k={k} on={cur === h.id} label={h.label} onPress={() => { void setTestHoliday(h.id); }} />)}
        </View>
        <Txt t="sectionTitle" color={k.textSecondary} style={{ marginTop: 10 }}>Огонёк серии</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {streakOpts.map(([l, v]) => {
            const on = v === null ? !st : v === 'on' ? !!st && !st.test : !!st && st.test && st.streak === v;
            return <Chip key={l} k={k} on={on} label={l} onPress={() => { void setStreakTest(v); }} />;
          })}
        </View>
        <Txt t="caption" color={k.textSecondary}>«Настоящий счёт» — серия считается по вашим заходам с сегодняшнего дня. Число — подставить серию, чтобы увидеть подсказки и огонь.</Txt>
      </View>
    </BottomSheet>
  );
}

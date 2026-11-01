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
import { FLAME_NAMES, savePrizes, usePrizes, type FlameKind } from './prizes/prizes';

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
  const pz = usePrizes();
  const cur: HolidayId | null = test && holiday ? holiday.id : null;
  const streakOpts: [string, null | 'on' | number][] = [['Выкл', null], ['Настоящий счёт', 'on'], ['1', 1], ['7', 7], ['14', 14], ['20', 20], ['21', 21], ['60', 60]];
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
        {/* Призы за достижения (src/prizes): пока достижений нет — включаются только здесь */}
        <Txt t="sectionTitle" color={k.textSecondary} style={{ marginTop: 10 }}>Призы · живая рамка</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip k={k} on={pz.frame === 'off'} label="Выкл" onPress={() => { void savePrizes({ frame: 'off' }); }} />
          <Chip k={k} on={pz.frame === 'accent'} label="В цвет оформления" onPress={() => { void savePrizes({ frame: 'accent' }); }} />
          <Chip k={k} on={pz.frame === 'rainbow'} label="Радуга" onPress={() => { void savePrizes({ frame: 'rainbow' }); }} />
        </View>
        <Txt t="sectionTitle" color={k.textSecondary} style={{ marginTop: 10 }}>Призы · табло и небо</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip k={k} on={pz.flip} label={pz.flip ? 'Табло: вкл' : 'Табло: выкл'} onPress={() => { void savePrizes({ flip: !pz.flip }); }} />
          <Chip k={k} on={pz.sky} label={pz.sky ? 'Живое небо: вкл' : 'Живое небо: выкл'} onPress={() => { void savePrizes({ sky: !pz.sky }); }} />
        </View>
        <Txt t="sectionTitle" color={k.textSecondary} style={{ marginTop: 10 }}>Призы · огонёк</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(Object.keys(FLAME_NAMES) as FlameKind[]).map(f => <Chip key={f} k={k} on={pz.flame === f} label={FLAME_NAMES[f]} onPress={() => { void savePrizes({ flame: f }); }} />)}
        </View>
        <Txt t="caption" color={k.textSecondary}>Огонёк виден в Кабинете, когда включён «Огонёк серии» выше.</Txt>
      </View>
    </BottomSheet>
  );
}

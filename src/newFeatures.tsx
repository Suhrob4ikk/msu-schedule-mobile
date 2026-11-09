/**
 * Новые функции и «Ранний доступ» (9 ноя 2026) — как на сайте (frontend/src/lib/newFeatures.ts). Награда огонька
 * за 30 дней с заходом: новая функция открывается на EARLY_DAYS дней раньше, чем у всех (`allFrom`).
 *
 * Каждая функция описывается здесь один раз: что умеет и как пользоваться. Код функции спрашивает
 * `useFeatureOn(id)` и без «да» себя не показывает. При первом открытии — один раз окно с инструкцией
 * (`NewFeatureSheet`, подключено в app/_layout.tsx): «Раньше всех» или «Новое в приложении».
 * «Ранний доступ» — 30+ дней с заходом (огонёк) или достижение «Следопыт» (приз early).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { usePathname } from 'expo-router';
import { usePrizeUnlocked } from './prizes/prizes';
import { useStreak } from './streak/streak';
import { dushanbeNow, isoOf } from './holiday/holidays';
import { useTokens } from './schedule/tokens';
import { Txt } from './schedule/ui';
import BottomSheet from './schedule/BottomSheet';
import { Button } from './profile/rows';

export type NewFeature = { id: string; title: string; what: string; steps: string[]; allFrom: string };

export const EARLY_DAYS = 7;
export const EARLY_TOTAL = 30;
const SEEN_KEY = 'features_seen';
export const NEW_FEATURE_TEST_KEY = 'new_feature_test';

/** Список новых функций (пример записи — в frontend/src/lib/newFeatures.ts). */
export const FEATURES: NewFeature[] = [];

const DEMO: NewFeature = {
  id: '_demo', title: 'Сводка дня', what: 'Утром одной карточкой: изменения, окна и свободные аудитории.',
  steps: ['Откройте «Расписание» — карточка сверху', 'Нажмите на окно между парами — покажем свободные аудитории'],
  allFrom: '2999-01-01',
};

const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };

export function useEarlyAccess(): boolean {
  const prize = usePrizeUnlocked('early');
  const st = useStreak();
  return prize || (st?.total ?? 0) >= EARLY_TOTAL;
}

function stateOf(f: NewFeature, early: boolean): 'all' | 'early' | null {
  const today = isoOf(dushanbeNow());
  if (today >= f.allFrom) return 'all';
  if (early && today >= addDays(f.allFrom, -EARLY_DAYS)) return 'early';
  return null;
}

export function useFeatureOn(id: string): boolean {
  const early = useEarlyAccess();
  const f = FEATURES.find(x => x.id === id);
  return !!f && stateOf(f, early) !== null;
}

let showTest: (() => void) | null = null;
/** «Тестовый режим» → «Показать окно «Новое»» — пример, ничего не включает. */
export function showNewFeatureDemo(): void { showTest?.(); }

export function NewFeatureSheet() {
  const k = useTokens();
  const path = usePathname();
  const early = useEarlyAccess();
  const [show, setShow] = useState<{ f: NewFeature; early: boolean } | null>(null);

  useEffect(() => { showTest = () => setShow({ f: DEMO, early: true }); return () => { showTest = null; }; }, []);

  useEffect(() => {
    if (show || path === '/onboarding') return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const [[, gid], [, raw]] = await AsyncStorage.multiGet(['selected_group_id', SEEN_KEY]);
        if (!gid) return;
        const seen = new Set<string>(raw ? JSON.parse(raw) : []);
        for (const f of FEATURES) {
          if (seen.has(f.id)) continue;
          const st = stateOf(f, early);
          if (st && alive) { setShow({ f, early: st === 'early' }); return; }
        }
      } catch { /* нет хранилища */ }
    }, 1500);
    return () => { alive = false; clearTimeout(t); };
  }, [path, early, show]);

  const close = async () => {
    const id = show?.f.id;
    setShow(null);
    if (!id || id === DEMO.id) return;
    try {
      const raw = await AsyncStorage.getItem(SEEN_KEY);
      await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...(raw ? JSON.parse(raw) : []), id])]));
    } catch { /* нет хранилища */ }
  };

  return (
    <BottomSheet visible={!!show} onClose={() => void close()} k={k} label={show?.f.title ?? 'Новое'}
      header={show ? (
        <View style={{ paddingBottom: 6 }}>
          <Txt t="overline" color={k.accentText}>{show.early ? 'Раньше всех — у вас ранний доступ' : 'Новое в приложении'}</Txt>
          <Txt t="sheetTitle" color={k.text} style={{ marginTop: 2 }}>{show.f.title}</Txt>
        </View>
      ) : null}>
      {show ? (
        <View style={{ rowGap: 14, paddingBottom: 12 }}>
          <Txt t="body" color={k.text}>{show.f.what}</Txt>
          <View style={{ backgroundColor: k.accentSoft, borderRadius: 14, padding: 12, rowGap: 4 }}>
            <Txt t="overline" color={k.onAccentSoft}>Как пользоваться</Txt>
            {show.f.steps.map((s, i) => <Txt key={i} t="body" color={k.text}>{`${i + 1}. ${s}`}</Txt>)}
          </View>
          <Button k={k} primary title="Понятно" onPress={() => void close()} />
        </View>
      ) : null}
    </BottomSheet>
  );
}

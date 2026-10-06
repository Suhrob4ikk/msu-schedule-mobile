/**
 * Загрузка для работы без интернета: всё расписание (группы, педагоги,
 * аудитории, история своей группы). Показывается сразу после онбординга и
 * при каждом запуске, пока на телефоне чего-то не хватает (state.ts,
 * isOfflineDataComplete) — например, прошлая загрузка оборвалась.
 *
 * Сама загрузка — обычная полная синхронизация (triggerSync): если она уже
 * идёт в фоне, экран к ней присоединяется, а не качает второй раз.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSyncStatus } from '../SyncContext';
import { useThemeMode } from '../theme';
import { useTokens, RADIUS, type Tokens } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import LoaderIcon from './LoaderIcon';
import { Button } from '../profile/rows';
import { prefetchMyChanges } from '../notifications/data';
import { STEPS, Counts, Phase, Step, StepStatus, stepDetail, stepStatus } from './state';

/** Столько ждём ответа сервера, прежде чем сказать «сервер просыпается». */
const SLOW_HINT_MS = 10_000;

/** first — сразу после онбординга; resume — при запуске не хватило данных. */
type Props = { mode: 'first' | 'resume'; onDone: () => void };

export default function OfflineSetupScreen({ mode: kind, onDone }: Props) {
  const k = useTokens();
  const { mode } = useThemeMode();
  const insets = useSafeAreaInsets();
  const { triggerSync, isOnline, onlineAt, syncErrorText } = useSyncStatus();

  const [phase, setPhase] = useState<Phase>('running');
  const [step, setStep] = useState<Step>('download');
  const [counts, setCounts] = useState<Counts | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [slow, setSlow] = useState(false);
  const mounted = useRef(true);
  const busy = useRef(false);

  useEffect(() => () => { mounted.current = false; }, []);

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setPhase('running');
    setStep('download');
    setSlow(false);
    const slowTimer = setTimeout(() => { if (mounted.current) setSlow(true); }, SLOW_HINT_MS);
    const summary = await triggerSync((_msg, stage) => {
      if (!mounted.current) return;
      setStep(stage);
      if (stage !== 'download') setSlow(false);
    });
    clearTimeout(slowTimer);
    if (!mounted.current) return;
    if (!summary) {
      busy.current = false;
      setSlow(false);
      setPhase('error');
      return;
    }
    setCounts(summary);
    setStep('history');
    // История своей группы — не главное: не скачалась, обновится сама позже
    let failed = false;
    try {
      const gid = await AsyncStorage.getItem('selected_group_id');
      if (gid) await prefetchMyChanges(Number(gid));
    } catch {
      failed = true;
    }
    busy.current = false;
    if (!mounted.current) return;
    setHistoryFailed(failed);
    setPhase('done');
  }, [triggerSync]);

  useEffect(() => { run(); }, [run]);

  // Ошибка из-за сети, и сеть вернулась — пробуем сами, без кнопки
  const firstOnlineAt = useRef(onlineAt);
  useEffect(() => {
    if (onlineAt !== firstOnlineAt.current && phase === 'error') run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineAt]);

  const finish = onDone;

  const title = phase === 'done' ? 'Всё скачано'
    : phase === 'error' ? 'Не получилось скачать'
      : kind === 'resume' ? 'Докачиваем расписание' : 'Скачиваем расписание';
  const lead = phase === 'done'
    ? 'Теперь расписание, педагоги и аудитории открываются и без интернета. Когда интернет есть, приложение само обновляет их в фоне.'
    : phase === 'error'
      ? (!isOnline
        ? 'Нет интернета. Подключитесь к Wi-Fi или мобильному интернету — загрузка начнётся сама.'
        : `Сервер не ответил${syncErrorText ? `: ${syncErrorText}` : ''}. Попробуйте ещё раз.`)
      : kind === 'resume'
        ? 'Прошлая загрузка не закончилась. Докачаем — и приложение будет работать без интернета.'
        : 'Один раз — и приложение будет работать без интернета. Обычно это несколько секунд.';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: k.bg }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }}
    >
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />

      <LoaderIcon k={k} phase={phase} />
      <Txt t="display" color={k.text} accessibilityRole="header" style={{ fontSize: 30, lineHeight: 36, letterSpacing: 0, marginTop: 20, textAlign: 'center' }}>
        {title}
      </Txt>
      <Txt t="body" color={k.textSecondary} accessibilityLiveRegion="polite" style={{ marginTop: 8, textAlign: 'center' }}>{lead}</Txt>

      <View style={{ backgroundColor: k.surface, borderRadius: RADIUS.lg, paddingVertical: 6, marginTop: 20 }}>
        {STEPS.map(s => (
          <StepRow
            key={s.id}
            k={k}
            title={s.title}
            status={stepStatus(s.id, step, phase, historyFailed)}
            detail={phase === 'done' ? stepDetail(s.id, counts, historyFailed) : null}
          />
        ))}
      </View>

      {slow && phase === 'running' ? (
        <View style={{ flexDirection: 'row', columnGap: 8, marginTop: 14, paddingHorizontal: 4 }}>
          <Ionicons name="time-outline" size={16} color={k.textSecondary} style={{ marginTop: 1 }} />
          <Txt t="small" color={k.textSecondary} style={{ flex: 1 }}>
            Сервер просыпается — так бывает, если им давно не пользовались. Обычно это до минуты.
          </Txt>
        </View>
      ) : null}

      <View style={{ marginTop: 24, rowGap: 10 }}>
        {phase === 'done' ? <Button k={k} primary title="Начать" onPress={finish} /> : null}
        {phase === 'error' ? (
          <>
            <Button k={k} primary title="Повторить" icon="refresh" onPress={run} />
            <Button k={k} title="Позже" onPress={finish} />
          </>
        ) : null}
        {/* Долго — можно не ждать: загрузка продолжится в фоне */}
        {phase === 'running' && slow ? <Button k={k} title="Не ждать — докачается само" onPress={finish} /> : null}
        {phase !== 'done' ? (
          <Txt t="small" color={k.textSecondary} style={{ textAlign: 'center', marginTop: 4 }}>
            Не скачается сейчас — предложим при следующем запуске или в Кабинете.
          </Txt>
        ) : null}
      </View>
    </ScrollView>
  );
}

function StepRow({ k, title, status, detail }: { k: Tokens; title: string; status: StepStatus; detail: string | null }) {
  const spoken = { done: 'готово', active: 'идёт', pending: 'ожидает', failed: 'не удалось' }[status];
  return (
    <View
      accessible
      accessibilityLabel={`${title}: ${detail ?? spoken}`}
      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', columnGap: 12, paddingHorizontal: 16, paddingVertical: 8 }}
    >
      <View style={{ width: 22, alignItems: 'center' }}>
        {status === 'active' ? <ActivityIndicator size="small" color={k.accentText} />
          : status === 'done' ? <Ionicons name="checkmark-circle" size={22} color={k.accentText} />
            : status === 'failed' ? <Ionicons name="alert-circle-outline" size={22} color={k.statusOffline} />
              : <Ionicons name="ellipse-outline" size={22} color={k.textSecondary} />}
      </View>
      <Txt t="rowTitle" color={status === 'pending' ? k.textSecondary : k.text} style={{ flex: 1 }}>{title}</Txt>
      {detail ? <Txt t="rowValue" color={k.textSecondary} numberOfLines={1} style={{ flexShrink: 0 }}>{detail}</Txt> : null}
    </View>
  );
}

/**
 * Экран обновления приложения (OTA, src/otaUpdates.ts) — владелец 9 ноя 2026: «чтобы было видно, что идёт обновление».
 * - скачивается — «Загружаем обновление», кольцо ЧЕСТНОЕ: процент скачивания от модуля expo-updates;
 * - скачано — «Обновляем приложение», кольцо полное, через секунду перезапуск в новой версии;
 * - скачивание сорвалось (пропал интернет) — экран уходит, приложение работает как было.
 * Подключено в app/_layout.tsx.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useTokens } from './schedule/tokens';
import { Txt } from './schedule/ui';
import LoaderIcon from './offline/LoaderIcon';

const APPLY_MS = 1000;      // «Обновляем приложение» — столько видно полное кольцо перед перезапуском
const MIN_SHOW_MS = 700;    // маленькое обновление качается мгновенно — экран не мелькает, а успевает прочитаться
// Страховка (12 ноя 2026: у владельца «Обновляем приложение» висело больше 10 минут): если перезапуск не случился
// за это время или сорвался — экран уходит насовсем до следующего запуска, приложение работает, а скачанное
// обновление включится при следующем открытии. Повторных попыток нет — раньше они шли раз в секунду бесконечно.
const APPLY_GIVE_UP_MS = 8000;
// Скачивание дольше этого (медленный интернет) — экран уходит, скачивание идёт дальше без него
const DOWNLOAD_GIVE_UP_MS = 60_000;

export default function UpdatingOverlay() {
  if (__DEV__ || !Updates.isEnabled) return null;
  return <Overlay />;
}

/**
 * Обычный слой поверх приложения, НЕ Modal: окно Modal на Android может пережить перезапуск React и остаться висеть
 * над уже обновлённым приложением (так, вероятно, и было 12 ноя 2026). Слой живёт внутри приложения и исчезает
 * вместе с ним при перезапуске.
 */
function Overlay() {
  const k = useTokens();
  const { isDownloading, downloadProgress, isUpdatePending } = Updates.useUpdates();
  const [phase, setPhase] = useState<'idle' | 'applying' | 'gaveUp'>('idle');
  const shownAt = useRef(0);
  const visible = phase !== 'gaveUp' && (isDownloading || isUpdatePending || phase === 'applying');
  if (visible && !shownAt.current) shownAt.current = Date.now();
  if (!visible) shownAt.current = 0;

  // Скачалось — «Обновляем приложение» и один перезапуск в новой версии
  useEffect(() => {
    if (!isUpdatePending || phase !== 'idle') return;
    setPhase('applying');
    const wait = Math.max(APPLY_MS, MIN_SHOW_MS - (Date.now() - (shownAt.current || Date.now())));
    const t = setTimeout(() => { Updates.reloadAsync().catch(() => setPhase('gaveUp')); }, wait);
    const giveUp = setTimeout(() => setPhase('gaveUp'), wait + APPLY_GIVE_UP_MS);
    return () => { clearTimeout(t); clearTimeout(giveUp); };
  }, [isUpdatePending, phase]);

  // Скачивание слишком долгое — не держать человека
  useEffect(() => {
    if (!isDownloading || phase !== 'idle') return;
    const t = setTimeout(() => setPhase('gaveUp'), DOWNLOAD_GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [isDownloading, phase]);

  if (!visible) return null;
  const done = isUpdatePending || phase === 'applying';
  const p = done ? 1 : downloadProgress;   // нет процента (редко) — кольцо с бегущей дугой
  const pct = p != null ? Math.round(p * 100) : null;
  return (
    <View accessibilityLiveRegion="polite" accessibilityViewIsModal
      style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000, backgroundColor: k.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
      <LoaderIcon k={k} progress={p ?? undefined} />
      <Txt t="titleScreen" color={k.text} style={{ marginTop: 22, textAlign: 'center' }}>
        {done ? 'Обновляем приложение' : 'Загружаем обновление'}
      </Txt>
      <Txt t="body" color={k.textSecondary} style={{ marginTop: 6, textAlign: 'center' }}>
        {done ? 'Пара секунд' : pct != null ? `Загружено ${pct}%` : 'Пара секунд'}
      </Txt>
    </View>
  );
}

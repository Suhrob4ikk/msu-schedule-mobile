/**
 * Экран обновления приложения (OTA, src/otaUpdates.ts) — владелец 9 ноя 2026: «чтобы было видно, что идёт обновление».
 * - скачивается — «Загружаем обновление», кольцо ЧЕСТНОЕ: процент скачивания от модуля expo-updates;
 * - скачано — «Обновляем приложение», кольцо полное, через секунду перезапуск в новой версии;
 * - скачивание сорвалось (пропал интернет) — экран уходит, приложение работает как было.
 * Подключено в app/_layout.tsx.
 */
import { useEffect, useRef, useState } from 'react';
import { Modal, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useTokens } from './schedule/tokens';
import { Txt } from './schedule/ui';
import LoaderIcon from './offline/LoaderIcon';

const APPLY_MS = 1000;      // «Обновляем приложение» — столько видно полное кольцо перед перезапуском
const MIN_SHOW_MS = 700;    // маленькое обновление качается мгновенно — экран не мелькает, а успевает прочитаться

export default function UpdatingOverlay() {
  if (__DEV__ || !Updates.isEnabled) return null;
  return <Overlay />;
}

function Overlay() {
  const k = useTokens();
  const { isDownloading, downloadProgress, isUpdatePending } = Updates.useUpdates();
  const [applying, setApplying] = useState(false);
  const shownAt = useRef(0);
  const visible = isDownloading || isUpdatePending || applying;
  if (visible && !shownAt.current) shownAt.current = Date.now();
  if (!visible) shownAt.current = 0;

  // Скачалось — показать «Обновляем приложение» и перезапуститься в новой версии
  useEffect(() => {
    if (!isUpdatePending || applying) return;
    setApplying(true);
    const wait = Math.max(APPLY_MS, MIN_SHOW_MS - (Date.now() - (shownAt.current || Date.now())));
    const t = setTimeout(() => { Updates.reloadAsync().catch(() => setApplying(false)); }, wait);
    return () => clearTimeout(t);
  }, [isUpdatePending, applying]);

  if (!visible) return null;
  const done = isUpdatePending || applying;
  const p = done ? 1 : downloadProgress;   // нет процента (редко) — кольцо с бегущей дугой
  const pct = p != null ? Math.round(p * 100) : null;
  return (
    <Modal visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => null}>
      <View accessibilityLiveRegion="polite" style={{ flex: 1, backgroundColor: k.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <LoaderIcon k={k} progress={p ?? undefined} />
        <Txt t="titleScreen" color={k.text} style={{ marginTop: 22, textAlign: 'center' }}>
          {done ? 'Обновляем приложение' : 'Загружаем обновление'}
        </Txt>
        <Txt t="body" color={k.textSecondary} style={{ marginTop: 6, textAlign: 'center' }}>
          {done ? 'Пара секунд' : pct != null ? `Загружено ${pct}%` : 'Пара секунд'}
        </Txt>
      </View>
    </Modal>
  );
}

/**
 * «Обновляем приложение» — на полторы секунды, пока включается скачанное OTA-обновление (src/otaUpdates.ts).
 * Иконка с полным кольцом: обновление к этому моменту уже скачано целиком — кольцо честное. Подключено в app/_layout.tsx.
 */
import { Modal, View } from 'react-native';
import { useTokens } from './schedule/tokens';
import { Txt } from './schedule/ui';
import LoaderIcon from './offline/LoaderIcon';
import { useOtaApplying } from './otaUpdates';

export default function UpdatingOverlay() {
  const k = useTokens();
  const on = useOtaApplying();
  if (!on) return null;
  return (
    <Modal visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => null}>
      <View accessibilityLiveRegion="polite" style={{ flex: 1, backgroundColor: k.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <LoaderIcon k={k} progress={1} />
        <Txt t="titleScreen" color={k.text} style={{ marginTop: 22, textAlign: 'center' }}>Обновляем приложение</Txt>
        <Txt t="body" color={k.textSecondary} style={{ marginTop: 6, textAlign: 'center' }}>Пара секунд</Txt>
      </View>
    </Modal>
  );
}

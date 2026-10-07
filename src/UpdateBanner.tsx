import React, { useEffect, useState } from 'react';
import {
  View, TouchableOpacity, StyleSheet, AppState, AppStateStatus, Modal, ScrollView,
} from 'react-native';
import { Text } from './OnestText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { api } from './api';
import {
  cancelDownload, installUpdate, openInBrowser, prepareUpdate, sizeLabel, startDownload, useUpdateState,
} from './appUpdate';
import { useTheme, useThemeMode } from './theme';

const DISMISSED_KEY = 'update_dismissed_version';

/** Сравнивает версии вида "1.4.4" — true, если a новее b. */
function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Плавающая карточка «доступно обновление» — внизу, над панелью вкладок.
 * Наверх её ставить нельзя: там системная строка (часы, батарея), баннер
 * налезал бы на неё и сдвигал всё приложение вниз.
 */
export default function UpdateBanner() {
  const C = useTheme();
  const { mode } = useThemeMode();
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<
    { version: string; download_url: string | null; notes: string; missed_count: number } | null
  >(null);
  const [dismissed, setDismissed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const installed = Constants.expoConfig?.version;
        if (!installed) return;
        // Передаём свою версию — бэкенд склеит заметки всех пропущенных релизов
        const latest = await api.getLatestVersion(installed);
        if (!latest?.version || !isNewer(latest.version, installed)) return;

        const dismissedVersion = await AsyncStorage.getItem(DISMISSED_KEY);
        if (dismissedVersion === latest.version) { setDismissed(true); return; }
        setInfo(latest);
        prepareUpdate(latest.version, latest.download_url);
      } catch {
        // Нет сети или GitHub недоступен — баннер просто не показываем.
      }
    };

    check();
    // Проверяем ещё и при возврате в приложение: иначе уведомление о новой
    // версии появилось бы только после полного перезапуска, а Android держит
    // приложение в памяти сутками.
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, []);

  const dismiss = async () => {
    if (info) await AsyncStorage.setItem(DISMISSED_KEY, info.version);
    setDismissed(true);
  };

  const up = useUpdateState();
  const downloading = up.phase === 'downloading';
  const pct = up.total > 0 ? Math.min(100, Math.round((up.received / up.total) * 100)) : null;

  if (!info || dismissed) return null;

  // Подпись под «Версия 2.0.4» и кнопка — по ходу загрузки (src/appUpdate.ts)
  const subtitle = downloading
    ? `Загрузка${pct != null ? ` ${pct}%` : ''} · ${sizeLabel(up.received, up.total)}`
    : up.phase === 'ready'
      ? 'Загружено — можно установить'
      : up.phase === 'error'
        ? 'Не удалось скачать'
        : info.missed_count > 1 ? `Что нового · ${info.missed_count} версии подряд` : 'Что нового';
  const action = downloading
    ? { label: 'Отмена', onPress: cancelDownload, a11y: 'Отменить загрузку' }
    : up.phase === 'ready'
      ? { label: 'Установить', onPress: installUpdate, a11y: `Установить версию ${info.version}` }
      : up.phase === 'error'
        ? { label: 'Повторить', onPress: startDownload, a11y: 'Скачать ещё раз' }
        : { label: 'Обновить', onPress: startDownload, a11y: `Скачать и установить версию ${info.version}` };

  // высота панели вкладок (60) + системный отступ снизу + зазор
  const bottom = 60 + insets.bottom + 12;

  return (
    <View style={[s.wrap, { bottom }]} pointerEvents="box-none">
      {/* Стекло вместо сплошной заливки — карточка «плавает» над расписанием,
          а не просто перекрывает его. intensity умеренная (не максимум):
          на Android BlurView софтверный и на слабых устройствах может
          подтормаживать заметнее, чем на iOS, где он GPU-ускорен нативно.
          Если после проверки на реальном слабом Android будет лагать —
          самая быстрая правка: заменить <BlurView ...> на обычный <View
          style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
          (без intensity/tint) — визуально почти то же самое, но без блюра. */}
      <BlurView
        intensity={50}
        tint={mode === 'dark' ? 'dark' : 'light'}
        style={[s.card, { borderColor: C.border, backgroundColor: `${C.card}cc`, overflow: 'hidden' }]}
      >
        <View style={[s.iconBox, { backgroundColor: C.primary }]}>
          <Ionicons name="arrow-up" size={15} color={C.primaryFg} />
        </View>
        {/* Тап по тексту раскрывает список изменений — что нового именно
            с той версии, которая стоит у человека */}
        <TouchableOpacity
          onPress={() => setShowNotes(true)}
          activeOpacity={0.7}
          style={{ flex: 1 }}
          accessibilityRole="button"
          accessibilityLabel="Посмотреть, что нового"
        >
          <Text style={[s.title, { color: C.fg }]} numberOfLines={1}>
            Версия {info.version}
          </Text>
          <Text
            style={[s.sub, { color: up.phase === 'error' ? C.statusOffline : C.primaryText }]}
            numberOfLines={1}
            accessibilityLiveRegion="polite"
          >
            {subtitle}
          </Text>
        </TouchableOpacity>
        {info.download_url && (
          <TouchableOpacity
            onPress={action.onPress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={action.a11y}
            style={[s.btn, downloading
              ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.border }
              : { backgroundColor: C.primary }]}
          >
            <Text style={[s.btnText, { color: downloading ? C.fg : C.primaryFg }]}>{action.label}</Text>
          </TouchableOpacity>
        )}
        {/* Пока качается — без крестика: закрытие карточки загрузку бы не остановило, только спрятало */}
        {!downloading && <TouchableOpacity
          onPress={dismiss}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Скрыть уведомление об обновлении"
          style={s.close}
        >
          <Ionicons name="close" size={16} color={C.muted} />
        </TouchableOpacity>}
        {/* Полоска загрузки по нижнему краю карточки */}
        {downloading && (
          <View pointerEvents="none" style={[s.track, { backgroundColor: C.border }]}>
            <View style={{ height: 3, width: `${pct ?? 5}%`, backgroundColor: C.primary }} />
          </View>
        )}
      </BlurView>

      {/* Что нового: заметки всех пропущенных релизов, не только последнего */}
      <Modal
        visible={showNotes}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotes(false)}
      >
        <View style={[s.modalBackdrop, { backgroundColor: C.scrim }]}>
          <View style={[s.modalCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={s.modalHead}>
              <View style={{ flex: 1 }}>
                <Text style={[s.modalTitle, { color: C.fg }]}>Что нового</Text>
                <Text style={[s.modalSub, { color: C.muted }]}>
                  {info.missed_count > 1
                    ? `Накопилось за ${info.missed_count} версии — до ${info.version}`
                    : `Версия ${info.version}`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowNotes(false)} hitSlop={10}>
                <Ionicons name="close" size={20} color={C.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }}>
              <Text style={[s.notesText, { color: C.fg }]}>{cleanNotes(info.notes)}</Text>
            </ScrollView>

            {info.download_url && !downloading && (
              <TouchableOpacity
                onPress={() => { setShowNotes(false); action.onPress(); }}
                activeOpacity={0.85}
                style={[s.modalBtn, { backgroundColor: C.primary }]}
              >
                <Text style={[s.btnText, { color: C.primaryFg }]}>
                  {up.phase === 'ready' ? 'Установить' : 'Скачать и установить'}
                </Text>
              </TouchableOpacity>
            )}
            {/* Запасной путь: в приложении не качается — по ссылке в браузере */}
            {info.download_url && (
              <TouchableOpacity onPress={openInBrowser} style={{ alignItems: 'center', paddingVertical: 10 }}>
                <Text style={[s.sub, { color: C.muted }]}>Скачать в браузере</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/**
 * Заметки релиза приходят как markdown с GitHub. Полноценный рендерер ради
 * одного окна тащить незачем — снимаем разметку, оставляя читаемый текст.
 */
function cleanNotes(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, '$1')     // **жирный** → обычный
    .replace(/^#{1,6}\s*/gm, '')          // ## заголовки → просто строка
    .replace(/\n{3,}/g, '\n\n')           // лишние пустые строки
    .trim();
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12,
    // тень, чтобы карточка читалась поверх расписания
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  iconBox: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 13.5, fontWeight: '700' },
  sub: { fontSize: 11.5, marginTop: 1 },
  btn: { borderRadius: 9, paddingHorizontal: 14, paddingVertical: 7 },
  btnText: { fontSize: 12.5, fontWeight: '700' },
  close: { padding: 2 },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },

  modalBackdrop: {
    flex: 1,
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  modalCard: { width: '100%', maxWidth: 420, borderRadius: 16, borderWidth: 1, padding: 18 },
  modalHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalSub: { fontSize: 12, marginTop: 2 },
  notesText: { fontSize: 13.5, lineHeight: 20 },
  modalBtn: { borderRadius: 11, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
});

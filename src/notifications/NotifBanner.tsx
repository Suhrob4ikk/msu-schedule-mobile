/**
 * Уведомления — обязательная вещь (владелец 12 ноя 2026: «самая главная причина — не пропустить изменения в
 * расписании»; так же на сайте — components/PushInvite.tsx).
 *
 * - Разрешение ещё ни разу не спрашивали — спрашиваем сами, один раз, системным окном Android (`notif_auto_asked`).
 * - Пока уведомления не разрешены — карточка над расписанием «Уведомления выключены», без крестика: убрать её можно,
 *   только включив. «Включить»: если Android ещё разрешает спросить — системное окно, иначе (человек запретил) —
 *   настройки приложения.
 * - Разрешили — сразу регистрируем push-токен (syncWithServer), чтобы приходили изменения в расписании.
 * Проверяется при открытии и при возврате в приложение (мог включить в настройках).
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTokens } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import { syncWithServer } from '../pushToken';
import { WHATS_NEW_ID, WHATS_NEW_SEEN_KEY } from '../whatsNewSlides';

const AUTO_ASKED_KEY = 'notif_auto_asked';

// Видна ли сейчас карточка — для очереди (владелец 12 ноя 2026: «слишком много всего за раз»): напоминание об именах
// (src/names/NamesReminder.tsx) ждёт, пока уведомления не включены.
let cardShown = false;
const cardListeners = new Set<(v: boolean) => void>();
function setCardShown(v: boolean) { if (cardShown !== v) { cardShown = v; cardListeners.forEach(f => f(v)); } }
export function useNotifCardShown(): boolean {
  const [v, setV] = useState(cardShown);
  useEffect(() => { cardListeners.add(setV); setV(cardShown); return () => { cardListeners.delete(setV); }; }, []);
  return v;
}

export default function NotifBanner() {
  const k = useTokens();
  const [off, setOff] = useState(false);
  const [canAsk, setCanAsk] = useState(true);

  const check = useCallback(async () => {
    try {
      const p = await Notifications.getPermissionsAsync();
      if (p.status === 'granted') { setOff(false); return; }
      setCanAsk(p.canAskAgain);
      setOff(true);
      // ни разу не спрашивали — спросить сами, один раз
      // …но не поверх сторис «Что нового»: спросим, когда они этого выпуска уже просмотрены (следующий заход или возврат)
      const storiesSeen = (await AsyncStorage.getItem(WHATS_NEW_SEEN_KEY)) === WHATS_NEW_ID;
      if (p.status === 'undetermined' && p.canAskAgain && storiesSeen && !(await AsyncStorage.getItem(AUTO_ASKED_KEY))) {
        await AsyncStorage.setItem(AUTO_ASKED_KEY, '1');
        const r = await Notifications.requestPermissionsAsync();
        if (r.status === 'granted') { setOff(false); void syncWithServer(true); }
        else setCanAsk(r.canAskAgain);
      }
    } catch { /* нет модуля уведомлений — карточку не показываем */ }
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') void check(); });
    return () => sub.remove();
  }, [check]);

  const enable = async () => {
    try {
      if (canAsk) {
        const r = await Notifications.requestPermissionsAsync();
        if (r.status === 'granted') { setOff(false); void syncWithServer(true); return; }
        setCanAsk(r.canAskAgain);
        if (r.canAskAgain) return;
      }
      await Linking.openSettings();   // запрещено — включить можно только в настройках телефона
    } catch { /* ничего */ }
  };

  useEffect(() => { setCardShown(off); return () => setCardShown(false); }, [off]);

  if (!off) return null;
  return (
    <View style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 4, flexDirection: 'row', alignItems: 'center', columnGap: 12,
      backgroundColor: k.surface, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: k.border }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: k.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="notifications-outline" size={19} color={k.onAccent} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt t="labelStrong" color={k.text}>Уведомления выключены</Txt>
        <Txt t="caption" color={k.textSecondary}>
          {canAsk ? 'Изменения в расписании можно пропустить' : 'Включите их в настройках телефона, чтобы не пропустить изменения'}
        </Txt>
      </View>
      <Pressable onPress={() => void enable()} accessibilityRole="button" hitSlop={8}
        style={({ pressed }) => ({ backgroundColor: k.accent, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14, opacity: pressed ? 0.85 : 1 })}>
        <Txt t="labelStrong" color={k.onAccent}>{canAsk ? 'Включить' : 'Настройки'}</Txt>
      </Pressable>
    </View>
  );
}

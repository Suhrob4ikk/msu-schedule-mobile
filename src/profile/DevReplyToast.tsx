/**
 * Баннер «Ответ разработчика» сверху любой вкладки — как на сайте (components/DevReplyToast.tsx): спрашивает
 * сервер (GET /user/messages/unread — из памяти, базу не будит) при запуске, при возврате в приложение и когда
 * пришёл push «dev-reply». Один ответ — один показ (REPLY_BANNER_KEY), через 12 с уходит сам; нажатие — в переписку.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTokens } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import { REPLY_BANNER_KEY, myDeviceId, onDevReply, unreadInfo } from '../devMessages';

const SHOW_MS = 12_000;

export default function DevReplyToast() {
  const k = useTokens();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const [reply, setReply] = useState<{ key: string; text: string; n: number } | null>(null);
  const onScreen = path === '/messages';

  const check = useCallback(async () => {
    const dev = await myDeviceId();
    if (!dev) return;
    const info = await unreadInfo(dev);
    if (!info.unread || !info.text || info.id == null) return;
    const key = `${info.id}:${info.text.slice(0, 40)}`;
    const shown = await AsyncStorage.getItem(REPLY_BANNER_KEY).catch(() => null);
    if (shown !== key) setReply({ key, text: info.text, n: info.unread });
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') void check(); });
    const off = onDevReply(() => void check());
    return () => { sub.remove(); off(); };
  }, [check]);

  const close = useCallback(() => {
    if (!reply) return;
    AsyncStorage.setItem(REPLY_BANNER_KEY, reply.key).catch(() => null);
    setReply(null);
  }, [reply]);

  // Открыл переписку сам — баннер больше не нужен
  useEffect(() => { if (reply && onScreen) close(); }, [reply, onScreen, close]);

  useEffect(() => {
    if (!reply || onScreen) return;
    const t = setTimeout(close, SHOW_MS);
    return () => clearTimeout(t);
  }, [reply, onScreen, close]);

  if (!reply || onScreen) return null;
  return (
    <View accessibilityLiveRegion="polite"
      style={{ position: 'absolute', top: insets.top + 10, left: 14, right: 14, zIndex: 61, elevation: 13, flexDirection: 'row', alignItems: 'center',
        borderRadius: 18, backgroundColor: k.surface, borderWidth: 1, borderColor: k.border,
        shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }}>
      <Pressable onPress={() => { close(); router.navigate('/messages'); }} accessibilityRole="button"
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', columnGap: 12, padding: 12 }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: k.accent }}>
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={k.onAccent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt t="overline" color={k.accentText}>{reply.n > 1 ? `Ответ разработчика · ${reply.n}` : 'Ответ разработчика'}</Txt>
          <Txt t="titleRow" color={k.text} numberOfLines={2}>{reply.text}</Txt>
        </View>
      </Pressable>
      <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Закрыть"
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 4 }}>
        <Ionicons name="close" size={20} color={k.textSecondary} />
      </Pressable>
    </View>
  );
}

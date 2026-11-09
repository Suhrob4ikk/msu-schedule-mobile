/**
 * «Написать разработчику» — как на сайте (app/profile/messages/page.tsx в репозитории сайта): вопрос, ошибка в
 * расписании или идея; ответ разработчика появляется здесь же и приходит уведомлением. Галочка «Не показывать
 * моё имя» — имя и группа на сервере не сохраняются вовсе. Клиент — src/devMessages.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, Pressable, ScrollView, StatusBar, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TextInput } from '../OnestText';
import { useThemeMode } from '../theme';
import { FONT, GUTTER, RADIUS, TOUCH_MIN, useTokens } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import { Button } from './rows';
import {
  MAX_LEN, fmtMessageTime, loadMessages, markRepliesSeen, myDeviceId, onDevReply, parseServerTime, sendMessage, waiting,
  type DevMessage,
} from '../devMessages';

export default function MessagesScreen() {
  const k = useTokens();
  const { mode } = useThemeMode();
  const insets = useSafeAreaInsets();
  // null — ещё не знаем, '' — группа не выбрана (без регистрации сервер не примет)
  const [device, setDevice] = useState<string | null>(null);
  const [list, setList] = useState<DevMessage[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState('');
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [kb, setKb] = useState(0);
  const scroll = useRef<ScrollView>(null);

  const reload = useCallback(async (dev: string) => {
    try {
      const rows = await loadMessages(dev);
      setList(rows);
      setLoadError(false);
      if (rows.some(m => m.from_dev)) void markRepliesSeen(dev);
    } catch {
      setLoadError(true);
      setList(l => l ?? []);
    }
  }, []);

  const back = useCallback(() => { router.navigate('/profile'); }, []);

  // При каждом заходе — перечитать (ответ мог прийти, пока экран был закрыт)
  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle(mode === 'dark' ? 'light-content' : 'dark-content');
      let alive = true;
      myDeviceId().then(dev => { if (!alive) return; setDevice(dev); if (dev) void reload(dev); });
      const sub = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
      return () => { alive = false; sub.remove(); };
    }, [mode, reload, back]),
  );

  // Пришёл push с ответом, пока экран открыт
  useEffect(() => (device ? onDevReply(() => void reload(device)) : undefined), [device, reload]);

  // Клавиатура: отступ снизу на её высоту (окно при edge-to-edge само не сжимается)
  useEffect(() => {
    const s1 = Keyboard.addListener('keyboardDidShow', e => {
      setKb(e.endCoordinates.height);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    });
    const s2 = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => { s1.remove(); s2.remove(); };
  }, []);

  useEffect(() => {
    if (list?.length) setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 50);
  }, [list?.length]);

  const submit = async () => {
    if (!device || busy || !text.trim()) return;
    setBusy(true);
    setError('');
    try {
      const m = await sendMessage(device, text, anon);
      setList(l => [...(l ?? []), m]);
      setText('');
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отправить');
    }
    setBusy(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: k.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: k.bg }}>
        <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: GUTTER }}>
          <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Назад, в Кабинет"
            style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="arrow-back" size={24} color={k.text} />
          </Pressable>
          <Txt t="titleScreen" color={k.text} accessibilityRole="header" style={{ marginLeft: 4, flexShrink: 1 }}>
            Написать разработчику
          </Txt>
        </View>
      </View>

      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 + kb }}>
        {device === '' ? (
          <View style={{ backgroundColor: k.card, borderRadius: RADIUS.card, borderWidth: 1, borderColor: k.border, padding: 16, rowGap: 12 }}>
            <Txt t="body" color={k.text}>Чтобы написать, сначала выберите группу в Кабинете.</Txt>
            <Button k={k} primary title="В Кабинет" onPress={back} />
          </View>
        ) : null}

        {device ? (
          <>
            <Txt t="small" color={k.textSecondary} style={{ marginBottom: 14 }}>
              Вопрос, ошибка в расписании или идея. Ответ появится здесь же.
            </Txt>

            {list && list.length > 0 ? (
              <View accessibilityLabel="Переписка" style={{ rowGap: 8, marginBottom: 16 }}>
                {list.map((m, i) => (
                  <View key={m.id}>
                    {m.from_dev ? (
                      <View style={{ alignSelf: 'flex-start', maxWidth: '86%', backgroundColor: k.card, borderWidth: 1, borderColor: k.border,
                        borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
                        {list[i - 1]?.from_dev !== true ? <Txt t="captionStrong" color={k.accentText} style={{ marginBottom: 2 }}>Разработчик</Txt> : null}
                        <Txt t="body" color={k.text} selectable>{m.text}</Txt>
                        <Txt t="caption" color={k.textSecondary} style={{ marginTop: 4 }}>
                          {(m.edited ? 'изменено · ' : '') + fmtMessageTime(parseServerTime(m.created_at))}
                        </Txt>
                      </View>
                    ) : (
                      <View style={{ alignSelf: 'flex-end', maxWidth: '86%', backgroundColor: k.accent,
                        borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
                        <Txt t="body" color={k.onAccent} selectable>{m.text}</Txt>
                        <Txt t="caption" color={k.onAccent} style={{ marginTop: 4, opacity: 0.75, textAlign: 'right' }}>
                          {(m.anonymous ? 'без имени · ' : '') + fmtMessageTime(parseServerTime(m.created_at))}
                        </Txt>
                      </View>
                    )}
                    {waiting(list, i) ? (
                      <Txt t="caption" color={k.textSecondary} style={{ alignSelf: 'flex-end', marginTop: 4, marginRight: 4 }}>Ждёт ответа</Txt>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
            {loadError ? (
              <Txt t="small" color={k.statusOffline} style={{ marginBottom: 12 }}>Не удалось загрузить переписку — проверьте интернет</Txt>
            ) : null}

            <View style={{ backgroundColor: k.card, borderRadius: RADIUS.card, borderWidth: 1, borderColor: k.border, padding: 14, rowGap: 12 }}>
              <TextInput
                value={text}
                onChangeText={v => { setText(v.slice(0, MAX_LEN)); setSent(false); setError(''); }}
                onFocus={() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 300)}
                placeholder="Ваше сообщение"
                placeholderTextColor={k.textSecondary}
                multiline
                maxLength={MAX_LEN}
                accessibilityLabel="Сообщение разработчику"
                textAlignVertical="top"
                style={{
                  minHeight: 110, maxHeight: 240, paddingHorizontal: 12, paddingVertical: 10, borderRadius: RADIUS.sm, borderWidth: 1.5,
                  borderColor: k.border, backgroundColor: k.surface, color: k.text, fontFamily: FONT[500], fontSize: 16, lineHeight: 22,
                }}
              />
              <Pressable onPress={() => setAnon(a => !a)} accessibilityRole="checkbox" accessibilityState={{ checked: anon }}
                style={{ flexDirection: 'row', alignItems: 'center', columnGap: 10, minHeight: 40 }}>
                <Ionicons name={anon ? 'checkbox' : 'square-outline'} size={22} color={anon ? k.accentText : k.textSecondary} />
                <Txt t="body" color={k.text}>Не показывать моё имя</Txt>
              </Pressable>
              {anon ? <Txt t="small" color={k.textSecondary}>Разработчик увидит только текст — без имени и группы.</Txt> : null}
              {error ? <Txt t="small" color={k.statusOffline}>{error}</Txt> : null}
              {sent && !error ? <Txt t="smallSemi" color={k.accentText}>Отправлено</Txt> : null}
              {text.length > MAX_LEN - 200 ? (
                <Txt t="caption" color={k.textSecondary} style={{ textAlign: 'right' }}>{text.length} / {MAX_LEN}</Txt>
              ) : null}
              <Button k={k} primary title={busy ? 'Отправляем…' : 'Отправить'} disabled={busy || !text.trim()} busy={busy} onPress={submit} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

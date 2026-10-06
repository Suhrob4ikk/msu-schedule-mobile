/**
 * «Как вас зовут?» — для тех, у кого имя пустое с прежних версий (раньше в
 * Кабинете его можно было стереть). Имя обязательно, как на сайте: без него
 * дальше не пускаем. Показывается при запуске (app/_layout.tsx).
 */
import React, { useState } from 'react';
import { ScrollView, StatusBar, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeMode } from '../theme';
import { useTokens, RADIUS, TOUCH_MIN, type as typeStyle } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import { syncWithServer } from '../pushToken';
import { NAME_MAX, NAME_REQUIRED_HINT, nameOk, setUserName } from '../userName';
import { Button } from './rows';

export default function NameRequiredScreen({ onDone }: { onDone: () => void }) {
  const k = useTokens();
  const { mode } = useThemeMode();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const ok = nameOk(name);

  const save = async () => {
    if (!ok || saving) return;
    setSaving(true);
    await setUserName(name);
    // Серверу — новое имя вместо «Аноним» (без сети — при следующем запуске)
    syncWithServer(true).catch(() => null);
    onDone();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: k.bg }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />
      <Txt t="display" color={k.text} accessibilityRole="header" style={{ fontSize: 30, lineHeight: 36, letterSpacing: 0 }}>
        Как вас зовут?
      </Txt>
      <Txt t="body" color={k.textSecondary} style={{ marginTop: 8 }}>
        По имени приложение здоровается с вами и подписывает напоминания о парах и зачётах.
      </Txt>

      <View style={{ backgroundColor: k.surface, borderRadius: RADIUS.lg, padding: 16, marginTop: 20, rowGap: 8 }}>
        <Txt t="overline" color={k.textSecondary}>Имя</Txt>
        <TextInput
          value={name}
          onChangeText={setName}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={save}
          placeholder="Как вас зовут"
          placeholderTextColor={k.textSecondary}
          autoFocus
          returnKeyType="done"
          maxLength={NAME_MAX}
          maxFontSizeMultiplier={2}
          accessibilityLabel="Имя"
          style={[typeStyle(16, 22, 500), {
            color: k.text, backgroundColor: k.surface2, borderRadius: 14, minHeight: TOUCH_MIN,
            paddingHorizontal: 14, borderWidth: 2, borderColor: focused ? k.accentText : 'transparent',
          }]}
        />
      </View>

      <View style={{ marginTop: 20 }}>
        <Button k={k} primary title="Продолжить" disabled={!ok || saving} busy={saving} onPress={save} />
      </View>
      {!ok && <Txt t="small" color={k.textSecondary} style={{ textAlign: 'center', marginTop: 10 }}>{NAME_REQUIRED_HINT}</Txt>}
    </ScrollView>
  );
}

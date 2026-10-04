/** Поле «Номер аудитории»: 48 dp, радиус 14; при фокусе и непустом значении — обводка accent-text. */
import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tokens, TOUCH_MIN, type as typeStyle } from '../schedule/tokens';

export default function SearchField({ k, value, onChange }: {
  k: Tokens; value: string; onChange: (v: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused && value.length > 0;
  return (
    <View
      style={{
        minHeight: TOUCH_MIN, flexDirection: 'row', alignItems: 'center',
        backgroundColor: k.surface, borderRadius: 14,
        borderWidth: active ? 2 : 1, borderColor: active ? k.accentText : k.border,
        paddingLeft: active ? 11 : 12,
      }}
    >
      <Ionicons name="search" size={18} color={k.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Номер аудитории"
        placeholderTextColor={k.textSecondary}
        keyboardType="default"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        maxFontSizeMultiplier={2}
        accessibilityLabel="Номер аудитории"
        style={[typeStyle(15, 20, 500), { flex: 1, color: k.text, paddingHorizontal: 10, paddingVertical: 10 }]}
      />
      {value.length > 0 && (
        <Pressable
          onPress={() => onChange('')}
          accessibilityRole="button"
          accessibilityLabel="Очистить поиск"
          style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close" size={20} color={k.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

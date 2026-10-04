/** Мелкие части вкладки «Педагоги»: поле поиска в шапке, пустое состояние, переходы. */
import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tokens, TOUCH_MIN, RADIUS, type as typeStyle } from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import { mondayOf } from './state';

// ─── Переходы в другие вкладки ─────────────────────────────────────────────
//
// back: 'teachers' — системная «Назад» на той вкладке вернёт в расписание
// педагога (см. useBackTo в src/backTo.ts).

/** Чип группы → «Расписание» этой группы на той же неделе. */
export function openGroupSchedule(groupId: number, date: string) {
  Haptics.selectionAsync();
  router.navigate({ pathname: '/', params: { group: String(groupId), week_start: mondayOf(date), back: 'teachers' } });
}

/** Аудитория → «Аудитории» с этой аудиторией, днём и парой. */
export function openRoomFromTeacher(room: string, day: string, pair: string, date: string) {
  Haptics.selectionAsync();
  router.navigate({ pathname: '/rooms', params: { day, pair, room, week_start: mondayOf(date), back: 'teachers' } });
}

// ─── Поле поиска ───────────────────────────────────────────────────────────

/**
 * Поле «Фамилия» в шапке: высота ≥ 48, радиус 14, лупа 22 слева, очистка
 * 48×48 справа (только при тексте). В фокусе с текстом — рамка 2 accent-text
 * и текст 17/700. Без сети и без данных — фон surface-2, ввод выключен.
 */
export function SearchField({ k, value, onChange, disabled, inputRef }: {
  k: Tokens;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  inputRef?: React.Ref<TextInput>;
}) {
  const [focused, setFocused] = useState(false);
  const active = focused && value.length > 0;
  return (
    <View
      style={{
        flexGrow: 1, flexShrink: 1, flexBasis: 150,
        minHeight: TOUCH_MIN, flexDirection: 'row', alignItems: 'center',
        backgroundColor: disabled ? k.surface2 : k.surface, borderRadius: RADIUS.md,
        borderWidth: active ? 2 : 1, borderColor: active ? k.accentText : k.border,
        paddingLeft: active ? 11 : 12,
      }}
    >
      <Ionicons name="search" size={22} color={k.textSecondary} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        placeholder="Фамилия"
        placeholderTextColor={k.textSecondary}
        autoCorrect={false}
        autoCapitalize="words"
        returnKeyType="search"
        maxFontSizeMultiplier={2}
        accessibilityLabel="Поиск по фамилии"
        style={[
          value.length ? typeStyle(17, 22, 700) : typeStyle(15, 20, 400),
          { flex: 1, minWidth: 0, color: k.text, paddingHorizontal: 10, paddingVertical: 10 },
        ]}
      />
      {value.length > 0 && (
        <Pressable
          onPress={() => onChange('')}
          accessibilityRole="button"
          accessibilityLabel="Очистить поиск"
          style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close" size={22} color={k.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

// ─── Пустые состояния ──────────────────────────────────────────────────────

/** Иконка 56 в круге surface-2, заголовок, текст, кнопка (залитая или «призрак»). */
export function EmptyState({ k, icon, title, text, action, onAction, ghost, live }: {
  k: Tokens;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  text?: React.ReactNode;
  action?: string;
  onAction?: () => void;
  ghost?: boolean;
  /** Объявить заголовок диктору (результат поиска). */
  live?: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', rowGap: 8 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: k.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <Ionicons name={icon} size={26} color={k.textSecondary} />
      </View>
      <Txt t="emptyTitle" color={k.text} style={{ textAlign: 'center' }} accessibilityLiveRegion={live ? 'polite' : undefined}>
        {title}
      </Txt>
      {text ? <Txt t="bodySmall" color={k.textSecondary} style={{ textAlign: 'center' }}>{text}</Txt> : null}
      {action && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          style={({ pressed }) => ({
            marginTop: 8, minHeight: TOUCH_MIN, paddingHorizontal: 20, borderRadius: ghost ? RADIUS.md : RADIUS.pill,
            alignSelf: ghost ? 'stretch' : 'center', alignItems: 'center', justifyContent: 'center',
            backgroundColor: ghost ? k.accentSoft : k.accent, opacity: pressed ? 0.85 : 1,
          })}
        >
          <Txt t="button" color={ghost ? k.onAccentSoft : k.onAccent} style={{ textAlign: 'center' }}>{action}</Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

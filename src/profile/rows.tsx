/**
 * Детали Кабинета «Табло»: карточка группы, заголовок, переключатель и три
 * вида строк (ТЗ «Кабинет», раздел «Компоненты и размеры»).
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tokens, RADIUS, FONT } from '../schedule/tokens';
import { Txt } from '../schedule/ui';

export const ROW_MIN = 56;

/** Заголовок группы: «УЧЁБА» — 12 pt 700, прописные, отступ сверху 14, слева 4. */
export function SectionTitle({ k, children }: { k: Tokens; children: string }) {
  return (
    <Txt t="sectionTitle" color={k.textSecondary} accessibilityRole="header" style={{ marginTop: 14, marginLeft: 4, marginBottom: 8 }}>
      {children}
    </Txt>
  );
}

/** Карточка группы: строки делятся линией 1 dp. */
export function Card({ k, children, style }: { k: Tokens; children: React.ReactNode; style?: object }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ backgroundColor: k.card, borderRadius: RADIUS.card, borderWidth: 1, borderColor: k.border, overflow: 'hidden' }, style]}>
      {items.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <View style={{ height: 1, backgroundColor: k.border }} />}
          {c}
        </React.Fragment>
      ))}
    </View>
  );
}

/**
 * Переключатель 52 × 32, бегунок 20. Выключенный — с обводкой 2 dp
 * text-secondary (ТЗ: раньше светлая дорожка сливалась с фоном).
 */
export function Toggle({ k, on }: { k: Tokens; on: boolean }) {
  return (
    <View
      style={{
        width: 52, height: 32, borderRadius: 16, borderWidth: 2, flexShrink: 0,
        backgroundColor: on ? k.accent : k.surface2, borderColor: on ? k.accent : k.textSecondary,
      }}
    >
      <View
        style={{
          position: 'absolute', top: 4, left: on ? 24 : 4, width: 20, height: 20, borderRadius: 10,
          backgroundColor: on ? k.onAccent : k.textSecondary,
        }}
      />
    </View>
  );
}

/** Строка с переключателем: вся строка — зона нажатия. */
export function SwitchRow({ k, title, subtitle, on, onPress, disabled }: {
  k: Tokens; title: string; subtitle?: string; on: boolean; onPress: () => void; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={({ pressed }) => ({
        minHeight: ROW_MIN, paddingVertical: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', columnGap: 12,
        backgroundColor: pressed ? k.surface2 : 'transparent',
      })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt t="rowTitle" color={k.text}>{title}</Txt>
        {subtitle ? <Txt t="small" color={k.textSecondary} style={{ marginTop: 2 }}>{subtitle}</Txt> : null}
      </View>
      <Toggle k={k} on={on} />
    </Pressable>
  );
}

/** Строка-переход: иконка 36 × 36 на surface-2, название, значение справа, стрелка. */
export function NavRow({ k, icon, title, value, valueColor, valueStrong, badge, onPress, hint }: {
  k: Tokens; icon?: keyof typeof Ionicons.glyphMap; title: string;
  value?: string; valueColor?: string; valueStrong?: boolean; badge?: number; onPress: () => void; hint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, value, badge ? `непрочитанных: ${badge}` : null].filter(Boolean).join(', ')}
      accessibilityHint={hint}
      style={({ pressed }) => ({
        minHeight: ROW_MIN, paddingVertical: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', columnGap: 12,
        backgroundColor: pressed ? k.surface2 : 'transparent',
      })}
    >
      {icon && (
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: k.surface2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ionicons name={icon} size={18} color={k.text} />
        </View>
      )}
      <Txt t="rowTitle" color={k.text} style={{ flex: 1, minWidth: 0 }}>{title}</Txt>
      {value ? (
        <Txt t={valueStrong ? 'smallSemi' : 'rowValue'} color={valueColor ?? k.textSecondary} numberOfLines={1} style={{ flexShrink: 1, maxWidth: '50%' }}>
          {value}
        </Txt>
      ) : null}
      {badge ? (
        <View style={{ minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: k.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Txt t="captionStrong" color={k.onAccent} maxFontSizeMultiplier={1.3}>{badge > 99 ? '99+' : String(badge)}</Txt>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={k.textSecondary} style={{ flexShrink: 0 }} />
    </Pressable>
  );
}

/** Строка-действие: 16 pt 600 цветом accent-text. */
export function ActionRow({ k, icon, title, onPress }: {
  k: Tokens; icon?: keyof typeof Ionicons.glyphMap; title: string; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: ROW_MIN, paddingVertical: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', columnGap: 12,
        backgroundColor: pressed ? k.surface2 : 'transparent',
      })}
    >
      {icon && <Ionicons name={icon} size={18} color={k.accentText} style={{ flexShrink: 0 }} />}
      <Txt t="rowTitle" color={k.accentText} style={{ flex: 1, fontFamily: FONT[600] }}>{title}</Txt>
      <Ionicons name="chevron-forward" size={16} color={k.accentText} style={{ flexShrink: 0 }} />
    </Pressable>
  );
}

/** Кнопка второго уровня (48, accent-soft) и первого (52, accent). */
export function Button({ k, title, icon, onPress, primary, disabled, busy, children }: {
  k: Tokens; title: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void;
  primary?: boolean; disabled?: boolean; busy?: boolean; children?: React.ReactNode;
}) {
  const bg = disabled ? k.surface2 : primary ? k.accent : k.accentSoft;
  const fg = disabled ? k.textSecondary : primary ? k.onAccent : k.onAccentSoft;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      style={({ pressed }) => ({
        minHeight: primary ? 52 : 48, borderRadius: RADIUS.md, paddingHorizontal: 14,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8,
        backgroundColor: bg, opacity: pressed ? 0.85 : 1,
      })}
    >
      {children}
      {icon && <Ionicons name={icon} size={18} color={fg} />}
      <Txt t={primary ? 'buttonLg' : 'button'} color={fg} style={{ textAlign: 'center', flexShrink: 1 }}>{title}</Txt>
    </Pressable>
  );
}

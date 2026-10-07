/**
 * Шапка 60 dp: слева кнопка «группа · неделя / дата ▾» (открывает лист
 * недели и группы), справа статус связи словами и колокольчик.
 */
import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import { usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUnreadNotifCount } from '../useUnreadNotifCount';
import { Tokens, HEADER_H, GUTTER, RADIUS, TOUCH_MIN, FONT } from './tokens';
import { openNotifications } from '../notifications/nav';
import { badgeText, unreadSpoken } from '../notifications/state';
import { Txt } from './ui';
import { stampLabel } from './state';

export type LinkState = { kind: 'online' | 'sync' | 'offline'; text: string };

/**
 * Статус связи словами — общий для «Табло»-вкладок. stamp — время, на
 * которое актуальны данные (последняя удачная загрузка или синхронизация).
 */
export function linkState(opts: {
  syncing: boolean; offline: boolean; stamps: (Date | null | undefined)[]; now: Date;
}): LinkState {
  const stamp = opts.stamps.filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  if (opts.syncing) return { kind: 'sync', text: 'Синхронизация' };
  if (opts.offline) return { kind: 'offline', text: stamp ? `Нет сети · ${stampLabel(stamp, opts.now)}` : 'Нет сети' };
  return { kind: 'online', text: stamp ? `обновлено ${stampLabel(stamp, opts.now)}` : 'обновляется' };
}

export function StatusPill({ s, k }: { s: LinkState; k: Tokens }) {
  const offline = s.kind === 'offline';
  const dot = s.kind === 'online' ? k.statusOnline : s.kind === 'sync' ? k.statusSync : k.statusOffline;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Связь: ${s.text}`}
      style={{
        flexDirection: 'row', alignItems: 'center', columnGap: 6,
        backgroundColor: offline ? k.statusOfflineBg : k.surface,
        borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 5,
        borderWidth: offline ? 0 : 1, borderColor: k.border,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
      <Txt t="caption" color={offline ? k.statusOffline : k.textSecondary}>{s.text}</Txt>
    </View>
  );
}

/**
 * Колокольчик 48×48 со счётчиком (ТЗ «Уведомления», BellButton): пилюля 20,
 * фон accent, 11/800, кольцо 2 dp цветом фона — рамкой, не тенью; «9+»
 * свыше 9, при 0 скрыт. active — на самом экране Уведомлений: фон
 * accent-soft, без счётчика, нажатие прокручивает ленту к началу (onPress).
 */
export function Bell({ k, active, onPress }: { k: Tokens; active?: boolean; onPress?: () => void }) {
  const count = useUnreadNotifCount();
  const path = usePathname();
  const show = !active && count > 0;
  return (
    <Pressable
      onPress={onPress ?? (() => openNotifications(path))}
      accessibilityRole="button"
      accessibilityState={active ? { selected: true } : undefined}
      accessibilityLabel={count > 0 ? `Уведомления, ${unreadSpoken(count)}` : 'Уведомления'}
      style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        style={{
          width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
          backgroundColor: active ? k.accentSoft : 'transparent',
        }}
      >
        <Ionicons name={active ? 'notifications' : 'notifications-outline'} size={22} color={active ? k.onAccentSoft : k.text} />
      </View>
      {show && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', top: 4, right: 2, minWidth: 20, height: 20, borderRadius: 10,
            paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center',
            backgroundColor: k.accent, borderWidth: 2, borderColor: k.bg,
          }}
        >
          <Txt t="captionStrong" color={k.onAccent} maxFontSizeMultiplier={1.3} numberOfLines={1} style={{ fontFamily: FONT[800], fontSize: 11, lineHeight: 13 }}>
            {badgeText(count)}
          </Txt>
        </View>
      )}
    </Pressable>
  );
}

function ScheduleHeader({ k, topInset, subtitle, subtitleLead, title, link, onOpen, openLabel = 'Выбрать неделю и группу', smallSize = 12 }: {
  k: Tokens;
  topInset: number;
  subtitle: string;
  /** Выделенное слово перед мелкой строкой («Сейчас») — цветом accent-text. */
  subtitleLead?: string | null;
  /** Что делает нажатие на кнопку шапки — для экранного диктора. */
  openLabel?: string;
  /** Мелкая строка: 12 pt в Расписании, 13 pt в Аудиториях (по ТЗ). */
  smallSize?: 12 | 13;
  title: string;
  link: LinkState;
  onOpen: () => void;
}) {
  return (
    <View style={{ paddingTop: topInset, backgroundColor: k.bg }}>
      <View
        style={{
          minHeight: HEADER_H, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
          paddingLeft: GUTTER, paddingRight: GUTTER - 8, columnGap: 8,
        }}
      >
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`${subtitleLead ?? ''}${subtitle}. ${title}. ${openLabel}`}
          style={{ flexGrow: 1, flexShrink: 1, minHeight: TOUCH_MIN, justifyContent: 'center', paddingVertical: 4 }}
        >
          <Txt t={smallSize === 13 ? 'small' : 'caption'} color={k.textSecondary}>
            {subtitleLead ? <Txt t={smallSize === 13 ? 'smallStrong' : 'captionStrong'} color={k.accentText}>{subtitleLead}</Txt> : null}
            {subtitle}
          </Txt>
          {/* Плашка цвета приложения (accent-soft), чтобы было видно, что это кнопка —
              раньше это был просто текст (просьба владельца, 7 окт 2026) */}
          <View
            style={{
              flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4, alignSelf: 'flex-start',
              marginTop: 2, paddingLeft: 12, paddingRight: 8, paddingVertical: 3,
              borderRadius: RADIUS.pill, backgroundColor: k.accentSoft,
            }}
          >
            <Txt t="titleCard" color={k.onAccentSoft}>{title}</Txt>
            <Ionicons name="chevron-down" size={18} color={k.onAccentSoft} />
          </View>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' }}>
          <StatusPill s={link} k={k} />
          <Bell k={k} />
        </View>
      </View>
    </View>
  );
}

export default memo(ScheduleHeader);

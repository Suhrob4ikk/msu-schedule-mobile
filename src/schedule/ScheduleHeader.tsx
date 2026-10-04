/**
 * Шапка 60 dp: слева кнопка «группа · неделя / дата ▾» (открывает лист
 * недели и группы), справа статус связи словами и колокольчик.
 */
import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUnreadNotifCount } from '../useUnreadNotifCount';
import { Tokens, HEADER_H, GUTTER, RADIUS, TOUCH_MIN } from './tokens';
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

function StatusPill({ s, k }: { s: LinkState; k: Tokens }) {
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

function Bell({ k }: { k: Tokens }) {
  const count = useUnreadNotifCount();
  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Уведомления, непрочитанных: ${count}` : 'Уведомления'}
      style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="notifications-outline" size={22} color={k.text} />
      {count > 0 && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', top: 8, right: 7, minWidth: 16, height: 16, borderRadius: 8,
            paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: k.accent,
          }}
        >
          <Txt t="captionStrong" color={k.onAccent} maxFontSizeMultiplier={1.2} style={{ fontSize: 10, lineHeight: 12 }}>
            {count > 9 ? '9+' : count}
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
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 4 }}>
            <Txt t="titleCard" color={k.text}>{title}</Txt>
            <Ionicons name="chevron-down" size={18} color={k.textSecondary} />
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

/**
 * Лист по нажатию на шапку: неделя (прошлая / эта / следующая — все, что
 * отдаёт сервер), группа, «Вернуться к моей группе», «Поделиться расписанием».
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Group, WeekInfo } from '../api';
import { shortGroupName } from '../api';
import type { Colors } from '../theme';
import GroupSelector from '../GroupSelector';
import { Tokens, RADIUS, TOUCH_MIN } from './tokens';
import { addDays, rangeLabel, weekName } from './state';
import { Txt, Divider } from './ui';
import BottomSheet from './BottomSheet';

function Row({ k, icon, title, subtitle, selected, onPress, role = 'button' }: {
  k: Tokens; icon?: React.ComponentProps<typeof Ionicons>['name']; title: string; subtitle?: string;
  selected?: boolean; onPress: () => void; role?: 'button' | 'radio';
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected: !!selected } : undefined}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={({ pressed }) => ({
        minHeight: TOUCH_MIN, flexDirection: 'row', alignItems: 'center', columnGap: 12,
        paddingVertical: 8, paddingHorizontal: 12, borderRadius: RADIUS.sm,
        backgroundColor: pressed ? k.surface2 : 'transparent',
      })}
    >
      {icon && <Ionicons name={icon} size={20} color={k.accentText} />}
      <View style={{ flex: 1 }}>
        <Txt t={selected ? 'labelStrong' : 'body'} color={k.text}>{title}</Txt>
        {subtitle && <Txt t="caption" color={k.textSecondary}>{subtitle}</Txt>}
      </View>
      {role === 'radio' && (
        <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? k.accentText : k.textSecondary} />
      )}
    </Pressable>
  );
}

export default function WeekSheet({
  visible, onClose, k, viewMode, onViewMode, weeks, selectedWeek, groups, group, myGroup, onPickWeek, onPickGroup, onShare, canShare,
}: {
  visible: boolean;
  onClose: () => void;
  k: Tokens;
  viewMode: 'list' | 'pages';
  onViewMode: (m: 'list' | 'pages') => void;
  weeks: WeekInfo[];
  selectedWeek: WeekInfo | null;
  groups: Group[];
  group: Group | null;
  myGroup: Group | null;
  onPickWeek: (w: WeekInfo) => void;
  onPickGroup: (g: Group) => void;
  onShare: () => void;
  canShare: boolean;
}) {
  const now = new Date();
  const sorted = [...weeks].sort((a, b) => a.week_start.localeCompare(b.week_start));
  // GroupSelector общий со старыми экранами и ждёт старую палитру — даём её из новых токенов
  const legacy = {
    primary: k.accent, primaryFg: k.onAccent, card: k.surface2, border: k.border, fg: k.text, muted: k.textSecondary,
  } as unknown as Colors;

  return (
    <BottomSheet visible={visible} onClose={onClose} k={k} label="Неделя и группа">
      {sorted.length > 0 && (
        <>
          <Txt t="overline" color={k.textSecondary} style={{ marginTop: 8, marginBottom: 4, marginLeft: 12 }}>Неделя</Txt>
          {sorted.map(w => (
            <Row
              key={w.id}
              k={k}
              role="radio"
              title={weekName(w.week_start, now)}
              subtitle={rangeLabel(w.week_start, addDays(w.week_start, 5))}
              selected={selectedWeek?.id === w.id}
              onPress={() => { onClose(); onPickWeek(w); }}
            />
          ))}
        </>
      )}

      <Txt t="overline" color={k.textSecondary} style={{ marginTop: 16, marginBottom: 4, marginLeft: 12 }}>Вид</Txt>
      <Row k={k} role="radio" title="Лентой" subtitle="Вся неделя, листать вверх и вниз" selected={viewMode === 'list'} onPress={() => onViewMode('list')} />
      <Row k={k} role="radio" title="По дням" subtitle="Один день, листать влево и вправо" selected={viewMode === 'pages'} onPress={() => onViewMode('pages')} />

      <Txt t="overline" color={k.textSecondary} style={{ marginTop: 16, marginBottom: 8, marginLeft: 12 }}>Группа</Txt>
      <View style={{ paddingHorizontal: 12 }}>
        <GroupSelector groups={groups} value={group} onChange={g => { onClose(); onPickGroup(g); }} C={legacy} />
      </View>

      <View style={{ marginTop: 16, borderRadius: RADIUS.lg, overflow: 'hidden' }}>
        {myGroup && group && myGroup.id !== group.id && (
          <>
            <Divider k={k} />
            <Row
              k={k}
              icon="arrow-undo-outline"
              title="Вернуться к моей группе"
              subtitle={`${shortGroupName(myGroup.name)} · ${myGroup.year} курс`}
              onPress={() => { onClose(); onPickGroup(myGroup); }}
            />
          </>
        )}
        {canShare && (
          <>
            <Divider k={k} />
            <Row k={k} icon="share-outline" title="Поделиться расписанием" onPress={() => { onClose(); onShare(); }} />
          </>
        )}
      </View>
    </BottomSheet>
  );
}

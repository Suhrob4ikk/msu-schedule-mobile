/**
 * Части «Уведомлений» и «Истории» (ТЗ, раздел 3): шапка, заголовок экрана,
 * фильтры, заголовок даты, строка события с бейджем и блоком «Было / Стало»,
 * сегмент, выбор группы, кнопка Истории, строка в конце списка.
 */
import React from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Tokens, GUTTER, HEADER_H, RADIUS, TOUCH_MIN, FONT } from '../schedule/tokens';
import { Txt, Divider } from '../schedule/ui';
import { StatusPill, Bell, LinkState } from '../schedule/ScheduleHeader';
import type { ChangeKind, Diff, Filter } from './state';

// ─── Шапка и заголовок ─────────────────────────────────────────────────────

/** Шапка 60 dp: «Назад» 48×48, пусто, плашка связи, колокольчик. */
export function OverlayHeader({ k, topInset, link, onBack, bellActive, onBell }: {
  k: Tokens; topInset: number; link: LinkState; onBack: () => void; bellActive?: boolean; onBell?: () => void;
}) {
  return (
    <View style={{ paddingTop: topInset, backgroundColor: k.bg }}>
      <View style={{ minHeight: HEADER_H, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingHorizontal: GUTTER - 8, columnGap: 8 }}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="arrow-back" size={24} color={k.text} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' }}>
          <StatusPill s={link} k={k} />
          <Bell k={k} active={bellActive} onPress={onBell} />
        </View>
      </View>
    </View>
  );
}

/** Заголовок экрана 26/800 и строка под ним 13/400 (число — 700). */
export function ScreenTitle({ k, title, lead, strong }: { k: Tokens; title: string; lead: string; strong?: string | null }) {
  return (
    <View style={{ paddingHorizontal: 4, paddingBottom: 12 }}>
      <Txt t="teacherTitle" color={k.text} accessibilityRole="header" android_hyphenationFrequency="full">{title}</Txt>
      <Txt t="small" color={k.textSecondary} style={{ marginTop: 4, fontFamily: FONT[400] }}>
        {lead}
        {strong ? <>{lead ? ' · ' : ''}<Txt t="smallStrong" color={k.text}>{strong}</Txt></> : null}
      </Txt>
    </View>
  );
}

// ─── Фильтры ───────────────────────────────────────────────────────────────

/** Зона 48, видимая пилюля 36, 14/600; число непрочитанных — accent-text 800. */
export function FilterChip({ k, label, count, selected, onPress, spoken }: {
  k: Tokens; label: string; count: number; selected: boolean; onPress: () => void; spoken: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={spoken}
      style={{ minHeight: TOUCH_MIN, justifyContent: 'center' }}
    >
      <View
        style={{
          minHeight: 36, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 6, justifyContent: 'center',
          borderWidth: 1, borderColor: selected ? k.accent : k.border, backgroundColor: selected ? k.accent : k.surface,
        }}
      >
        <Txt t="labelStrong" color={selected ? k.onAccent : k.text} style={{ fontFamily: FONT[600] }}>
          {label}
          {count > 0 ? <Txt t="labelStrong" color={selected ? k.onAccent : k.accentText} style={{ fontFamily: FONT[800] }}>{` ${count}`}</Txt> : null}
        </Txt>
      </View>
    </Pressable>
  );
}

export const FILTERS: Array<{ f: Filter; label: string }> = [
  { f: 'all', label: 'Все' },
  { f: 'exam', label: 'Экзамены' },
  { f: 'schedule', label: 'Расписание' },
];

/** «Прочитать все» — текстовая кнопка 48, accent-text 14/700; прижата вправо, при нехватке места — своя строка. */
export function MarkAllButton({ k, onPress }: { k: Tokens; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ minHeight: TOUCH_MIN, justifyContent: 'center', paddingHorizontal: 4, marginLeft: 'auto' }}
    >
      <Txt t="labelStrong" color={k.accentText}>Прочитать все</Txt>
    </Pressable>
  );
}

// ─── Заголовок даты и карточка ─────────────────────────────────────────────

/** «СЕГОДНЯ» 12/700 заглавными и справа 13/500 («2 новых», «1 изменение»). */
export function DateHeader({ k, title, right }: { k: Tokens; title: string; right?: string | null }) {
  return (
    <View
      accessibilityRole="header"
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 8, paddingHorizontal: 4, paddingTop: 8, paddingBottom: 8 }}
    >
      <Txt t="sectionTitle" color={k.text}>{title}</Txt>
      {right ? <Txt t="small" color={k.textSecondary}>{right}</Txt> : null}
    </View>
  );
}

/** Карточка группы строк: радиус 18, строки через тонкую линию. */
export function DayCard({ k, children }: { k: Tokens; children: React.ReactNode[] }) {
  return (
    <View style={{ backgroundColor: k.card, borderRadius: RADIUS.card, overflow: 'hidden' }}>
      {children.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <Divider k={k} /> : null}
          {c}
        </React.Fragment>
      ))}
    </View>
  );
}

// ─── Бейджи ────────────────────────────────────────────────────────────────

export type BadgeKind = ChangeKind | 'exam';

/** Цвета типов — семантические псевдонимы готовых токенов (ТЗ, раздел 5). */
function badgeColors(kind: BadgeKind, k: Tokens): { bg: string; fg: string } {
  switch (kind) {
    case 'added': return { bg: k.roomFreeBg, fg: k.roomFreeText };       // change-added
    case 'removed': return { bg: k.roomBusyBg, fg: k.roomBusyText };     // change-removed
    case 'changed': return { bg: k.roomConflictBg, fg: k.roomConflictText }; // change-modified
    case 'new_week': return { bg: k.accentSoft, fg: k.onAccentSoft };    // change-week
    default: return { bg: k.typeExamBg, fg: k.typeExamText };            // reminder-exam
  }
}

/** Бейдж типа: высота 22, радиус 999, 12/700. */
export function TypeBadge({ k, kind, label }: { k: Tokens; kind: BadgeKind; label: string }) {
  const c = badgeColors(kind, k);
  return (
    <View style={{ minHeight: 22, borderRadius: RADIUS.pill, paddingHorizontal: 8, justifyContent: 'center', backgroundColor: c.bg }}>
      <Txt t="captionStrong" color={c.fg}>{label}</Txt>
    </View>
  );
}

/** «завтра» / «сегодня» у зачёта: высота 24, type-exam. */
export function CountdownTag({ k, text }: { k: Tokens; text: string }) {
  return (
    <View style={{ alignSelf: 'flex-start', minHeight: 24, borderRadius: RADIUS.pill, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: k.typeExamBg, marginTop: 6 }}>
      <Txt t="captionStrong" color={k.typeExamText}>{text}</Txt>
    </View>
  );
}

// ─── «Было / Стало» ────────────────────────────────────────────────────────

/**
 * Подложка surface-2, радиус 12, отступ 8/10. Подписи слева (12/700), значения
 * переносятся: «Было» зачёркнуто text-secondary, «Стало» 14/700. Смысл — в
 * словах, не в цвете. Ширина подписи — из ширины шрифта, без замеров.
 */
export function DiffBlock({ k, diff }: { k: Tokens; diff: Diff }) {
  const { fontScale } = useWindowDimensions();
  const labelW = Math.ceil(38 * Math.min(Math.max(fontScale, 1), 2));
  if (!diff.before && !diff.after) return null;
  const row = (label: string, value: string, before: boolean) => (
    <View style={{ flexDirection: 'row', columnGap: 10, alignItems: 'baseline' }}>
      <Txt t="captionStrong" color={k.textSecondary} style={{ width: labelW }}>{label}</Txt>
      <Txt
        t="bodySmall"
        color={before ? k.textSecondary : k.text}
        style={[{ flex: 1, minWidth: 0 }, before ? { textDecorationLine: 'line-through' } : { fontFamily: FONT[700] }]}
      >
        {value}
      </Txt>
    </View>
  );
  return (
    <View importantForAccessibility="no-hide-descendants" style={{ marginTop: 8, backgroundColor: k.surface2, borderRadius: RADIUS.sm, paddingVertical: 8, paddingHorizontal: 10, rowGap: 3 }}>
      {diff.before ? row('Было', diff.before, true) : null}
      {diff.after ? row('Стало', diff.after, false) : null}
    </View>
  );
}

// ─── Строка события ────────────────────────────────────────────────────────

/**
 * Одна строка для обоих экранов: сетка 12 | 1fr, отступы 12/12/12/10, ≥ 56.
 * Точка 10 accent-text — у непрочитанных (в Истории колонка пустая, но
 * ширина та же). Вся строка — одна зона нажатия и одна фраза для диктора.
 */
export function EventRow({ k, unread, badge, time, group, groupMine, title, subject, extra, countdown, diff, a11y, onPress }: {
  k: Tokens;
  unread: boolean;
  badge: { kind: BadgeKind; label: string };
  time: string;
  group?: string | null;
  groupMine?: boolean;
  title: string;
  subject?: string | null;
  extra?: string | null;
  countdown?: string | null;
  diff?: Diff | null;
  a11y: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint={onPress ? 'Открыть в расписании' : undefined}
      style={({ pressed }) => ({
        minHeight: 56, paddingTop: 12, paddingRight: 12, paddingBottom: 12, paddingLeft: 10,
        flexDirection: 'row', columnGap: 8, backgroundColor: pressed ? k.surface2 : 'transparent',
      })}
    >
      <View style={{ width: 12, paddingTop: 6, alignItems: 'center' }}>
        {unread ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: k.accentText }} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 }}>
          <TypeBadge k={k} kind={badge.kind} label={badge.label} />
          <Txt
            t="small"
            numberOfLines={1}
            color={unread ? k.accentText : k.textSecondary}
            style={[{ marginLeft: 'auto' }, unread ? { fontFamily: FONT[700] } : { fontFamily: FONT[400] }]}
          >
            {time}
          </Txt>
        </View>
        {group ? (
          <Txt t="small" color={k.textSecondary} style={{ marginTop: 6, fontFamily: FONT[400] }}>
            {group}
            {groupMine ? <Txt t="small" color={k.accentText}> · ваша группа</Txt> : null}
          </Txt>
        ) : null}
        <Txt t="titleRow" color={k.text} style={[{ marginTop: group ? 2 : 6 }, unread ? { fontFamily: FONT[800] } : null]}>
          {title}
        </Txt>
        {subject ? <Txt t="bodySmall" color={k.text} style={{ marginTop: 2, lineHeight: 18 }}>{subject}</Txt> : null}
        {extra ? <Txt t="small" color={k.textSecondary} style={{ marginTop: 2, fontFamily: FONT[400] }}>{extra}</Txt> : null}
        {countdown ? <CountdownTag k={k} text={countdown} /> : null}
        {diff ? <DiffBlock k={k} diff={diff} /> : null}
      </View>
    </Pressable>
  );
}

// ─── Сегмент «Моя группа / Все факультеты» ─────────────────────────────────

export function Segment<T extends string>({ k, items, value, onPick }: {
  k: Tokens; items: Array<{ v: T; label: string }>; value: T; onPick: (v: T) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: k.surface2, borderRadius: RADIUS.sm, padding: 3, columnGap: 3 }}>
      {items.map(it => {
        const on = it.v === value;
        return (
          <Pressable
            key={it.v}
            onPress={() => onPick(it.v)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{
              flex: 1, minHeight: TOUCH_MIN, borderRadius: RADIUS.sm - 3, paddingVertical: 4, paddingHorizontal: 6,
              alignItems: 'center', justifyContent: 'center', backgroundColor: on ? k.bg : 'transparent',
            }}
          >
            <Txt t="labelStrong" color={on ? k.text : k.textSecondary} style={{ textAlign: 'center' }}>{it.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** «Все группы ▾»: пилюля 48, рамка, surface, 14/600. */
export function GroupPickerButton({ k, label, onPress }: { k: Tokens; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Выбор группы: ${label}`}
      style={({ pressed }) => ({
        minHeight: TOUCH_MIN, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: k.border,
        backgroundColor: pressed ? k.surface2 : k.surface, paddingHorizontal: 16,
        flexDirection: 'row', alignItems: 'center', columnGap: 6, marginLeft: 'auto', flexShrink: 1,
      })}
    >
      <Txt t="labelStrong" color={k.text} style={{ fontFamily: FONT[600], flexShrink: 1 }}>{label}</Txt>
      <Ionicons name="chevron-down" size={18} color={k.textSecondary} />
    </Pressable>
  );
}

// ─── Кнопки и подписи ──────────────────────────────────────────────────────

/** «Вся история изменений»: 48, радиус 14, accent-soft, 15/700. */
export function HistoryButton({ k, onPress }: { k: Tokens; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: TOUCH_MIN, borderRadius: RADIUS.md, backgroundColor: k.accentSoft, opacity: pressed ? 0.85 : 1,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8, paddingHorizontal: 16, paddingVertical: 8,
      })}
    >
      <Ionicons name="time-outline" size={20} color={k.onAccentSoft} />
      <Txt t="button" color={k.onAccentSoft} style={{ flexShrink: 1, textAlign: 'center' }}>Вся история изменений</Txt>
    </Pressable>
  );
}

/** Строка в конце списка: 12 text-secondary по центру. */
export function TailNote({ k, text }: { k: Tokens; text: string }) {
  return <Txt t="caption" color={k.textSecondary} style={{ textAlign: 'center', paddingVertical: 12, paddingHorizontal: 8, fontFamily: FONT[400] }}>{text}</Txt>;
}

/** «Уведомления выключены — Включить» над лентой. */
export function PermissionRow({ k, onEnable }: { k: Tokens; onEnable: () => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, backgroundColor: k.card, borderRadius: RADIUS.card, paddingLeft: 14, paddingRight: 6, marginBottom: 8 }}>
      <Ionicons name="notifications-off-outline" size={20} color={k.textSecondary} />
      <Txt t="body" color={k.text} style={{ flex: 1, minWidth: 140, paddingVertical: 12 }}>Уведомления выключены</Txt>
      <Pressable onPress={onEnable} accessibilityRole="button" style={{ minHeight: TOUCH_MIN, justifyContent: 'center', paddingHorizontal: 10 }}>
        <Txt t="labelStrong" color={k.accentText}>Включить</Txt>
      </Pressable>
    </View>
  );
}

/** Плашка «Отмечено: 3 · Вернуть» — 5 секунд после «Прочитать все». */
export function UndoBar({ k, count, onUndo, bottom }: { k: Tokens; count: number; onUndo: () => void; bottom: number }) {
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: GUTTER, right: GUTTER, bottom, alignItems: 'center' }}>
      <View
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: 'row', alignItems: 'center', columnGap: 4, borderRadius: RADIUS.md, backgroundColor: k.text,
          paddingLeft: 16, paddingRight: 4, minHeight: TOUCH_MIN, maxWidth: '100%', elevation: 4,
        }}
      >
        <Txt t="body" color={k.bg} style={{ flexShrink: 1 }}>{`Отмечено: ${count}`}</Txt>
        <Pressable onPress={onUndo} accessibilityRole="button" style={{ minHeight: TOUCH_MIN, justifyContent: 'center', paddingHorizontal: 12 }}>
          <Txt t="labelStrong" color={k.bg} style={{ textDecorationLine: 'underline' }}>Вернуть</Txt>
        </Pressable>
      </View>
    </View>
  );
}

/** Скелет карточки, пока нет ни кэша, ни ответа. */
export function SkeletonCard({ k }: { k: Tokens }) {
  return <View style={{ marginTop: 12, height: 120, borderRadius: RADIUS.card, backgroundColor: k.card }} />;
}


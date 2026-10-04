/**
 * Экран «Внешний вид» — по ТЗ «токены и экран „Внешний вид“». Любой выбор
 * сразу действует во всём приложении (src/appearance.ts), без «Сохранить»;
 * исключение — лист «Свой цвет» с кнопкой «Применить».
 */
import React, { useCallback, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StatusBar, TextInput, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useThemeMode, useAppearanceSettings } from '../theme';
import { setAppearance, resetAppearance } from '../appearance';
import { accentHex, onAccentLine, type Background } from '../appearanceModel';
import {
  useTokens, Tokens, RADIUS, TOUCH_MIN, TYPE,
  ACCENT_PRESETS, TYPE_SHADES, BASE_THEMES, normalizeHex, pickOnAccent,
  type BaseMode, type Density, type LessonTypeKey, type ShadeId,
} from '../schedule/tokens';
import { Txt } from '../schedule/ui';
import FocusCard from '../schedule/FocusCard';
import BottomSheet from '../schedule/BottomSheet';
import type { Focus, Block } from '../schedule/state';
import type { Lesson } from '../api';

const GUTTER = 16;
const SECTION_GAP = 26;
const PREVIEW_SCALE = 0.78;

// ─── Демо-пара для предпросмотра ────────────────────────────────────────────

function demoFocus(): Focus {
  const now = Date.now();
  const lesson: Lesson = {
    id: -1, subject: 'Математический анализ', lesson_type: 'ЛК', day_of_week: 'понедельник',
    lesson_date: null, pair_number: 'II', pair_time_start: '09:45', pair_time_end: '11:15',
    teacher: { id: -1, name: 'Иванов И. И.' }, room: { id: -1, name: '406' }, group: null,
  };
  const block: Block = {
    key: 'demo', lessons: [lesson], day: 'понедельник', date: '2026-10-05', pairs: ['II'],
    start: '09:45', end: '11:15', startAt: now - 38 * 60_000, endAt: now + 52 * 60_000,
  };
  return {
    kind: 'live', block, slot: lesson, pill: 'Идёт · II пара', filled: true,
    countdownLabel: 'до конца', targetAt: now + 52 * 60_000, progressFrom: now - 38 * 60_000,
  };
}

const noop = () => {};

/** Настоящая карточка Расписания с демо-данными, уменьшенная до 0,78. */
function Preview({ k }: { k: Tokens }) {
  const [focus] = useState(demoFocus);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  return (
    <View
      accessible
      accessibilityLabel="Предпросмотр карточки пары"
      importantForAccessibility="yes"
      onLayout={e => setW(e.nativeEvent.layout.width)}
      style={{ height: h ? h * PREVIEW_SCALE : undefined }}
    >
      {w > 0 && (
        <View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          onLayout={e => setH(e.nativeEvent.layout.height)}
          style={{ width: w / PREVIEW_SCALE, transform: [{ scale: PREVIEW_SCALE }], transformOrigin: 'top left' }}
        >
          <FocusCard focus={focus} k={k} onPress={noop} onExpire={noop} />
        </View>
      )}
    </View>
  );
}

// ─── Общие детали ────────────────────────────────────────────────────────────

function Panel({ k, title, children }: { k: Tokens; title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: SECTION_GAP }}>
      <Txt t="overline" color={k.textSecondary} accessibilityRole="header" style={{ marginLeft: 4, marginBottom: 8 }}>
        {title}
      </Txt>
      <View style={{ backgroundColor: k.surface, borderRadius: RADIUS.lg, padding: 16 }}>{children}</View>
    </View>
  );
}

/** Круг с кольцом выбора цвета `text` (2 + 3 отступ, ТЗ selected-ring). */
function Swatch({ k, color, size, selected, check, children }: {
  k: Tokens; color: string; size: number; selected: boolean; check?: string; children?: React.ReactNode;
}) {
  return (
    <View style={{
      width: size + 10, height: size + 10, borderRadius: RADIUS.pill, borderWidth: 2,
      borderColor: selected ? k.text : 'transparent', alignItems: 'center', justifyContent: 'center',
    }}
    >
      <View style={{
        width: size, height: size, borderRadius: RADIUS.pill, backgroundColor: color,
        alignItems: 'center', justifyContent: 'center',
      }}
      >
        {selected && check ? <Ionicons name="checkmark" size={Math.round(size * 0.5)} color={check} /> : children}
      </View>
    </View>
  );
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Акцент ──────────────────────────────────────────────────────────────────

function AccentGrid({ k, onCustom }: { k: Tokens; onCustom: () => void }) {
  const a = useAppearanceSettings();
  const custom = a.accent.custom;
  const customOn = a.accent.preset === 'custom';
  const cell = { width: '20%' as const, minHeight: 72, alignItems: 'center' as const, paddingVertical: 4 };
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
        {ACCENT_PRESETS.map(p => {
          const sel = a.accent.preset === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => { Haptics.selectionAsync(); setAppearance(prev => ({ ...prev, accent: { ...prev.accent, preset: p.id } })); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={`Акцент: ${p.name}`}
              style={cell}
            >
              <Swatch k={k} color={p.hex} size={40} selected={sel} check={pickOnAccent(p.hex)} />
              <Txt t={sel ? 'captionStrong' : 'caption'} color={sel ? k.text : k.textSecondary} numberOfLines={1} style={{ marginTop: 4 }}>
                {capital(p.name)}
              </Txt>
            </Pressable>
          );
        })}
        <Pressable
          onPress={onCustom}
          accessibilityRole="radio"
          accessibilityState={{ selected: customOn }}
          accessibilityLabel={custom ? `Акцент: свой цвет ${custom}` : 'Акцент: свой цвет'}
          accessibilityHint="Открыть выбор своего цвета"
          style={cell}
        >
          <Swatch k={k} color={custom ?? k.surface2} size={40} selected={customOn} check={custom ? pickOnAccent(custom) : undefined}>
            <Ionicons name={custom ? 'color-palette' : 'add'} size={20} color={custom ? pickOnAccent(custom) : k.textSecondary} />
          </Swatch>
          <Txt t={customOn ? 'captionStrong' : 'caption'} color={customOn ? k.text : k.textSecondary} numberOfLines={1} style={{ marginTop: 4 }}>
            Свой
          </Txt>
        </Pressable>
      </View>
      <Txt t="label" color={k.textSecondary} style={{ marginTop: 8 }}>{onAccentLine(accentHex(a))}</Txt>
    </>
  );
}

// ─── «Свой цвет» ─────────────────────────────────────────────────────────────

const CUSTOM_PALETTE = [
  '#E53935', '#D81B60', '#8E24AA', '#5E35B1', '#3949AB', '#1E88E5',
  '#039BE5', '#00ACC1', '#00897B', '#43A047', '#7CB342', '#C0CA33',
  '#FDD835', '#FFB300', '#FB8C00', '#F4511E', '#6D4C41', '#546E7A',
];

function CustomColorSheet({ k, visible, onClose }: { k: Tokens; visible: boolean; onClose: () => void }) {
  const a = useAppearanceSettings();
  const start = a.accent.custom ?? accentHex(a);
  const [draft, setDraft] = useState(start);
  const [text, setText] = useState(start);

  // Каждое открытие — с текущего цвета
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) { setDraft(start); setText(start); }
  }

  const typed = normalizeHex(text);
  const valid = typed != null;
  const pick = (hex: string) => { Haptics.selectionAsync(); setDraft(hex); setText(hex); };
  const apply = () => {
    if (!valid) return;
    setAppearance(prev => ({ ...prev, accent: { preset: 'custom', custom: draft } }));
    onClose();
  };
  const onDraft = pickOnAccent(draft);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      k={k}
      label="Свой цвет"
      header={(
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: TOUCH_MIN }}>
          <Txt t="titleScreen" color={k.text} accessibilityRole="header" style={{ flex: 1 }}>Свой цвет</Txt>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center', marginRight: -12 }}
          >
            <Ionicons name="close" size={24} color={k.text} />
          </Pressable>
        </View>
      )}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 12, marginTop: 8 }}>
        <View style={{ width: 48, height: 48, borderRadius: RADIUS.pill, backgroundColor: draft, borderWidth: 1, borderColor: k.border }} />
        <View style={{ flex: 1 }}>
          <Txt t="titleRow" color={k.text}>{draft}</Txt>
          <Txt t="caption" color={k.textSecondary}>{onAccentLine(draft)}</Txt>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 }}>
        {CUSTOM_PALETTE.map(hex => {
          const sel = hex === draft;
          return (
            <Pressable
              key={hex}
              onPress={() => pick(hex)}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={`Цвет ${hex}`}
              style={{ width: `${100 / 6}%`, height: 52, alignItems: 'center', justifyContent: 'center' }}
            >
              <Swatch k={k} color={hex} size={30} selected={sel} check={pickOnAccent(hex)} />
            </Pressable>
          );
        })}
      </View>

      <Txt t="overline" color={k.textSecondary} style={{ marginTop: 16, marginBottom: 6 }}>Код цвета</Txt>
      <TextInput
        value={text}
        onChangeText={v => { setText(v); const n = normalizeHex(v); if (n) setDraft(n); }}
        placeholder="#2F62EA"
        placeholderTextColor={k.textSecondary}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={7}
        accessibilityLabel="Код цвета, например #2F62EA"
        maxFontSizeMultiplier={TYPE.body.max}
        style={[TYPE.body.style, {
          minHeight: TOUCH_MIN, borderRadius: RADIUS.sm, paddingHorizontal: 14, color: k.text,
          backgroundColor: k.surface2, borderWidth: 1, borderColor: valid ? k.border : k.statusOffline,
        }]}
      />
      {!valid && <Txt t="caption" color={k.statusOffline} style={{ marginTop: 4 }}>Шесть знаков 0–9 и A–F, например #2F62EA</Txt>}

      <Pressable
        onPress={apply}
        disabled={!valid}
        accessibilityRole="button"
        accessibilityState={{ disabled: !valid }}
        style={{
          marginTop: 16, minHeight: 52, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
          backgroundColor: valid ? draft : k.surface2,
        }}
      >
        <Txt t="labelStrong" color={valid ? onDraft : k.textSecondary} style={{ fontSize: 16 }}>Применить</Txt>
      </Pressable>
    </BottomSheet>
  );
}

// ─── Типы занятий ────────────────────────────────────────────────────────────

const TYPE_ROWS: { key: LessonTypeKey; label: string; bg: keyof Tokens; fg: keyof Tokens }[] = [
  { key: 'lecture', label: 'Лекция', bg: 'typeLectureBg', fg: 'typeLectureText' },
  { key: 'practice', label: 'Практика', bg: 'typePracticeBg', fg: 'typePracticeText' },
  { key: 'exam', label: 'Экзамен · Зачёт', bg: 'typeExamBg', fg: 'typeExamText' },
];

function TypeBadge({ k, row }: { k: Tokens; row: typeof TYPE_ROWS[number] }) {
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: k[row.bg] as string, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Txt t="captionStrong" color={k[row.fg] as string}>{row.label}</Txt>
    </View>
  );
}

function TypeRows({ k }: { k: Tokens }) {
  const a = useAppearanceSettings();
  const set = (key: LessonTypeKey, id: ShadeId) => {
    Haptics.selectionAsync();
    setAppearance(prev => ({ ...prev, types: { ...prev.types, [key]: id } }));
  };
  return (
    <View style={{ rowGap: 4 }}>
      {TYPE_ROWS.map(row => (
        <View key={row.key} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 }}>
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 80 }}><TypeBadge k={k} row={row} /></View>
          <View style={{ flexDirection: 'row' }}>
            {TYPE_SHADES.map(sh => {
              const sel = a.types[row.key] === sh.id;
              return (
                <Pressable
                  key={sh.id}
                  onPress={() => set(row.key, sh.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel }}
                  accessibilityLabel={`${row.label}: ${sh.name}`}
                  style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Swatch k={k} color={sh.hex} size={28} selected={sel} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Фон ─────────────────────────────────────────────────────────────────────

function MiniScreen({ mode, accent, style }: { mode: BaseMode; accent: string; style?: object }) {
  const b = BASE_THEMES[mode];
  return (
    <View style={[{ flex: 1, backgroundColor: b.bg, padding: 6, rowGap: 4 }, style]}>
      <View style={{ height: 14, borderRadius: 4, backgroundColor: accent }} />
      <View style={{ height: 10, borderRadius: 3, backgroundColor: b.surface, borderWidth: 1, borderColor: b.border }} />
      <View style={{ height: 3, width: '70%', borderRadius: 2, backgroundColor: b.text }} />
    </View>
  );
}

const BACKGROUND_TILES: { id: Background; label: string }[] = [
  { id: 'system', label: 'Как в системе' },
  { id: 'light', label: 'Светлый' },
  { id: 'dark', label: 'Тёмный' },
  { id: 'black', label: 'Чёрный' },
];

function Tile({ k, selected, label, a11y, onPress, children }: {
  k: Tokens; selected: boolean; label: string; a11y: string;
  onPress: (e: GestureResponderEvent) => void; children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={a11y}
      style={{ flexGrow: 1, flexBasis: 0, minWidth: 64, alignItems: 'center' }}
    >
      <View style={{
        alignSelf: 'stretch', borderRadius: RADIUS.md + 5, borderWidth: 2, padding: 3,
        borderColor: selected ? k.text : 'transparent',
      }}
      >
        <View style={{ height: 64, borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: 1, borderColor: k.border, flexDirection: 'row' }}>
          {children}
        </View>
      </View>
      <Txt t={selected ? 'captionStrong' : 'caption'} color={selected ? k.text : k.textSecondary} style={{ marginTop: 4, textAlign: 'center' }}>
        {label}
      </Txt>
    </Pressable>
  );
}

function BackgroundTiles({ k }: { k: Tokens }) {
  const a = useAppearanceSettings();
  const { choose } = useThemeMode();
  const acc = accentHex(a);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 12 }}>
      {BACKGROUND_TILES.map(t => (
        <Tile
          key={t.id}
          k={k}
          selected={a.background === t.id}
          label={t.label}
          a11y={`Фон: ${t.label.toLowerCase()}`}
          onPress={e => {
            Haptics.selectionAsync();
            choose(t.id, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
          }}
        >
          {t.id === 'system' ? (
            <>
              <MiniScreen mode="light" accent={acc} />
              <MiniScreen mode="dark" accent={acc} />
            </>
          ) : (
            <MiniScreen mode={t.id} accent={acc} />
          )}
        </Tile>
      ))}
    </View>
  );
}

// ─── Плотность ───────────────────────────────────────────────────────────────

function DensityTiles({ k }: { k: Tokens }) {
  const a = useAppearanceSettings();
  const tiles: { id: Density; label: string; gap: number }[] = [
    { id: 'regular', label: 'Обычная', gap: 9 },
    { id: 'compact', label: 'Компактная', gap: 4 },
  ];
  return (
    <View style={{ flexDirection: 'row', columnGap: 8 }}>
      {tiles.map(t => (
        <Tile
          key={t.id}
          k={k}
          selected={a.density === t.id}
          label={t.label}
          a11y={`Плотность карточек: ${t.label.toLowerCase()}`}
          onPress={() => { Haptics.selectionAsync(); setAppearance(prev => ({ ...prev, density: t.id })); }}
        >
          <View style={{ flex: 1, backgroundColor: k.card, paddingHorizontal: 10, justifyContent: 'center', rowGap: t.gap }}>
            {[0, 1, 2].map(i => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', columnGap: 6 }}>
                <View style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: k.text }} />
                <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: k.textSecondary }} />
                <View style={{ width: 10, height: 4, borderRadius: 2, backgroundColor: k.text }} />
              </View>
            ))}
          </View>
        </Tile>
      ))}
    </View>
  );
}

// ─── Экран ───────────────────────────────────────────────────────────────────

export default function AppearanceScreen() {
  const k = useTokens();
  const { mode } = useThemeMode();
  const insets = useSafeAreaInsets();
  const [customOpen, setCustomOpen] = useState(false);

  const back = useCallback(() => { router.navigate('/profile'); }, []);

  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle(mode === 'dark' ? 'light-content' : 'dark-content');
      // Системная «Назад» — в Кабинет, откуда пришли
      const sub = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
      return () => {
        sub.remove();
        StatusBar.setBarStyle(k.onAccent === '#FFFFFF' ? 'light-content' : 'dark-content');
      };
    }, [mode, k.onAccent, back]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: k.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: k.bg }}>
        <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: GUTTER }}>
          <Pressable
            onPress={back}
            accessibilityRole="button"
            accessibilityLabel="Назад"
            style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="arrow-back" size={24} color={k.text} />
          </Pressable>
          <Txt t="titleScreen" color={k.text} accessibilityRole="header" style={{ marginLeft: 4, flexShrink: 1 }}>
            Внешний вид
          </Txt>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: insets.bottom + 32 }}>
        <View style={{ backgroundColor: k.surface, borderRadius: RADIUS.lg, padding: 16, rowGap: 12 }}>
          <Preview k={k} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 6 }}>
            {TYPE_ROWS.map(r => <TypeBadge key={r.key} k={k} row={r} />)}
          </View>
        </View>

        <Panel k={k} title="Акцент">
          <AccentGrid k={k} onCustom={() => setCustomOpen(true)} />
        </Panel>
        <Panel k={k} title="Типы занятий">
          <TypeRows k={k} />
        </Panel>
        <Panel k={k} title="Фон">
          <BackgroundTiles k={k} />
        </Panel>
        <Panel k={k} title="Плотность карточек">
          <DensityTiles k={k} />
        </Panel>

        <Pressable
          onPress={() => { Haptics.selectionAsync(); resetAppearance(); }}
          accessibilityRole="button"
          style={{ marginTop: SECTION_GAP - 8, minHeight: TOUCH_MIN, alignItems: 'center', justifyContent: 'center' }}
        >
          <Txt t="body" color={k.accentText}>Сбросить оформление</Txt>
        </Pressable>
      </ScrollView>

      <CustomColorSheet k={k} visible={customOpen} onClose={() => setCustomOpen(false)} />
    </View>
  );
}

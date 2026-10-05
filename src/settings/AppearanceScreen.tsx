/**
 * Экран «Внешний вид» — по ТЗ «токены и экран „Внешний вид“». Выбор сразу
 * отмечается на экране (кольцо — в тот же кадр), а приложение
 * перекрашивается следующим кадром (src/appearance.ts). Исключение — лист
 * «Свой цвет» с кнопкой «Применить».
 *
 * Раскладка без измерений: ни onLayout → setState, ни процентов с дробями.
 * В 1.9.40 предпросмотр брал высоту из onLayout, а внутри тикал отсчёт и
 * пульсировала точка — экран под ним мелко дрожал. Теперь все размеры
 * считаются из ширины окна целыми числами, предпросмотр неподвижен.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  BackHandler, Pressable, ScrollView, StatusBar, TextInput, View, useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useThemeMode } from '../theme';
import { setAppearance, resetAppearance, useSelectedAppearance } from '../appearance';
import { accentHex, onAccentLine, type Appearance, type Background } from '../appearanceModel';
import {
  useTokens, Tokens, RADIUS, TOUCH_MIN, TYPE,
  ACCENT_PRESETS, TYPE_SHADES, BASE_THEMES, normalizeHex, pickOnAccent, accentTokens, shadePair,
  type BaseMode, type Density, type LessonTypeKey, type ShadeId,
} from '../schedule/tokens';
import { Txt, Divider, FixedFontScale } from '../schedule/ui';
import FocusCard from '../schedule/FocusCard';
import LessonRow from '../schedule/LessonRow';
import RoomRow from '../rooms/RoomRow';
import BottomSheet from '../schedule/BottomSheet';
import type { Focus, Block } from '../schedule/state';
import { parseOccupant, type RoomDay } from '../rooms/state';
import { PAIR_TIMES, type Lesson } from '../api';
import { SatValSquare, HueSlider, hexToHsv, hsvToHex, type Hsv } from './ColorPicker';

const GUTTER = 16;
const PANEL_PAD = 16;
const SECTION_GAP = 26;
const PREVIEW_SCALE = 0.78;
/**
 * Высота живой карточки при шрифте ×1 (шрифт в предпросмотре не
 * масштабируется): поля 14 + пилюля/отсчёт 26 + 10 + время/аудитория 62 + 10
 * + предмет 23 + 8 + бейдж 20 + прогресс 18. Плюс 6 запаса снизу.
 */
const CARD_H = 14 + 26 + 10 + 62 + 10 + 23 + 8 + 20 + 18 + 6;

// ─── Демо-данные предпросмотра (неподвижные) ───────────────────────────────

const DEMO_NOW = Date.UTC(2026, 9, 5, 5, 23); // момент «замер» — внутри II пары
const MIN = 60_000;

function demoLesson(id: number, pair: string, subject: string, type: string, teacher: string, room: string): Lesson {
  const [start, end] = PAIR_TIMES[pair];
  return {
    id, subject, lesson_type: type, day_of_week: 'понедельник', lesson_date: null,
    pair_number: pair, pair_time_start: start, pair_time_end: end,
    teacher: { id, name: teacher }, room: { id, name: room }, group: null,
  };
}

function demoBlock(l: Lesson): Block {
  return {
    key: `demo-${l.id}`, lessons: [l], day: l.day_of_week, date: '2026-10-05', pairs: [l.pair_number],
    start: l.pair_time_start, end: l.pair_time_end, startAt: 0, endAt: 0,
  };
}

// Настоящие пары ПМиИ 3 курса (октябрь 2026) — образец должен выглядеть как своё расписание
const DEMO_LIVE = demoLesson(-1, 'II', 'Численные методы', 'ПЗ', 'Хайбуллоев Д.А.', '702');
const DEMO_FOCUS: Focus = {
  kind: 'live', block: demoBlock(DEMO_LIVE), slot: DEMO_LIVE, pill: 'Идёт · II пара', filled: true,
  countdownLabel: 'до конца', targetAt: DEMO_NOW + 52 * MIN, progressFrom: DEMO_NOW - 38 * MIN,
};
const DEMO_ROWS: Block[] = [
  demoBlock(demoLesson(-2, 'III', 'Практический курс на ЭВМ', 'ПЗ', 'Харисова М.А.', '105')),
  demoBlock(demoLesson(-3, 'IV', 'Численные методы', 'ЛК', 'Попов А.В.', '403')),
  demoBlock(demoLesson(-4, 'V', 'Численные методы', 'ЭКЗ', 'Попов А.В.', '403')),
];
// Аудитория 702 во вторник — строки ровно как их отдаёт сервер
const DEMO_ROOM: RoomDay = {
  room: '702',
  occupants: [
    ['2 курс · МО: Мировая экономика · ЛК · Ганизода Р.Г.'],
    ['3 курс · ПМиИ: Численные методы · ПЗ · Хайбуллоев Д.А.'],
    ['1 курс · МО: Иностранный язык · ПЗ · Сабирова С.Г., Хасанова Т.Г.'],
    ['1 курс · МО: Таджикский язык · ПЗ · Музаффарова Ш.М.'],
    [],
  ].map(day => day.map(parseOccupant)),
  cells: ['busy', 'busy', 'busy', 'busy', 'free'],
};

const noop = () => {};

// ─── Типы занятий: подписи бейджей ──────────────────────────────────────────

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

/**
 * Предпросмотр: настоящая карточка Расписания (0,78), под ней три строки пар
 * и строка аудитории — в них видна плотность. Всё неподвижно и без
 * измерений: ширина — из окна, высота карточки — константа.
 */
function Preview({ k, width }: { k: Tokens; width: number }) {
  const innerW = Math.round(width / PREVIEW_SCALE);
  const boxH = Math.ceil(CARD_H * PREVIEW_SCALE);
  return (
    <FixedFontScale.Provider value>
      <View accessible accessibilityLabel="Предпросмотр: карточка пары, строки пар и аудитории" style={{ rowGap: 10 }}>
        <View style={{ width, height: boxH, overflow: 'hidden' }} pointerEvents="none" importantForAccessibility="no-hide-descendants">
          <View style={{ position: 'absolute', left: 0, top: 0, width: innerW, transform: [{ scale: PREVIEW_SCALE }], transformOrigin: 'top left' }}>
            <FocusCard focus={DEMO_FOCUS} k={k} onPress={noop} onExpire={noop} stillAt={DEMO_NOW} />
          </View>
        </View>
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={{ rowGap: k.blockGap }}>
          <View style={{ backgroundColor: k.card, borderRadius: RADIUS.card, borderWidth: 1, borderColor: k.border, overflow: 'hidden' }}>
            {DEMO_ROWS.map((b, i) => (
              <React.Fragment key={b.key}>
                {i > 0 && <Divider k={k} />}
                <LessonRow block={b} k={k} past={false} onPress={noop} />
              </React.Fragment>
            ))}
          </View>
          <View style={{ backgroundColor: k.card, borderRadius: RADIUS.card, borderWidth: 1, borderColor: k.border, overflow: 'hidden' }}>
            <RoomRow day={DEMO_ROOM} pairIdx={1} k={k} onPress={noop} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 6 }}>
          {TYPE_ROWS.map(r => <TypeBadge key={r.key} k={k} row={r} />)}
        </View>
      </View>
    </FixedFontScale.Provider>
  );
}

// ─── Общие детали ────────────────────────────────────────────────────────────

function Panel({ k, title, children }: { k: Tokens; title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: SECTION_GAP }}>
      <Txt t="overline" color={k.textSecondary} accessibilityRole="header" style={{ marginLeft: 4, marginBottom: 8 }}>
        {title}
      </Txt>
      <View style={{ backgroundColor: k.surface, borderRadius: RADIUS.lg, padding: PANEL_PAD }}>{children}</View>
    </View>
  );
}

/** Круг с кольцом выбора цвета `text` (2 + 3 отступ, ТЗ selected-ring). Размеры постоянные. */
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

const ACCENT_COLS = 5;

function AccentCell({ k, width, selected, label, a11y, hint, onPress, children }: {
  k: Tokens; width: number; selected: boolean; label: string; a11y: string; hint?: string;
  onPress: () => void; children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={a11y}
      accessibilityHint={hint}
      style={{ width, minHeight: 72, alignItems: 'center', paddingVertical: 4 }}
    >
      {children}
      <Txt t={selected ? 'captionStrong' : 'caption'} color={selected ? k.text : k.textSecondary} numberOfLines={1} style={{ marginTop: 4 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

function AccentGrid({ k, width, onCustom }: { k: Tokens; width: number; onCustom: () => void }) {
  const a = useSelectedAppearance();
  const custom = a.accent.custom;
  const customOn = a.accent.preset === 'custom';
  // Целая ширина ячейки — без дробных процентов, число колонок не «мигает»
  const cellW = Math.floor(width / ACCENT_COLS);
  const cells = [
    ...ACCENT_PRESETS.map(p => {
      const sel = a.accent.preset === p.id;
      return (
        <AccentCell
          key={p.id} k={k} width={cellW} selected={sel} label={capital(p.name)} a11y={`Акцент: ${p.name}`}
          onPress={() => { Haptics.selectionAsync(); setAppearance(prev => ({ ...prev, accent: { ...prev.accent, preset: p.id } })); }}
        >
          <Swatch k={k} color={p.hex} size={40} selected={sel} check={pickOnAccent(p.hex)} />
        </AccentCell>
      );
    }),
    <AccentCell
      key="custom" k={k} width={cellW} selected={customOn} label="Свой"
      a11y={custom ? `Акцент: свой цвет ${custom}` : 'Акцент: свой цвет'} hint="Открыть выбор своего цвета"
      onPress={onCustom}
    >
      <Swatch k={k} color={custom ?? k.surface2} size={40} selected={customOn} check={custom ? pickOnAccent(custom) : undefined}>
        <Ionicons name={custom ? 'color-palette' : 'add'} size={20} color={custom ? pickOnAccent(custom) : k.textSecondary} />
      </Swatch>
    </AccentCell>,
  ];
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < cells.length; i += ACCENT_COLS) rows.push(cells.slice(i, i + ACCENT_COLS));
  return (
    <>
      <View style={{ rowGap: 8 }}>
        {rows.map((r, i) => <View key={i} style={{ flexDirection: 'row' }}>{r}</View>)}
      </View>
      <Txt t="label" color={k.textSecondary} style={{ marginTop: 8 }}>{onAccentLine(accentHex(a))}</Txt>
    </>
  );
}

// ─── «Свой цвет» ─────────────────────────────────────────────────────────────

/** Чей свой цвет выбирают: акцента или одного типа занятий (с 2.0.2). */
type ColorTarget = 'accent' | LessonTypeKey;

/** С какого цвета открыть лист: сохранённый свой, иначе действующий сейчас. */
function startColor(a: Appearance, target: ColorTarget): string {
  if (target === 'accent') return a.accent.custom ?? accentHex(a);
  const saved = a.typesCustom[target];
  if (saved) return saved;
  const choice = a.types[target];
  return TYPE_SHADES.find(s => s.id === choice)?.hex ?? TYPE_SHADES[0].hex;
}

function CustomColorSheet({ k, target, width, onClose, onPreview }: {
  k: Tokens; target: ColorTarget | null; width: number; onClose: () => void;
  /** Предпросмотр на экране — по отпусканию пальца; null — вернуть как было. */
  onPreview: (hex: string | null) => void;
}) {
  const a = useSelectedAppearance();
  const visible = target != null;
  const t: ColorTarget = target ?? 'accent';
  const start = startColor(a, t);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(start));
  const [text, setText] = useState(start);
  const [dragging, setDragging] = useState(false);
  const row = TYPE_ROWS.find(r => r.key === t);

  // Каждое открытие — с текущего цвета
  const [wasOpen, setWasOpen] = useState<ColorTarget | null>(target);
  if (target !== wasOpen) {
    setWasOpen(target);
    if (target) {
      setHsv(hexToHsv(start));
      setText(start);
    }
  }

  const hex = hsvToHex(hsv);
  const settle = (h: string) => onPreview(h);
  const onPick = (v: Hsv) => { setHsv(v); setText(hsvToHex(v)); };
  const onActive = (on: boolean) => {
    setDragging(on);
    if (!on) settle(hex);
  };
  const onText = (v: string) => {
    setText(v);
    const n = normalizeHex(v);
    if (n) { setHsv(prev => hexToHsv(n, prev.h)); settle(n); }
  };
  const valid = normalizeHex(text) != null;
  const cancel = () => { onPreview(null); onClose(); };
  const apply = () => {
    if (!valid) return;
    if (t === 'accent') setAppearance(prev => ({ ...prev, accent: { preset: 'custom', custom: hex } }));
    else setAppearance(prev => ({ ...prev, types: { ...prev.types, [t]: 'custom' }, typesCustom: { ...prev.typesCustom, [t]: hex } }));
    onPreview(null);
    onClose();
  };
  const badge = shadePair(hex, k.mode);
  const title = row ? `Свой цвет · ${row.label}` : 'Свой цвет';
  const squareH = Math.min(200, Math.round(width * 0.55));

  return (
    <BottomSheet
      visible={visible}
      onClose={cancel}
      k={k}
      label={title}
      scrollEnabled={!dragging}
      header={(
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: TOUCH_MIN }}>
          <Txt t="titleScreen" color={k.text} accessibilityRole="header" style={{ flex: 1 }}>{title}</Txt>
          <Pressable
            onPress={cancel}
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center', marginRight: -12 }}
          >
            <Ionicons name="close" size={24} color={k.text} />
          </Pressable>
        </View>
      )}
    >
      {/* Образец выбранного цвета */}
      <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 12, marginTop: 4, marginBottom: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: RADIUS.md, backgroundColor: hex, borderWidth: 1, borderColor: k.border, alignItems: 'center', justifyContent: 'center' }}>
          <Txt t="labelStrong" color={pickOnAccent(hex)}>Аа</Txt>
        </View>
        <View style={{ flex: 1, rowGap: 4 }}>
          <Txt t="titleRow" color={k.text}>{hex}</Txt>
          {row ? (
            // Так бейдж будет выглядеть в расписании: фон и текст считаются от цвета
            <View style={{ alignSelf: 'flex-start', backgroundColor: badge.bg, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Txt t="captionStrong" color={badge.text}>{row.label}</Txt>
            </View>
          ) : (
            <Txt t="caption" color={k.textSecondary}>{onAccentLine(hex)}</Txt>
          )}
        </View>
      </View>

      <SatValSquare k={k} width={width} height={squareH} value={hsv} onChange={onPick} onActive={onActive} />
      <View style={{ marginTop: 8 }}>
        <HueSlider k={k} width={width} value={hsv} onChange={onPick} onActive={onActive} />
      </View>

      <Txt t="overline" color={k.textSecondary} style={{ marginTop: 8, marginBottom: 6 }}>Код цвета</Txt>
      <TextInput
        value={text}
        onChangeText={onText}
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

      <View style={{ flexDirection: 'row', columnGap: 8, marginTop: 16 }}>
        <Pressable
          onPress={cancel}
          accessibilityRole="button"
          style={{ flex: 1, minHeight: 52, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: k.surface2 }}
        >
          <Txt t="labelStrong" color={k.text} style={{ fontSize: 16 }}>Отмена</Txt>
        </Pressable>
        <Pressable
          onPress={apply}
          disabled={!valid}
          accessibilityRole="button"
          accessibilityState={{ disabled: !valid }}
          style={{
            flex: 1, minHeight: 52, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
            backgroundColor: valid ? hex : k.surface2, borderWidth: 1, borderColor: k.border,
          }}
        >
          <Txt t="labelStrong" color={valid ? pickOnAccent(hex) : k.textSecondary} style={{ fontSize: 16 }}>Применить</Txt>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

// ─── Типы занятий ────────────────────────────────────────────────────────────

function TypeRows({ k, onCustom }: { k: Tokens; onCustom: (key: LessonTypeKey) => void }) {
  const a = useSelectedAppearance();
  const set = (key: LessonTypeKey, id: ShadeId) => {
    Haptics.selectionAsync();
    setAppearance(prev => ({ ...prev, types: { ...prev.types, [key]: id } }));
  };
  return (
    <View style={{ rowGap: 4 }}>
      {TYPE_ROWS.map(row => (
        // Бейдж слева, пять кругов справа; на узком экране круги уходят строкой ниже
        <View key={row.key} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
          <View style={{ flexGrow: 1, paddingRight: 8 }}><TypeBadge k={k} row={row} /></View>
          <View style={{ flexDirection: 'row', marginLeft: 'auto' }}>
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
          <CustomTypeSwatch k={k} label={row.label} custom={a.typesCustom[row.key]} selected={a.types[row.key] === 'custom'} onPress={() => onCustom(row.key)} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Пятый круг «Свой»: открывает выбор своего цвета для этого типа. */
function CustomTypeSwatch({ k, label, custom, selected, onPress }: {
  k: Tokens; label: string; custom: string | undefined; selected: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={custom ? `${label}: свой цвет ${custom}` : `${label}: свой цвет`}
      accessibilityHint="Открыть выбор своего цвета"
      style={{ width: TOUCH_MIN, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center' }}
    >
      <Swatch k={k} color={custom ?? k.surface2} size={28} selected={selected}>
        <Ionicons name={custom ? 'color-palette' : 'add'} size={16} color={custom ? pickOnAccent(custom) : k.textSecondary} />
      </Swatch>
    </Pressable>
  );
}

// ─── Фон и плотность: плитки ─────────────────────────────────────────────────

function MiniScreen({ mode, accent }: { mode: BaseMode; accent: string }) {
  const b = BASE_THEMES[mode];
  return (
    <View style={{ flex: 1, backgroundColor: b.bg, padding: 6, rowGap: 4 }}>
      <View style={{ height: 14, borderRadius: 4, backgroundColor: accent }} />
      <View style={{ height: 10, borderRadius: 3, backgroundColor: b.surface, borderWidth: 1, borderColor: b.border }} />
      <View style={{ height: 3, width: 24, borderRadius: 2, backgroundColor: b.text }} />
    </View>
  );
}

const BACKGROUND_TILES: { id: Background; label: string }[] = [
  { id: 'system', label: 'Как в системе' },
  { id: 'light', label: 'Светлый' },
  { id: 'dark', label: 'Тёмный' },
  { id: 'black', label: 'Чёрный' },
];

const TILE_H = 64;

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
      style={{ flex: 1, alignItems: 'center' }}
    >
      <View style={{
        alignSelf: 'stretch', borderRadius: RADIUS.md + 5, borderWidth: 2, padding: 3,
        borderColor: selected ? k.text : 'transparent',
      }}
      >
        <View style={{ height: TILE_H, borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: 1, borderColor: k.border, flexDirection: 'row' }}>
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
  const a = useSelectedAppearance();
  const { choose } = useThemeMode();
  const acc = accentHex(a);
  return (
    <View style={{ flexDirection: 'row', columnGap: 8 }}>
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

/** Мини-список из трёх строк: у обычной строки 20 dp, у компактной 12 — разница видна. */
function MiniRows({ k, rowH }: { k: Tokens; rowH: number }) {
  return (
    <View style={{ flex: 1, backgroundColor: k.card, paddingHorizontal: 8 }}>
      {[0, 1, 2].map(i => (
        <View
          key={i}
          style={{
            height: rowH, flexDirection: 'row', alignItems: 'center', columnGap: 6,
            borderTopWidth: i > 0 ? 1 : 0, borderTopColor: k.border,
          }}
        >
          <View style={{ width: 14, height: 4, borderRadius: 2, backgroundColor: k.text }} />
          <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: k.textSecondary }} />
          <View style={{ width: 10, height: 4, borderRadius: 2, backgroundColor: k.text }} />
        </View>
      ))}
    </View>
  );
}

function DensityTiles({ k }: { k: Tokens }) {
  const a = useSelectedAppearance();
  const tiles: { id: Density; label: string; rowH: number }[] = [
    { id: 'regular', label: 'Обычная', rowH: 20 },
    { id: 'compact', label: 'Компактная', rowH: 12 },
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
          <MiniRows k={k} rowH={t.rowH} />
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
  const { width: winW } = useWindowDimensions();
  const [colorTarget, setColorTarget] = useState<ColorTarget | null>(null);
  const [preview, setPreview] = useState<{ target: ColorTarget; hex: string } | null>(null);

  // Ширины — целые числа из ширины окна, без измерений
  const panelW = Math.floor(winW - GUTTER * 2 - PANEL_PAD * 2);
  const sheetW = Math.floor(winW - 32);

  // Пока выбирают свой цвет — предпросмотр показывает его, приложение — нет
  const previewK = useMemo(() => {
    if (!preview) return k;
    if (preview.target === 'accent') return { ...k, ...accentTokens(preview.hex, k.mode) };
    const row = TYPE_ROWS.find(r => r.key === preview.target)!;
    const p = shadePair(preview.hex, k.mode);
    return { ...k, [row.bg]: p.bg, [row.fg]: p.text };
  }, [k, preview]);
  const onPreview = useCallback(
    (hex: string | null) => setPreview(hex && colorTarget ? { target: colorTarget, hex } : null),
    [colorTarget],
  );

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
        <View style={{ backgroundColor: k.surface, borderRadius: RADIUS.lg, padding: PANEL_PAD }}>
          <Preview k={previewK} width={panelW} />
        </View>

        <Panel k={k} title="Акцент">
          <AccentGrid k={k} width={panelW} onCustom={() => setColorTarget('accent')} />
        </Panel>
        <Panel k={k} title="Типы занятий">
          <TypeRows k={k} onCustom={setColorTarget} />
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

      <CustomColorSheet
        k={k}
        target={colorTarget}
        width={sheetW}
        onClose={() => setColorTarget(null)}
        onPreview={onPreview}
      />
    </View>
  );
}

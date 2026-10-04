/**
 * Цвета «Табло» — по ТЗ «токены и экран „Внешний вид“». Чистые функции без
 * React Native: их можно проверить скриптом (контраст на всех фонах).
 * Хуки и типографика — в tokens.ts, он всё это реэкспортирует.
 */
import { oklch, formatHex, wcagContrast, interpolate, clampChroma } from 'culori';

export type BaseMode = 'light' | 'dark' | 'black';

/** Фоновые и текстовые токены — зависят только от фона. */
export interface BaseTheme {
  mode: BaseMode;
  bg: string;
  surface: string;
  card: string;
  surface2: string;
  border: string;
  text: string;
  textSecondary: string;
  typeLectureBg: string;
  typeLectureText: string;
  typePracticeBg: string;
  typePracticeText: string;
  typeExamBg: string;
  typeExamText: string;
  statusOnline: string;
  statusSync: string;
  statusOffline: string;
  statusOfflineBg: string;
  scrim: string;
  /** Аудитории (ТЗ «Аудитории», раздел «Цвета»): смысловые, от акцента не зависят. */
  roomFreeText: string;
  roomFreeBg: string;
  roomBusyText: string;
  roomBusyBg: string;
  roomConflictText: string;
  roomConflictBg: string;
}

export const BASE_THEMES: Record<BaseMode, BaseTheme> = {
  dark: {
    mode: 'dark',
    bg: '#0B0D12',
    surface: '#151821',
    card: '#151821',
    surface2: '#1E222D',
    border: '#2A2F3B',
    text: '#F1F3F7',
    textSecondary: '#A8AFBD',
    typeLectureBg: '#13314A',
    typeLectureText: '#8CCBFF',
    typePracticeBg: '#2B2350',
    typePracticeText: '#C7B8FF',
    typeExamBg: '#47220F',
    typeExamText: '#FFB27A',
    statusOnline: '#4ADE80',
    statusSync: '#FACC15',
    statusOffline: '#FF8A80',
    statusOfflineBg: '#3A1C1C',
    scrim: 'rgba(0,0,0,0.62)',
    roomFreeText: '#4ADE80',
    roomFreeBg: '#12301F',
    roomBusyText: '#FF8A80',
    roomBusyBg: '#3A1C1C',
    roomConflictText: '#FFB547',
    roomConflictBg: '#3A2A0F',
  },
  light: {
    mode: 'light',
    bg: '#F2F4F8',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    surface2: '#EBEEF4',
    border: '#DDE2EA',
    text: '#10131A',
    textSecondary: '#4B5262',
    typeLectureBg: '#DDF0FF',
    typeLectureText: '#0B5A8C',
    typePracticeBg: '#ECE7FF',
    typePracticeText: '#5534C2',
    typeExamBg: '#FFE7D6',
    typeExamText: '#A33F00',
    statusOnline: '#15803D',
    statusSync: '#8A5A00',
    statusOffline: '#B42318',
    statusOfflineBg: '#FDE8E6',
    scrim: 'rgba(0,0,0,0.40)',
    roomFreeText: '#116632',
    roomFreeBg: '#DCF5E6',
    roomBusyText: '#B42318',
    roomBusyBg: '#FDE8E6',
    roomConflictText: '#8A4B00',
    roomConflictBg: '#FFF0D6',
  },
  black: {
    mode: 'black',
    bg: '#000000',
    surface: '#0E0F12',
    card: '#0E0F12',
    surface2: '#17191F',
    border: '#24272F',
    text: '#F1F3F7',
    textSecondary: '#A8AFBD',
    typeLectureBg: '#13314A',
    typeLectureText: '#8CCBFF',
    typePracticeBg: '#2B2350',
    typePracticeText: '#C7B8FF',
    typeExamBg: '#47220F',
    typeExamText: '#FFB27A',
    statusOnline: '#4ADE80',
    statusSync: '#FACC15',
    statusOffline: '#FF8A80',
    statusOfflineBg: '#3A1C1C',
    scrim: 'rgba(0,0,0,0.70)',
    roomFreeText: '#4ADE80',
    roomFreeBg: '#12301F',
    roomBusyText: '#FF8A80',
    roomBusyBg: '#3A1C1C',
    roomConflictText: '#FFB547',
    roomConflictBg: '#3A2A0F',
  },
};

/** Акцент по умолчанию (ТЗ). */
export const DEFAULT_ACCENT = '#2F62EA';

// ─── Производные акцентные цвета (пример из ТЗ, один к одному) ────────────

export const WHITE = '#FFFFFF';
export const INK = '#0B0D12';
const MIN = 4.5;

/**
 * Белый или почти чёрный — у кого контраст выше. Обещание ТЗ «один из двух
 * даёт не меньше 4,58» неверно для средне-серых: у #777777 белый — 4,48,
 * #0B0D12 — ещё меньше. Тогда — чистый чёрный: контрасты белого и чёрного
 * в произведении дают 21, так что если белый < 4,5, чёрный > 4,66.
 */
export function pickOnAccent(accent: string): string {
  const w = wcagContrast(accent, WHITE);
  const ink = wcagContrast(accent, INK);
  if (w >= ink) return w >= MIN ? WHITE : '#000000';
  return ink >= MIN ? INK : '#000000';
}

export function ensureContrast(color: string, bg: string, lighter: boolean): string {
  let c = oklch(color)!;
  for (let i = 0; i < 50; i++) {
    const hex = formatHex(clampChroma(c, 'oklch'));
    if (wcagContrast(hex, bg) >= MIN) return hex;
    c = { ...c, l: Math.min(1, Math.max(0, c.l + (lighter ? 0.02 : -0.02))) };
  }
  return lighter ? WHITE : INK;
}

export function mix(a: string, b: string, t: number): string {
  return formatHex(interpolate([a, b], 'rgb')(t));
}

export function contrast(a: string, b: string): number {
  return wcagContrast(a, b);
}

/** #abc / #aabbcc / aabbcc → #AABBCC; иначе null. Для поля «Свой цвет». */
export function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) return ('#' + s.split('').map(ch => ch + ch).join('')).toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(s)) return ('#' + s).toUpperCase();
  return null;
}

export interface AccentTokens {
  accent: string;
  onAccent: string;
  accentText: string;
  accentSoft: string;
  onAccentSoft: string;
  accentChip: string;
  accentLine: string;
}

export function deriveAccent(accent: string, base: BaseTheme): AccentTokens {
  const lighter = base.mode !== 'light';
  const onAccent = pickOnAccent(accent);
  const accentText = ensureContrast(accent, base.surface2, lighter);
  const softShare = base.mode === 'light' ? 0.12 : base.mode === 'black' ? 0.14 : 0.16;
  const accentSoft = mix(base.surface, accent, softShare);
  const onAccentSoft = ensureContrast(accentText, accentSoft, lighter);
  const darkInk = onAccent === WHITE;
  return {
    accent,
    onAccent,
    accentText,
    accentSoft,
    onAccentSoft,
    accentChip: darkInk ? `rgba(0,0,0,${base.mode === 'light' ? 0.2 : 0.24})` : 'rgba(255,255,255,0.45)',
    accentLine: darkInk ? `rgba(255,255,255,${base.mode === 'light' ? 0.5 : 0.42})` : 'rgba(11,13,18,0.30)',
  };
}

/**
 * Для акцента по умолчанию — значения прямо из таблицы ТЗ (их проверял
 * дизайнер). Формула для #2F62EA даёт близкие, но не те же оттенки, а макет
 * сверстан именно по таблице. Для любого другого цвета — deriveAccent.
 */
const DEFAULT_ACCENT_TABLE: Record<BaseMode, AccentTokens> = {
  dark: {
    accent: DEFAULT_ACCENT, onAccent: '#FFFFFF', accentText: '#8FB0FF', accentSoft: '#1C2850',
    onAccentSoft: '#BFD0FF', accentChip: 'rgba(0,0,0,0.24)', accentLine: 'rgba(255,255,255,0.42)',
  },
  light: {
    accent: DEFAULT_ACCENT, onAccent: '#FFFFFF', accentText: '#2856D6', accentSoft: '#E5ECFD',
    onAccentSoft: '#1E46B8', accentChip: 'rgba(0,0,0,0.20)', accentLine: 'rgba(255,255,255,0.50)',
  },
  black: {
    accent: DEFAULT_ACCENT, onAccent: '#FFFFFF', accentText: '#8FB0FF', accentSoft: '#16204A',
    onAccentSoft: '#BFD0FF', accentChip: 'rgba(0,0,0,0.24)', accentLine: 'rgba(255,255,255,0.42)',
  },
};

export function accentTokens(accent: string, mode: BaseMode): AccentTokens {
  return accent.toUpperCase() === DEFAULT_ACCENT ? DEFAULT_ACCENT_TABLE[mode] : deriveAccent(accent, BASE_THEMES[mode]);
}

// ─── Пресеты акцента (утверждены владельцем 4 окт 2026) ───────────────────

export type AccentPresetId = 'blue' | 'violet' | 'emerald' | 'teal' | 'pink' | 'orange' | 'yellow' | 'graphite';

export const ACCENT_PRESETS: { id: AccentPresetId; name: string; hex: string }[] = [
  { id: 'blue', name: 'синий', hex: DEFAULT_ACCENT },
  { id: 'violet', name: 'фиолетовый', hex: '#7357F0' },
  { id: 'emerald', name: 'изумруд', hex: '#0E9B72' },
  { id: 'teal', name: 'бирюзовый', hex: '#0E8FA6' },
  { id: 'pink', name: 'розовый', hex: '#D6407F' },
  { id: 'orange', name: 'оранжевый', hex: '#E8640C' },
  { id: 'yellow', name: 'жёлтый', hex: '#F2C230' },
  { id: 'graphite', name: 'графит', hex: '#4D5566' },
];

// ─── Оттенки типов занятий ─────────────────────────────────────────────────

export type ShadeId = 'sky' | 'lilac' | 'amber' | 'mint';
export type LessonTypeKey = 'lecture' | 'practice' | 'exam';

export interface ShadePair { bg: string; text: string }

export const TYPE_SHADES: { id: ShadeId; name: string; hex: string }[] = [
  { id: 'sky', name: 'голубой', hex: '#4FB3FF' },
  { id: 'lilac', name: 'сиреневый', hex: '#9B87F5' },
  { id: 'amber', name: 'янтарный', hex: '#FF9640' },
  { id: 'mint', name: 'мятный', hex: '#2EC48A' },
];

/** Пары «фон / текст» из таблицы ТЗ для трёх готовых оттенков. */
const SHADE_TABLE: Partial<Record<ShadeId, Record<BaseMode, ShadePair>>> = {
  sky: {
    dark: { bg: '#13314A', text: '#8CCBFF' },
    light: { bg: '#DDF0FF', text: '#0B5A8C' },
    black: { bg: '#13314A', text: '#8CCBFF' },
  },
  lilac: {
    dark: { bg: '#2B2350', text: '#C7B8FF' },
    light: { bg: '#ECE7FF', text: '#5534C2' },
    black: { bg: '#2B2350', text: '#C7B8FF' },
  },
  amber: {
    dark: { bg: '#47220F', text: '#FFB27A' },
    light: { bg: '#FFE7D6', text: '#A33F00' },
    black: { bg: '#47220F', text: '#FFB27A' },
  },
};

/** Пара бейджа для оттенка. Для мятного — по правилу ТЗ: фон = смесь оттенка
 *  с surface, текст = оттенок, доведённый до 4,5 : 1 к этому фону. */
export function shadePair(id: ShadeId, mode: BaseMode): ShadePair {
  const t = SHADE_TABLE[id];
  if (t) return t[mode];
  const hue = TYPE_SHADES.find(s => s.id === id)!.hex;
  const base = BASE_THEMES[mode];
  const bg = mix(base.surface, hue, mode === 'light' ? 0.16 : 0.22);
  return { bg, text: ensureContrast(hue, bg, mode !== 'light') };
}

// ─── Плотность карточек ───────────────────────────────────────────────────

export type Density = 'regular' | 'compact';

export interface DensityTokens {
  density: Density;
  /** Строка пары: минимум и вертикальные поля (ТЗ: 60/10 и 52/7). */
  rowMin: number;
  rowPadY: number;
  /** Строка аудитории: ТЗ молчит, компактная — 48 (минимум зоны нажатия). */
  roomRowMin: number;
}

export const DENSITY: Record<Density, DensityTokens> = {
  regular: { density: 'regular', rowMin: 60, rowPadY: 10, roomRowMin: 56 },
  compact: { density: 'compact', rowMin: 52, rowPadY: 7, roomRowMin: 48 },
};

// ─── Сборка ────────────────────────────────────────────────────────────────

export type Tokens = BaseTheme & AccentTokens & DensityTokens;

export type TypeShades = Record<LessonTypeKey, ShadeId>;

export const DEFAULT_TYPES: TypeShades = { lecture: 'sky', practice: 'lilac', exam: 'amber' };

// Пересчёт один раз на набор настроек — ТЗ: «пересчитывать при смене цвета
// или темы и кешировать».
const cache = new Map<string, Tokens>();

export function buildTokens(
  mode: BaseMode,
  accent: string = DEFAULT_ACCENT,
  types: TypeShades = DEFAULT_TYPES,
  density: Density = 'regular',
): Tokens {
  const key = `${mode}|${accent.toUpperCase()}|${types.lecture}|${types.practice}|${types.exam}|${density}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const lec = shadePair(types.lecture, mode);
  const pr = shadePair(types.practice, mode);
  const ex = shadePair(types.exam, mode);
  const t: Tokens = {
    ...BASE_THEMES[mode],
    typeLectureBg: lec.bg, typeLectureText: lec.text,
    typePracticeBg: pr.bg, typePracticeText: pr.text,
    typeExamBg: ex.bg, typeExamText: ex.text,
    ...accentTokens(accent, mode),
    ...DENSITY[density],
  };
  cache.set(key, t);
  return t;
}

/**
 * Настройки «Внешнего вида» — формат ключа `appearance` (ТЗ «токены и экран
 * „Внешний вид“»), проверка прочитанного и перенос старых настроек.
 * Чистые функции: хранение и подписка — в src/appearance.ts.
 */
import {
  ACCENT_PRESETS, TYPE_SHADES, DEFAULT_TYPES, normalizeHex, contrast, pickOnAccent,
  type AccentPresetId, type ShadeId, type Density, type BaseMode, type TypeShades,
} from './schedule/colors';

export type Background = 'system' | 'light' | 'dark' | 'black';

export interface Appearance {
  version: 1;
  /** preset 'custom' — действует свой цвет; custom хранит последний свой цвет. */
  accent: { preset: AccentPresetId | 'custom'; custom: string | null };
  types: TypeShades;
  background: Background;
  density: Density;
}

export const DEFAULT_APPEARANCE: Appearance = {
  version: 1,
  accent: { preset: 'blue', custom: null },
  types: DEFAULT_TYPES,
  background: 'system',
  density: 'regular',
};

const PRESET_IDS = ACCENT_PRESETS.map(p => p.id) as string[];
const SHADE_IDS = TYPE_SHADES.map(s => s.id) as string[];
const BACKGROUNDS: Background[] = ['system', 'light', 'dark', 'black'];

function oneOf<T extends string>(v: unknown, allowed: readonly string[], fallback: T): T {
  return typeof v === 'string' && allowed.includes(v) ? (v as T) : fallback;
}

/** Разбор сохранённого JSON. null — ключа нет или он нечитаем целиком;
 *  отдельные битые поля заменяются значениями по умолчанию. */
export function parseAppearance(raw: string | null): Appearance | null {
  if (!raw) return null;
  let o: any;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const d = DEFAULT_APPEARANCE;
  const custom = typeof o.accent?.custom === 'string' ? normalizeHex(o.accent.custom) : null;
  let preset = oneOf<AccentPresetId | 'custom'>(o.accent?.preset, [...PRESET_IDS, 'custom'], d.accent.preset);
  if (preset === 'custom' && !custom) preset = d.accent.preset;
  return {
    version: 1,
    accent: { preset, custom },
    types: {
      lecture: oneOf<ShadeId>(o.types?.lecture, SHADE_IDS, d.types.lecture),
      practice: oneOf<ShadeId>(o.types?.practice, SHADE_IDS, d.types.practice),
      exam: oneOf<ShadeId>(o.types?.exam, SHADE_IDS, d.types.exam),
    },
    background: oneOf<Background>(o.background, BACKGROUNDS, d.background),
    density: oneOf<Density>(o.density, ['regular', 'compact'], d.density),
  };
}

/**
 * Перенос настроек до 1.9.40: `msu_theme` (light/dark/system) → фон,
 * `msu_accent` (blue/green/violet) → ближайший пресет. Акцент не выбирался —
 * синий (решение владельца), хотя раньше по умолчанию показывался фиолетовый.
 */
export function migrateLegacy(theme: string | null, accent: string | null): Appearance {
  const background: Background = theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system';
  const preset: AccentPresetId = accent === 'green' ? 'emerald' : accent === 'violet' ? 'violet' : 'blue';
  return { ...DEFAULT_APPEARANCE, background, accent: { preset, custom: null } };
}

export function accentHex(a: Appearance): string {
  if (a.accent.preset === 'custom' && a.accent.custom) return a.accent.custom;
  return (ACCENT_PRESETS.find(p => p.id === a.accent.preset) ?? ACCENT_PRESETS[0]).hex;
}

export function accentName(a: Appearance): string {
  if (a.accent.preset === 'custom') return 'свой цвет';
  return (ACCENT_PRESETS.find(p => p.id === a.accent.preset) ?? ACCENT_PRESETS[0]).name;
}

export function resolveMode(bg: Background, systemDark: boolean): BaseMode {
  return bg === 'system' ? (systemDark ? 'dark' : 'light') : bg;
}

export const BACKGROUND_NAMES: Record<Background, string> = {
  system: 'Как в системе', light: 'Светлая', dark: 'Тёмная', black: 'Чёрная',
};

/** Значение строки «Внешний вид» в Кабинете: «Тёмная · синий». */
export function appearanceSummary(a: Appearance): string {
  return `${BACKGROUND_NAMES[a.background]} · ${accentName(a)}`;
}

/** «Текст на акценте — белый · 5,2 : 1» (5,18 → 5,2, как в ТЗ). Ниже 4,5
 *  не бывает: pickOnAccent гарантирует контраст для любого цвета. */
export function onAccentLine(accent: string): string {
  const on = pickOnAccent(accent);
  const ratio = Math.round(contrast(on, accent) * 10) / 10;
  const word = on.toUpperCase() === '#FFFFFF' ? 'белый' : 'чёрный';
  return `Текст на акценте — ${word} · ${ratio.toFixed(1).replace('.', ',')} : 1`;
}

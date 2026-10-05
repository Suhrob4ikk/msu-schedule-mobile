/**
 * Цвета виджета на рабочем столе и строки «идёт пара» — готовыми HEX для
 * всех трёх фонов. Kotlin (native-widget/ScheduleWidget.kt, LiveLesson.kt)
 * ничего не вычисляет: берёт набор по выбранному фону, а при «как в
 * системе» — по ночному режиму телефона. Так цвета совпадают с приложением
 * один в один, в том числе «Свой цвет».
 *
 * Роли — из ТЗ виджета «вариант C», раздел 4.1. Hex в таблице ТЗ — лишь
 * пример; значения берутся из токенов приложения (buildTokens), а роли,
 * которых в приложении нет (onFill2, fillLine, softLine, ink3), смешиваются
 * из существующих.
 *
 * Чистые функции без React Native — проверяются скриптом.
 */
import { buildTokens, ensureContrast, mix, contrast, type BaseMode } from './schedule/colors';
import { accentHex, type Appearance, type Background } from './appearanceModel';

/** Ключ AsyncStorage — его же читает нативная часть, менять только вместе. */
export const WIDGET_THEME_KEY = 'widget_theme';

/** Все цвета непрозрачные «#RRGGBB». */
export interface WidgetPalette {
  /** Фон темы (карточка приложения) — от него считаются оттенки. */
  surface: string;
  /** Основной текст и подписи на tint и soft; ink3 — группа в пустых. */
  ink: string;
  ink2: string;
  ink3: string;
  /** Граница карточек приложения (виджету — запасной цвет линий). */
  line: string;
  /** Фон «Идёт пара», плашка отсчёта в перемену; текст и подписи на нём, разделители. */
  fill: string;
  onFill: string;
  onFill2: string;
  fillLine: string;
  /** Фон «Перемена» и «Следующая пара»; аудитория и отсчёт на нём, разделители. */
  soft: string;
  onSoft: string;
  softLine: string;
  /**
   * Фон «Пар больше нет» и пустых состояний — лёгкий оттенок акцента, вдвое
   * слабее soft (решение владельца 6 окт 2026: не белый, а цвет акцента —
   * светлее в светлой теме, темнее в тёмной). Разделители на нём.
   */
  tint: string;
  tintLine: string;
  /** Аудитория в плитках на tint. */
  accentText: string;
}

export interface WidgetTheme {
  version: 3;
  background: Background;
  light: WidgetPalette;
  dark: WidgetPalette;
  black: WidgetPalette;
}

const up = (hex: string) => hex.toUpperCase();

export function widgetPalette(mode: BaseMode, accent: string): WidgetPalette {
  const k = buildTokens(mode, accent);
  const lighter = mode !== 'light';
  // Подписи на заливке — чуть тише белого (в ТЗ #DCE4FF на синем), но не ниже 4,5 : 1
  let onFill2 = k.onAccent;
  for (let t = 0.15; t > 0.001; t -= 0.01) {
    const c = mix(k.onAccent, k.accent, t);
    if (contrast(c, k.accent) >= 4.5) { onFill2 = c; break; }
  }
  // Лёгкий оттенок: ~2/3 доли акцента, что у accent-soft (0,12 / 0,16 / 0,14) — заметно
  // цветной, но светлее (в тёмной — темнее) карточки перемены, чтобы состояния не сливались
  const tint = mix(k.surface, k.accent, mode === 'light' ? 0.08 : mode === 'black' ? 0.09 : 0.1);
  // Группа в пустых состояниях — тише ink2, но читаемая на tint
  const ink3 = ensureContrast(mix(k.textSecondary, tint, 0.25), tint, lighter);
  return {
    surface: up(k.surface),
    ink: up(k.text),
    ink2: up(k.textSecondary),
    ink3: up(ink3),
    line: up(k.border),
    fill: up(k.accent),
    onFill: up(k.onAccent),
    onFill2: up(onFill2),
    fillLine: up(mix(k.accent, k.onAccent, 0.2)),
    soft: up(k.accentSoft),
    onSoft: up(k.onAccentSoft),
    softLine: up(mix(k.accentSoft, k.accent, 0.18)),
    tint: up(tint),
    tintLine: up(mix(tint, k.accent, 0.18)),
    accentText: up(ensureContrast(k.accentText, tint, lighter)),
  };
}

export function widgetTheme(a: Appearance): WidgetTheme {
  const accent = accentHex(a);
  return {
    version: 3,
    background: a.background,
    light: widgetPalette('light', accent),
    dark: widgetPalette('dark', accent),
    black: widgetPalette('black', accent),
  };
}

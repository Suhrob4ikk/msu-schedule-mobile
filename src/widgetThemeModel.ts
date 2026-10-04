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
  /** Фон «Пар больше нет» и пустых состояний. */
  surface: string;
  /** Основной текст и подписи на surface и soft; ink3 — группа в пустых. */
  ink: string;
  ink2: string;
  ink3: string;
  /** Разделители сетки на surface. */
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
  /** Аудитория в плитках на surface. */
  accentText: string;
}

export interface WidgetTheme {
  version: 2;
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
  // Группа в пустых состояниях — тише ink2, но читаемая
  const ink3 = ensureContrast(mix(k.textSecondary, k.surface, 0.25), k.surface, lighter);
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
    accentText: up(k.accentText),
  };
}

export function widgetTheme(a: Appearance): WidgetTheme {
  const accent = accentHex(a);
  return {
    version: 2,
    background: a.background,
    light: widgetPalette('light', accent),
    dark: widgetPalette('dark', accent),
    black: widgetPalette('black', accent),
  };
}

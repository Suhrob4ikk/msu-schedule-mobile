/**
 * Перекрасить виджет и строку «идёт пара» под «Внешний вид»: записать
 * готовые цвета (src/widgetThemeModel.ts) в AsyncStorage и разбудить
 * нативную часть. Вызывается при запуске и после каждой смены оформления.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import LiveLessonNative from '../modules/live-lesson';
import type { Appearance } from './appearanceModel';
import { WIDGET_THEME_KEY, widgetTheme } from './widgetThemeModel';

let lastWritten: string | null = null;

export async function writeWidgetTheme(a: Appearance): Promise<void> {
  if (Platform.OS !== 'android') return;
  const json = JSON.stringify(widgetTheme(a));
  if (json === lastWritten) return;
  try {
    await AsyncStorage.setItem(WIDGET_THEME_KEY, json);
    lastWritten = json;
    await LiveLessonNative?.refreshWidget().catch(() => null);
    // Строка в шторке берёт тот же акцент; если она выключена — просто ничего не покажет
    await LiveLessonNative?.refresh().catch(() => null);
  } catch {
    // Виджет — не то, из-за чего стоит ломать экран оформления
  }
}

/**
 * OTA-обновления (9 ноя 2026, EAS Update, канал production). Исправления в коде приложения приходят без нового APK.
 *
 * Как приходит обновление (владелец 9 ноя: «показать загрузку, чтобы было видно, что идёт обновление»):
 * - при запуске модуль сам проверяет и скачивает (AndroidManifest: CHECK_ON_LAUNCH=ALWAYS, LAUNCH_WAIT_MS=0);
 * - при возврате в приложение (если с прошлой проверки больше 2 минут) — проверка здесь;
 * - пока скачивается — маленькая полоска сверху «Загружаем обновление · 45%», скачалось — «Обновление готово ·
 *   закройте приложение полностью и откройте заново» (src/UpdatingOverlay.tsx). ⚠️ Перезапуска на ходу (Updates.reloadAsync) НЕТ и не
 *   возвращать: 12 ноя 2026 на Xiaomi владельца он зависал намертво, экран «Обновляем приложение» висел минутами.
 * Без сети, при недоступном сервере обновлений или в отладочной сборке — ничего не делает.
 * Если новое обновление не запустится, модуль сам откатывается на предыдущее (встроенная защита expo-updates).
 * Что приходит по OTA: только JS и картинки. Виджеты, «идёт пара» в шторке, разрешения, версия Expo — только новым APK.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

const CHECK_EVERY_MS = 2 * 60_000;   // запрос маленький (только «есть ли новое»), скачивание — только если есть

export function useOtaUpdates(): void {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    let lastCheck = Date.now();   // при запуске проверил сам модуль
    let busy = false;
    let prev = AppState.currentState;

    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) await Updates.fetchUpdateAsync();   // ход и перезапуск — UpdatingOverlay
      } catch { /* нет сети или сервер обновлений недоступен — в следующий раз */ }
      busy = false;
      lastCheck = Date.now();
    };

    const sub = AppState.addEventListener('change', next => {
      const back = prev !== 'active' && next === 'active';
      prev = next;
      if (back && Date.now() - lastCheck >= CHECK_EVERY_MS) void check();
    });
    return () => sub.remove();
  }, []);
}

/** Подпись для Кабинета: «обновление от 9 ноября, 18:40», если сейчас работает OTA-обновление, а не код из APK. */
export function otaLabel(): string | null {
  if (!Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.createdAt) return null;
  const d = Updates.createdAt;
  const M = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const p = (n: number) => String(n).padStart(2, '0');
  return `обновление от ${d.getDate()} ${M[d.getMonth()]}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

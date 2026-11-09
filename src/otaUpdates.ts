/**
 * OTA-обновления (9 ноя 2026, EAS Update, канал production). Исправления в коде приложения приходят без нового APK.
 *
 * Как приходит обновление:
 * - при запуске модуль сам проверяет и тихо скачивает (AndroidManifest: CHECK_ON_LAUNCH=ALWAYS, LAUNCH_WAIT_MS=0 —
 *   запуск не ждёт сети); скачанное включится при следующем запуске;
 * - здесь же, при возврате в приложение (не чаще раза в 30 минут), — проверка и скачивание; скачанное применяется при
 *   СЛЕДУЮЩЕМ возврате в приложение одной быстрой перезагрузкой — не посреди того, что человек делает.
 * Без сети, при недоступном сервере обновлений или в отладочной сборке — ничего не делает, приложение работает как было.
 * Если новое обновление не запустится, модуль сам откатывается на предыдущее (встроенная защита expo-updates).
 * Что приходит по OTA: только JS и картинки. Виджеты, «идёт пара» в шторке, разрешения, версия Expo — только новым APK.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

const CHECK_EVERY_MS = 30 * 60_000;

export function useOtaUpdates(): void {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    let lastCheck = Date.now();   // при запуске проверил сам модуль
    let ready = false;            // обновление скачано — применить при следующем возврате
    let busy = false;
    let prev = AppState.currentState;

    const check = async () => {
      if (busy || ready) return;
      busy = true;
      try {
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) {
          const got = await Updates.fetchUpdateAsync();
          if (got.isNew) ready = true;
        }
      } catch { /* нет сети или сервер обновлений недоступен — в следующий раз */ }
      busy = false;
      lastCheck = Date.now();
    };

    const sub = AppState.addEventListener('change', next => {
      const back = prev !== 'active' && next === 'active';
      prev = next;
      if (!back) return;
      if (ready) { Updates.reloadAsync().catch(() => null); return; }
      if (Date.now() - lastCheck >= CHECK_EVERY_MS) void check();
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

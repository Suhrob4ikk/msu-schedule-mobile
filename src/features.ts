// Автооткрытие функций «Посещаемость» и «Заметки к парам».
// Проверка по дате устройства: 1 сентября 2026 функции откроются сами,
// без обновления приложения. Значение совпадает с веб (lib/features.ts).
export const FEATURES_UNLOCK_AT = new Date('2026-09-01T00:00:00');

export const featuresUnlocked = (): boolean =>
  Date.now() >= FEATURES_UNLOCK_AT.getTime();

/**
 * Сигнал «на сервере, похоже, новое расписание» — между частями приложения,
 * которые друг друга не знают.
 *
 * Шлёт его app/_layout.tsx, когда пришёл push («вышла новая неделя»,
 * «расписание изменилось»). Слушают экран расписания (перечитать недели и
 * пары) и колокольчик (пересчитать непрочитанные изменения).
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onScheduleUpdated(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function emitScheduleUpdated(): void {
  listeners.forEach(fn => {
    try { fn(); } catch { /* один слушатель не должен ломать остальных */ }
  });
}

/**
 * Кабинет «Табло» — чистые функции (проверяются скриптом): статистика
 * пропусков, подписи профиля и синхронизации. Без импортов React Native.
 */

/** Склонение: 1 пара, 2 пары, 5 пар. */
export function pluralPairs(n: number): string {
  const d10 = n % 10, d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return 'пара';
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return 'пары';
  return 'пар';
}

export interface SubjectSkips {
  /** Название — ровно как пришло с сервера (решение владельца, без словаря). */
  subject: string;
  count: number;
  /** Длина полосы: доля от максимума, 0–1. */
  share: number;
}

/** По убыванию числа, при равенстве — по алфавиту (ТЗ «Кабинет», «Учёба»). */
export function skipRows(bySubject: [string, number][]): SubjectSkips[] {
  const rows = bySubject.filter(([, n]) => n > 0);
  const max = rows.reduce((m, [, n]) => Math.max(m, n), 0);
  return rows
    .slice()
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .map(([subject, count]) => ({ subject, count, share: max ? count / max : 0 }));
}

/** «6 пар» — крупное число в карточке. */
export function totalLabel(total: number): string {
  return `${total} ${pluralPairs(total)}`;
}

/** Для диктора одним блоком: «Пропущено 6 пар: Предмет — 3, Предмет — 3». */
export function skipsSpoken(total: number, rows: SubjectSkips[]): string {
  if (total === 0) return 'Пропусков нет';
  const head = `Пропущено ${totalLabel(total)}`;
  return rows.length ? `${head}: ${rows.map(r => `${r.subject} — ${r.count}`).join(', ')}` : head;
}

/** «ПМиИ · 3 курс» — тот же порядок, что в шапке Расписания. */
export function profileLine(direction: string | null, year: number | null): string {
  return [direction, year ? `${year} курс` : null].filter(Boolean).join(' · ');
}

/** Кнопка листа «Профиль»: «Сохранить · ПМиИ, 3 курс». */
export function saveLabel(direction: string | null, year: number | null): string {
  return direction && year ? `Сохранить · ${direction}, ${year} курс` : 'Сохранить';
}

/** Плашка без сети: «Нет сети — показано расписание от 3 окт · 12:09». */
export function offlineNote(lastSync: string | null): string {
  return lastSync ? `Нет сети — показано расписание от ${lastSync}` : 'Нет сети — расписание ещё не загружено';
}

/** Буква в аватаре; null — имени нет, рисуем значок человека. */
export function avatarLetter(name: string): string | null {
  const t = name.trim();
  return t ? t[0].toUpperCase() : null;
}

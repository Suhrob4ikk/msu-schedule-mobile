import { useInbox, unreadOf } from './notifications/data';

/**
 * Число непрочитанных уведомлений — один источник для колокольчика во всех
 * вкладках и строки «Уведомления» в Кабинете (src/notifications/data.ts):
 * изменения своей группы с сервера за 30 дней + пришедшие напоминания о
 * зачётах, минус отмеченные прочитанными. История на него не влияет.
 */
export function useUnreadNotifCount(): number {
  const s = useInbox();
  return unreadOf(s, new Date());
}

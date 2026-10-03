import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getUnreadNotifCount, subscribeNotifHistory } from './notificationHistory';
import { loadMyChanges, countUnseenChanges } from './changesFeed';
import { onScheduleUpdated } from './scheduleEvents';

/** Счётчик непрочитанных уведомлений для колокольчика в шапке. Обновляется
 *  по подписке (новая запись/прочтение) и при возврате приложения на передний
 *  план — колокольчик рисуется один раз для всех вкладок, своего useFocusEffect
 *  на экран у него нет. */
export function useUnreadNotifCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let mounted = true;
    // Непрочитанные напоминания о зачётах + новые изменения своей группы
    const refresh = async () => {
      const [exams, changes] = await Promise.all([
        getUnreadNotifCount(),
        loadMyChanges().then(countUnseenChanges).catch(() => 0),
      ]);
      if (mounted) setCount(exams + changes);
    };
    refresh();
    const unsub = subscribeNotifHistory(refresh);
    const unsubPush = onScheduleUpdated(refresh);
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => { if (s === 'active') refresh(); });
    return () => { mounted = false; unsub(); unsubPush(); sub.remove(); };
  }, []);
  return count;
}

package tj.msu.schedule.live

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Будит пересборку уведомления «идёт пара».
 *
 * Приходит сюда в трёх случаях:
 *  - сработал будильник на границе пары (ACTION_TICK);
 *  - телефон перезагрузился (BOOT_COMPLETED) — будильники после перезагрузки
 *    стираются, их надо поставить заново;
 *  - приложение обновилось (MY_PACKAGE_REPLACED) — по той же причине.
 */
class LiveLessonReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        // refresh() сама решает: показать, обновить или снять уведомление,
        // и ставит следующий будильник.
        LiveLesson.refresh(context)
    }
}

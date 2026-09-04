package tj.msu.schedule.live

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Мостик в JS. Нужен ровно для одного: сказать нативной части «пересчитай
 * прямо сейчас» — когда пользователь включил функцию или когда приложение
 * обновило расписание. Само расписание передавать не нужно: нативная часть
 * читает его из AsyncStorage.
 */
class LiveLessonModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("LiveLesson")

        AsyncFunction("refresh") {
            appContext.reactContext?.let { LiveLesson.refresh(it) }
        }

        AsyncFunction("clear") {
            appContext.reactContext?.let { LiveLesson.clear(it) }
        }

        /**
         * Заставить виджет на рабочем столе перерисоваться прямо сейчас.
         *
         * Раньше виджет обновлялся ТОЛЬКО по своему будильнику или системному
         * updatePeriodMillis (30 минут) — а MIUI умеет замораживать и то, и
         * другое на часы, если приложению не выдано разрешение «без
         * ограничений» на батарею. 3 сентября 2026 виджет провисел так с
         * 15:30 до 23:01 — почти 8 часов, показывая пару, которая давно
         * закончилась, с отсчётом в минус.
         *
         * Открытие приложения на такое замирание не влияет никак: раньше
         * writeWidgetData() просто писал в AsyncStorage, а сам виджет об этом
         * не узнавал, пока не сработает его будильник. Теперь при каждой
         * записи свежего расписания (см. src/widgetData.ts) шлём широковещательно
         * то же действие, на которое подписан ScheduleWidget (WIDGET_TICK) —
         * без зависимости на класс виджета: он в отдельном модуле (android/app),
         * а этот код живёт в модуле modules/live-lesson и с ним не связан
         * напрямую. setPackage() нужен из-за ограничений Android 8+ на
         * неявные broadcast — без него ресивер приложения его не получит.
         */
        AsyncFunction("refreshWidget") {
            appContext.reactContext?.let { ctx ->
                ctx.sendBroadcast(
                    Intent("tj.msu.schedule.WIDGET_TICK").setPackage(ctx.packageName)
                )
            }
        }
    }
}

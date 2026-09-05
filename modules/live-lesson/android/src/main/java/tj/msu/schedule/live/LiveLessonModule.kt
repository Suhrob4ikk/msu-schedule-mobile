package tj.msu.schedule.live

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
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

        /**
         * Уже ли системе разрешено не ограничивать приложение в фоне.
         * Это НЕ решает проблему MIUI целиком — у MIUI есть отдельный,
         * непубличный переключатель «Автозапуск», до которого этим методом
         * не достучаться, — но снимает часть ограничений на стоковом Android
         * и Doze, из-за которых будильник виджета (см. ScheduleWidget.kt)
         * может не сработать вовремя.
         */
        AsyncFunction("isIgnoringBatteryOptimizations") {
            val ctx = appContext.reactContext ?: return@AsyncFunction true
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager
            pm?.isIgnoringBatteryOptimizations(ctx.packageName) ?: true
        }

        /** Открыть системный диалог запроса на исключение из ограничений батареи. */
        AsyncFunction("requestIgnoreBatteryOptimizations") {
            appContext.reactContext?.let { ctx ->
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${ctx.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                ctx.startActivity(intent)
            }
        }
    }
}

package tj.msu.schedule

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.ComponentName
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

private data class LessonItem(
    val start: Long, val end: Long, val subject: String, val room: String, val label: String,
)

/**
 * Виджет «Следующая пара» на рабочий стол.
 *
 * Данные пишет приложение (src/widgetData.ts) в AsyncStorage под ключом
 * "widget_data"; здесь читаем их напрямую из базы RKStorage — без
 * дополнительных нативных модулей. Сам виджет (текст «Сейчас/Далее», кольцо)
 * обновляется системой раз в 30 минут (updatePeriodMillis) и при каждом
 * добавлении/ресайзе — и только тогда. Между обновлениями это содержимое
 * застывает как есть.
 *
 * Из этого следует твёрдое правило: НЕ показывать здесь ОБЫЧНЫЙ ТЕКСТ,
 * который выглядит как живой отсчёт («осталось N мин» простой строкой) —
 * цифры на месте, а актуальны только в момент последнего обновления.
 * Пробовали в v1.9.23, получили «Через 0 мин» на середине идущей пары.
 * Тающее кольцо (ringProgress/ringBitmap) — не нарушение правила: оно тоже
 * снимок, но не называет точную цифру минут, поэтому устаревшим выглядит не
 * так явно.
 *
 * Отсчёт под line2 (widget_countdown) — другое дело: это системный
 * android.widget.Chronometer, а не текст. RemoteViews.setChronometer() +
 * setChronometerCountDown() один раз сообщают лаунчеру целевое время, а
 * дальше ТИКАЕТ САМ ЛАУНЧЕР — по-настоящему, посекундно, без единого нашего
 * обновления. Появилось в v1.9.25 именно как замена запрещённому обычному
 * тексту: тот же смысл («осталось X»), но без лжи о точности.
 *
 * Два макета: компактный (widget_schedule) и увеличенный (widget_schedule_large)
 * со списком оставшихся пар на сегодня — выбирается по текущему размеру
 * виджета (onAppWidgetOptionsChanged срабатывает, когда пользователь тянет
 * за край виджета на рабочем столе).
 */
class ScheduleWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) updateWidget(context, appWidgetManager, id)
    }

    override fun onAppWidgetOptionsChanged(
        context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle,
    ) {
        updateWidget(context, appWidgetManager, appWidgetId)
    }

    /**
     * Наш собственный будильник на границе пары, а также перезагрузка телефона
     * и обновление приложения (в обоих случаях будильники стираются системой,
     * их надо поставить заново).
     */
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val action = intent.action
        if (action == ACTION_TICK ||
            action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            val manager = AppWidgetManager.getInstance(context) ?: return
            val ids = manager.getAppWidgetIds(ComponentName(context, ScheduleWidget::class.java))
            for (id in ids) updateWidget(context, manager, id)
        }
    }

    companion object {
        /** Наш будильник «пара сменилась, перерисуй виджет». */
        const val ACTION_TICK = "tj.msu.schedule.WIDGET_TICK"

        // Выше этой высоты (в dp, задаёт лаунчер при ресайзе) — расширенный макет.
        //
        // Пробовал снижать до 100: расширенный макет (заголовок + разделитель +
        // до 4 строк списка) реально требует больше 150dp, чтобы поместиться.
        // При пороге 100 виджет размера по умолчанию (minHeight=110dp в
        // schedule_widget_info.xml) получал расширенный макет, для которого не
        // хватало места, — и на MIUI это кончилось не обрезанным текстом, а
        // ошибкой «Не удалось загрузить виджет» на всём виджете. 180 проверено
        // и безопасно; пустоту при маленьком размере лечим самим компактным
        // макетом (widget_schedule.xml), а не понижением порога.
        private const val LARGE_MIN_HEIGHT_DP = 180

        fun updateWidget(context: Context, manager: AppWidgetManager, widgetId: Int) {
            val large = isLargeSize(manager, widgetId)
            val layoutId = if (large) R.layout.widget_schedule_large else R.layout.widget_schedule
            val views = RemoteViews(context.packageName, layoutId)

            var group = "МГУ Расписание"
            var line1 = "Откройте приложение"
            var line2 = "чтобы загрузить расписание"
            var ringProgress: Float? = null
            // Цель для системного Chronometer (см. большой комментарий выше) — сколько
            // миллисекунд осталось до конца текущей пары или до начала следующей.
            var countdownTargetMs: Long? = null
            var countdownFormat = ""
            // Тот же момент, но абсолютным временем — на него ставим будильник,
            // чтобы перерисовать виджет ровно тогда, когда показанное устареет.
            var nextBoundaryAt: Long? = null
            var upcoming: List<LessonItem> = emptyList()
            var extraTitle = "СЕГОДНЯ ЕЩЁ"

            try {
                val json = readWidgetData(context)
                if (json != null) {
                    val o = JSONObject(json)
                    group = o.optString("group", group)
                    val arr = o.getJSONArray("lessons")
                    val items = (0 until arr.length()).map { i ->
                        val l = arr.getJSONObject(i)
                        LessonItem(
                            start = l.getLong("startAt"),
                            end = l.getLong("endAt"),
                            subject = l.getString("subject"),
                            room = l.optString("room", ""),
                            label = l.getString("label"),
                        )
                    }
                    val now = System.currentTimeMillis()
                    var found = false
                    // Конец последней уже прошедшей пары — начало перемены,
                    // нужен, чтобы посчитать долю оставшегося времени перемены.
                    var lastEnd = -1L
                    var shownIndex = -1
                    for ((i, l) in items.withIndex()) {
                        if (l.end <= now) {
                            lastEnd = l.end
                            continue
                        }
                        if (l.start <= now) {
                            line1 = "Сейчас: " + l.subject
                            line2 = l.label + (if (l.room.isNotEmpty()) " · ауд. ${l.room}" else "")
                            ringProgress = ((l.end - now).toFloat() / (l.end - l.start).toFloat()).coerceIn(0f, 1f)
                            countdownTargetMs = l.end - now
                            countdownFormat = "Осталось %s"
                            nextBoundaryAt = l.end
                        } else {
                            line1 = "Далее: " + l.subject
                            line2 = l.label + (if (l.room.isNotEmpty()) " · ауд. ${l.room}" else "")
                            countdownTargetMs = l.start - now
                            countdownFormat = "Через %s"
                            nextBoundaryAt = l.start
                            // Кольцо перемены — только если известно, когда она началась
                            // (то есть до неё в списке была ещё не закончившаяся пара сегодня).
                            if (lastEnd in 0 until l.start) {
                                ringProgress = ((l.start - now).toFloat() / (l.start - lastEnd).toFloat()).coerceIn(0f, 1f)
                            }
                        }
                        found = true
                        shownIndex = i
                        break
                    }
                    if (!found) {
                        val month = Calendar.getInstance().get(Calendar.MONTH)
                        if (month == Calendar.JULY || month == Calendar.AUGUST) {
                            line1 = "Каникулы!"
                            line2 = "Расписание — к 1 сентября"
                        } else {
                            line1 = "Пар больше нет"
                            line2 = "Хорошего отдыха!"
                        }
                    } else if (large) {
                        // Расширенный макет: ещё до 4 пар после уже показанной.
                        // Сначала пробуем сегодняшние; если на сегодня всё —
                        // берём ближайшие следующие, какого бы дня они ни были.
                        // Иначе вечером и в выходные нижняя половина виджета
                        // оставалась пустой, а место под неё всё равно занято.
                        val dayEnd = endOfDay(now)
                        val rest = items.drop(shownIndex + 1).filter { it.start > now }
                        val today = rest.filter { it.start <= dayEnd }
                        upcoming = (if (today.isNotEmpty()) today else rest).take(4)
                        extraTitle = if (today.isNotEmpty()) "СЕГОДНЯ ЕЩЁ" else "ДАЛЬШЕ"
                    }
                }
            } catch (_: Exception) {
                // Любая ошибка чтения — оставляем текст по умолчанию
            }

            views.setTextViewText(R.id.widget_group, group)
            views.setTextViewText(R.id.widget_line1, line1)
            views.setTextViewText(R.id.widget_line2, line2)

            val targetMs = countdownTargetMs
            // Chronometer в режиме обратного отсчёта не останавливается на нуле:
            // перейдя цель, он показывает время со знаком минус («−14:13:37»).
            // Само по себе это видно, только если виджет не обновился вовремя,
            // но подстраховаться дешевле, чем показать человеку минус.
            if (targetMs != null && targetMs > 0) {
                // Chronometer считает от SystemClock.elapsedRealtime(), а не от
                // System.currentTimeMillis() — переносим разницу в его систему отсчёта.
                val base = SystemClock.elapsedRealtime() + targetMs
                views.setChronometer(R.id.widget_countdown, base, countdownFormat, true)
                views.setChronometerCountDown(R.id.widget_countdown, true)
                views.setViewVisibility(R.id.widget_countdown, View.VISIBLE)
            } else {
                views.setViewVisibility(R.id.widget_countdown, View.GONE)
            }

            if (ringProgress != null) {
                views.setImageViewBitmap(R.id.widget_ring, ringBitmap(context, ringProgress))
                views.setViewVisibility(R.id.widget_ring, View.VISIBLE)
            } else {
                views.setViewVisibility(R.id.widget_ring, View.GONE)
            }

            if (large) {
                val timeFmt = SimpleDateFormat("HH:mm", Locale.US)
                val dayFmt = SimpleDateFormat("EEE", Locale.forLanguageTag("ru"))
                val rowIds = listOf(R.id.widget_extra1, R.id.widget_extra2, R.id.widget_extra3, R.id.widget_extra4)
                views.setTextViewText(R.id.widget_extra_title, extraTitle)
                views.setViewVisibility(R.id.widget_extra_title, if (upcoming.isEmpty()) View.GONE else View.VISIBLE)
                for ((i, rowId) in rowIds.withIndex()) {
                    val item = upcoming.getOrNull(i)
                    if (item != null) {
                        // У пар другого дня одно время без дня недели вводило бы
                        // в заблуждение — «08:00» завтра и сегодня выглядят одинаково.
                        val sameDay = item.start <= endOfDay(System.currentTimeMillis())
                        val when_ = if (sameDay) timeFmt.format(Date(item.start))
                                    else dayFmt.format(Date(item.start)) + " " + timeFmt.format(Date(item.start))
                        val text = "$when_ · ${item.subject}" + (if (item.room.isNotEmpty()) " · ауд. ${item.room}" else "")
                        views.setTextViewText(rowId, text)
                        views.setViewVisibility(rowId, View.VISIBLE)
                    } else {
                        views.setViewVisibility(rowId, View.GONE)
                    }
                }
            }

            // Тап по виджету открывает приложение
            val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (launch != null) {
                val pi = PendingIntent.getActivity(
                    context, 0, launch,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.widget_root, pi)
            }

            manager.updateAppWidget(widgetId, views)

            // Будильник на границу пары. Если пар впереди нет (каникулы,
            // вечер воскресенья) — не ставим ничего: разбудит либо обычное
            // обновление системы, либо открытие приложения.
            nextBoundaryAt?.let { scheduleNextUpdate(context, it) }
        }

        /** Пользователь растянул виджет выше LARGE_MIN_HEIGHT_DP — показываем список пар. */
        private fun isLargeSize(manager: AppWidgetManager, widgetId: Int): Boolean {
            return try {
                val options = manager.getAppWidgetOptions(widgetId)
                options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) >= LARGE_MIN_HEIGHT_DP
            } catch (_: Exception) {
                false
            }
        }

        /**
         * Ставит будильник на момент, когда показанное станет неправдой:
         * конец идущей пары или начало следующей.
         *
         * Без этого виджет жил только на updatePeriodMillis (30 минут), а на
         * MIUI система режет и их: 2 сентября 2026 виджет в 23:58 всё ещё
         * показывал утреннюю пару, а отсчёт под ней ушёл в «−14:13:37».
         * Тот же приём уже работает для уведомления «идёт пара»
         * (modules/live-lesson/LiveLesson.kt), оттуда и способ.
         *
         * setWindow, а не setExact: точные будильники на Android 12+ требуют
         * отдельного разрешения, которое пользователь может отобрать. Окна в
         * минуту на смену пары более чем достаточно.
         */
        private fun scheduleNextUpdate(context: Context, atMs: Long) {
            val am = context.getSystemService(AlarmManager::class.java) ?: return
            val pi = PendingIntent.getBroadcast(
                context,
                0,
                Intent(context, ScheduleWidget::class.java).setAction(ACTION_TICK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            // +2 секунды: будим уже ПОСЛЕ границы, иначе пересчёт застанет
            // ту же пару и поставит будильник на то же время по кругу.
            am.setWindow(AlarmManager.RTC_WAKEUP, atMs + 2_000L, 60_000L, pi)
        }

        private fun endOfDay(ms: Long): Long {
            val cal = Calendar.getInstance()
            cal.timeInMillis = ms
            cal.set(Calendar.HOUR_OF_DAY, 23)
            cal.set(Calendar.MINUTE, 59)
            cal.set(Calendar.SECOND, 59)
            cal.set(Calendar.MILLISECOND, 999)
            return cal.timeInMillis
        }

        /**
         * Тающее кольцо прогресса — та же идея, что и RadialProgress в приложении,
         * но нарисованная руками: RemoteViews виджета не умеют кастомные View
         * или SVG, только обычные Bitmap.
         */
        private fun ringBitmap(context: Context, progress: Float): Bitmap {
            val density = context.resources.displayMetrics.density
            val size = (32f * density).toInt()
            val stroke = 3.5f * density
            val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bmp)
            val rect = RectF(stroke / 2, stroke / 2, size - stroke / 2, size - stroke / 2)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = stroke
                strokeCap = Paint.Cap.ROUND
            }
            paint.color = Color.parseColor("#33FFFFFF")
            canvas.drawArc(rect, 0f, 360f, false, paint)
            paint.color = Color.parseColor("#2DD4A7")
            canvas.drawArc(rect, -90f, 360f * progress, false, paint)
            return bmp
        }

        /** Читает JSON виджета из хранилища AsyncStorage (SQLite RKStorage). */
        private fun readWidgetData(context: Context): String? {
            val dbFile = context.getDatabasePath("RKStorage")
            if (!dbFile.exists()) return null
            SQLiteDatabase.openDatabase(dbFile.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
                db.rawQuery(
                    "SELECT value FROM catalystLocalStorage WHERE key = ?",
                    arrayOf("widget_data")
                ).use { c ->
                    if (c.moveToFirst()) return c.getString(0)
                }
            }
            return null
        }
    }
}

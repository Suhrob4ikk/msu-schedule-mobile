package tj.msu.schedule

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.util.Calendar

/**
 * Виджет «Следующая пара» на рабочий стол.
 *
 * Данные пишет приложение (src/widgetData.ts) в AsyncStorage под ключом
 * "widget_data"; здесь читаем их напрямую из базы RKStorage — без
 * дополнительных нативных модулей. Обновляется системой раз в 30 минут
 * (updatePeriodMillis) и при каждом добавлении виджета.
 */
class ScheduleWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) updateWidget(context, appWidgetManager, id)
    }

    companion object {
        fun updateWidget(context: Context, manager: AppWidgetManager, widgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_schedule)
            var group = "МГУ Расписание"
            var line1 = "Откройте приложение"
            var line2 = "чтобы загрузить расписание"
            var ringProgress: Float? = null

            try {
                val json = readWidgetData(context)
                if (json != null) {
                    val o = JSONObject(json)
                    group = o.optString("group", group)
                    val lessons = o.getJSONArray("lessons")
                    val now = System.currentTimeMillis()
                    var found = false
                    // Конец последней уже прошедшей пары — начало перемены,
                    // нужен, чтобы посчитать долю оставшегося времени перемены.
                    var lastEnd = -1L
                    for (i in 0 until lessons.length()) {
                        val l = lessons.getJSONObject(i)
                        val start = l.getLong("startAt")
                        val end = l.getLong("endAt")
                        if (end <= now) {
                            lastEnd = end
                            continue
                        }
                        val room = l.optString("room", "")
                        if (start <= now) {
                            line1 = "Сейчас: " + l.getString("subject")
                            line2 = l.getString("label") + (if (room.isNotEmpty()) " · ауд. $room" else "")
                            ringProgress = ((end - now).toFloat() / (end - start).toFloat()).coerceIn(0f, 1f)
                        } else {
                            line1 = "Далее: " + l.getString("subject")
                            line2 = l.getString("label") + (if (room.isNotEmpty()) " · ауд. $room" else "")
                            // Кольцо перемены — только если известно, когда она началась
                            // (то есть до неё в списке была ещё не закончившаяся пара сегодня).
                            if (lastEnd in 0 until start) {
                                ringProgress = ((start - now).toFloat() / (start - lastEnd).toFloat()).coerceIn(0f, 1f)
                            }
                        }
                        found = true
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
                    }
                }
            } catch (_: Exception) {
                // Любая ошибка чтения — оставляем текст по умолчанию
            }

            views.setTextViewText(R.id.widget_group, group)
            views.setTextViewText(R.id.widget_line1, line1)
            views.setTextViewText(R.id.widget_line2, line2)

            if (ringProgress != null) {
                views.setImageViewBitmap(R.id.widget_ring, ringBitmap(context, ringProgress))
                views.setViewVisibility(R.id.widget_ring, View.VISIBLE)
            } else {
                views.setViewVisibility(R.id.widget_ring, View.GONE)
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

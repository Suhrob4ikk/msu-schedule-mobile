package tj.msu.schedule.live

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.os.Build
import org.json.JSONObject
import java.util.Calendar

/**
 * Постоянное уведомление «идёт пара».
 *
 * Показывает текущую (или следующую) пару с живым отсчётом до её конца и
 * прогрессом учебного дня. На Android 16 просится в статус-бар отдельной
 * плашкой — там видно предмет и остаток времени, не разблокируя телефон.
 *
 * Как это держится без работающего приложения:
 *  - расписание уже лежит в AsyncStorage под ключом widget_data (его пишет
 *    src/widgetData.ts для виджета) — читаем базу RKStorage напрямую;
 *  - отсчёт рисует сам Android (chronometer), поэтому раз в минуту ничего
 *    обновлять не нужно;
 *  - будильник ставится ровно на границу пары, то есть 5–10 раз в день.
 *
 * Функция включается только вручную в «Моём кабинете»: постоянное уведомление
 * без спроса — это навязчиво.
 */
object LiveLesson {

    const val CHANNEL_ID = "live-lesson"
    const val ACTION_TICK = "tj.msu.schedule.live.TICK"

    private const val NOTIF_ID = 4711
    private const val KEY_ENABLED = "live_lesson_enabled"
    private const val KEY_DATA = "widget_data"

    /** За сколько до первой пары дня показывать строку. */
    private const val LEAD_MS = 30 * 60_000L

    // Те же цвета, что в приложении и на сайте (src/theme.ts, globals.css)
    private const val COLOR_LESSON = 0xFF0E9B72.toInt() // фирменный изумруд
    private const val COLOR_BREAK = 0xFF8B94A3.toInt()  // приглушённый серый

    /** Одна пара в удобном виде. */
    private data class Slot(
        val start: Long,
        val end: Long,
        val subject: String,
        val room: String,
    )

    /**
     * Пересобирает уведомление по текущему времени и переставляет будильник.
     * Вызывать можно сколько угодно — операция идемпотентная.
     */
    fun refresh(context: Context) {
        // Каналы уведомлений появились в Android 8. На более старых просто
        // ничего не делаем — таких телефонов у пользователей уже нет.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        if (readValue(context, KEY_ENABLED) != "1") {
            clear(context)
            return
        }

        val slots = readSlots(context)
        if (slots.isEmpty()) {
            clear(context)
            return
        }

        val now = System.currentTimeMillis()
        val today = slots.filter { isSameDay(it.start, now) }

        val current = today.firstOrNull { now >= it.start && now < it.end }
        val next = today.firstOrNull { it.start > now }

        // Строку показываем, пока идёт пара, на перемене между парами и за
        // полчаса до первой. Без этого условия она висела бы с полуночи и до
        // первой пары — это мусор в шторке, а не польза.
        val dayStarted = today.any { it.end <= now }
        val showNext = next != null && (dayStarted || next.start - now <= LEAD_MS)

        if (current == null && !showNext) {
            cancelNotification(context)
            // Проснуться к ближайшей паре (может быть и завтрашней), но не
            // раньше, чем через минуту — иначе будильник ушёл бы в прошлое.
            val upcoming = next ?: slots.firstOrNull { it.start > now }
            if (upcoming != null) {
                scheduleAt(context, maxOf(upcoming.start - LEAD_MS, now + 60_000L))
            } else {
                cancelAlarm(context)
            }
            return
        }

        createChannel(context)
        notify(context, current, next, today)

        // Следующая пересборка — на ближайшей границе: конец идущей пары либо
        // начало следующей. Секунда сверху, чтобы не попасть ровно в момент.
        val boundary = (current?.end ?: next!!.start) + 1_000L
        scheduleAt(context, boundary)
    }

    /** Полностью выключить: снять уведомление и будильник. */
    fun clear(context: Context) {
        cancelNotification(context)
        cancelAlarm(context)
    }

    // ── Уведомление ─────────────────────────────────────────────────────────

    private fun createChannel(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Идёт пара",
            NotificationManager.IMPORTANCE_LOW, // без звука и всплытия
        ).apply {
            description = "Постоянная строка с текущей парой"
            setShowBadge(false)
            enableVibration(false)
            setSound(null, null)
        }
        nm.createNotificationChannel(channel)
    }

    private fun notify(context: Context, current: Slot?, next: Slot?, today: List<Slot>) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return

        val builder = Notification.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_live_lesson)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_STATUS)
            .setContentIntent(openAppIntent(context))

        if (current != null) {
            builder
                .setContentTitle(current.subject)
                .setContentText(placeAndTime(current))
                // Отсчёт до конца пары рисует сам Android — раз в минуту
                // будить приложение не нужно.
                .setWhen(current.end)
                .setShowWhen(true)
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
        } else if (next != null) {
            builder
                .setContentTitle("Дальше: ${next.subject}")
                .setContentText(placeAndTime(next))
                .setWhen(next.start)
                .setShowWhen(true)
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
        }

        applyDayProgress(builder, today, System.currentTimeMillis(), current, next)

        val notification = builder.build()
        // Плашку в статус-баре Android 16 просят флагом, сеттера у Builder нет.
        // Разрешит система или нет — решает она сама (canPostPromotedNotifications).
        if (Build.VERSION.SDK_INT >= 36) {
            notification.flags = notification.flags or Notification.FLAG_PROMOTED_ONGOING
        }
        nm.notify(NOTIF_ID, notification)
    }

    /**
     * Прогресс учебного дня. На Android 16 — сегментами (одна пара = один
     * сегмент), на более старых — обычной полосой.
     */
    private fun applyDayProgress(
        builder: Notification.Builder,
        today: List<Slot>,
        now: Long,
        current: Slot?,
        next: Slot?,
    ) {
        if (today.isEmpty()) return
        val dayStart = today.first().start
        val dayEnd = today.last().end
        val span = (dayEnd - dayStart).coerceAtLeast(1L)
        val doneMs = (now - dayStart).coerceIn(0L, span)

        val left = when {
            current != null -> current.end - now
            next != null -> next.start - now
            else -> 0L
        }

        if (Build.VERSION.SDK_INT >= 36) {
            // Android 16: сегментированная полоса — одна пара = один сегмент,
            // перемены между ними тусклым. Сразу видно, сколько дня прошло и
            // сколько пар осталось.
            val style = Notification.ProgressStyle()
            var prevEnd = dayStart
            today.forEach { slot ->
                // Настоящая длина перемены, без округления вверх: иначе перед
                // первой парой (где перемены нет) появлялся бы лишний сегмент.
                val gap = ((slot.start - prevEnd) / 60_000L).toInt()
                if (gap > 0) {
                    style.addProgressSegment(
                        Notification.ProgressStyle.Segment(gap).setColor(COLOR_BREAK)
                    )
                }
                style.addProgressSegment(
                    Notification.ProgressStyle.Segment(minutesBetween(slot.start, slot.end))
                        .setColor(COLOR_LESSON)
                )
                prevEnd = slot.end
            }
            // Прогресс в тех же единицах, что длины сегментов — в минутах.
            style.setProgress((doneMs / 60_000L).toInt())
            builder.setStyle(style)

            // В плашке статус-бара места на пару слов — только остаток времени.
            if (left > 0) {
                builder.setShortCriticalText("${(left / 60_000L).coerceAtLeast(1L)} мин")
            }
        } else {
            // До Android 16 сегментов нет — обычная полоса на весь день.
            builder.setProgress(100, (doneMs * 100 / span).toInt(), false)
        }
    }

    /** Длина пары в минутах, минимум 1 — сегмент нулевой длины не рисуется. */
    private fun minutesBetween(from: Long, to: Long): Int =
        ((to - from) / 60_000L).toInt().coerceAtLeast(1)

    private fun placeAndTime(slot: Slot): String {
        val time = "${formatTime(slot.start)}–${formatTime(slot.end)}"
        return if (slot.room.isNotEmpty()) "ауд. ${slot.room} · $time" else time
    }

    private fun openAppIntent(context: Context): PendingIntent? {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: return null
        return PendingIntent.getActivity(
            context, 0, launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun cancelNotification(context: Context) {
        context.getSystemService(NotificationManager::class.java)?.cancel(NOTIF_ID)
    }

    // ── Будильник ───────────────────────────────────────────────────────────

    private fun alarmIntent(context: Context): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            0,
            Intent(context, LiveLessonReceiver::class.java).setAction(ACTION_TICK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    /**
     * setExactAndAllowWhileIdle, а не setExact/setAlarmClock: те требуют
     * отдельное разрешение SCHEDULE_EXACT_ALARM (Android 12+), которое
     * пользователь может отобрать. В отличие от прежнего setWindow, доставляется
     * даже в Doze (см. тот же приём и подробное объяснение в
     * native-widget/ScheduleWidget.kt — там из-за setWindow строка «идёт
     * пара» и виджет отставали одинаково).
     */
    private fun scheduleAt(context: Context, atMs: Long) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, alarmIntent(context))
    }

    private fun cancelAlarm(context: Context) {
        context.getSystemService(AlarmManager::class.java)?.cancel(alarmIntent(context))
    }

    // ── Данные ──────────────────────────────────────────────────────────────

    private fun readSlots(context: Context): List<Slot> {
        val json = readValue(context, KEY_DATA) ?: return emptyList()
        return try {
            val lessons = JSONObject(json).getJSONArray("lessons")
            (0 until lessons.length()).mapNotNull { i ->
                val o = lessons.getJSONObject(i)
                val start = o.optLong("startAt", 0L)
                val end = o.optLong("endAt", 0L)
                if (start <= 0L || end <= start) return@mapNotNull null
                Slot(start, end, o.optString("subject", "Занятие"), o.optString("room", ""))
            }.sortedBy { it.start }
        } catch (_: Exception) {
            emptyList()
        }
    }

    /**
     * Значение из AsyncStorage. Читаем базу RKStorage напрямую — тем же
     * способом, что и виджет на рабочем столе (native-android/widget):
     * так уведомление собирается, даже когда приложение не запущено.
     */
    private fun readValue(context: Context, key: String): String? {
        val dbFile = context.getDatabasePath("RKStorage")
        if (!dbFile.exists()) return null
        return try {
            SQLiteDatabase.openDatabase(dbFile.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
                db.rawQuery(
                    "SELECT value FROM catalystLocalStorage WHERE key = ?",
                    arrayOf(key),
                ).use { c -> if (c.moveToFirst()) c.getString(0) else null }
            }
        } catch (_: Exception) {
            null
        }
    }

    // ── Мелочи ──────────────────────────────────────────────────────────────

    private fun isSameDay(a: Long, b: Long): Boolean {
        val ca = Calendar.getInstance().apply { timeInMillis = a }
        val cb = Calendar.getInstance().apply { timeInMillis = b }
        return ca.get(Calendar.YEAR) == cb.get(Calendar.YEAR) &&
            ca.get(Calendar.DAY_OF_YEAR) == cb.get(Calendar.DAY_OF_YEAR)
    }

    private fun formatTime(ms: Long): String {
        val c = Calendar.getInstance().apply { timeInMillis = ms }
        return "%02d:%02d".format(c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE))
    }
}

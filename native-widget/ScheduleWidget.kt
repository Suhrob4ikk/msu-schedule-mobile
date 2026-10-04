package tj.msu.schedule

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.database.sqlite.SQLiteDatabase
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.SizeF
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

private data class LessonItem(
    val start: Long,
    val end: Long,
    val subject: String,
    /** Уже как в приложении: «Лаб. химии», а не «лабхим» (src/widgetData.ts). */
    val room: String,
    /** «II»; пусто у данных до 1.9.47. */
    val pair: String,
    /** «Лекция», «Практика» — подпись, как в приложении. */
    val type: String,
    val teacher: String,
)

private class WidgetData(
    val group: String,
    val items: List<LessonItem>,
    /** Вышла ли следующая неделя — без этого «нет пар» ещё не значит «каникулы». */
    val nextWeekPublished: Boolean,
)

/** Набор цветов одного фона — роли из ТЗ (раздел 4.1), значения считает src/widgetThemeModel.ts. */
private class Palette(o: JSONObject) {
    val surface = c(o, "surface")
    val ink = c(o, "ink")
    val ink2 = c(o, "ink2")
    val ink3 = c(o, "ink3")
    val line = c(o, "line")
    val fill = c(o, "fill")
    val onFill = c(o, "onFill")
    val onFill2 = c(o, "onFill2")
    val fillLine = c(o, "fillLine")
    val soft = c(o, "soft")
    val onSoft = c(o, "onSoft")
    val softLine = c(o, "softLine")
    val accentText = c(o, "accentText")

    private fun c(o: JSONObject, key: String): Int = Color.parseColor(o.getString(key))
}

private class WidgetColors(json: JSONObject) {
    /** system / light / dark / black — как во «Внешнем виде». */
    val background: String = json.optString("background", "system")
    val light = Palette(json.getJSONObject("light"))
    val dark = Palette(json.getJSONObject("dark"))
    val black = Palette(json.getJSONObject("black"))
}

/** Состояния из ТЗ, раздел 5.1 (с решениями владельца Д1–Д4, окт 2026). */
private sealed class WState {
    /** Идёт пара: шапка — текущая пара, отсчёт до конца. */
    class Live(val hero: LessonItem) : WState()
    /** Перемена: сегодня уже была пара и ещё будет — любой промежуток, и обед тоже (Д1). */
    class Break(val hero: LessonItem) : WState()
    /** Следующая пара: утро до первой пары сегодня. */
    class Next(val hero: LessonItem) : WState()
    /** Пар больше нет / сегодня пар нет: шапка — первая пара следующего учебного дня. */
    class Later(val hero: LessonItem, val hadToday: Boolean) : WState()
    /** Пустые: не загружено, каникулы, следующая неделя не опубликована (Д4). */
    class Empty(val kind: EmptyKind, val group: String, val firstLesson: LessonItem?) : WState()
}

private enum class EmptyKind { NOT_LOADED, HOLIDAY, NO_NEXT_WEEK }

/** Сетка следующих пар: N рядов по rowH dp. ТЗ, раздел 2.3. */
private data class Grid(val rows: Int, val rowH: Float)

/**
 * Виджет «Расписание», вариант C «Аудитория» (ТЗ widget-C-TZ.md, макет
 * widget-C-maket.png). Номер аудитории — самый крупный элемент, цвет всего
 * виджета показывает статус пары, под шапкой — сетка следующих пар, число
 * рядов зависит от высоты. Один виджет, тянется по ширине и высоте:
 * H < 170 — малая раскладка, 170…245 — компактная, от 245 — полная.
 *
 * Данные пишет приложение (src/widgetData.ts) в AsyncStorage под ключом
 * "widget_data" — эта и следующая неделя своей группы; читаем их напрямую из
 * базы RKStorage. Цвета — ключ "widget_theme" (src/widgetThemeModel.ts):
 * приложение само считает роли ТЗ для трёх фонов по акценту из «Внешнего
 * вида», здесь только выбираем набор. Нет ключа — синий по умолчанию.
 *
 * Обновляется: на границах пар и в полночь (свой будильник WIDGET_TICK), при
 * открытии приложения и загрузке расписания (LiveLessonNative.refreshWidget),
 * при смене оформления, при изменении размера, раз в 30 минут системой.
 * Между обновлениями содержимое застывает как есть.
 *
 * Отсюда твёрдое правило: НЕ показывать ОБЫЧНЫЙ ТЕКСТ, похожий на живой
 * отсчёт («осталось N мин» простой строкой) — он устаревает между
 * обновлениями. Пробовали в v1.9.23, получили «Через 0 мин» посреди пары.
 * Отсчёт (widget_countdown) — системный android.widget.Chronometer:
 * setChronometer() один раз сообщает лаунчеру цель, а дальше ТИКАЕТ САМ
 * ЛАУНЧЕР, посекундно, без наших обновлений (с v1.9.25). Формат системный —
 * «42:13», после часа «1:05:09». Полос прогресса и колец нет.
 *
 * Размеры: на Android 12+ лаунчер сообщает все фактические размеры
 * (OPTION_APPWIDGET_SIZES), и мы отдаём по раскладке на каждый —
 * RemoteViews(Map<SizeF, RemoteViews>); там же ставим высоты рядов сетки
 * (≤ 60 dp); остаток высоты всегда забирает распорка над сеткой (weight в
 * разметке). На старых — размер из MIN/MAX_WIDTH/HEIGHT по ориентации, ряды
 * по 44 dp из разметки (высоту ряда RemoteViews до Android 12 задать не умеют).
 *
 * Цвет фона со скруглением RemoteViews менять не умеют — подложки здесь
 * белые картинки (widget_bg, widget_plate), их перекрашивает setColorFilter;
 * линии — setBackgroundColor. При «как в системе» на Android 12+ передаём оба
 * цвета (setColorInt) — лаунчер сам переключит их с темой телефона; на старых
 * — по теме в момент обновления.
 *
 * Шрифт — системный: свои шрифты (Onest) лаунчер в виджете не грузит.
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

        /** Раскладки по высоте, dp (ТЗ, раздел 1). */
        private const val SMALL_BELOW = 170f
        private const val FULL_FROM = 245f

        private const val DAY_MS = 24 * 3_600_000L
        private const val HORIZON_MS = 14 * DAY_MS

        private val DAY2 = listOf("Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб")
        private val MONTH_SHORT = listOf(
            "янв.", "февр.", "марта", "апр.", "мая", "июня", "июля", "авг.", "сент.", "окт.", "нояб.", "дек.",
        )
        private val MONTH_GEN = listOf(
            "января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября",
            "ноября", "декабря",
        )
        private val RU = Locale.forLanguageTag("ru")

        /** Синий по умолчанию — пока приложение не записало widget_theme (вывод widgetTheme(DEFAULT_APPEARANCE)). */
        private const val DEFAULT_THEME = """{"background":"system",
            "light":{"surface":"#FFFFFF","ink":"#10131A","ink2":"#4B5262","ink3":"#6C717D","line":"#DDE2EA","fill":"#2F62EA","onFill":"#FFFFFF","onFill2":"#EAEFFD","fillLine":"#5981EE","soft":"#E5ECFD","onSoft":"#1E46B8","softLine":"#C4D3FA","accentText":"#2856D6"},
            "dark":{"surface":"#151821","ink":"#F1F3F7","ink2":"#A8AFBD","ink3":"#838996","line":"#2A2F3B","fill":"#2F62EA","onFill":"#FFFFFF","onFill2":"#EAEFFD","fillLine":"#5981EE","soft":"#1C2850","onSoft":"#BFD0FF","softLine":"#1F326C","accentText":"#8FB0FF"},
            "black":{"surface":"#0E0F12","ink":"#F1F3F7","ink2":"#A8AFBD","ink3":"#828792","line":"#24272F","fill":"#2F62EA","onFill":"#FFFFFF","onFill2":"#EAEFFD","fillLine":"#5981EE","soft":"#16204A","onSoft":"#BFD0FF","softLine":"#1B2C67","accentText":"#8FB0FF"}}"""

        fun updateWidget(context: Context, manager: AppWidgetManager, widgetId: Int) {
            val options = try { manager.getAppWidgetOptions(widgetId) } catch (_: Exception) { null }
            val data = readData(context)
            val now = System.currentTimeMillis()
            // Сначала состояние, потом счётчик (ТЗ, раздел 8): опоздавший будильник
            // не оставит отсчёт уходить в минус дольше, чем до этого обновления.
            val state = computeState(data, now)
            val colors = readColors(context)
            val night = isNight(context)

            val sizes = widgetSizes(context, options)
            val views = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && sizes.size > 1) {
                RemoteViews(sizes.associateWith { build(context, it, state, data, colors, night, now) })
            } else {
                build(context, sizes.first(), state, data, colors, night, now)
            }
            manager.updateAppWidget(widgetId, views)

            scheduleNextUpdate(context, nextBoundary(state, now))
        }

        // ── Состояние (ТЗ 5.1) ───────────────────────────────────────────────

        private fun computeState(data: WidgetData?, now: Long): WState {
            if (data == null) return WState.Empty(EmptyKind.NOT_LOADED, "", null)
            val items = data.items
            val today = items.filter { isSameDay(it.start, now) }

            today.firstOrNull { now >= it.start && now < it.end }?.let { return WState.Live(it) }

            val next = today.firstOrNull { it.start > now }
            if (next != null) {
                // Д1: без порога 20 минут — после сегодняшней пары любой промежуток «Перемена»
                val hadEarlier = today.any { it.end <= now }
                return if (hadEarlier) WState.Break(next) else WState.Next(next)
            }

            val later = items.firstOrNull { it.start > endOfDay(now) }
            if (later != null && later.start - now < HORIZON_MS) return WState.Later(later, today.isNotEmpty())

            // Д4: «Каникулы» — только если следующая неделя уже вышла (или лето);
            // иначе мы просто ещё не знаем, будут ли пары.
            val month = Calendar.getInstance().apply { timeInMillis = now }.get(Calendar.MONTH)
            val summer = month == Calendar.JULY || month == Calendar.AUGUST
            val kind = if (data.nextWeekPublished || summer || later != null) EmptyKind.HOLIDAY else EmptyKind.NO_NEXT_WEEK
            return WState.Empty(kind, data.group, later)
        }

        private fun heroOf(s: WState): LessonItem? = when (s) {
            is WState.Live -> s.hero
            is WState.Break -> s.hero
            is WState.Next -> s.hero
            is WState.Later -> s.hero
            is WState.Empty -> null
        }

        /** Когда показанное устареет: конец/начало пары или полночь — что раньше. */
        private fun nextBoundary(s: WState, now: Long): Long {
            val midnight = endOfDay(now) + 1
            val at = when (s) {
                is WState.Live -> s.hero.end
                is WState.Break -> s.hero.start
                is WState.Next -> s.hero.start
                else -> midnight
            }
            return min(at, midnight)
        }

        // ── Сетка (ТЗ 2.3) ───────────────────────────────────────────────────

        /**
         * Высота шапки. Строка шапки — 56/44 dp по ТЗ, но не ниже блока отсчёта
         * (2 + строка счётчика + подпись 14·f): при ×1,3 подпись иначе срезалась бы.
         */
        private fun heroHeight(full: Boolean, f: Float): Float =
            if (full) 14f * f + 6f + max(56f, 34f + 14f * f) + 4f + 22f * f + 18f * f
            else max(44f, 28f + 14f * f) + 4f + 19f * f + 16f * f

        private fun gridFor(h: Float, f: Float, full: Boolean, upcoming: Int): Grid {
            val top = if (full) 14f else 12f
            val avail = h - top - heroHeight(full, f) - 10f - 12f - 1f
            val minRow = max(44f, ceil(34f * f) + 10f)
            val n = minOf(6, floor(avail / minRow).toInt(), (upcoming + 1) / 2).coerceAtLeast(0)
            return if (n == 0) Grid(0, 0f) else Grid(n, min(60f, avail / n))
        }

        // ── Отрисовка ────────────────────────────────────────────────────────

        private val ROWS = intArrayOf(
            R.id.widget_row1, R.id.widget_row2, R.id.widget_row3, R.id.widget_row4, R.id.widget_row5, R.id.widget_row6,
        )
        private val ROW_LINES = intArrayOf(
            0, R.id.widget_row2_line, R.id.widget_row3_line, R.id.widget_row4_line, R.id.widget_row5_line, R.id.widget_row6_line,
        )
        private val ROW_VLINES = intArrayOf(
            R.id.widget_row1_vline, R.id.widget_row2_vline, R.id.widget_row3_vline,
            R.id.widget_row4_vline, R.id.widget_row5_vline, R.id.widget_row6_vline,
        )

        /** Плитки по строкам: слева направо, сверху вниз. [время, аудитория, предмет]. */
        private val TILES = arrayOf(
            intArrayOf(R.id.widget_t1a_time, R.id.widget_t1a_room, R.id.widget_t1a_subj),
            intArrayOf(R.id.widget_t1b_time, R.id.widget_t1b_room, R.id.widget_t1b_subj),
            intArrayOf(R.id.widget_t2a_time, R.id.widget_t2a_room, R.id.widget_t2a_subj),
            intArrayOf(R.id.widget_t2b_time, R.id.widget_t2b_room, R.id.widget_t2b_subj),
            intArrayOf(R.id.widget_t3a_time, R.id.widget_t3a_room, R.id.widget_t3a_subj),
            intArrayOf(R.id.widget_t3b_time, R.id.widget_t3b_room, R.id.widget_t3b_subj),
            intArrayOf(R.id.widget_t4a_time, R.id.widget_t4a_room, R.id.widget_t4a_subj),
            intArrayOf(R.id.widget_t4b_time, R.id.widget_t4b_room, R.id.widget_t4b_subj),
            intArrayOf(R.id.widget_t5a_time, R.id.widget_t5a_room, R.id.widget_t5a_subj),
            intArrayOf(R.id.widget_t5b_time, R.id.widget_t5b_room, R.id.widget_t5b_subj),
            intArrayOf(R.id.widget_t6a_time, R.id.widget_t6a_room, R.id.widget_t6a_subj),
            intArrayOf(R.id.widget_t6b_time, R.id.widget_t6b_room, R.id.widget_t6b_subj),
        )

        private fun build(
            context: Context, size: SizeF, state: WState, data: WidgetData?,
            colors: WidgetColors, night: Boolean, now: Long,
        ): RemoteViews {
            val h = size.height
            val full = h >= FULL_FROM
            val small = h < SMALL_BELOW
            val f = context.resources.configuration.fontScale
            val views = RemoteViews(context.packageName, if (full) R.layout.widget_full else R.layout.widget_compact)
            val paint = Painter(views, colors, night)

            views.setOnClickPendingIntent(R.id.widget_root, openScheduleIntent(context))

            val hero = heroOf(state)
            if (state is WState.Empty || hero == null) {
                fillEmpty(views, paint, state as WState.Empty, small)
                return views
            }
            views.setViewVisibility(R.id.widget_content, View.VISIBLE)
            views.setViewVisibility(R.id.widget_empty, View.GONE)

            val live = state is WState.Live
            val soft = state is WState.Break || state is WState.Next
            // Палитра по состояниям — ТЗ 4.2
            val bg: (Palette) -> Int = { if (live) it.fill else if (soft) it.soft else it.surface }
            val ink: (Palette) -> Int = { if (live) it.onFill else it.ink }
            val ink2: (Palette) -> Int = { if (live) it.onFill2 else it.ink2 }
            val room: (Palette) -> Int = { if (live) it.onFill else if (soft) it.onSoft else it.ink }
            val line: (Palette) -> Int = { if (live) it.fillLine else if (soft) it.softLine else it.line }
            val tileRoom: (Palette) -> Int = { if (live) it.onFill else if (soft) it.onSoft else it.accentText }

            paint.fill(R.id.widget_bg, bg)

            // 1. Строка статуса (только полная)
            if (full) {
                views.setTextViewText(R.id.widget_status, statusText(state).uppercase(RU))
                views.setTextViewText(R.id.widget_group, data?.group ?: "")
                paint.text(R.id.widget_status, ink2)
                paint.text(R.id.widget_group, ink2)
            }

            // 2. Шапка: блок отсчёта справа
            val density = context.resources.displayMetrics.density
            val timerDp = if (full) 28f else 22f
            val labelPaint = textPaint("sans-serif-medium", 11f * f * density)
            var blockPx: Float
            val plate = state is WState.Break
            views.setViewVisibility(R.id.widget_plate, if (plate) View.VISIBLE else View.GONE)
            val platePad = if (plate) (8f * density).toInt() else 0
            views.setViewPadding(R.id.widget_timer_inner, platePad, 0, platePad, 0)

            if (state is WState.Later) {
                val tomorrow = isTomorrow(hero.start, now)
                val dayWord = if (tomorrow) "Завтра" else dayShort(hero.start)
                val dateLine = if (tomorrow) "${dayShort(hero.start)}, ${dateShort(hero.start)}" else dateShort(hero.start)
                views.setViewVisibility(R.id.widget_countdown, View.GONE)
                views.setViewVisibility(R.id.widget_day, View.VISIBLE)
                views.setTextViewText(R.id.widget_day, dayWord)
                views.setTextViewText(R.id.widget_timer_label, dateLine)
                paint.text(R.id.widget_day) { it.ink }
                blockPx = max(
                    textPaint("sans-serif", (if (full) 20f else 17f) * density, bold = true).measureText(dayWord),
                    labelPaint.measureText(dateLine),
                )
            } else {
                val target = if (live) hero.end else hero.start
                val label = if (live) "до конца" else "до начала"
                // Chronometer считает от SystemClock.elapsedRealtime(), а не от
                // System.currentTimeMillis() — переносим разницу в его систему отсчёта.
                views.setChronometer(R.id.widget_countdown, SystemClock.elapsedRealtime() + (target - now), null, true)
                views.setChronometerCountDown(R.id.widget_countdown, true)
                views.setViewVisibility(R.id.widget_countdown, View.VISIBLE)
                views.setViewVisibility(R.id.widget_day, View.GONE)
                views.setTextViewText(R.id.widget_timer_label, label)
                // Место под «0:00:00», чтобы шапка не прыгала, когда отсчёт перевалит за час
                val timerPx = textPaint("sans-serif", timerDp * density, bold = true).measureText("0:00:00")
                views.setInt(R.id.widget_countdown, "setMinWidth", ceil(timerPx).toInt())
                paint.text(R.id.widget_countdown) { if (live || plate) it.onFill else it.onSoft }
                if (plate) paint.fill(R.id.widget_plate) { it.fill }
                blockPx = max(timerPx + 2 * platePad, labelPaint.measureText(label))
            }
            paint.text(R.id.widget_timer_label, ink2)

            // Аудитория: 56/44 dp; длиннее 4 знаков — 32; не влезает — меньше, но не ниже 20 (ТЗ 6)
            val roomText = hero.room.ifEmpty { "—" }
            val availPx = size.width * density - 32f * density - 12f * density - blockPx
            var roomDp = if (roomText.length > 4) 32f else if (full) 56f else 44f
            val roomPaint = textPaint("sans-serif-black", 0f).apply { letterSpacing = -0.02f }
            while (roomDp > 20f) {
                roomPaint.textSize = roomDp * density
                if (roomPaint.measureText(roomText) <= availPx) break
                roomDp -= 1f
            }
            views.setTextViewText(R.id.widget_room, roomText)
            views.setTextViewTextSize(R.id.widget_room, TypedValue.COMPLEX_UNIT_DIP, roomDp)
            paint.text(R.id.widget_room, room)

            // 3–4. Предмет и «время · тип · преподаватель»
            views.setTextViewText(R.id.widget_subject, hero.subject)
            views.setTextViewText(R.id.widget_meta, metaLine(hero))
            paint.text(R.id.widget_subject, ink)
            paint.text(R.id.widget_meta, ink2)
            // В малой при крупном шрифте третья строка не помещается (ТЗ 2.2)
            views.setViewVisibility(R.id.widget_meta, if (small && f >= 1.15f) View.GONE else View.VISIBLE)

            // 5–6. Распорка и сетка
            val upcoming = data!!.items.filter { it.start > hero.start }.take(12)
            val grid = if (small) Grid(0, 0f) else gridFor(h, f, full, upcoming.size)
            fillGrid(views, paint, grid, upcoming, hero, ink, ink2, line, tileRoom)
            // Нет сетки — шапка по центру, как у малой: без пустой полосы внизу
            views.setInt(R.id.widget_content, "setGravity", if (grid.rows == 0) Gravity.CENTER_VERTICAL else Gravity.TOP)

            views.setContentDescription(R.id.widget_root, describe(state, hero, now))
            return views
        }

        private fun fillGrid(
            views: RemoteViews, paint: Painter, grid: Grid, upcoming: List<LessonItem>, hero: LessonItem,
            ink: (Palette) -> Int, ink2: (Palette) -> Int, line: (Palette) -> Int, tileRoom: (Palette) -> Int,
        ) {
            val show = if (grid.rows > 0) View.VISIBLE else View.GONE
            views.setViewVisibility(R.id.widget_spacer, show)
            views.setViewVisibility(R.id.widget_grid, show)
            if (grid.rows == 0) return

            // Ряды — ровно rowH (≤ 60); остаток высоты забирает распорка над сеткой
            // (weight в разметке): сетка прижата к нижнему отступу, пустой полосы внизу нет.
            // На старых Android высоту не задать — там ряды по 44 dp из разметки.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                for (r in 0 until grid.rows) {
                    views.setViewLayoutHeight(ROWS[r], grid.rowH, TypedValue.COMPLEX_UNIT_DIP)
                }
            }

            paint.background(R.id.widget_grid_line, line)
            for (r in ROWS.indices) {
                views.setViewVisibility(ROWS[r], if (r < grid.rows) View.VISIBLE else View.GONE)
                if (r >= grid.rows) continue
                if (ROW_LINES[r] != 0) paint.background(ROW_LINES[r], line)
                paint.background(ROW_VLINES[r], line)
            }

            for (i in 0 until grid.rows * 2) {
                val ids = TILES[i]
                val item = upcoming.getOrNull(i)
                // Неполный последний ряд: правая ячейка пустая, разделители как обычно
                views.setTextViewText(ids[0], item?.let { tileTime(it, hero) } ?: "")
                views.setTextViewText(ids[1], item?.let { it.room.ifEmpty { "—" } } ?: "")
                views.setTextViewText(ids[2], item?.subject ?: "")
                paint.text(ids[0], ink)
                paint.text(ids[1], tileRoom)
                paint.text(ids[2], ink2)
            }
        }

        private fun fillEmpty(views: RemoteViews, paint: Painter, s: WState.Empty, small: Boolean) {
            views.setViewVisibility(R.id.widget_content, View.GONE)
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE)
            paint.fill(R.id.widget_bg) { it.surface }

            val (title, text) = when (s.kind) {
                EmptyKind.NOT_LOADED ->
                    (if (small) "Расписание не загружено" else "Расписание\nне загружено") to "Нажмите, чтобы обновить"
                EmptyKind.HOLIDAY ->
                    "Каникулы" to (s.firstLesson?.let { "Занятия с ${dateLong(it.start)}" } ?: "")
                EmptyKind.NO_NEXT_WEEK ->
                    "Пар больше нет" to "Следующая неделя ещё не опубликована"
            }
            views.setTextViewText(R.id.widget_empty_group, s.group.uppercase(RU))
            views.setViewVisibility(R.id.widget_empty_group, if (s.group.isEmpty()) View.GONE else View.VISIBLE)
            views.setTextViewText(R.id.widget_empty_title, title)
            views.setTextViewText(R.id.widget_empty_text, text)
            views.setViewVisibility(R.id.widget_empty_text, if (text.isEmpty()) View.GONE else View.VISIBLE)
            paint.text(R.id.widget_empty_group) { it.ink3 }
            paint.text(R.id.widget_empty_title) { it.ink }
            paint.text(R.id.widget_empty_text) { it.ink2 }
            views.setContentDescription(
                R.id.widget_root, listOf(title.replace('\n', ' '), text).filter { it.isNotEmpty() }.joinToString(". "),
            )
        }

        // ── Тексты (ТЗ 5.2) ──────────────────────────────────────────────────

        private fun pairWord(l: LessonItem) = if (l.pair.isNotEmpty()) " · ${l.pair} пара" else ""

        private fun statusText(s: WState): String = when (s) {
            is WState.Live -> "Идёт${pairWord(s.hero)}".let { if (s.hero.pair.isEmpty()) "Идёт пара" else it }
            is WState.Break -> "Перемена${pairWord(s.hero)}"
            is WState.Next -> "Сегодня${pairWord(s.hero)}"
            is WState.Later -> if (s.hadToday) "Пар больше нет" else "Сегодня пар нет"
            is WState.Empty -> ""
        }

        /** «09:45–11:15 · Лекция · Хайбуллоев Д.А.» — преподаватель как пришёл. */
        private fun metaLine(l: LessonItem): String =
            listOf("${hhmm(l.start)}–${hhmm(l.end)}", l.type, l.teacher).filter { it.isNotEmpty() }.joinToString(" · ")

        /** «09:45», если в тот же день, что пара в шапке, иначе «Вт 09:45». */
        private fun tileTime(l: LessonItem, hero: LessonItem): String =
            if (isSameDay(l.start, hero.start)) hhmm(l.start) else "${dayShort(l.start)} ${hhmm(l.start)}"

        private fun describe(s: WState, hero: LessonItem, now: Long): String {
            val room = if (hero.room.isNotEmpty()) "аудитория ${hero.room}" else "аудитория не указана"
            return when (s) {
                is WState.Live -> "Идёт пара: ${hero.subject}, $room, до ${hhmm(hero.end)}"
                is WState.Later -> {
                    val day = if (isTomorrow(hero.start, now)) "Завтра" else "${dayShort(hero.start)}, ${dateShort(hero.start)}"
                    "${if (s.hadToday) "Сегодня пар больше нет" else "Сегодня пар нет"}. $day в ${hhmm(hero.start)}: ${hero.subject}, $room"
                }
                else -> "Следующая пара: ${hero.subject}, $room, в ${hhmm(hero.start)}"
            }
        }

        private fun cal(ms: Long) = Calendar.getInstance().apply { timeInMillis = ms }
        private fun hhmm(ms: Long) = cal(ms).let { "%02d:%02d".format(it.get(Calendar.HOUR_OF_DAY), it.get(Calendar.MINUTE)) }
        private fun dayShort(ms: Long) = DAY2[cal(ms).get(Calendar.DAY_OF_WEEK) - 1]
        private fun dateShort(ms: Long) = cal(ms).let { "${it.get(Calendar.DAY_OF_MONTH)} ${MONTH_SHORT[it.get(Calendar.MONTH)]}" }
        private fun dateLong(ms: Long) = cal(ms).let { "${it.get(Calendar.DAY_OF_MONTH)} ${MONTH_GEN[it.get(Calendar.MONTH)]}" }

        private fun isTomorrow(at: Long, now: Long): Boolean {
            val d = startOfDay(at) - startOfDay(now)
            return d in 1..(36 * 3_600_000L) // 23–25 ч при переходе на летнее время
        }

        private fun textPaint(family: String, px: Float, bold: Boolean = false) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(family, if (bold) Typeface.BOLD else Typeface.NORMAL)
            textSize = px
        }

        // ── Размеры ──────────────────────────────────────────────────────────

        /**
         * Фактические размеры виджета, dp. Android 12+ — все, что сообщил лаунчер
         * (до 16, каждому своя раскладка); старые — по ориентации: портрет —
         * MIN_WIDTH × MAX_HEIGHT, альбом — MAX_WIDTH × MIN_HEIGHT.
         */
        private fun widgetSizes(context: Context, options: Bundle?): List<SizeF> {
            if (options != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                @Suppress("DEPRECATION")
                val list = options.getParcelableArrayList<SizeF>(AppWidgetManager.OPTION_APPWIDGET_SIZES)
                if (!list.isNullOrEmpty()) return list.distinct().take(16)
            }
            val landscape = context.resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
            val w = options?.getInt(if (landscape) AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH else AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) ?: 0
            val h = options?.getInt(if (landscape) AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT else AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0) ?: 0
            return listOf(SizeF(if (w > 0) w.toFloat() else 280f, if (h > 0) h.toFloat() else 110f))
        }

        /** Нажатие — приложение на вкладке «Расписание» (ссылка на корень, её разбирает expo-router). */
        private fun openScheduleIntent(context: Context): PendingIntent {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("msu-schedule:///"), context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            return PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        // ── Цвета ────────────────────────────────────────────────────────────

        private fun readColors(context: Context): WidgetColors =
            try {
                WidgetColors(JSONObject(readValue(context, "widget_theme") ?: DEFAULT_THEME))
            } catch (_: Exception) {
                // В том числе widget_theme от 1.9.47 — там другие имена ролей
                WidgetColors(JSONObject(DEFAULT_THEME))
            }

        private fun isNight(context: Context): Boolean =
            (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
                Configuration.UI_MODE_NIGHT_YES

        /**
         * Красит виджет набором своего фона. При «как в системе» на Android 12+
         * отдаёт лаунчеру оба цвета (setColorInt): тема телефона сменилась —
         * виджет перекрасился сам, без нашего обновления.
         */
        private class Painter(val views: RemoteViews, colors: WidgetColors, night: Boolean) {
            private val light = colors.light
            private val dark = colors.dark
            private val dual = colors.background == "system"
            private val current = when (colors.background) {
                "light" -> colors.light
                "dark" -> colors.dark
                "black" -> colors.black
                else -> if (night) colors.dark else colors.light
            }

            fun text(id: Int, pick: (Palette) -> Int) = set(id, "setTextColor", pick)
            fun fill(id: Int, pick: (Palette) -> Int) = set(id, "setColorFilter", pick)
            fun background(id: Int, pick: (Palette) -> Int) = set(id, "setBackgroundColor", pick)

            private fun set(id: Int, method: String, pick: (Palette) -> Int) {
                if (dual && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    views.setColorInt(id, method, pick(light), pick(dark))
                } else {
                    views.setInt(id, method, pick(current))
                }
            }
        }

        // ── Будильник ────────────────────────────────────────────────────────

        /**
         * Будильник на момент, когда показанное станет неправдой: конец идущей
         * пары, начало следующей или полночь.
         *
         * Без него виджет жил только на updatePeriodMillis (30 минут), а MIUI режет
         * и их: 2 сентября 2026 виджет в 23:58 всё ещё показывал утреннюю пару,
         * а отсчёт под ней ушёл в «−14:13:37». Тот же приём — у строки «идёт пара»
         * (modules/live-lesson/LiveLesson.kt).
         *
         * setExactAndAllowWhileIdle, а не setWindow: тот система вправе отложить,
         * особенно в Doze. Был баг 5 сентября 2026: будильник на начало пары не
         * сработал вовремя, виджет показывал «Далее» с отсчётом в минус, хотя пара
         * уже шла. Но на Android 12+ точный будильник без SCHEDULE_EXACT_ALARM
         * разрешён не всем (только «без ограничений батареи») и иначе бросает
         * SecurityException — тогда setWindow с окном в минуту (ТЗ, раздел 8).
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
            val at = atMs + 2_000L
            try {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
                } else {
                    am.setWindow(AlarmManager.RTC_WAKEUP, at, 60_000L, pi)
                }
            } catch (_: SecurityException) {
                am.setWindow(AlarmManager.RTC_WAKEUP, at, 60_000L, pi)
            }
        }

        // ── Время ────────────────────────────────────────────────────────────

        private fun startOfDay(ms: Long): Long = cal(ms).apply {
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis

        private fun endOfDay(ms: Long): Long = cal(ms).apply {
            set(Calendar.HOUR_OF_DAY, 23); set(Calendar.MINUTE, 59); set(Calendar.SECOND, 59); set(Calendar.MILLISECOND, 999)
        }.timeInMillis

        private fun isSameDay(a: Long, b: Long) = startOfDay(a) == startOfDay(b)

        // ── Хранилище ────────────────────────────────────────────────────────

        private fun readData(context: Context): WidgetData? = try {
            readValue(context, "widget_data")?.let { json ->
                val o = JSONObject(json)
                val arr = o.getJSONArray("lessons")
                WidgetData(
                    group = o.optString("group", ""),
                    items = (0 until arr.length()).map { i ->
                        val l = arr.getJSONObject(i)
                        LessonItem(
                            start = l.getLong("startAt"),
                            end = l.getLong("endAt"),
                            subject = l.optString("subject", ""),
                            room = l.optString("room", ""),
                            pair = l.optString("pair", ""),
                            type = l.optString("type", ""),
                            teacher = l.optString("teacher", ""),
                        )
                    }.sortedBy { it.start },
                    nextWeekPublished = o.optBoolean("nextWeekPublished", false),
                )
            }
        } catch (_: Exception) {
            null // битые данные — как будто их нет
        }

        /** Значение из AsyncStorage (SQLite RKStorage) — читаем базу напрямую. */
        private fun readValue(context: Context, key: String): String? {
            val dbFile = context.getDatabasePath("RKStorage")
            if (!dbFile.exists()) return null
            SQLiteDatabase.openDatabase(dbFile.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
                db.rawQuery(
                    "SELECT value FROM catalystLocalStorage WHERE key = ?",
                    arrayOf(key)
                ).use { c ->
                    if (c.moveToFirst()) return c.getString(0)
                }
            }
            return null
        }
    }
}

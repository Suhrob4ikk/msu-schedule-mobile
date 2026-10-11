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
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.SizeF
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale
import kotlin.math.min

/*
 * Виджеты «Расписание» (с 2.0.5, решение владельца 11 окт 2026: «виджет — главное отличие
 * от сайта, сделать на ином уровне»). Два стиля — два виджета в списке Android:
 *
 * - «МГУ · Табло» (класс ScheduleWidget — прежнее имя, чтобы уже поставленные виджеты
 *   остались на рабочих столах): во время пары залит акцентом, огромный номер аудитории,
 *   отсчёт, полоска пары; в остальное время — спокойный accent-soft.
 * - «МГУ · Циферблат» (DialWidget): спокойный фон, отсчёт в кольце, которое заполняется по
 *   ходу пары; аудитория и предмет рядом.
 *
 * Размеры — S (2×2), M (4×2), L (4×4, весь день списком), у «Табло» ещё T (4×3: номер
 * аудитории отдельной строкой). Раскладки пишет native-widget/gen-layouts.js, id общие.
 * Текст — системными шрифтами: Onest через fontFamily="@font/…" лаунчер Xiaomi не взял
 * (11 окт 2026, весь текст вышел тонким). Номер аудитории «Табло» — картинка, нарисованная
 * здесь шрифтом Onest (roomBitmap): ImageView вписывает её в свободное место целиком, так
 * что при растягивании виджета номер растёт сам. Кольцо «Циферблата» на Android 12+ тоже
 * растёт с виджетом (setViewLayoutWidth), вместе с отсчётом и номером аудитории.
 *
 * Данные — ключ "widget_data" (src/widgetData.ts), цвета — "widget_theme"
 * (src/widgetThemeModel.ts), читаем базу AsyncStorage (RKStorage) напрямую.
 *
 * Отсчёт — системный Chronometer: setChronometer() один раз сообщает цель, а тикает сам
 * лаунчер, посекундно. НЕ показывать обычный текст, похожий на живой отсчёт («осталось
 * N мин» строкой): он устаревает между обновлениями (v1.9.23: «Через 0 мин» посреди пары).
 * Полоска пары и кольцо обновляются раз в 5 минут, пока идёт пара или ждём её (неточный
 * будильник — батарею не жалко); границы пар и полночь — точный, как раньше.
 */

internal data class LessonItem(
    val start: Long,
    val end: Long,
    val subject: String,
    /** Уже как в приложении: «Лаб. химии», а не «лабхим» (src/widgetData.ts). */
    val room: String,
    /** «II»; пусто у данных до 1.9.47. */
    val pair: String,
    /** «Лекция», «Практика». */
    val type: String,
    val teacher: String,
)

internal class WidgetData(
    val group: String,
    val items: List<LessonItem>,
    /** Вышла ли следующая неделя — без этого «нет пар» ещё не значит «каникулы». */
    val nextWeekPublished: Boolean,
)

/** Набор цветов одного фона — роли считает src/widgetThemeModel.ts. */
internal class Palette(o: JSONObject) {
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
    val tint = c(o, "tint")
    val tintLine = c(o, "tintLine")
    val accentText = c(o, "accentText")

    private fun c(o: JSONObject, key: String): Int = Color.parseColor(o.getString(key))
}

internal class WidgetColors(json: JSONObject) {
    /** system / light / dark / black — как во «Внешнем виде». */
    val background: String = json.optString("background", "system")
    val light = Palette(json.getJSONObject("light"))
    val dark = Palette(json.getJSONObject("dark"))
    val black = Palette(json.getJSONObject("black"))
}

/** Состояния дня (ТЗ 5.1 с решениями владельца Д1–Д4, окт 2026). */
internal sealed class WState {
    class Live(val hero: LessonItem) : WState()
    /** Перемена: сегодня уже была пара и ещё будет — любой промежуток, и обед (Д1). */
    class Break(val hero: LessonItem) : WState()
    /** Утро до первой пары. */
    class Next(val hero: LessonItem) : WState()
    /** Пар больше нет / сегодня нет: герой — первая пара следующего учебного дня. */
    class Later(val hero: LessonItem, val hadToday: Boolean) : WState()
    class Empty(val kind: EmptyKind, val group: String, val firstLesson: LessonItem?) : WState()
}

internal enum class EmptyKind { NOT_LOADED, HOLIDAY, NO_NEXT_WEEK }

internal enum class Kind { TABLO, DIAL }

/** «МГУ · Табло». */
class ScheduleWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) Widgets.updateOne(context, appWidgetManager, id, Kind.TABLO)
    }

    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        Widgets.updateOne(context, appWidgetManager, appWidgetId, Kind.TABLO)
    }

    /**
     * Свой будильник на границе пары (и раз в 5 минут во время пары), перезагрузка телефона
     * и обновление приложения (будильники стираются системой). Обновляем ОБА вида виджетов:
     * будильник один на всех, и приложение шлёт WIDGET_TICK именно сюда (LiveLessonModule).
     */
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            Widgets.ACTION_TICK, Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> Widgets.updateAll(context)
        }
    }

    companion object {
        const val ACTION_TICK = Widgets.ACTION_TICK
    }
}

/** «МГУ · Циферблат». Будильник и общие события — у ScheduleWidget. */
class DialWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) Widgets.updateOne(context, appWidgetManager, id, Kind.DIAL)
    }

    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        Widgets.updateOne(context, appWidgetManager, appWidgetId, Kind.DIAL)
    }
}

internal object Widgets {
    const val ACTION_TICK = "tj.msu.schedule.WIDGET_TICK"

    private const val DAY_MS = 24 * 3_600_000L
    private const val HORIZON_MS = 14 * DAY_MS
    /** Пока идёт пара (или ждём её не дольше 2 ч) — полоска и кольцо раз в 5 минут. */
    private const val TICK_MS = 5 * 60_000L
    private const val WAIT_TICKS_MS = 2 * 3_600_000L
    /** Кольцо в перемену/утром заполняется за последние 20 минут до пары. */
    private const val RING_WAIT_MS = 20 * 60_000L

    private val DAY2 = listOf("Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб")
    private val MONTH_GEN = listOf(
        "января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря",
    )
    private val RU = Locale.forLanguageTag("ru")

    /** Синий по умолчанию — пока приложение не записало widget_theme (вывод widgetTheme(DEFAULT_APPEARANCE)). */
    private const val DEFAULT_THEME = """{"background":"system",
        "light":{"surface":"#FFFFFF","ink":"#10131A","ink2":"#4B5262","ink3":"#686E7D","line":"#DDE2EA","fill":"#2F62EA","onFill":"#FFFFFF","onFill2":"#EAEFFD","fillLine":"#5981EE","soft":"#E5ECFD","onSoft":"#1E46B8","softLine":"#C4D3FA","tint":"#EEF2FD","tintLine":"#CCD8FA","accentText":"#2856D6"},
        "dark":{"surface":"#151821","ink":"#F1F3F7","ink2":"#A8AFBD","ink3":"#848B9B","line":"#2A2F3B","fill":"#2F62EA","onFill":"#FFFFFF","onFill2":"#EAEFFD","fillLine":"#5981EE","soft":"#1C2850","onSoft":"#BFD0FF","softLine":"#1F326C","tint":"#181F35","tintLine":"#1C2B56","accentText":"#8FB0FF"},
        "black":{"surface":"#0E0F12","ink":"#F1F3F7","ink2":"#A8AFBD","ink3":"#828997","line":"#24272F","fill":"#2F62EA","onFill":"#FFFFFF","onFill2":"#EAEFFD","fillLine":"#5981EE","soft":"#16204A","onSoft":"#BFD0FF","softLine":"#1B2C67","tint":"#111625","tintLine":"#162448","accentText":"#8FB0FF"}}"""

    fun updateAll(context: Context) {
        val m = AppWidgetManager.getInstance(context) ?: return
        for (id in m.getAppWidgetIds(ComponentName(context, ScheduleWidget::class.java))) updateOne(context, m, id, Kind.TABLO)
        for (id in m.getAppWidgetIds(ComponentName(context, DialWidget::class.java))) updateOne(context, m, id, Kind.DIAL)
    }

    fun updateOne(context: Context, manager: AppWidgetManager, widgetId: Int, kind: Kind) {
        val options = try { manager.getAppWidgetOptions(widgetId) } catch (_: Exception) { null }
        val data = readData(context)
        val now = System.currentTimeMillis()
        // Сначала состояние, потом счётчик: опоздавший будильник не оставит отсчёт в минусе
        val state = computeState(data, now)
        val colors = readColors(context)
        val night = isNight(context)
        val sizes = widgetSizes(context, options)
        // Одна картинка номера на все размеры: один и тот же Bitmap уходит в лаунчер один раз
        val roomImg = if (kind == Kind.TABLO) heroOf(state)?.let {
            roomBitmap(context, roomLines(it.room).ifEmpty { listOf("—") }.joinToString(" "), sizes.maxOf { s -> s.height })
        } else null
        val views = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && sizes.size > 1) {
            RemoteViews(sizes.associateWith { build(context, kind, it, state, data, colors, night, now, roomImg) })
        } else {
            build(context, kind, sizes.first(), state, data, colors, night, now, roomImg)
        }
        manager.updateAppWidget(widgetId, views)
        scheduleNextUpdate(context, state, now)
    }

    // ── Состояние ────────────────────────────────────────────────────────

    private fun computeState(data: WidgetData?, now: Long): WState {
        if (data == null) return WState.Empty(EmptyKind.NOT_LOADED, "", null)
        val items = data.items
        val today = items.filter { isSameDay(it.start, now) }
        today.firstOrNull { now >= it.start && now < it.end }?.let { return WState.Live(it) }
        val next = today.firstOrNull { it.start > now }
        if (next != null) return if (today.any { it.end <= now }) WState.Break(next) else WState.Next(next)
        val later = items.firstOrNull { it.start > endOfDay(now) }
        if (later != null && later.start - now < HORIZON_MS) return WState.Later(later, today.isNotEmpty())
        // Д4: «Каникулы» — только если следующая неделя уже вышла (или лето)
        val month = cal(now).get(Calendar.MONTH)
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

    // ── Размеры ──────────────────────────────────────────────────────────

    private enum class Sz { S, M, T, L }

    /** 2×2 — уже 220 dp; 4×4 — от 280 dp высоты; 4×3 — от 180; остальное — 4×2. */
    private fun sizeOf(w: Float, h: Float) = when {
        w < 220f -> Sz.S
        h >= 280f -> Sz.L
        h >= 180f -> Sz.T
        else -> Sz.M
    }

    private fun layoutOf(kind: Kind, sz: Sz) = when (kind) {
        Kind.TABLO -> when (sz) {
            Sz.S -> R.layout.widget_tablo_s; Sz.M -> R.layout.widget_tablo_m; Sz.T -> R.layout.widget_tablo_t; Sz.L -> R.layout.widget_tablo_l
        }
        // у «Циферблата» 4×3 — та же раскладка, что 4×2: кольцо растёт само (sizeDial)
        Kind.DIAL -> when (sz) { Sz.S -> R.layout.widget_dial_s; Sz.M, Sz.T -> R.layout.widget_dial_m; Sz.L -> R.layout.widget_dial_l }
    }

    /**
     * Фактические размеры, dp. Android 12+ — все, что сообщил лаунчер (каждому своя
     * раскладка); старые — по ориентации: портрет — MIN_WIDTH × MAX_HEIGHT.
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
        return listOf(SizeF(if (w > 0) w.toFloat() else 280f, if (h > 0) h.toFloat() else 150f))
    }

    // ── Цвета по стилю и состоянию ───────────────────────────────────────

    private class Roles(
        val bg: (Palette) -> Int, val ink: (Palette) -> Int, val ink2: (Palette) -> Int, val past: (Palette) -> Int,
        val chipBg: (Palette) -> Int, val chipInk: (Palette) -> Int, val room: (Palette) -> Int, val line: (Palette) -> Int,
        val bar: (Palette) -> Int, val track: (Palette) -> Int, val listRoom: (Palette) -> Int,
    )

    /** Табло: идёт — заливка акцентом; иначе — accent-soft. Циферблат — всегда спокойный фон. */
    private fun rolesOf(kind: Kind, live: Boolean): Roles = when {
        kind == Kind.TABLO && live -> Roles(
            bg = { it.fill }, ink = { it.onFill }, ink2 = { it.onFill2 }, past = { it.onFill2 },
            chipBg = { it.fillLine }, chipInk = { it.onFill }, room = { it.onFill }, line = { it.fillLine },
            bar = { it.onFill }, track = { it.fillLine }, listRoom = { it.onFill },
        )
        kind == Kind.TABLO -> Roles(
            bg = { it.soft }, ink = { it.ink }, ink2 = { it.ink2 }, past = { it.ink3 },
            chipBg = { it.softLine }, chipInk = { it.onSoft }, room = { it.onSoft }, line = { it.softLine },
            bar = { it.fill }, track = { it.softLine }, listRoom = { it.onSoft },
        )
        else -> Roles(
            bg = { it.surface }, ink = { it.ink }, ink2 = { it.ink2 }, past = { it.ink3 },
            chipBg = { it.soft }, chipInk = { it.accentText }, room = { it.accentText }, line = { it.line },
            bar = { it.fill }, track = { it.line }, listRoom = { it.ink },
        )
    }

    // ── Отрисовка ────────────────────────────────────────────────────────

    private val ROW = intArrayOf(R.id.w_r1, R.id.w_r2, R.id.w_r3, R.id.w_r4)
    private val ROW_LINE = intArrayOf(R.id.w_r1_line, R.id.w_r2_line, R.id.w_r3_line, R.id.w_r4_line)
    private val ROW_TIME = intArrayOf(R.id.w_r1_time, R.id.w_r2_time, R.id.w_r3_time, R.id.w_r4_time)
    private val ROW_PAIR = intArrayOf(R.id.w_r1_pair, R.id.w_r2_pair, R.id.w_r3_pair, R.id.w_r4_pair)
    private val ROW_SUBJ = intArrayOf(R.id.w_r1_subj, R.id.w_r2_subj, R.id.w_r3_subj, R.id.w_r4_subj)
    private val ROW_TYPE = intArrayOf(R.id.w_r1_type, R.id.w_r2_type, R.id.w_r3_type, R.id.w_r4_type)
    private val ROW_ROOM = intArrayOf(R.id.w_r1_room, R.id.w_r2_room, R.id.w_r3_room, R.id.w_r4_room)

    private fun build(
        context: Context, kind: Kind, size: SizeF, state: WState, data: WidgetData?,
        colors: WidgetColors, night: Boolean, now: Long, roomImg: Bitmap?,
    ): RemoteViews {
        val sz = sizeOf(size.width, size.height)
        val v = RemoteViews(context.packageName, layoutOf(kind, sz))
        val p = Painter(v, colors, night)
        v.setOnClickPendingIntent(R.id.w_root, openScheduleIntent(context))

        val hero = heroOf(state)
        if (hero == null || state is WState.Empty) {
            fillEmpty(v, p, state as WState.Empty, kind)
            return v
        }
        v.setViewVisibility(R.id.w_content, View.VISIBLE)
        v.setViewVisibility(R.id.w_empty, View.GONE)

        val live = state is WState.Live
        val later = state is WState.Later
        val r = rolesOf(kind, live)
        p.fill(R.id.w_bg, r.bg)

        // Плашка статуса: «Идёт · I пара», в маленьком — «Идёт · I»
        v.setTextViewText(R.id.w_chip, chipText(state, sz == Sz.S))
        p.fill(R.id.w_chip_bg, r.chipBg)
        p.text(R.id.w_chip, r.chipInk)

        // Отсчёт (Chronometer) или, если пар сегодня больше нет, «Завтра · 08:00»
        if (later) {
            v.setViewVisibility(R.id.w_chrono, View.GONE)
            v.setViewVisibility(R.id.w_when, View.VISIBLE)
            val tomorrow = isTomorrow(hero.start, now)
            if (kind == Kind.DIAL) {
                v.setTextViewText(R.id.w_when, hhmm(hero.start))
                v.setTextViewText(R.id.w_chrono_lbl, if (tomorrow) "завтра" else dayShort(hero.start).lowercase(RU))
                v.setViewVisibility(R.id.w_chrono_lbl, View.VISIBLE)
            } else {
                // В маленьком «Завтра» уже на плашке — рядом только время
                v.setTextViewText(R.id.w_when, if (sz == Sz.S) hhmm(hero.start) else "${if (tomorrow) "Завтра" else dayShort(hero.start)} · ${hhmm(hero.start)}")
                v.setViewVisibility(R.id.w_chrono_lbl, View.GONE)
            }
        } else {
            val target = if (live) hero.end else hero.start
            // Chronometer считает от elapsedRealtime, а не от currentTimeMillis
            v.setChronometer(R.id.w_chrono, SystemClock.elapsedRealtime() + (target - now), null, true)
            v.setChronometerCountDown(R.id.w_chrono, true)
            v.setViewVisibility(R.id.w_chrono, View.VISIBLE)
            v.setViewVisibility(R.id.w_when, View.GONE)
            v.setTextViewText(R.id.w_chrono_lbl, if (live) "до конца" else "до начала")
            v.setViewVisibility(R.id.w_chrono_lbl, View.VISIBLE)
        }
        p.text(R.id.w_chrono, r.ink)
        p.text(R.id.w_when, r.ink)
        p.text(R.id.w_chrono_lbl, r.ink2)

        // Аудитория: несколько — через пробел, нет — «—». У «Табло» — картинка (roomBitmap)
        if (kind == Kind.TABLO) {
            if (roomImg != null) v.setImageViewBitmap(R.id.w_room_img, roomImg)
            p.fill(R.id.w_room_img, r.room)
        } else {
            v.setTextViewText(R.id.w_room, roomLines(hero.room).ifEmpty { listOf("—") }.joinToString(" "))
            p.text(R.id.w_room, r.room)
        }

        // Предмет и строка «время · тип · преподаватель»
        v.setTextViewText(R.id.w_subj, tidySubject(hero.subject))
        p.text(R.id.w_subj, r.ink)
        if (sz != Sz.S) {
            val parts = if (kind == Kind.TABLO) listOf("${hhmm(hero.start)}–${hhmm(hero.end)}", hero.type, hero.teacher)
            else listOf("${hhmm(hero.start)}–${hhmm(hero.end)}", hero.type)
            v.setTextViewText(R.id.w_meta, parts.filter { it.isNotEmpty() }.joinToString(" · "))
            p.text(R.id.w_meta, r.ink2)
            // Низкий 4×2 — строку «время · тип» убираем первой: предмет и цифры важнее
            v.setViewVisibility(R.id.w_meta, if (sz == Sz.M && size.height < 140f) View.GONE else View.VISIBLE)
        }
        if (kind == Kind.DIAL && sz != Sz.S) p.text(R.id.w_room_lbl, r.ink2)

        // Полоска пары (Табло) или кольцо (Циферблат)
        if (kind == Kind.TABLO) {
            val showBar = live && !(sz == Sz.M && size.height < 125f)
            v.setViewVisibility(R.id.w_bar_box, if (showBar) View.VISIBLE else View.GONE)
            if (showBar) {
                v.setInt(R.id.w_bar, "setImageLevel", level(now - hero.start, hero.end - hero.start))
                p.fill(R.id.w_bar_track, r.track)
                p.fill(R.id.w_bar, r.bar)
            }
        } else {
            val lvl = when (state) {
                is WState.Live -> level(now - hero.start, hero.end - hero.start)
                is WState.Break, is WState.Next -> level(RING_WAIT_MS - (hero.start - now), RING_WAIT_MS)
                else -> 0
            }
            v.setInt(R.id.w_ring, "setImageLevel", lvl)
            p.fill(R.id.w_ring_track, r.track)
            p.fill(R.id.w_ring, r.bar)
        }

        val rows = if (sz == Sz.L && data != null) listItems(state, hero, data, now) else emptyList()
        if (sz == Sz.L) fillList(v, p, r, rows, hero, kind)
        if (kind == Kind.DIAL && sz != Sz.S) sizeDial(v, size, sz, rows.size)
        v.setContentDescription(R.id.w_root, describe(state, hero, now))
        return v
    }

    /**
     * «Циферблат» 4×2 / 4×3 / 4×4 на Android 12+: кольцо — по высоте свободного места (но не
     * шире половины виджета), отсчёт и номер аудитории — в пропорции к нему. Иначе в высоком
     * виджете кольцо 128 dp висело посередине пустоты (владелец, 11 окт 2026). Высоты — из
     * раскладки в gen-layouts.js: поля 14 + 14, строка списка ≈ 50 dp, отступ списка 10.
     */
    private fun sizeDial(v: RemoteViews, size: SizeF, sz: Sz, rows: Int) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        val list = if (sz == Sz.L && rows > 0) 10f + rows * 50f else 0f
        val heroH = size.height - (if (sz == Sz.L) 26f else 28f) - list
        val d = minOf(heroH, size.width * 0.46f, 230f).coerceAtLeast(96f)
        val dip = TypedValue.COMPLEX_UNIT_DIP
        v.setViewLayoutWidth(R.id.w_ring_box, d, dip)
        v.setTextViewTextSize(R.id.w_chrono, dip, d * 0.2f)
        v.setTextViewTextSize(R.id.w_when, dip, d * 0.2f)
        v.setTextViewTextSize(R.id.w_chrono_lbl, dip, (d * 0.09f).coerceIn(11f, 16f))
        v.setTextViewTextSize(R.id.w_room, dip, (heroH * 0.3f).coerceIn(32f, 64f))
        v.setTextViewTextSize(R.id.w_subj, dip, if (heroH >= 200f) 20f else 17f)
    }

    /**
     * Номер аудитории картинкой, шрифтом Onest ExtraBold, белым (цвет даёт setColorFilter —
     * так работает и «как в системе» с двумя цветами). Обрезана впритык по высоте цифры «0»
     * (а не по самому тексту: «—» иначе растянулся бы на весь виджет). Размер шрифта — от
     * высоты самого большого размера виджета, не больше 260 px: картинка уходит в лаунчер
     * по Binder, а он не любит больших (≈ 0,35 МБ на «104» — с запасом).
     */
    private fun roomBitmap(context: Context, text: String, maxHeightDp: Float): Bitmap {
        val tf = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.resources.getFont(R.font.onest_extrabold) else null
        } catch (_: Exception) { null } ?: Typeface.DEFAULT_BOLD
        val px = (maxHeightDp * context.resources.displayMetrics.density * 0.8f).coerceIn(96f, 260f)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = tf; textSize = px; color = Color.WHITE }
        val b = Rect().also { paint.getTextBounds(text, 0, text.length, it) }
        val zero = Rect().also { paint.getTextBounds("0", 0, 1, it) }
        val top = min(b.top, zero.top)
        val bottom = maxOf(b.bottom, zero.bottom)
        val pad = (px * 0.03f).toInt() + 1
        val w = (maxOf(b.width(), zero.width()) + pad * 2).coerceAtLeast(1)
        val bmp = Bitmap.createBitmap(w, bottom - top + pad * 2, Bitmap.Config.ARGB_8888)
        Canvas(bmp).drawText(text, (pad - b.left).toFloat(), (pad - top).toFloat(), paint)
        return bmp
    }

    /**
     * «ДВ:Объектно-ориентир.» → «ДВ: Объектно-ориентир.»: без пробела после двоеточия первому
     * слову негде переноситься, и Android рвал его посередине («Объектн / о-…», 11 окт 2026).
     */
    private fun tidySubject(s: String) = s.replace(Regex(":(?=\\S)"), ": ")

    /** Уровень 0…10000 для полоски и кольца. */
    private fun level(done: Long, total: Long): Int =
        if (total <= 0) 0 else ((done.toDouble() / total) * 10_000).toInt().coerceIn(0, 10_000)

    /**
     * Остальные пары того же дня, что герой: прошедшие (бледнее) и будущие, не больше 4 — если
     * больше, отбрасываем самые ранние прошедшие. Других пар в этот день нет — следующий день.
     */
    private fun listItems(state: WState, hero: LessonItem, data: WidgetData, now: Long): List<Pair<LessonItem, Boolean>> {
        val day = data.items.filter { isSameDay(it.start, hero.start) && it != hero }
        var out = day.map { it to (state !is WState.Later && it.end <= now) }
        if (out.size > 4) out = out.drop(out.size - 4)
        if (out.isEmpty()) {
            val nextDayStart = data.items.firstOrNull { it.start > endOfDay(hero.start) }?.start ?: return emptyList()
            out = data.items.filter { isSameDay(it.start, nextDayStart) }.take(4).map { it to false }
        }
        return out
    }

    private fun fillList(v: RemoteViews, p: Painter, r: Roles, items: List<Pair<LessonItem, Boolean>>, hero: LessonItem, kind: Kind) {
        v.setViewVisibility(R.id.w_list, if (items.isEmpty()) View.GONE else View.VISIBLE)
        for (i in ROW.indices) {
            val it = items.getOrNull(i)
            v.setViewVisibility(ROW[i], if (it == null) View.GONE else View.VISIBLE)
            if (it == null) continue
            val (l, past) = it
            val sameDay = isSameDay(l.start, hero.start)
            v.setTextViewText(ROW_TIME[i], hhmm(l.start))
            v.setTextViewText(ROW_PAIR[i], when {
                !sameDay -> "${dayShort(l.start)}${if (l.pair.isNotEmpty()) " · ${l.pair}" else ""}"
                l.pair.isNotEmpty() -> "${l.pair} пара"
                else -> ""
            })
            v.setTextViewText(ROW_SUBJ[i], tidySubject(l.subject))
            v.setTextViewText(ROW_TYPE[i], (if (kind == Kind.DIAL) listOf(l.type, l.teacher) else listOf(l.type)).filter { s -> s.isNotEmpty() }.joinToString(" · "))
            v.setTextViewText(ROW_ROOM[i], roomLines(l.room).firstOrNull() ?: "—")
            p.background(ROW_LINE[i], r.line)
            val ink = if (past) r.past else r.ink
            p.text(ROW_TIME[i], ink)
            p.text(ROW_PAIR[i], if (past) r.past else r.ink2)
            p.text(ROW_SUBJ[i], ink)
            p.text(ROW_TYPE[i], if (past) r.past else r.ink2)
            p.text(ROW_ROOM[i], if (past) r.past else r.listRoom)
        }
    }

    private fun fillEmpty(v: RemoteViews, p: Painter, s: WState.Empty, kind: Kind) {
        v.setViewVisibility(R.id.w_content, View.GONE)
        v.setViewVisibility(R.id.w_empty, View.VISIBLE)
        p.fill(R.id.w_bg) { if (kind == Kind.TABLO) it.tint else it.surface }
        val (title, text) = when (s.kind) {
            EmptyKind.NOT_LOADED -> "Расписание не загружено" to "Нажмите, чтобы обновить"
            EmptyKind.HOLIDAY -> "Каникулы" to (s.firstLesson?.let { "Занятия с ${dateLong(it.start)}" } ?: "")
            EmptyKind.NO_NEXT_WEEK -> "Пар больше нет" to "Следующая неделя ещё не опубликована"
        }
        v.setTextViewText(R.id.w_empty_title, title)
        v.setTextViewText(R.id.w_empty_text, text)
        v.setViewVisibility(R.id.w_empty_text, if (text.isEmpty()) View.GONE else View.VISIBLE)
        p.text(R.id.w_empty_title) { it.ink }
        p.text(R.id.w_empty_text) { it.ink2 }
        v.setContentDescription(R.id.w_root, listOf(title, text).filter { it.isNotEmpty() }.joinToString(". "))
    }

    // ── Тексты ───────────────────────────────────────────────────────────

    private fun chipText(s: WState, short: Boolean): String {
        val hero = heroOf(s)
        val pr = hero?.pair.orEmpty()
        return when (s) {
            is WState.Live -> if (pr.isEmpty()) "Идёт пара" else if (short) "Идёт · $pr" else "Идёт · $pr пара"
            is WState.Break -> if (pr.isEmpty()) "Перемена" else if (short) "Перемена · $pr" else "Перемена · далее $pr"
            is WState.Next -> if (pr.isEmpty()) "Сегодня" else if (short) "Сегодня · $pr" else "Сегодня · $pr пара"
            is WState.Later -> if (short) "Завтра" else if (s.hadToday) "Пар больше нет" else "Сегодня пар нет"
            is WState.Empty -> ""
        }
    }

    /** «704 701» → ["704", "701"]. */
    private fun roomLines(room: String): List<String> = room.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }

    private fun describe(s: WState, hero: LessonItem, now: Long): String {
        val room = if (hero.room.isNotEmpty()) "аудитория ${hero.room}" else "аудитория не указана"
        return when (s) {
            is WState.Live -> "Идёт пара: ${hero.subject}, $room, до ${hhmm(hero.end)}"
            is WState.Later -> {
                val day = if (isTomorrow(hero.start, now)) "Завтра" else dayShort(hero.start)
                "${if (s.hadToday) "Сегодня пар больше нет" else "Сегодня пар нет"}. $day в ${hhmm(hero.start)}: ${hero.subject}, $room"
            }
            else -> "Следующая пара: ${hero.subject}, $room, в ${hhmm(hero.start)}"
        }
    }

    private fun cal(ms: Long) = Calendar.getInstance().apply { timeInMillis = ms }
    private fun hhmm(ms: Long) = cal(ms).let { "%02d:%02d".format(it.get(Calendar.HOUR_OF_DAY), it.get(Calendar.MINUTE)) }
    private fun dayShort(ms: Long) = DAY2[cal(ms).get(Calendar.DAY_OF_WEEK) - 1]
    private fun dateLong(ms: Long) = cal(ms).let { "${it.get(Calendar.DAY_OF_MONTH)} ${MONTH_GEN[it.get(Calendar.MONTH)]}" }

    private fun isTomorrow(at: Long, now: Long): Boolean {
        val d = startOfDay(at) - startOfDay(now)
        return d in 1..(36 * 3_600_000L) // 23–25 ч при переходе на летнее время
    }

    /** Нажатие — приложение на вкладке «Расписание» (ссылка на корень, её разбирает expo-router). */
    private fun openScheduleIntent(context: Context): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("msu-schedule:///"), context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    // ── Цвета ────────────────────────────────────────────────────────────

    private fun readColors(context: Context): WidgetColors =
        try {
            WidgetColors(JSONObject(readValue(context, "widget_theme") ?: DEFAULT_THEME))
        } catch (_: Exception) {
            WidgetColors(JSONObject(DEFAULT_THEME))
        }

    private fun isNight(context: Context): Boolean =
        (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    /**
     * Красит набором своего фона. «Как в системе» на Android 12+ — оба цвета (setColorInt):
     * тема телефона сменилась — виджет перекрасился сам, без нашего обновления.
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
     * Граница пары или полночь — точный будильник (без него MIUI оставлял утреннюю пару до
     * ночи, а отсчёт уходил в минус). Пока идёт пара или ждём её (≤ 2 ч) — ещё и раз в
     * 5 минут неточный, для полоски и кольца. На Android 12+ без разрешения на точный —
     * setWindow с окном в минуту.
     */
    private fun scheduleNextUpdate(context: Context, state: WState, now: Long) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        val pi = PendingIntent.getBroadcast(
            context, 0, Intent(context, ScheduleWidget::class.java).setAction(ACTION_TICK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val boundary = nextBoundary(state, now) + 2_000L // уже после границы, иначе застанем ту же пару
        val ticking = state is WState.Live || state is WState.Break ||
            (state is WState.Next && state.hero.start - now <= WAIT_TICKS_MS)
        val periodic = now + TICK_MS
        try {
            if (ticking && periodic < boundary - 60_000L) {
                am.setWindow(AlarmManager.RTC, periodic, 60_000L, pi)
            } else if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, boundary, pi)
            } else {
                am.setWindow(AlarmManager.RTC_WAKEUP, boundary, 60_000L, pi)
            }
        } catch (_: SecurityException) {
            am.setWindow(AlarmManager.RTC_WAKEUP, boundary, 60_000L, pi)
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
            db.rawQuery("SELECT value FROM catalystLocalStorage WHERE key = ?", arrayOf(key)).use { c ->
                if (c.moveToFirst()) return c.getString(0)
            }
        }
        return null
    }
}

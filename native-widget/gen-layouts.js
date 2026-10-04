// Генератор раскладок виджета «вариант C» (ТЗ widget-C-TZ.md, разделы 2–3).
// Запуск из корня проекта: node native-widget/gen-layouts.js — потом скопировать оба XML в android/ (см. README)
const fs = require('fs');

const W = '#FFFFFF';

function tile(r, side) {
  const pad = side === 'a' ? 'android:paddingEnd="10dp"' : 'android:paddingStart="10dp"';
  return `
                    <LinearLayout
                        android:layout_width="0dp"
                        android:layout_height="match_parent"
                        android:layout_weight="1"
                        ${pad}
                        android:orientation="vertical"
                        android:gravity="center_vertical">

                        <LinearLayout
                            android:layout_width="match_parent"
                            android:layout_height="wrap_content"
                            android:orientation="horizontal"
                            android:gravity="center_vertical">

                            <TextView
                                android:id="@+id/widget_t${r}${side}_time"
                                android:layout_width="wrap_content"
                                android:layout_height="wrap_content"
                                android:textSize="13sp"
                                android:lineHeight="18sp"
                                android:fontFamily="sans-serif"
                                android:textStyle="bold"
                                android:fontFeatureSettings="tnum"
                                android:includeFontPadding="false"
                                android:maxLines="1"
                                android:textColor="${W}" />

                            <LinearLayout
                                android:layout_width="0dp"
                                android:layout_height="1dp"
                                android:layout_weight="1"
                                android:minWidth="6dp" />

                            <TextView
                                android:id="@+id/widget_t${r}${side}_room"
                                android:layout_width="wrap_content"
                                android:layout_height="wrap_content"
                                android:textSize="15sp"
                                android:lineHeight="18sp"
                                android:fontFamily="sans-serif-black"
                                android:fontFeatureSettings="tnum"
                                android:includeFontPadding="false"
                                android:maxLines="1"
                                android:textColor="${W}" />
                        </LinearLayout>

                        <TextView
                            android:id="@+id/widget_t${r}${side}_subj"
                            android:layout_width="match_parent"
                            android:layout_height="wrap_content"
                            android:textSize="12sp"
                            android:lineHeight="16sp"
                            android:fontFamily="sans-serif-medium"
                            android:includeFontPadding="false"
                            android:maxLines="1"
                            android:ellipsize="end"
                            android:textColor="${W}" />
                    </LinearLayout>`;
}

function row(r) {
  const line = r === 1 ? '' : `
                <ImageView
                    android:id="@+id/widget_row${r}_line"
                    android:layout_width="match_parent"
                    android:layout_height="1dp"
                    android:background="${W}"
                    android:importantForAccessibility="no" />
`;
  return `
            <LinearLayout
                android:id="@+id/widget_row${r}"
                android:layout_width="match_parent"
                android:layout_height="44dp"
                android:orientation="vertical"
                android:visibility="gone">
${line}
                <LinearLayout
                    android:layout_width="match_parent"
                    android:layout_height="0dp"
                    android:layout_weight="1"
                    android:orientation="horizontal">
${tile(r, 'a')}

                    <ImageView
                        android:id="@+id/widget_row${r}_vline"
                        android:layout_width="1dp"
                        android:layout_height="match_parent"
                        android:background="${W}"
                        android:importantForAccessibility="no" />
${tile(r, 'b')}
                </LinearLayout>
            </LinearLayout>
`;
}

function layout(full) {
  const s = full
    ? { top: 14, heroMin: 56, heroTop: 6, room: 56, timer: 28, timerLh: 32, day: 20, subj: 17, subjLh: 22, meta: 13, metaLh: 18, emptyTitle: 30, emptyLh: 34 }
    : { top: 12, heroMin: 44, heroTop: 0, room: 44, timer: 22, timerLh: 26, day: 17, subj: 15, subjLh: 19, meta: 12, metaLh: 16, emptyTitle: 17, emptyLh: 22 };
  const status = full ? `
        <!-- 1. Строка статуса: слева статус (заглавные), справа группа -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal">

            <TextView
                android:id="@+id/widget_status"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:textSize="11sp"
                android:lineHeight="14sp"
                android:fontFamily="sans-serif"
                android:textStyle="bold"
                android:letterSpacing="0.06"
                android:includeFontPadding="false"
                android:maxLines="1"
                android:ellipsize="end"
                android:textColor="${W}" />

            <TextView
                android:id="@+id/widget_group"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:layout_marginStart="8dp"
                android:textSize="11sp"
                android:lineHeight="14sp"
                android:fontFamily="sans-serif-medium"
                android:includeFontPadding="false"
                android:maxLines="1"
                android:textColor="${W}" />
        </LinearLayout>
` : '';
  const head = full
    ? `<!-- Виджет «Расписание», вариант C «Аудитория» — ПОЛНАЯ раскладка (H ≥ 245 dp).
     ТЗ widget-C-TZ.md, разделы 2.1 и 3. Сгенерирована скриптом вместе с
     widget_compact.xml — правя одну, правьте и другую (общие id).`
    : `<!-- Виджет «Расписание», вариант C «Аудитория» — КОМПАКТНАЯ (170 ≤ H < 245)
     и МАЛАЯ (H < 170) раскладки. ТЗ widget-C-TZ.md, разделы 2.2 и 3. В малой
     сетку и распорку прячет код, а содержимое встаёт по центру. Сгенерирована
     вместе с widget_full.xml — правя одну, правьте и другую (общие id).`;
  return `<?xml version="1.0" encoding="utf-8"?>
${head}

     Цвета здесь — заглушки: настоящие ставит ScheduleWidget.kt из widget_theme
     (подложка — белая картинка, её красит setColorFilter; линии — setBackgroundColor).
     Крупные цифры — в dp (не растут со шрифтом системы), остальное — в sp.
     Ряды сетки: на Android 12+ высоту каждого ставит код (формула ТЗ 2.3, ≤ 60 dp),
     на старых — 44 dp (наименьший ряд ТЗ). Остаток высоты всегда забирает распорка
     над сеткой (weight), поэтому сетка прижата к нижнему отступу.
     Только классы RemoteViews: простой <View> лаунчер не покажет. -->
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <ImageView
        android:id="@+id/widget_bg"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:scaleType="fitXY"
        android:src="@drawable/widget_bg"
        android:importantForAccessibility="no" />

    <LinearLayout
        android:id="@+id/widget_content"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="vertical"
        android:paddingStart="16dp"
        android:paddingEnd="16dp"
        android:paddingTop="${s.top}dp"
        android:paddingBottom="12dp">
${status}
        <!-- 2. Шапка: слева аудитория, справа блок отсчёта -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="${s.heroTop}dp"
            android:minHeight="${s.heroMin}dp"
            android:orientation="horizontal">

            <TextView
                android:id="@+id/widget_room"
                android:layout_width="wrap_content"
                android:layout_height="match_parent"
                android:gravity="center_vertical"
                android:textSize="${s.room}dp"
                android:fontFamily="sans-serif-black"
                android:fontFeatureSettings="tnum"
                android:letterSpacing="-0.02"
                android:includeFontPadding="false"
                android:maxLines="1"
                android:textColor="${W}" />

            <LinearLayout
                android:layout_width="0dp"
                android:layout_height="1dp"
                android:layout_weight="1"
                android:minWidth="12dp" />

            <LinearLayout
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:layout_marginTop="2dp"
                android:orientation="vertical"
                android:gravity="end">

                <FrameLayout
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content">

                    <!-- Плашка отсчёта в перемену: фон fill, скругление 10 dp -->
                    <ImageView
                        android:id="@+id/widget_plate"
                        android:layout_width="match_parent"
                        android:layout_height="match_parent"
                        android:scaleType="fitXY"
                        android:src="@drawable/widget_plate"
                        android:visibility="gone"
                        android:importantForAccessibility="no" />

                    <LinearLayout
                        android:id="@+id/widget_timer_inner"
                        android:layout_width="wrap_content"
                        android:layout_height="wrap_content"
                        android:orientation="horizontal">

                        <!-- Живой отсчёт: тикает сам лаунчер, см. шапку ScheduleWidget.kt -->
                        <Chronometer
                            android:id="@+id/widget_countdown"
                            android:layout_width="wrap_content"
                            android:layout_height="wrap_content"
                            android:gravity="end"
                            android:textSize="${s.timer}dp"
                            android:lineHeight="${s.timerLh}dp"
                            android:fontFamily="sans-serif"
                            android:textStyle="bold"
                            android:fontFeatureSettings="tnum"
                            android:includeFontPadding="false"
                            android:maxLines="1"
                            android:textColor="${W}"
                            android:visibility="gone" />

                        <!-- «Завтра» / «Пн» вместо отсчёта, когда пар сегодня больше нет -->
                        <TextView
                            android:id="@+id/widget_day"
                            android:layout_width="wrap_content"
                            android:layout_height="wrap_content"
                            android:textSize="${s.day}dp"
                            android:lineHeight="${s.timerLh}dp"
                            android:fontFamily="sans-serif"
                            android:textStyle="bold"
                            android:includeFontPadding="false"
                            android:maxLines="1"
                            android:textColor="${W}"
                            android:visibility="gone" />
                    </LinearLayout>
                </FrameLayout>

                <TextView
                    android:id="@+id/widget_timer_label"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:textSize="11sp"
                    android:lineHeight="14sp"
                    android:fontFamily="sans-serif-medium"
                    android:includeFontPadding="false"
                    android:maxLines="1"
                    android:textColor="${W}" />
            </LinearLayout>
        </LinearLayout>

        <!-- 3. Предмет — ровно как с сервера -->
        <TextView
            android:id="@+id/widget_subject"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="4dp"
            android:textSize="${s.subj}sp"
            android:lineHeight="${s.subjLh}sp"
            android:fontFamily="sans-serif"
            android:textStyle="bold"
            android:includeFontPadding="false"
            android:maxLines="1"
            android:ellipsize="end"
            android:textColor="${W}" />

        <!-- 4. Время · тип · преподаватель -->
        <TextView
            android:id="@+id/widget_meta"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:textSize="${s.meta}sp"
            android:lineHeight="${s.metaLh}sp"
            android:fontFamily="sans-serif-medium"
            android:includeFontPadding="false"
            android:maxLines="1"
            android:ellipsize="end"
            android:textColor="${W}" />

        <!-- 5. Распорка: 10 dp + весь остаток высоты — сетка прижата к нижнему отступу -->
        <LinearLayout
            android:id="@+id/widget_spacer"
            android:layout_width="match_parent"
            android:layout_height="10dp"
            android:layout_weight="1"
            android:orientation="vertical" />

        <!-- 6. Сетка следующих пар: линия 1 dp + до 6 рядов по 2 плитки -->
        <LinearLayout
            android:id="@+id/widget_grid"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"
            android:importantForAccessibility="noHideDescendants">

            <ImageView
                android:id="@+id/widget_grid_line"
                android:layout_width="match_parent"
                android:layout_height="1dp"
                android:background="${W}"
                android:importantForAccessibility="no" />
${[1, 2, 3, 4, 5, 6].map(row).join('')}        </LinearLayout>
    </LinearLayout>

    <!-- Пустые состояния: группа сверху, заголовок и подпись прижаты к низу -->
    <LinearLayout
        android:id="@+id/widget_empty"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="vertical"
        android:paddingStart="16dp"
        android:paddingEnd="16dp"
        android:paddingTop="${s.top}dp"
        android:paddingBottom="12dp"
        android:visibility="gone">

        <TextView
            android:id="@+id/widget_empty_group"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:textSize="11sp"
            android:lineHeight="14sp"
            android:fontFamily="sans-serif"
            android:textStyle="bold"
            android:letterSpacing="0.06"
            android:includeFontPadding="false"
            android:maxLines="1"
            android:textColor="${W}" />

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="0dp"
            android:layout_weight="1"
            android:orientation="vertical" />

        <TextView
            android:id="@+id/widget_empty_title"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:textSize="${s.emptyTitle}sp"
            android:lineHeight="${s.emptyLh}sp"
            android:fontFamily="sans-serif-black"
            android:letterSpacing="-0.01"
            android:includeFontPadding="false"
            android:maxLines="2"
            android:ellipsize="end"
            android:textColor="${W}" />

        <TextView
            android:id="@+id/widget_empty_text"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="2dp"
            android:textSize="13sp"
            android:lineHeight="18sp"
            android:fontFamily="sans-serif-medium"
            android:includeFontPadding="false"
            android:maxLines="1"
            android:ellipsize="end"
            android:textColor="${W}" />
    </LinearLayout>

</FrameLayout>
`;
}

fs.writeFileSync('native-widget/widget_full.xml', layout(true));
fs.writeFileSync('native-widget/widget_compact.xml', layout(false));
console.log('ok');

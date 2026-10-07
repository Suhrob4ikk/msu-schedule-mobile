// Генератор раскладки виджета — карточка «идёт сейчас» (7 окт 2026; до того вариант C, ТЗ widget-C-TZ.md).
// Запуск из корня проекта: node native-widget/gen-layouts.js — потом скопировать widget_full.xml в android/ (см. README)
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

function layout() {
  // Базовые размеры карточки при масштабе 1; настоящие ставит ScheduleWidget.kt
  // (setTextViewTextSize × масштаб под размер виджета, plan()).
  const top = 14;
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Виджет «Расписание» в виде карточки «идёт сейчас» из приложения (решение
     владельца 7 окт 2026, вместо варианта C «Аудитория»): пилюля статуса и
     отсчёт, крупно время начала и аудитория, предмет, «тип · преподаватель»,
     под карточкой — сетка следующих пар, если виджет растянут выше.
     Одна раскладка на все размеры: масштаб считает ScheduleWidget.kt (plan()).
     Сгенерирована скриптом native-widget/gen-layouts.js — руками не править.

     Цвета здесь — заглушки: настоящие ставит ScheduleWidget.kt из widget_theme
     (подложки — белые картинки, их красит setColorFilter; линии — setBackgroundColor).
     Ряды сетки: на Android 12+ высоту каждого ставит код, на старых — 44 dp.
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
        android:paddingTop="${top}dp"
        android:paddingBottom="12dp">

        <!-- 1. Пилюля статуса слева, отсчёт справа -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical">

            <FrameLayout
                android:layout_width="wrap_content"
                android:layout_height="wrap_content">

                <ImageView
                    android:id="@+id/widget_pill_bg"
                    android:layout_width="match_parent"
                    android:layout_height="match_parent"
                    android:scaleType="fitXY"
                    android:src="@drawable/widget_plate"
                    android:importantForAccessibility="no" />

                <TextView
                    android:id="@+id/widget_pill"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:paddingStart="10dp"
                    android:paddingEnd="10dp"
                    android:paddingTop="4dp"
                    android:paddingBottom="4dp"
                    android:textSize="12sp"
                    android:fontFamily="sans-serif"
                    android:textStyle="bold"
                    android:includeFontPadding="false"
                    android:maxLines="1"
                    android:textColor="${W}" />
            </FrameLayout>

            <LinearLayout
                android:layout_width="0dp"
                android:layout_height="1dp"
                android:layout_weight="1"
                android:minWidth="8dp" />

            <!-- «до конца» мелко + живой отсчёт крупно: тикает сам лаунчер (Chronometer) -->
            <LinearLayout
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:baselineAligned="true">

                <TextView
                    android:id="@+id/widget_timer_label"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:textSize="13sp"
                    android:fontFamily="sans-serif-medium"
                    android:includeFontPadding="false"
                    android:maxLines="1"
                    android:textColor="${W}" />

                <Chronometer
                    android:id="@+id/widget_countdown"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:layout_marginStart="6dp"
                    android:gravity="end"
                    android:textSize="24dp"
                    android:fontFamily="sans-serif"
                    android:textStyle="bold"
                    android:fontFeatureSettings="tnum"
                    android:includeFontPadding="false"
                    android:maxLines="1"
                    android:textColor="${W}" />
            </LinearLayout>
        </LinearLayout>

        <!-- 2. Слева время начала и «до 13:00», справа «АУДИТОРИЯ» и номер -->
        <LinearLayout
            android:id="@+id/widget_hero"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="8dp"
            android:orientation="horizontal"
            android:gravity="bottom">

            <LinearLayout
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:orientation="vertical">

                <TextView
                    android:id="@+id/widget_time"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:textSize="42dp"
                    android:fontFamily="sans-serif"
                    android:textStyle="bold"
                    android:fontFeatureSettings="tnum"
                    android:letterSpacing="-0.02"
                    android:includeFontPadding="false"
                    android:maxLines="1"
                    android:textColor="${W}" />

                <TextView
                    android:id="@+id/widget_until"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:layout_marginTop="2dp"
                    android:textSize="14sp"
                    android:fontFamily="sans-serif-medium"
                    android:includeFontPadding="false"
                    android:maxLines="1"
                    android:textColor="${W}" />
            </LinearLayout>

            <LinearLayout
                android:layout_width="0dp"
                android:layout_height="1dp"
                android:layout_weight="1"
                android:minWidth="12dp" />

            <LinearLayout
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:orientation="vertical"
                android:gravity="end">

                <TextView
                    android:id="@+id/widget_room_label"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:textSize="10sp"
                    android:fontFamily="sans-serif"
                    android:textStyle="bold"
                    android:letterSpacing="0.1"
                    android:includeFontPadding="false"
                    android:maxLines="1"
                    android:textColor="${W}" />

                <TextView
                    android:id="@+id/widget_room"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:layout_marginTop="2dp"
                    android:gravity="end"
                    android:textSize="42dp"
                    android:fontFamily="sans-serif-black"
                    android:fontFeatureSettings="tnum"
                    android:letterSpacing="-0.02"
                    android:includeFontPadding="false"
                    android:maxLines="2"
                    android:textColor="${W}" />
            </LinearLayout>
        </LinearLayout>

        <!-- 3. Предмет — ровно как с сервера -->
        <TextView
            android:id="@+id/widget_subject"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="6dp"
            android:textSize="17sp"
            android:fontFamily="sans-serif"
            android:textStyle="bold"
            android:includeFontPadding="false"
            android:maxLines="1"
            android:ellipsize="end"
            android:textColor="${W}" />

        <!-- 4. Тип · преподаватель -->
        <TextView
            android:id="@+id/widget_meta"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:layout_marginTop="4dp"
            android:textSize="13sp"
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
        android:paddingTop="${top}dp"
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
            android:textSize="30sp"
            android:lineHeight="34sp"
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

fs.writeFileSync('native-widget/widget_full.xml', layout());
console.log('ok');

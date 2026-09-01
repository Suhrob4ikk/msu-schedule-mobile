# Нативный код Android

Здесь лежит нативный код, который **не** помещается в `modules/` — то есть тот,
что должен жить внутри самого приложения. Папка `android/` в `.gitignore`
(генерируется `expo prebuild`), поэтому исходники хранятся тут.

## Виджет «Следующая пара»

Если `android/` пересоздавался — скопируй файлы обратно:

- `ScheduleWidget.kt`      → `android/app/src/main/java/tj/msu/schedule/`
- `widget_schedule.xml`, `widget_schedule_large.xml` → `android/app/src/main/res/layout/`
- `widget_bg.xml`          → `android/app/src/main/res/drawable/`
- `schedule_widget_info.xml` → `android/app/src/main/res/xml/`

И добавь в AndroidManifest.xml перед `</application>`:

    <receiver android:name=".ScheduleWidget" android:exported="false" android:label="@string/app_name">
      <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE"/>
      </intent-filter>
      <meta-data android:name="android.appwidget.provider" android:resource="@xml/schedule_widget_info"/>
    </receiver>

Данные виджету пишет `src/widgetData.ts` (AsyncStorage, ключ `widget_data`).

## Строка «идёт пара» — в modules/, копировать не нужно

Постоянное уведомление с текущей парой живёт в `modules/live-lesson/` как
локальный Expo-модуль. Его подхватывает автолинковка (`useExpoModules()` в
`settings.gradle`), а манифест библиотеки склеивается с манифестом приложения
сам — поэтому **`expo prebuild` его не стирает** и копировать ничего не надо.
Виджет когда-нибудь стоит перенести туда же по этой же причине.

Читает тот же ключ `widget_data`, что и виджет: расписание уже лежит в
AsyncStorage, значит уведомление собирается и когда приложение не запущено.
Подробности — в шапке `modules/live-lesson/android/.../LiveLesson.kt`.

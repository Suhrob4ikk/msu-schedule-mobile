# Нативный код Android

Здесь лежит нативный код, который **не** помещается в `modules/` — то есть тот,
что должен жить внутри самого приложения. Папка `android/` в `.gitignore`
(генерируется `expo prebuild`), поэтому исходники хранятся тут.

## Виджет «Расписание» (карточка «идёт сейчас», с 2.0.3; до того вариант C «Аудитория»)

Если `android/` пересоздавался или файлы здесь правились — скопируй в `android/app/src/main/`:

| Файл здесь | Куда |
|---|---|
| `ScheduleWidget.kt` | `java/tj/msu/schedule/` |
| `widget_full.xml`, `widget_preview.xml` | `res/layout/` |
| `widget_bg.xml`, `widget_plate.xml` | `res/drawable/` |
| `widget_bg_v31.xml` | `res/drawable-v31/` **под именем `widget_bg.xml`** |
| `widget_preview.png` | `res/drawable-nodpi/` |
| `schedule_widget_info.xml` | `res/xml/` |

`widget_full.xml` не правится руками — его пишет `node native-widget/gen-layouts.js`.
`gen-layouts.js` в `android/` не копируется. С 2.0.3 раскладка одна: `widget_compact.xml`
удалён (если остался в `android/res/layout/` — удалить).

Удалены в 1.9.48 (если остались в `android/` — удалить, иначе висят мёртвым грузом):
`res/layout/widget_schedule.xml`, `res/layout/widget_schedule_large.xml`,
`res/drawable/widget_card_bg.xml`, `res/drawable/widget_pill.xml`.

И добавь в AndroidManifest.xml перед `</application>`:

    <receiver android:name=".ScheduleWidget" android:exported="false" android:label="@string/app_name">
      <intent-filter>
        <action android:name="android.appwidget.action.APPWIDGET_UPDATE"/>
        <action android:name="tj.msu.schedule.WIDGET_TICK"/>
        <action android:name="android.intent.action.BOOT_COMPLETED"/>
        <action android:name="android.intent.action.MY_PACKAGE_REPLACED"/>
      </intent-filter>
      <meta-data android:name="android.appwidget.provider" android:resource="@xml/schedule_widget_info"/>
    </receiver>

⚠️ Три последних действия обязательны, без них виджет отстаёт на часы.
`WIDGET_TICK` — собственный будильник виджета на границе пары: сам по себе
`updatePeriodMillis` даёт лишь обновление раз в 30 минут, а MIUI режет и его.
`BOOT_COMPLETED` и `MY_PACKAGE_REPLACED` нужны потому, что после перезагрузки
и обновления приложения система стирает все будильники, и их надо ставить
заново. Разрешение `RECEIVE_BOOT_COMPLETED` отдельно добавлять не нужно —
его объявляет модуль `modules/live-lesson`, и при сборке оно попадает в общий
манифест.

Данные виджету пишет `src/widgetData.ts` (AsyncStorage, ключ `widget_data`),
цвета — `src/widgetTheme.ts` (ключ `widget_theme`, см. раздел «Виджет» в CLAUDE.md).

⚠️ Правя файлы здесь, копируйте их в `android/` — в APK попадает только та копия.
До 1.9.47 `ScheduleWidget.kt` в `android/` отставал от этой папки на месяц.

## Push-уведомления (Firebase/FCM)

Исходник `google-services.json` лежит в корне репозитория и указан в
`app.json` (`expo.android.googleServicesFile`) — при обычном `expo prebuild`
Expo сам скопирует его в `android/app/` и подключит плагин. Но раз `android/`
здесь персистентная, а не всегда пересоздаётся, если она всё же пересоздалась
вручную — проверь и при необходимости добавь заново:

- Скопировать `google-services.json` из корня в `android/app/`
- В `android/build.gradle` (buildscript → dependencies):
  `classpath('com.google.gms:google-services:4.4.2')`
- В `android/app/build.gradle` (в самом верху, рядом с другими `apply plugin`):
  `apply plugin: "com.google.gms.google-services"`

Без этого `Notifications.getExpoPushTokenAsync()` на Android будет падать —
не критично для остального приложения (см. `src/pushToken.ts`), но push
работать не будет.

## Строка «идёт пара» — в modules/, копировать не нужно

Постоянное уведомление с текущей парой живёт в `modules/live-lesson/` как
локальный Expo-модуль. Его подхватывает автолинковка (`useExpoModules()` в
`settings.gradle`), а манифест библиотеки склеивается с манифестом приложения
сам — поэтому **`expo prebuild` его не стирает** и копировать ничего не надо.
Виджет когда-нибудь стоит перенести туда же по этой же причине.

Читает тот же ключ `widget_data`, что и виджет: расписание уже лежит в
AsyncStorage, значит уведомление собирается и когда приложение не запущено.
Подробности — в шапке `modules/live-lesson/android/.../LiveLesson.kt`.

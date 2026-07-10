# Нативный виджет «Следующая пара»

Папка `android/` в .gitignore (генерируется `expo prebuild`), поэтому исходники
виджета хранятся здесь. Если android/ пересоздавался — скопируй файлы обратно:

- `ScheduleWidget.kt`      → `android/app/src/main/java/tj/msu/schedule/`
- `widget_schedule.xml`    → `android/app/src/main/res/layout/`
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

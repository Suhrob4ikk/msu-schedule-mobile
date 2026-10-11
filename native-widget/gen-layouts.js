// Генератор раскладок виджетов (с 2.0.5): «Табло» и «Циферблат», по три размера — S (2×2),
// M (4×2), L (4×4). Запуск: node native-widget/gen-layouts.js → widget_{tablo,dial}_{s,m,l}.xml.
// Руками XML не правится. Общие id у всех шести — ScheduleWidget.kt заполняет их одинаково.
//
// Правила, на которые уже наступали:
// - только классы RemoteViews (FrameLayout, LinearLayout, TextView, ImageView, Chronometer):
//   простой <View> лаунчер не покажет («Не удалось загрузить виджет»), линии — FrameLayout;
// - шрифт — Onest из res/font (fontFamily): Android 8+ берёт его из ресурсов приложения;
// - номер аудитории — autoSize: заполняет свободное место сам, поэтому при растягивании
//   виджета нет пустой полосы (владелец 11 окт 2026 — на Xiaomi внизу пустовало); textSize
//   рядом — запасной для Android 7, где autoSize нет;
// - подложки и плашки — белые картинки, цвет ставит код (setColorFilter);
// - значения по умолчанию (тексты, цвета) — для предпросмотра в списке виджетов.
const fs = require('fs');
const path = require('path');

const NS = 'xmlns:android="http://schemas.android.com/apk/res/android"';
const F = { m: '@font/onest_medium', b: '@font/onest_bold', x: '@font/onest_extrabold' };

function tv(id, { size, font = 'b', color = '#FFFFFF', text = '', extra = '', w = 'wrap_content', h = 'wrap_content' }) {
  return `<TextView android:id="@+id/${id}" android:layout_width="${w}" android:layout_height="${h}"
    android:textSize="${size}dp" android:fontFamily="${F[font]}" android:textColor="${color}"
    android:includeFontPadding="false" android:singleLine="true" android:ellipsize="end"
    android:text="${text}" ${extra} />`;
}

const bg = tint => `<ImageView android:id="@+id/w_bg" android:layout_width="match_parent" android:layout_height="match_parent"
    android:scaleType="fitXY" android:src="@drawable/widget_bg" android:tint="${tint}" android:importantForAccessibility="no" />`;

const chip = (size, tint, color, text) => `<FrameLayout android:layout_width="wrap_content" android:layout_height="wrap_content">
    <ImageView android:id="@+id/w_chip_bg" android:layout_width="match_parent" android:layout_height="match_parent"
        android:scaleType="fitXY" android:src="@drawable/widget_plate" android:tint="${tint}" android:importantForAccessibility="no" />
    ${tv('w_chip', { size, color, text, extra: 'android:paddingStart="10dp" android:paddingEnd="10dp" android:paddingTop="5dp" android:paddingBottom="5dp"' })}
  </FrameLayout>`;

const chrono = (size, color, extra = '') => `<Chronometer android:id="@+id/w_chrono" android:layout_width="wrap_content" android:layout_height="wrap_content"
    android:textSize="${size}dp" android:fontFamily="${F.x}" android:textColor="${color}" android:includeFontPadding="false"
    android:singleLine="true" android:letterSpacing="-0.03" ${extra} />`;

/** Номер аудитории: autoSize в заданной коробке. */
const room = (min, max, fallback, color, gravity, w, h, extra = '') => `<TextView android:id="@+id/w_room" android:layout_width="${w}" android:layout_height="${h}"
    android:fontFamily="${F.x}" android:textColor="${color}" android:includeFontPadding="false" android:maxLines="1"
    android:letterSpacing="-0.04" android:gravity="${gravity}" android:text="104"
    android:textSize="${fallback}dp" android:autoSizeTextType="uniform" android:autoSizeMinTextSize="${min}dp"
    android:autoSizeMaxTextSize="${max}dp" android:autoSizeStepGranularity="2dp" ${extra} />`;

/** Полоска пары: дорожка и заполнение (уровень). */
const bar = (marginTop, track, fill) => `<FrameLayout android:id="@+id/w_bar_box" android:layout_width="match_parent" android:layout_height="5dp" android:layout_marginTop="${marginTop}dp">
    <ImageView android:id="@+id/w_bar_track" android:layout_width="match_parent" android:layout_height="match_parent"
        android:scaleType="fitXY" android:src="@drawable/widget_bar" android:tint="${track}" android:importantForAccessibility="no" />
    <ImageView android:id="@+id/w_bar" android:layout_width="match_parent" android:layout_height="match_parent"
        android:scaleType="fitXY" android:src="@drawable/widget_bar_fill" android:tint="${fill}" android:importantForAccessibility="no" />
  </FrameLayout>`;

/** Кольцо «Циферблата» с отсчётом в центре. */
const ring = (w, h, chronoSize, lblSize, extra = '') => `<FrameLayout android:layout_width="${w}" android:layout_height="${h}" ${extra}>
    <ImageView android:id="@+id/w_ring_track" android:layout_width="match_parent" android:layout_height="match_parent"
        android:scaleType="fitCenter" android:src="@drawable/widget_ring_track" android:tint="#E7E9F0" android:importantForAccessibility="no" />
    <ImageView android:id="@+id/w_ring" android:layout_width="match_parent" android:layout_height="match_parent"
        android:scaleType="fitCenter" android:src="@drawable/widget_ring" android:tint="#2F62EA" android:importantForAccessibility="no" />
    <LinearLayout android:layout_width="wrap_content" android:layout_height="wrap_content" android:layout_gravity="center"
        android:orientation="vertical" android:gravity="center_horizontal">
      ${chrono(chronoSize, '#121521')}
      ${tv('w_when', { size: chronoSize, font: 'x', color: '#121521', text: '08:00', extra: 'android:visibility="gone"' })}
      ${tv('w_chrono_lbl', { size: lblSize, font: 'b', color: '#6A7186', text: 'до конца', extra: 'android:layout_marginTop="3dp"' })}
    </LinearLayout>
  </FrameLayout>`;

const empty = `<LinearLayout android:id="@+id/w_empty" android:layout_width="match_parent" android:layout_height="match_parent"
    android:orientation="vertical" android:gravity="center" android:padding="16dp" android:visibility="gone">
    <TextView android:id="@+id/w_empty_title" android:layout_width="wrap_content" android:layout_height="wrap_content"
        android:textSize="22dp" android:fontFamily="${F.x}" android:textColor="#10131A" android:gravity="center"
        android:includeFontPadding="false" android:text="Каникулы" />
    <TextView android:id="@+id/w_empty_text" android:layout_width="wrap_content" android:layout_height="wrap_content"
        android:layout_marginTop="6dp" android:textSize="13dp" android:fontFamily="${F.m}" android:textColor="#4B5262"
        android:gravity="center" android:includeFontPadding="false" android:text="" />
  </LinearLayout>`;

/** Список остальных пар (только L): 4 строки — время и номер пары, предмет и тип, аудитория. */
function list(ink, ink2, line, roomColor) {
  let out = '<LinearLayout android:id="@+id/w_list" android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="vertical" android:layout_marginTop="10dp">';
  for (let i = 1; i <= 4; i++) {
    out += `
    <LinearLayout android:id="@+id/w_r${i}" android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="vertical">
      <FrameLayout android:id="@+id/w_r${i}_line" android:layout_width="match_parent" android:layout_height="1dp" android:background="${line}" />
      <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal"
          android:gravity="center_vertical" android:paddingTop="7dp" android:paddingBottom="7dp">
        <LinearLayout android:layout_width="62dp" android:layout_height="wrap_content" android:orientation="vertical">
          ${tv(`w_r${i}_time`, { size: 19, font: 'x', color: ink, text: '09:45' })}
          ${tv(`w_r${i}_pair`, { size: 11, font: 'b', color: ink2, text: 'II пара', extra: 'android:layout_marginTop="2dp"' })}
        </LinearLayout>
        <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:orientation="vertical">
          ${tv(`w_r${i}_subj`, { size: 15, font: 'b', color: ink, text: 'Численные методы', w: 'match_parent' })}
          ${tv(`w_r${i}_type`, { size: 12, font: 'm', color: ink2, text: 'Лекция', w: 'match_parent', extra: 'android:layout_marginTop="2dp"' })}
        </LinearLayout>
        ${tv(`w_r${i}_room`, { size: 22, font: 'x', color: roomColor, text: '602', extra: 'android:layout_marginStart="8dp" android:letterSpacing="-0.03"' })}
      </LinearLayout>
    </LinearLayout>`;
  }
  return out + '\n  </LinearLayout>';
}

const root = inner => `<?xml version="1.0" encoding="utf-8"?>
<!-- Сгенерировано native-widget/gen-layouts.js — руками не править. -->
<FrameLayout ${NS} android:id="@+id/w_root" android:layout_width="match_parent" android:layout_height="match_parent">
  ${inner}
</FrameLayout>
`;

// ── «Табло»: во время пары — заливка акцентом, огромный номер аудитории ──
const T = { bg: '#2F62EA', ink: '#FFFFFF', ink2: '#EAEFFD', line: '#5981EE' };

const tabloS = root(`${bg(T.bg)}
  <LinearLayout android:id="@+id/w_content" android:layout_width="match_parent" android:layout_height="match_parent"
      android:orientation="vertical" android:paddingStart="14dp" android:paddingEnd="14dp" android:paddingTop="13dp" android:paddingBottom="13dp">
    ${chip(12, T.line, T.ink, 'Идёт · I')}
    ${room(28, 84, 56, T.ink, 'start|center_vertical', 'match_parent', '0dp', 'android:layout_weight="1"')}
    ${tv('w_subj', { size: 14, font: 'b', color: T.ink, text: 'Объектно-ориентированное программирование', w: 'match_parent' })}
    <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal"
        android:gravity="center_vertical" android:layout_marginTop="5dp">
      ${chrono(14, T.ink)}
      ${tv('w_when', { size: 14, font: 'x', color: T.ink, text: 'Завтра · 08:00', extra: 'android:visibility="gone"' })}
      ${tv('w_chrono_lbl', { size: 12, font: 'b', color: T.ink2, text: 'до конца', w: '0dp', extra: 'android:layout_weight="1" android:gravity="end" android:layout_marginStart="6dp"' })}
    </LinearLayout>
    ${bar(6, T.line, T.ink)}
  </LinearLayout>
  ${empty}`);

const tabloHero = `<LinearLayout android:id="@+id/w_hero" android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" android:orientation="horizontal">
      <LinearLayout android:layout_width="0dp" android:layout_height="match_parent" android:layout_weight="1.15" android:orientation="vertical">
        ${chip(13, T.line, T.ink, 'Идёт · I пара')}
        ${chrono(40, T.ink, 'android:layout_marginTop="9dp"')}
        ${tv('w_when', { size: 24, font: 'x', color: T.ink, text: 'Завтра · 08:00', extra: 'android:layout_marginTop="12dp" android:visibility="gone"' })}
        ${tv('w_chrono_lbl', { size: 13, font: 'm', color: T.ink2, text: 'до конца', extra: 'android:layout_marginTop="4dp"' })}
      </LinearLayout>
      ${room(32, 120, 72, T.ink, 'end|bottom', '0dp', 'match_parent', 'android:layout_weight="1"')}
    </LinearLayout>
    ${tv('w_subj', { size: 17, font: 'x', color: T.ink, text: 'Объектно-ориентированное программирование', w: 'match_parent', extra: 'android:layout_marginTop="8dp"' })}
    ${tv('w_meta', { size: 13, font: 'm', color: T.ink2, text: '08:00–09:30 · Практика · Одилзода О.О.', w: 'match_parent', extra: 'android:layout_marginTop="3dp"' })}
    ${bar(9, T.line, T.ink)}`;

const tabloM = root(`${bg(T.bg)}
  <LinearLayout android:id="@+id/w_content" android:layout_width="match_parent" android:layout_height="match_parent"
      android:orientation="vertical" android:paddingStart="18dp" android:paddingEnd="18dp" android:paddingTop="15dp" android:paddingBottom="14dp">
    ${tabloHero}
  </LinearLayout>
  ${empty}`);

const tabloL = root(`${bg(T.bg)}
  <LinearLayout android:id="@+id/w_content" android:layout_width="match_parent" android:layout_height="match_parent"
      android:orientation="vertical" android:paddingStart="18dp" android:paddingEnd="18dp" android:paddingTop="15dp" android:paddingBottom="12dp">
    ${tabloHero}
    ${list(T.ink, T.ink2, T.line, T.ink)}
  </LinearLayout>
  ${empty}`);

// ── «Циферблат»: спокойный фон, отсчёт в кольце ──
const D = { bg: '#FFFFFF', ink: '#121521', ink2: '#6A7186', line: '#E7E9F0', acc: '#2856D6', soft: '#E5ECFD' };

const dialS = root(`${bg(D.bg)}
  <LinearLayout android:id="@+id/w_content" android:layout_width="match_parent" android:layout_height="match_parent"
      android:orientation="vertical" android:gravity="center_horizontal" android:padding="12dp">
    ${ring('match_parent', '0dp', 22, 11, 'android:layout_weight="1"')}
    <LinearLayout android:layout_width="wrap_content" android:layout_height="wrap_content" android:orientation="horizontal"
        android:gravity="center_vertical" android:layout_marginTop="6dp">
      ${tv('w_subj', { size: 13, font: 'b', color: D.ink, text: 'ООП', extra: 'android:maxWidth="110dp"' })}
      ${tv('w_room', { size: 17, font: 'x', color: D.acc, text: '104', extra: 'android:layout_marginStart="6dp"' })}
    </LinearLayout>
  </LinearLayout>
  ${empty}`);

const dialHero = (ringSize, chronoSize) => `<LinearLayout android:id="@+id/w_hero" android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1"
      android:orientation="horizontal" android:gravity="center_vertical">
      ${ring(`${ringSize}dp`, 'match_parent', chronoSize, 12)}
      <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:orientation="vertical"
          android:layout_marginStart="14dp">
        ${chip(13, D.soft, D.acc, 'Идёт · I пара')}
        <TextView android:id="@+id/w_subj" android:layout_width="match_parent" android:layout_height="wrap_content"
            android:layout_marginTop="7dp" android:textSize="17dp" android:fontFamily="${F.x}" android:textColor="${D.ink}"
            android:includeFontPadding="false" android:maxLines="2" android:ellipsize="end" android:lineSpacingExtra="1dp"
            android:text="Объектно-ориентированное программирование" />
        ${tv('w_meta', { size: 13, font: 'm', color: D.ink2, text: '08:00–09:30 · Практика', w: 'match_parent', extra: 'android:layout_marginTop="5dp"' })}
        <LinearLayout android:layout_width="wrap_content" android:layout_height="wrap_content" android:orientation="horizontal"
            android:gravity="center_vertical" android:layout_marginTop="6dp">
          ${tv('w_room_lbl', { size: 11, font: 'x', color: D.ink2, text: 'АУД.', extra: 'android:letterSpacing="0.12"' })}
          ${tv('w_room', { size: 34, font: 'x', color: D.acc, text: '104', extra: 'android:layout_marginStart="8dp" android:letterSpacing="-0.04"' })}
        </LinearLayout>
      </LinearLayout>
    </LinearLayout>`;

const dialM = root(`${bg(D.bg)}
  <LinearLayout android:id="@+id/w_content" android:layout_width="match_parent" android:layout_height="match_parent"
      android:orientation="vertical" android:padding="14dp">
    ${dialHero(128, 26)}
  </LinearLayout>
  ${empty}`);

const dialL = root(`${bg(D.bg)}
  <LinearLayout android:id="@+id/w_content" android:layout_width="match_parent" android:layout_height="match_parent"
      android:orientation="vertical" android:paddingStart="16dp" android:paddingEnd="16dp" android:paddingTop="14dp" android:paddingBottom="12dp">
    ${dialHero(136, 28)}
    ${list(D.ink, D.ink2, D.line, D.ink)}
  </LinearLayout>
  ${empty}`);

const out = { widget_tablo_s: tabloS, widget_tablo_m: tabloM, widget_tablo_l: tabloL, widget_dial_s: dialS, widget_dial_m: dialM, widget_dial_l: dialL };
for (const [name, xml] of Object.entries(out)) fs.writeFileSync(path.join(__dirname, `${name}.xml`), xml);
console.log('ok:', Object.keys(out).join(', '));

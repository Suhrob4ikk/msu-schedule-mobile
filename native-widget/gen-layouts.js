// Генератор раскладок виджетов: «Плитки» (с 2.0.7, вместо «Табло») — widget_tiles_{s,n,w}.xml,
// «Циферблат» (с 2.0.5) — widget_dial_{s,m,l}.xml. Запуск: node native-widget/gen-layouts.js.
// Руками XML не правится.
//
// Правила, на которые уже наступали:
// - только классы RemoteViews (FrameLayout, LinearLayout, TextView, ImageView, Chronometer):
//   простой <View> лаунчер не покажет («Не удалось загрузить виджет»), линии — FrameLayout;
// - шрифты — системные (sans-serif-medium / sans-serif + bold / sans-serif-black). Onest через
//   fontFamily="@font/…" лаунчер Xiaomi молча не взял (11 окт 2026): весь текст вышел тонким
//   системным. Onest остался только у номера аудитории «Табло» — его рисует код картинкой
//   (w_room_img, roomBitmap в ScheduleWidget.kt), картинка растягивается на всё свободное место;
// - «Табло» 4×3 и 4×4 — номер отдельной строкой во всю ширину (widget_tablo_t, _l), в низком
//   4×2 — справа от отсчёта (владелец 11 окт 2026: в высоких размерах пустовало);
// - подложки и плашки — белые картинки, цвет ставит код (setColorFilter);
// - значения по умолчанию (тексты, цвета) — для предпросмотра в списке виджетов.
const fs = require('fs');
const path = require('path');

const NS = 'xmlns:android="http://schemas.android.com/apk/res/android"';
/** Начертания: системные семейства — они работают в любом лаунчере. */
const F = {
  m: 'android:fontFamily="sans-serif-medium"',
  b: 'android:fontFamily="sans-serif" android:textStyle="bold"',
  x: 'android:fontFamily="sans-serif-black"',
};

function tv(id, { size, font = 'b', color = '#FFFFFF', text = '', extra = '', w = 'wrap_content', h = 'wrap_content' }) {
  return `<TextView android:id="@+id/${id}" android:layout_width="${w}" android:layout_height="${h}"
    android:textSize="${size}dp" ${F[font]} android:textColor="${color}"
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
    android:textSize="${size}dp" ${F.x} android:textColor="${color}" android:includeFontPadding="false"
    android:singleLine="true" android:letterSpacing="-0.02" ${extra} />`;

/** Номер аудитории «Табло» — картинка Onest (её рисует код), вписывается в коробку целиком. */
const roomImg = (scale, w, h, extra = '') => `<ImageView android:id="@+id/w_room_img" android:layout_width="${w}" android:layout_height="${h}"
    android:scaleType="${scale}" android:src="@drawable/widget_room_sample" android:tint="#FFFFFF" android:importantForAccessibility="no" ${extra} />`;

/** Полоска пары: дорожка и заполнение (уровень). */
const bar = (marginTop, track, fill) => `<FrameLayout android:id="@+id/w_bar_box" android:layout_width="match_parent" android:layout_height="5dp" android:layout_marginTop="${marginTop}dp">
    <ImageView android:id="@+id/w_bar_track" android:layout_width="match_parent" android:layout_height="match_parent"
        android:scaleType="fitXY" android:src="@drawable/widget_bar" android:tint="${track}" android:importantForAccessibility="no" />
    <ImageView android:id="@+id/w_bar" android:layout_width="match_parent" android:layout_height="match_parent"
        android:scaleType="fitXY" android:src="@drawable/widget_bar_fill" android:tint="${fill}" android:importantForAccessibility="no" />
  </FrameLayout>`;

/** Кольцо «Циферблата» с отсчётом в центре. */
const ring = (w, h, chronoSize, lblSize, extra = '') => `<FrameLayout android:id="@+id/w_ring_box" android:layout_width="${w}" android:layout_height="${h}" ${extra}>
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
        android:textSize="22dp" ${F.x} android:textColor="#10131A" android:gravity="center"
        android:includeFontPadding="false" android:text="Каникулы" />
    <TextView android:id="@+id/w_empty_text" android:layout_width="wrap_content" android:layout_height="wrap_content"
        android:layout_marginTop="6dp" android:textSize="13dp" ${F.m} android:textColor="#4B5262"
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

// ── «Плитки» (с 2.0.7; макет — docs/Виджеты - варианты 3.html в репозитории сайта, выбор владельца 8 ноя 2026) ──
// Вместо «Табло»: класс ScheduleWidget прежний, поэтому уже поставленные виджеты сменят вид сами.
// Сверху: день и отсчёт (единственный). Главная плитка — следующая или идущая пара, залита акцентом:
// номер аудитории крупно (картинка Onest, roomBitmap), пара, время, предмет. Остальные плитки — пары дня
// (из прошедших — только одна, бледно): номер пары, время, номер аудитории (autoSize ужимает «Лаб. физики»,
// «Стадион»), в высоком — предмет. Всё на весах LinearLayout — плитки сами занимают весь виджет.
// Раскладки: s (уже 220 dp — одна главная плитка), n (уже 280 dp — главная слева, две справа),
// w (шире — главная сверху во всю ширину, до четырёх плиток снизу).
const TL = { bg: '#FFFFFF', ink: '#10131A', ink2: '#4B5262', ink3: '#9AA0AD', acc: '#2856D6', fill: '#2F62EA', line: '#E7EBF2', on: '#FFFFFF', on2: '#EAEFFD' };

const tlDot = (id, size, tint, extra = '') => `<ImageView android:id="@+id/${id}" android:layout_width="${size}dp" android:layout_height="${size}dp"
    android:src="@drawable/widget_dot" android:tint="${tint}" android:importantForAccessibility="no" ${extra} />`;

/** Шапка: точка «идёт», день, отсчёт (Chronometer — последний час) или текст (w_when: «через 15 ч»). */
const tlHead = size => `<LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content"
      android:orientation="horizontal" android:gravity="center_vertical" android:paddingStart="3dp" android:paddingEnd="3dp">
      ${tlDot('w_live_dot', 7, TL.fill, 'android:layout_marginEnd="6dp"')}
      ${tv('w_head', { size, font: 'b', color: TL.ink, text: 'Завтра, пн', w: '0dp', extra: 'android:layout_weight="1"' })}
      <Chronometer android:id="@+id/w_chrono" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:textSize="${size}dp" ${F.b} android:textColor="${TL.acc}" android:includeFontPadding="false" android:singleLine="true"
          android:layout_marginStart="8dp" android:visibility="gone" />
      ${tv('w_when', { size, font: 'b', color: TL.acc, text: 'через 15 ч', extra: 'android:layout_marginStart="8dp"' })}
    </LinearLayout>`;

/** Подложка плитки и заполнение (прошедшая часть идущей пары — светлее). */
const tlBg = (id, tint, prog) => `<ImageView android:id="@+id/${id}_bg" android:layout_width="match_parent" android:layout_height="match_parent"
        android:scaleType="fitXY" android:src="@drawable/widget_tile" android:tint="${tint}" android:importantForAccessibility="no" />${prog ? `
      <ImageView android:id="@+id/${id}_prog" android:layout_width="match_parent" android:layout_height="match_parent"
        android:scaleType="fitXY" android:src="@drawable/widget_tile_fill" android:tint="#5981EE" android:importantForAccessibility="no" android:visibility="gone" />` : ''}`;

const heroImg = (maxH, maxW) => `<ImageView android:id="@+id/w_room_img" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:adjustViewBounds="true" android:maxHeight="${maxH}dp" android:maxWidth="${maxW}dp" android:scaleType="fitCenter"
          android:src="@drawable/widget_room_sample" android:tint="${TL.on}" android:importantForAccessibility="no" />`;

/** Главная плитка, компактная (2×2 и узкий): номер и справа «I · 08:00» / «дальше 602», ниже предмет. */
const heroCompact = (lp, maxH, maxW) => `<FrameLayout android:id="@+id/w_hero" ${lp}>
      ${tlBg('w_hero', TL.fill, true)}
      <LinearLayout android:layout_width="match_parent" android:layout_height="match_parent" android:orientation="vertical"
          android:paddingStart="10dp" android:paddingEnd="9dp" android:paddingTop="8dp" android:paddingBottom="8dp">
        <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal">
          ${heroImg(maxH, maxW)}
          <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:orientation="vertical"
              android:gravity="end" android:layout_marginStart="6dp">
            ${tv('w_meta', { size: 11.5, font: 'm', color: TL.on2, text: 'I · 08:00' })}
            ${tv('w_hnext', { size: 11.5, font: 'm', color: TL.on2, text: 'дальше 602', extra: 'android:layout_marginTop="2dp"' })}
          </LinearLayout>
        </LinearLayout>
        <FrameLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" />
        <TextView android:id="@+id/w_subj" android:layout_width="match_parent" android:layout_height="wrap_content"
            android:textSize="12dp" ${F.b} android:textColor="${TL.on}" android:includeFontPadding="false"
            android:maxLines="2" android:ellipsize="end" android:lineSpacingExtra="1dp" android:text="ДВ: Объектно-ориентир. программ" />
      </LinearLayout>
    </FrameLayout>`;

/** Главная плитка, широкая: номер слева, справа «I пара · 08:00–09:30 · Практика» и предмет. */
const heroWide = `<FrameLayout android:id="@+id/w_hero" android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1.2">
      ${tlBg('w_hero', TL.fill, true)}
      <LinearLayout android:layout_width="match_parent" android:layout_height="match_parent" android:orientation="horizontal"
          android:gravity="center_vertical" android:paddingStart="12dp" android:paddingEnd="12dp" android:paddingTop="6dp" android:paddingBottom="6dp">
        ${heroImg(60, 150)}
        <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:orientation="vertical"
            android:layout_marginStart="12dp">
          ${tv('w_meta', { size: 11.5, font: 'm', color: TL.on2, text: 'I пара · 08:00–09:30 · Практика', w: 'match_parent' })}
          <TextView android:id="@+id/w_subj" android:layout_width="match_parent" android:layout_height="wrap_content"
              android:layout_marginTop="3dp" android:textSize="15dp" ${F.b} android:textColor="${TL.on}" android:includeFontPadding="false"
              android:maxLines="2" android:ellipsize="end" android:lineSpacingExtra="1dp" android:text="ДВ: Объектно-ориентир. программ" />
        </LinearLayout>
      </LinearLayout>
    </FrameLayout>`;

/** Обычная плитка i: «III» и время сверху, номер аудитории (autoSize), предмет с точкой типа (по месту). */
function tile(i, lp, compact) {
  const demo = [['II', '09:45', '602', 'Численные методы'], ['III', '11:30', '305', 'Базы данных'], ['IV', '14:00', 'Лаб. физики', 'Физика'], ['V', '15:45', '210', 'Философия']][i - 1];
  if (compact) return `<FrameLayout android:id="@+id/w_t${i}" ${lp}>
      ${tlBg(`w_t${i}`, TL.line, false)}
      <LinearLayout android:layout_width="match_parent" android:layout_height="match_parent" android:orientation="vertical"
          android:gravity="center_vertical" android:paddingStart="9dp" android:paddingEnd="7dp" android:paddingTop="4dp" android:paddingBottom="4dp">
        ${tv(`w_t${i}_top`, { size: 10.5, font: 'm', color: TL.ink2, text: `${demo[0]} · ${demo[1]}`, w: 'match_parent' })}
        <TextView android:id="@+id/w_t${i}_room" android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1"
            android:gravity="start|center_vertical" ${F.x} android:textColor="${TL.ink}" android:includeFontPadding="false" android:maxLines="1"
            android:text="${demo[2]}" android:textSize="19dp"
            android:autoSizeTextType="uniform" android:autoSizeMinTextSize="8sp" android:autoSizeMaxTextSize="19sp" android:autoSizeStepGranularity="0.5sp" />
      </LinearLayout>
    </FrameLayout>`;
  return `<FrameLayout android:id="@+id/w_t${i}" ${lp}>
      ${tlBg(`w_t${i}`, TL.line, false)}
      <LinearLayout android:layout_width="match_parent" android:layout_height="match_parent" android:orientation="vertical"
          android:paddingStart="9dp" android:paddingEnd="8dp" android:paddingTop="6dp" android:paddingBottom="6dp">
        <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal">
          ${tv(`w_t${i}_pair`, { size: 11, font: 'm', color: TL.ink2, text: demo[0], w: '0dp', extra: 'android:layout_weight="1"' })}
          ${tv(`w_t${i}_time`, { size: 11, font: 'm', color: TL.ink2, text: demo[1] })}
        </LinearLayout>
        <TextView android:id="@+id/w_t${i}_room" android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1"
            android:gravity="start|center_vertical" ${F.x} android:textColor="${TL.ink}" android:includeFontPadding="false" android:maxLines="2"
            android:text="${demo[2]}" android:textSize="24dp"
            android:autoSizeTextType="uniform" android:autoSizeMinTextSize="8sp" android:autoSizeMaxTextSize="30sp" android:autoSizeStepGranularity="0.5sp" />
        <LinearLayout android:id="@+id/w_t${i}_sub" android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal"
            android:gravity="center_vertical" android:visibility="gone">
          ${tlDot(`w_t${i}_dot`, 6, '#2BB27F', 'android:layout_marginEnd="4dp"')}
          ${tv(`w_t${i}_subj`, { size: 11, font: 'm', color: TL.ink, text: demo[3], w: '0dp', extra: 'android:layout_weight="1"' })}
        </LinearLayout>
      </LinearLayout>
    </FrameLayout>`;
}

const tilesS = root(`${bg(TL.bg)}
  <LinearLayout android:id="@+id/w_content" android:layout_width="match_parent" android:layout_height="match_parent"
      android:orientation="vertical" android:paddingStart="10dp" android:paddingEnd="10dp" android:paddingTop="10dp" android:paddingBottom="10dp">
    ${tlHead(12.5)}
    ${heroCompact('android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" android:layout_marginTop="6dp"', 36, 100)}
  </LinearLayout>
  ${empty}`);

const tilesN = root(`${bg(TL.bg)}
  <LinearLayout android:id="@+id/w_content" android:layout_width="match_parent" android:layout_height="match_parent"
      android:orientation="vertical" android:paddingStart="10dp" android:paddingEnd="10dp" android:paddingTop="10dp" android:paddingBottom="10dp">
    ${tlHead(12.5)}
    <LinearLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" android:orientation="horizontal"
        android:layout_marginTop="6dp">
      ${heroCompact('android:layout_width="0dp" android:layout_height="match_parent" android:layout_weight="1.5"', 36, 90)}
      <LinearLayout android:id="@+id/w_side" android:layout_width="0dp" android:layout_height="match_parent" android:layout_weight="1"
          android:orientation="vertical" android:layout_marginStart="6dp">
        ${tile(1, 'android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1"', true)}
        ${tile(2, 'android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" android:layout_marginTop="6dp"', true)}
      </LinearLayout>
    </LinearLayout>
  </LinearLayout>
  ${empty}`);

const tilesW = root(`${bg(TL.bg)}
  <LinearLayout android:id="@+id/w_content" android:layout_width="match_parent" android:layout_height="match_parent"
      android:orientation="vertical" android:paddingStart="11dp" android:paddingEnd="11dp" android:paddingTop="11dp" android:paddingBottom="11dp">
    ${tlHead(13)}
    <LinearLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" android:orientation="vertical"
        android:layout_marginTop="7dp">
      ${heroWide}
      <LinearLayout android:id="@+id/w_row" android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1"
          android:orientation="horizontal" android:layout_marginTop="6dp">
        ${[1, 2, 3, 4].map(i => tile(i, `android:layout_width="0dp" android:layout_height="match_parent" android:layout_weight="1"${i > 1 ? ' android:layout_marginStart="6dp"' : ''}`, false)).join('\n        ')}
      </LinearLayout>
    </LinearLayout>
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
            android:layout_marginTop="7dp" android:textSize="17dp" ${F.b} android:textColor="${D.ink}"
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

const out = { widget_tiles_s: tilesS, widget_tiles_n: tilesN, widget_tiles_w: tilesW, widget_dial_s: dialS, widget_dial_m: dialM, widget_dial_l: dialL };
for (const [name, xml] of Object.entries(out)) fs.writeFileSync(path.join(__dirname, `${name}.xml`), xml);
console.log('ok:', Object.keys(out).join(', '));

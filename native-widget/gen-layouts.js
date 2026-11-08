// Генератор раскладок виджетов: «Список пар» (с 2.0.7, вместо «Табло») — widget_list_s.xml (2×2) и
// widget_list.xml (остальные размеры: строк столько, сколько влезает), «Циферблат» (с 2.0.5) —
// widget_dial_{s,m,l}.xml. Запуск: node native-widget/gen-layouts.js. Руками XML не правится.
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

// ── «Список пар» (с 2.0.7; макет — docs/Виджеты - макет.html в репозитории сайта, выбор владельца 8 ноя 2026) ──
// Вместо «Табло»: класс ScheduleWidget прежний, поэтому уже поставленные виджеты сменят вид сами.
// Шапка: день слева, отсчёт справа — единственное место с отсчётом (владелец: «без дублей»).
// Строки: номер пары, точка типа (синяя — лекция, зелёная — практика, красная — зачёт и экзамен),
// предмет, «время · тип», аудитория. Идущая пара залита, прошедшая часть заливки светлее (уровень).
// Пять строк и четыре черты «обед» — сколько показать и какого размера, решает код (planList).
const L = { bg: '#FFFFFF', ink: '#10131A', ink2: '#4B5262', ink3: '#9AA0AD', acc: '#2856D6', fill: '#2F62EA', line: '#DDE2EA' };

const dot = (id, size, tint, extra = '') => `<ImageView android:id="@+id/${id}" android:layout_width="${size}dp" android:layout_height="${size}dp"
    android:src="@drawable/widget_dot" android:tint="${tint}" android:importantForAccessibility="no" ${extra} />`;

/** Шапка: точка «идёт», день, отсчёт (Chronometer) или время (w_when). */
const listHead = (size, extra = '') => `<LinearLayout android:id="@+id/w_head_box" android:layout_width="match_parent" android:layout_height="wrap_content"
      android:orientation="horizontal" android:gravity="center_vertical" ${extra}>
      ${dot('w_live_dot', 7, L.fill, 'android:layout_marginEnd="6dp"')}
      ${tv('w_head', { size, font: 'b', color: L.ink, text: 'Сегодня, суббота', w: '0dp', extra: 'android:layout_weight="1"' })}
      <Chronometer android:id="@+id/w_chrono" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:textSize="${size}dp" ${F.b} android:textColor="${L.acc}" android:includeFontPadding="false" android:singleLine="true"
          android:layout_marginStart="8dp" />
      ${tv('w_when', { size, font: 'b', color: L.acc, text: '08:00', extra: 'android:layout_marginStart="8dp" android:visibility="gone"' })}
    </LinearLayout>`;

function listRows() {
  let out = '';
  for (let i = 1; i <= 5; i++) {
    // предпросмотр в списке виджетов: 1-я строка — идущая пара, 2-я — обычная, остальные скрыты
    const on = i === 1, hide = i >= 3 ? 'android:visibility="gone"' : '', off = on ? '' : 'android:visibility="gone"';
    const ink = on ? '#FFFFFF' : L.ink, ink2 = on ? '#EAEFFD' : L.ink2;
    const demo = on ? ['II', 'Численные методы', '09:45–11:15 · Лекция', '602', '#5B8DEF'] : ['III', 'Базы данных', '11:30–13:00 · Практика', '305', '#2BB27F'];
    out += `
    <FrameLayout android:id="@+id/w_r${i}" android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="3dp" ${hide}>
      <ImageView android:id="@+id/w_r${i}_bg" android:layout_width="match_parent" android:layout_height="match_parent"
          android:scaleType="fitXY" android:src="@drawable/widget_row" android:tint="${L.fill}" android:importantForAccessibility="no" ${off} />
      <ImageView android:id="@+id/w_r${i}_prog" android:layout_width="match_parent" android:layout_height="match_parent"
          android:scaleType="fitXY" android:src="@drawable/widget_row_fill" android:tint="#5981EE" android:importantForAccessibility="no" ${off} />
      <LinearLayout android:id="@+id/w_r${i}_box" android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal"
          android:gravity="center_vertical" android:paddingStart="10dp" android:paddingEnd="10dp" android:paddingTop="${on ? 9 : 5}dp" android:paddingBottom="${on ? 9 : 5}dp">
        ${tv(`w_r${i}_pair`, { size: 12.5, font: 'b', color: on ? ink2 : L.ink3, text: demo[0], w: '24dp' })}
        <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:orientation="vertical">
          <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="center_vertical">
            <FrameLayout android:layout_width="9dp" android:layout_height="9dp" android:layout_marginEnd="5dp">
              <ImageView android:id="@+id/w_r${i}_ring" android:layout_width="match_parent" android:layout_height="match_parent"
                  android:src="@drawable/widget_dot" android:tint="#FFFFFF" android:importantForAccessibility="no" ${off} />
              <ImageView android:id="@+id/w_r${i}_dot" android:layout_width="7dp" android:layout_height="7dp" android:layout_gravity="center"
                  android:src="@drawable/widget_dot" android:tint="${demo[4]}" android:importantForAccessibility="no" />
            </FrameLayout>
            ${tv(`w_r${i}_subj`, { size: 13.5, font: 'm', color: ink, text: demo[1], w: '0dp', extra: 'android:layout_weight="1"' })}
          </LinearLayout>
          ${tv(`w_r${i}_meta`, { size: 11.5, font: 'm', color: ink2, text: demo[2], w: 'match_parent', extra: 'android:layout_marginTop="2dp"' })}
        </LinearLayout>
        ${tv(`w_r${i}_room`, { size: on ? 30 : 21, font: 'x', color: ink, text: demo[3], extra: 'android:layout_marginStart="8dp" android:letterSpacing="-0.02"' })}
      </LinearLayout>
    </FrameLayout>`;
    if (i < 5) out += `
    <LinearLayout android:id="@+id/w_g${i}" android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal"
        android:gravity="center_vertical" android:paddingStart="34dp" android:paddingEnd="10dp" android:layout_marginTop="3dp" android:visibility="gone">
      ${tv(`w_g${i}_text`, { size: 10.5, font: 'm', color: L.ink3, text: 'обед 60 мин' })}
      <FrameLayout android:id="@+id/w_g${i}_line" android:layout_width="0dp" android:layout_height="1dp" android:layout_weight="1"
          android:layout_marginStart="8dp" android:background="${L.line}" />
    </LinearLayout>`;
  }
  return out;
}

/** 4×2 и больше. В предпросмотре — одна идущая пара (остальные строки код показывает сам). */
const listM = root(`${bg(L.bg)}
  <LinearLayout android:id="@+id/w_content" android:layout_width="match_parent" android:layout_height="match_parent"
      android:orientation="vertical" android:paddingStart="12dp" android:paddingEnd="12dp" android:paddingTop="11dp" android:paddingBottom="12dp">
    ${listHead(13, 'android:paddingStart="4dp" android:paddingEnd="4dp" android:paddingBottom="1dp"')}
    ${listRows()}
  </LinearLayout>
  ${empty}`);

/** 2×2: шапка, крупный номер (картинка Onest, не выше 64 dp), предмет в две строки, внизу — следующая пара. */
const listS = root(`${bg(L.bg)}
  <LinearLayout android:id="@+id/w_content" android:layout_width="match_parent" android:layout_height="match_parent"
      android:orientation="vertical" android:paddingStart="13dp" android:paddingEnd="13dp" android:paddingTop="12dp" android:paddingBottom="11dp">
    ${listHead(13)}
    <FrameLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1">
      <ImageView android:id="@+id/w_room_img" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:layout_gravity="start|center_vertical" android:adjustViewBounds="true" android:maxHeight="60dp" android:maxWidth="600dp"
          android:scaleType="fitStart" android:src="@drawable/widget_room_sample" android:tint="${L.acc}" android:importantForAccessibility="no" />
    </FrameLayout>
    <TextView android:id="@+id/w_subj" android:layout_width="match_parent" android:layout_height="wrap_content"
        android:textSize="13dp" ${F.b} android:textColor="${L.ink}" android:includeFontPadding="false"
        android:maxLines="2" android:ellipsize="end" android:lineSpacingExtra="1dp" android:text="Численные методы" />
    <LinearLayout android:id="@+id/w_after_box" android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="vertical" android:layout_marginTop="7dp">
      <FrameLayout android:id="@+id/w_after_line" android:layout_width="match_parent" android:layout_height="1dp" android:background="${L.line}" />
      <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal"
          android:gravity="center_vertical" android:layout_marginTop="6dp">
        ${tv('w_after', { size: 12, font: 'm', color: L.ink2, text: 'III · 11:30', w: '0dp', extra: 'android:layout_weight="1"' })}
        ${tv('w_after_room', { size: 17, font: 'x', color: L.ink, text: '305', extra: 'android:layout_marginStart="6dp"' })}
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

const out = { widget_list_s: listS, widget_list: listM, widget_dial_s: dialS, widget_dial_m: dialM, widget_dial_l: dialL };
for (const [name, xml] of Object.entries(out)) fs.writeFileSync(path.join(__dirname, `${name}.xml`), xml);
console.log('ok:', Object.keys(out).join(', '));

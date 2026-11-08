// Генератор раскладок виджетов: «Шкала дня» (с 2.0.7, вместо «Табло») — widget_scale_{s,m,l}.xml,
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

// ── «Шкала дня» (с 2.0.7; макет — docs/Виджеты - варианты 3.html в репозитории сайта, выбор владельца 8 ноя 2026) ──
// Вместо «Табло»: класс ScheduleWidget прежний, поэтому уже поставленные виджеты сменят вид сами.
// Сверху: день и отсчёт (единственный). Ниже — главное: номер аудитории следующей/идущей пары крупно
// (картинка Onest, roomBitmap), рядом «III пара · 11:30–13:00 · Лекция» и предмет. Внизу — весь день
// шкалой: пять мест под пары I–V с настоящими промежутками между ними (15, 15, 60 обед, 15 мин — веса
// в разметке), лишние по краям прячет код, пустое место внутри — «окно». В блоке — номер аудитории:
// autoSize сам уменьшает «Лаб. физики», «Стадион», «704 701», чтобы влезли (Android 8+).
// Раскладки: s (уже 220 dp — тонкая полоска без подписей), m (ниже 180 dp — блоки 26 dp с номером),
// l (блоки растягиваются на всю оставшуюся высоту: номер, время, точка типа; под шкалой — 08:00, обед, 17:15).
const SC = { bg: '#FFFFFF', ink: '#10131A', ink2: '#4B5262', ink3: '#9AA0AD', acc: '#2856D6', fill: '#2F62EA', line: '#DDE2EA' };
const SLOT_W = 90;                 // пара — 90 минут
const GAP_W = [15, 15, 60, 15];    // перерывы после I, II, III (обед), IV

const scDot = (id, size, tint, extra = '') => `<ImageView android:id="@+id/${id}" android:layout_width="${size}dp" android:layout_height="${size}dp"
    android:src="@drawable/widget_dot" android:tint="${tint}" android:importantForAccessibility="no" ${extra} />`;

/** Шапка: точка «идёт», день, отсчёт (Chronometer, последний час) или текст (w_when: «через 15 ч»). */
const scHead = size => `<LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content"
      android:orientation="horizontal" android:gravity="center_vertical">
      ${scDot('w_live_dot', 7, SC.fill, 'android:layout_marginEnd="6dp"')}
      ${tv('w_head', { size, font: 'b', color: SC.ink, text: 'Сегодня, четверг', w: '0dp', extra: 'android:layout_weight="1"' })}
      <Chronometer android:id="@+id/w_chrono" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:textSize="${size}dp" ${F.b} android:textColor="${SC.acc}" android:includeFontPadding="false" android:singleLine="true"
          android:layout_marginStart="8dp" android:visibility="gone" />
      ${tv('w_when', { size, font: 'b', color: SC.acc, text: 'до конца 54:44', extra: 'android:layout_marginStart="8dp"' })}
    </LinearLayout>`;

/** Главное: номер картинкой (не выше maxH, не шире maxW) и справа строка пары, предмет, «дальше». */
const scMain = (maxH, maxW, k, subj, lines, extra, next) => `<LinearLayout android:id="@+id/w_main" android:layout_width="match_parent" android:layout_height="${extra.includes('layout_weight') ? '0dp' : 'wrap_content'}"
      android:orientation="horizontal" android:gravity="center_vertical" ${extra}>
      <ImageView android:id="@+id/w_room_img" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:adjustViewBounds="true" android:maxHeight="${maxH}dp" android:maxWidth="${maxW}dp" android:scaleType="fitCenter"
          android:src="@drawable/widget_room_sample" android:tint="${SC.acc}" android:importantForAccessibility="no" />
      <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:orientation="vertical"
          android:layout_marginStart="11dp">
        ${tv('w_meta', { size: k, font: 'm', color: SC.ink2, text: 'III пара · 11:30–13:00 · Лекция', w: 'match_parent' })}
        <TextView android:id="@+id/w_subj" android:layout_width="match_parent" android:layout_height="wrap_content"
            android:layout_marginTop="2dp" android:textSize="${subj}dp" ${F.b} android:textColor="${SC.ink}" android:includeFontPadding="false"
            android:maxLines="${lines}" android:ellipsize="end" android:lineSpacingExtra="1dp" android:text="Физика" />
        ${next ? tv('w_next', { size: k, font: 'm', color: SC.ink2, text: 'дальше IV · 14:00 · Физика', w: 'match_parent', extra: 'android:layout_marginTop="5dp" android:visibility="gone"' }) : ''}
      </LinearLayout>
    </LinearLayout>`;

/** Шкала: пять мест I–V и четыре промежутка с весами в минутах. mode: s / m / l. */
function scTrack(mode) {
  const blkH = mode === 's' ? '8dp' : mode === 'm' ? '26dp' : 'match_parent';
  const radius = mode === 's' ? 'widget_blk_s' : 'widget_blk';
  const demo = ['602', '305', '401', 'Лаб. физики', '210'];
  let row = '';
  for (let i = 1; i <= 5; i++) {
    const hero = i === 3;
    let inner = '';
    if (mode === 'm') inner = `
          <TextView android:id="@+id/w_s${i}_room" android:layout_width="match_parent" android:layout_height="match_parent"
              android:gravity="center" android:paddingStart="3dp" android:paddingEnd="3dp" ${F.x} android:textColor="${hero ? '#FFFFFF' : SC.ink}"
              android:includeFontPadding="false" android:maxLines="1" android:text="${demo[i - 1]}"
              android:autoSizeTextType="uniform" android:autoSizeMinTextSize="7sp" android:autoSizeMaxTextSize="13sp" android:autoSizeStepGranularity="0.5sp" />`;
    if (mode === 'l') inner = `
          <LinearLayout android:layout_width="match_parent" android:layout_height="match_parent" android:orientation="vertical"
              android:gravity="center" android:paddingStart="3dp" android:paddingEnd="3dp" android:paddingTop="4dp" android:paddingBottom="5dp">
            <TextView android:id="@+id/w_s${i}_room" android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1"
                android:gravity="center" ${F.x} android:textColor="${hero ? '#FFFFFF' : SC.ink}" android:includeFontPadding="false"
                android:maxLines="2" android:lineSpacingExtra="0dp" android:text="${demo[i - 1]}"
                android:autoSizeTextType="uniform" android:autoSizeMinTextSize="7sp" android:autoSizeMaxTextSize="21sp" android:autoSizeStepGranularity="0.5sp" />
            ${tv(`w_s${i}_time`, { size: 10.5, font: 'm', color: hero ? '#EAEFFD' : SC.ink2, text: ['08:00', '09:45', '11:30', '14:00', '15:45'][i - 1], extra: 'android:layout_marginTop="2dp"' })}
            ${scDot(`w_s${i}_dot`, 6, hero ? '#FFFFFF' : '#5B8DEF', 'android:layout_marginTop="4dp" android:visibility="gone"')}
          </LinearLayout>`;
    row += `
      <FrameLayout android:id="@+id/w_s${i}" android:layout_width="0dp" android:layout_height="${blkH}" android:layout_weight="${SLOT_W}">
        <ImageView android:id="@+id/w_s${i}_bg" android:layout_width="match_parent" android:layout_height="match_parent"
            android:scaleType="fitXY" android:src="@drawable/${radius}" android:tint="${hero ? SC.fill : SC.line}" android:importantForAccessibility="no" />
        <ImageView android:id="@+id/w_s${i}_prog" android:layout_width="match_parent" android:layout_height="match_parent"
            android:scaleType="fitXY" android:src="@drawable/${radius}_fill" android:tint="#5981EE" android:importantForAccessibility="no" android:visibility="gone" />${inner}
      </FrameLayout>`;
    if (i < 5) row += `
      <FrameLayout android:id="@+id/w_gp${i}" android:layout_width="0dp" android:layout_height="${blkH}" android:layout_weight="${GAP_W[i - 1]}" />`;
  }
  const trackLp = mode === 'l'
    ? 'android:layout_height="0dp" android:layout_weight="1" android:layout_marginTop="8dp" android:minHeight="34dp"'
    : `android:layout_height="wrap_content" android:layout_marginTop="${mode === 's' ? 8 : 7}dp"`;
  let out = `<LinearLayout android:id="@+id/w_track" android:layout_width="match_parent" ${trackLp} android:orientation="horizontal">${row}
    </LinearLayout>`;
  if (mode === 'l') {
    // подписи под шкалой — те же веса: «08:00» под первой парой, «обед» под перерывом, «17:15» под последней
    let lab = '';
    for (let i = 1; i <= 5; i++) {
      lab += `
      ${tv(`w_lb${i}`, { size: 10, font: 'm', color: SC.ink3, text: i === 1 ? '08:00' : i === 5 ? '17:15' : '', w: '0dp', extra: `android:layout_weight="${SLOT_W}" android:gravity="${i === 5 ? 'end' : 'start'}"` })}`;
      if (i < 5) lab += `
      ${tv(`w_lg${i}`, { size: 9.5, font: 'm', color: SC.ink3, text: i === 3 ? 'обед' : '', w: '0dp', extra: `android:layout_weight="${GAP_W[i - 1]}" android:gravity="center"` })}`;
    }
    out += `
    <LinearLayout android:id="@+id/w_labels" android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal"
        android:layout_marginTop="3dp">${lab}
    </LinearLayout>`;
  }
  return out;
}

const scaleS = root(`${bg(SC.bg)}
  <LinearLayout android:id="@+id/w_content" android:layout_width="match_parent" android:layout_height="match_parent"
      android:orientation="vertical" android:paddingStart="12dp" android:paddingEnd="12dp" android:paddingTop="11dp" android:paddingBottom="11dp">
    ${scHead(12.5)}
    <LinearLayout android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1" android:orientation="horizontal" android:gravity="center_vertical">
      <ImageView android:id="@+id/w_room_img" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:adjustViewBounds="true" android:maxHeight="34dp" android:maxWidth="96dp" android:scaleType="fitCenter"
          android:src="@drawable/widget_room_sample" android:tint="${SC.acc}" android:importantForAccessibility="no" />
      ${tv('w_meta', { size: 11.5, font: 'm', color: SC.ink2, text: 'III пара · 11:30', w: '0dp', extra: 'android:layout_weight="1" android:layout_marginStart="8dp"' })}
    </LinearLayout>
    ${tv('w_subj', { size: 12.5, font: 'b', color: SC.ink, text: 'Физика', w: 'match_parent' })}
    ${scTrack('s')}
  </LinearLayout>
  ${empty}`);

const scaleM = root(`${bg(SC.bg)}
  <LinearLayout android:id="@+id/w_content" android:layout_width="match_parent" android:layout_height="match_parent"
      android:orientation="vertical" android:paddingStart="13dp" android:paddingEnd="13dp" android:paddingTop="12dp" android:paddingBottom="11dp">
    ${scHead(13)}
    ${scMain(46, 120, 11.5, 14, 2, 'android:layout_weight="1"', false)}
    ${scTrack('m')}
  </LinearLayout>
  ${empty}`);

const scaleL = root(`${bg(SC.bg)}
  <LinearLayout android:id="@+id/w_content" android:layout_width="match_parent" android:layout_height="match_parent"
      android:orientation="vertical" android:paddingStart="14dp" android:paddingEnd="14dp" android:paddingTop="12dp" android:paddingBottom="10dp">
    ${scHead(13)}
    ${scMain(64, 150, 12, 16, 2, 'android:layout_marginTop="8dp"', true)}
    ${scTrack('l')}
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

const out = { widget_scale_s: scaleS, widget_scale_m: scaleM, widget_scale_l: scaleL, widget_dial_s: dialS, widget_dial_m: dialM, widget_dial_l: dialL };
for (const [name, xml] of Object.entries(out)) fs.writeFileSync(path.join(__dirname, `${name}.xml`), xml);
console.log('ok:', Object.keys(out).join(', '));

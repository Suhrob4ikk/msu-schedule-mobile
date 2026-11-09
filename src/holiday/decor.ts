/**
 * Праздничное оформление вокруг расписания — как на сайте (components/holiday/decor.ts, макет — docs/Праздники в двух
 * темах - макет.html репозитория сайта; владелец 9 ноя 2026: «да, так же»): фон экрана, гирлянда под шапкой,
 * украшение над нижним меню, шапочка над активной вкладкой, орнамент у дня недели, плашка «Следующая пара» цветом
 * праздника, иней (Новый год). Рисунки — SVG строкой (SvgXml); без CSS-анимаций — RN их не рисует.
 */
type SceneId = 'ny' | 'navruz' | 'mar8' | 'sep1' | 'indep' | 'eid';

export interface Decor {
  gar: string; nav: string; hat: string; orn: string;
  /** Плашка «Следующая пара»: фон и текст. */
  pill: [string, string];
  /** Цвет праздника — для оттенка карточек. */
  acc: string;
  /** Фон экрана: цвета и места (сверху вниз) — для expo-linear-gradient. */
  bg: { colors: [string, string, ...string[]]; locations: [number, number, ...number[]] };
  /** Верх фона — шапка. */
  top: string;
}

const SV = (vb: string, body: string, ar = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" ${ar}>${body}</svg>`;

function flake(c: string) {
  let s = '';
  for (let i = 0; i < 6; i++) s += `<g transform="rotate(${i * 60} 12 12)"><line x1="12" y1="12" x2="12" y2="2" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/><path d="M9.5 5 12 7.2 14.5 5" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round"/></g>`;
  return SV('0 0 24 24', s);
}
const ORN = {
  flake: (d: boolean) => flake(d ? '#cfe3ff' : '#5b9be0'),
  blossom: () => SV('0 0 24 24', `<g fill="#f8a5c2" stroke="#e86f9b" stroke-width=".6">${[0, 72, 144, 216, 288].map(a => `<ellipse cx="12" cy="6.5" rx="3.4" ry="4.6" transform="rotate(${a} 12 12)"/>`).join('')}</g><circle cx="12" cy="12" r="2.4" fill="#ffd54f"/>`),
  mimosa: () => SV('0 0 24 24', `<path d="M3 21C9 15 14 10 21 3" stroke="#7cb342" stroke-width="1.6" fill="none"/><g fill="#ffd54f" stroke="#f9a825" stroke-width=".5">${[[18, 5], [15, 8], [12, 11], [9, 14], [16, 3], [20, 8], [13, 6], [7, 17]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.3"/>`).join('')}</g>`),
  crown: () => SV('0 0 24 24', `<path d="M4 17 6 8l4 5 2-7 2 7 4-5 2 9z" fill="#f2c94c" stroke="#c99a1b" stroke-width=".8"/>${[[6, 6], [12, 4], [18, 6], [3.5, 10], [20.5, 10], [9, 3.5], [15, 3.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="#f2c94c"/>`).join('')}`),
  crescent: () => SV('0 0 24 24', `<path d="M15 3A9 9 0 1 0 15 21A7 7 0 1 1 15 3Z" fill="#e8c070"/><path d="M19 8l.7 1.8 1.9.1-1.5 1.2.5 1.9-1.6-1.1-1.6 1.1.5-1.9-1.5-1.2 1.9-.1z" fill="#e8c070"/>`),
  star: () => SV('0 0 24 24', `<path d="M12 2l2.9 6.2 6.8.8-5 4.6 1.4 6.7L12 17l-6.1 3.3 1.4-6.7-5-4.6 6.8-.8z" fill="#ffc94d" stroke="#e0a21a" stroke-width=".8"/>`),
};
const santa = () => SV('0 0 24 20', `<path d="M3 15C5 7 11 2 18 4c-3 1-4 4-3 11z" fill="#d62d3a"/><rect x="1" y="14" width="17" height="4.5" rx="2.2" fill="#fff" stroke="#dfe7f2" stroke-width=".6"/><circle cx="19.5" cy="4.5" r="2.6" fill="#fff" stroke="#dfe7f2" stroke-width=".6"/>`);

type Gar = 'bulbs' | 'blossom' | 'mimosa' | 'pennants' | 'bunting' | 'lanterns';
function garland(kind: Gar, dark: boolean): string {
  if (kind === 'bulbs') {
    const cols = ['#ff4d5e', '#ffd34d', '#3ddc84', '#4db8ff', '#d64dff'];
    let path = 'M0 2', s = '', n = 0;
    for (let k = 0; k < 4; k++) path += ` Q${k * 90 + 45} 16 ${(k + 1) * 90} 2`;
    s += `<path d="${path}" stroke="${dark ? '#2b3a2b' : '#3a4a3a'}" stroke-width="1.4" fill="none"/>`;
    for (let k = 0; k < 4; k++) for (let j = 1; j <= 5; j++) {
      const t = j / 6, x = k * 90 + t * 90, y = (1 - t) * (1 - t) * 2 + 2 * (1 - t) * t * 16 + t * t * 2, c = cols[n % 5];
      s += `<g><circle cx="${x}" cy="${y + 6}" r="7" fill="${c}" opacity="${dark ? 0.35 : 0.22}"/><rect x="${x - 1.6}" y="${y - 0.5}" width="3.2" height="3" rx=".8" fill="#444"/><ellipse cx="${x}" cy="${y + 6}" rx="2.8" ry="4" fill="${c}" stroke="rgba(0,0,0,.18)" stroke-width=".5"/><ellipse cx="${x - 0.9}" cy="${y + 4.6}" rx=".8" ry="1.2" fill="#fff" opacity=".8"/></g>`;
      n++;
    }
    return SV('0 0 360 26', s, 'preserveAspectRatio="none"');
  }
  if (kind === 'bunting' || kind === 'pennants') {
    const cols = kind === 'bunting' ? ['#DC161D', '#ffffff', '#197B30'] : ['#ff5f6d', '#ffc371', '#3ddc84', '#4db8ff', '#a55eea'];
    let s = `<path d="M0 3 Q90 12 180 3 Q270 12 360 3" stroke="${dark ? '#8a8f9c' : '#9aa0ad'}" stroke-width="1" fill="none"/>`;
    for (let i = 0; i < 18; i++) {
      const x = i * 20 + 3, t = (x % 180) / 180, y = 3 + 4 * t * (1 - t) * 9;
      s += `<path d="M${x} ${y} L${x + 14} ${y} L${x + 7} ${y + 15} Z" fill="${cols[i % cols.length]}" stroke="rgba(0,0,0,.15)" stroke-width=".5"/>`;
    }
    return SV('0 0 360 26', s, 'preserveAspectRatio="none"');
  }
  if (kind === 'blossom') {
    let s = `<path d="M0 4C60 14 120 2 180 10S300 2 360 8" stroke="#6d4c41" stroke-width="2" fill="none"/>`;
    for (let i = 0; i < 16; i++) {
      const x = 10 + i * 22.5, y = 8 + Math.sin(i * 1.3) * 4;
      s += `<ellipse cx="${x + 6}" cy="${y + 4}" rx="4" ry="2" fill="#8bc34a" transform="rotate(30 ${x + 6} ${y + 4})"/><g fill="#fde4ec" stroke="#f48fb1" stroke-width=".6">${[0, 72, 144, 216, 288].map(a => `<circle cx="${x}" cy="${y - 3}" r="2.6" transform="rotate(${a} ${x} ${y})"/>`).join('')}</g><circle cx="${x}" cy="${y}" r="1.4" fill="#f06292"/>`;
    }
    return SV('0 0 360 26', s, 'preserveAspectRatio="none"');
  }
  if (kind === 'mimosa') {
    let s = `<path d="M0 5C60 15 120 3 180 11S300 3 360 9" stroke="#7cb342" stroke-width="1.6" fill="none"/>`;
    for (let i = 0; i < 40; i++) { const x = 4 + i * 9, y = 9 + Math.sin(i * 0.9) * 5 + (i % 2 ? 4 : 0); s += `<circle cx="${x}" cy="${y}" r="${i % 3 ? 2.6 : 3.2}" fill="#ffd54f" stroke="#f9a825" stroke-width=".5"/>`; }
    return SV('0 0 360 26', s, 'preserveAspectRatio="none"');
  }
  let s = `<path d="M0 2H360" stroke="#c9a24d" stroke-width="1"/>`;
  for (let i = 0; i < 7; i++) {
    const x = 25 + i * 52, l = 4 + (i % 2) * 5;
    s += `<line x1="${x}" y1="2" x2="${x}" y2="${l}" stroke="#c9a24d" stroke-width=".8"/>`;
    s += i % 2
      ? `<path d="M${x + 3} ${l + 1}A6 6 0 1 0 ${x + 3} ${l + 13}A4.6 4.6 0 1 1 ${x + 3} ${l + 1}Z" fill="#e8c070"/>`
      : `<g><circle cx="${x}" cy="${l + 9}" r="9" fill="#ffcc66" opacity="${dark ? 0.35 : 0.18}"/><rect x="${x - 4}" y="${l}" width="8" height="3" rx="1" fill="#a87c2a"/><path d="M${x - 5} ${l + 3}h10l-1.5 11h-7z" fill="${dark ? '#ffcf6e' : '#e5a93a'}" stroke="#a87c2a" stroke-width=".8"/><rect x="${x - 3}" y="${l + 14}" width="6" height="2" rx=".8" fill="#a87c2a"/></g>`;
  }
  return SV('0 0 360 26', s, 'preserveAspectRatio="none"');
}

type Nav = 'snowdrift' | 'grass' | 'ribbon' | 'pencils' | 'tricolor' | 'goldline';
function navDeco(kind: Nav, dark: boolean): string {
  if (kind === 'snowdrift') return SV('0 0 360 30', `<path d="M0 30V18C20 10 40 16 60 13S100 6 130 12 170 18 200 12 250 4 280 11 330 16 360 10V30Z" fill="${dark ? '#e8f0ff' : '#ffffff'}" opacity="${dark ? 0.92 : 1}"/><path d="M0 18C20 10 40 16 60 13S100 6 130 12 170 18 200 12 250 4 280 11 330 16 360 10" fill="none" stroke="${dark ? '#9fc0ff' : '#a9c8ee'}" stroke-width="1.4"/>`, 'preserveAspectRatio="none"');
  if (kind === 'grass') {
    let s = `<path d="M0 30V20C30 16 60 22 90 18S150 14 180 19 250 22 290 17 340 15 360 19V30Z" fill="#7cc35a"/>`;
    ([[30, '#e5484d'], [78, '#ffb020'], [140, '#d6409f'], [210, '#e5484d'], [262, '#ffb020'], [318, '#d6409f']] as [number, string][]).forEach(([x, c]) => {
      s += `<line x1="${x}" y1="20" x2="${x}" y2="9" stroke="#4e9a3a" stroke-width="1.5"/><path d="M${x - 4} 10C${x - 4} 3 ${x + 4} 3 ${x + 4} 10C${x + 2} 8 ${x - 2} 8 ${x - 4} 10Z" fill="${c}"/>`;
    });
    return SV('0 0 360 30', s, 'preserveAspectRatio="none"');
  }
  if (kind === 'ribbon') return SV('0 0 360 30', `<path d="M0 22C60 14 120 28 180 20S300 12 360 22V30H0Z" fill="#f8bbd0" opacity=".9"/><path d="M0 25C60 17 120 31 180 23S300 15 360 25" stroke="#d63a7a" stroke-width="1.5" fill="none"/>`, 'preserveAspectRatio="none"');
  if (kind === 'tricolor') return SV('0 0 360 30', `<rect y="23" width="360" height="2.4" fill="#DC161D"/><rect y="25.4" width="360" height="2.2" fill="${dark ? '#e9e9e9' : '#ffffff'}"/><rect y="27.6" width="360" height="2.4" fill="#197B30"/>`, 'preserveAspectRatio="none"');
  if (kind === 'goldline') {
    let s = `<defs><linearGradient id="gl"><stop offset="0" stop-color="#a87c2a"/><stop offset=".5" stop-color="#f3d27a"/><stop offset="1" stop-color="#a87c2a"/></linearGradient></defs><rect y="27" width="360" height="3" fill="url(#gl)"/>`;
    for (let i = 0; i < 9; i++) s += `<path d="M${20 + i * 40} 18l1 2.4 2.6.2-2 1.6.7 2.5-2.3-1.4-2.3 1.4.7-2.5-2-1.6 2.6-.2z" fill="#e8c070"/>`;
    return SV('0 0 360 30', s, 'preserveAspectRatio="none"');
  }
  const c = ['#ff5f6d', '#ffc371', '#3ddc84', '#4db8ff', '#a55eea'];
  let s = '';
  for (let i = 0; i < 12; i++) s += `<rect x="${i * 30}" y="26" width="30" height="4" fill="${c[i % 5]}"/>`;
  return SV('0 0 360 30', s, 'preserveAspectRatio="none"');
}

/** Иней в углу карточки «Следующая пара» (Новый год). */
export function frostSvg(dark: boolean, flip = false): string {
  const c = dark ? '#cfe3ff' : '#7fb0e6';
  let s = `<g stroke="${c}" stroke-width="1" fill="none" stroke-linecap="round">`;
  const br = (x: number, y: number, a: number, l: number, d: number) => {
    if (d > 3 || l < 4) return;
    const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l;
    s += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    br(x + (x2 - x) * 0.5, y + (y2 - y) * 0.5, a - 0.7, l * 0.45, d + 1); br(x + (x2 - x) * 0.5, y + (y2 - y) * 0.5, a + 0.7, l * 0.45, d + 1);
    br(x2, y2, a - 0.35, l * 0.55, d + 1); br(x2, y2, a + 0.35, l * 0.55, d + 1);
  };
  [-1.1, -0.7, -0.3, 0.1].forEach(a => br(0, 70, a, 34, 0));
  return SV('0 0 70 70', (flip ? `<g transform="translate(70 0) scale(-1 1)">${s}</g>` : s) + '</g>');
}

type Bg = Decor['bg'];
const g = (cols: string[], locs: number[]): Bg => ({ colors: cols as Bg['colors'], locations: locs as Bg['locations'] });
const PER: Record<SceneId, { gar: Gar; nav: Nav; hat: () => string; orn: (d: boolean) => string; pill: [string, string]; acc: string; bg: [Bg, Bg]; top: [string, string] }> = {
  ny: { gar: 'bulbs', nav: 'snowdrift', hat: santa, orn: ORN.flake, pill: ['#d62d3a', '#fff'], acc: '#2f7bd6',
    bg: [g(['#dcebff', '#eef5ff', '#f7faff'], [0, 0.38, 1]), g(['#060a1c', '#0b1230', '#0e1226'], [0, 0.5, 1])], top: ['#dcebff', '#060a1c'] },
  navruz: { gar: 'blossom', nav: 'grass', hat: ORN.blossom, orn: ORN.blossom, pill: ['#2e9d57', '#fff'], acc: '#2e9d57',
    bg: [g(['#e4f6dc', '#f4fbef', '#fff8f2'], [0, 0.4, 1]), g(['#0b1712', '#101a14', '#17130f'], [0, 0.6, 1])], top: ['#e4f6dc', '#0b1712'] },
  mar8: { gar: 'mimosa', nav: 'ribbon', hat: ORN.mimosa, orn: ORN.mimosa, pill: ['#d63a7a', '#fff'], acc: '#d63a7a',
    bg: [g(['#fde3ee', '#fff1f6', '#fff8fb'], [0, 0.45, 1]), g(['#1b0e18', '#170d15', '#120c12'], [0, 0.6, 1])], top: ['#fde3ee', '#1b0e18'] },
  sep1: { gar: 'pennants', nav: 'pencils', hat: ORN.star, orn: ORN.star, pill: ['#2f6fe0', '#fff'], acc: '#2f6fe0',
    bg: [g(['#e2eeff', '#f3f8ff', '#ffffff'], [0, 0.45, 1]), g(['#0a1226', '#0d1324', '#0e1118'], [0, 0.6, 1])], top: ['#e2eeff', '#0a1226'] },
  indep: { gar: 'bunting', nav: 'tricolor', hat: ORN.crown, orn: ORN.crown, pill: ['#c8102e', '#fff'], acc: '#c8102e',
    bg: [g(['#ffe7e7', '#ffffff', '#ffffff', '#e6f4e7'], [0, 0.32, 0.7, 1]), g(['#140d16', '#0f1020', '#0b1610'], [0, 0.5, 1])], top: ['#ffe7e7', '#140d16'] },
  eid: { gar: 'lanterns', nav: 'goldline', hat: ORN.crescent, orn: ORN.crescent, pill: ['#b8862b', '#fff'], acc: '#b8862b',
    bg: [g(['#f8eed6', '#fdf8ec', '#fffdf7'], [0, 0.45, 1]), g(['#04161b', '#071b21', '#0a1418'], [0, 0.5, 1])], top: ['#f8eed6', '#04161b'] },
};

const cache = new Map<string, Decor>();
export function decorFor(scene: SceneId, dark: boolean): Decor {
  const key = `${scene}|${dark}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = PER[scene], i = dark ? 1 : 0;
  const d: Decor = { gar: garland(p.gar, dark), nav: navDeco(p.nav, dark), hat: p.hat(), orn: p.orn(dark), pill: p.pill, acc: p.acc, bg: p.bg[i], top: p.top[i] };
  cache.set(key, d);
  return d;
}

/** Цвет праздника поверх поверхности (как color-mix на сайте): a — доля цвета праздника. */
export function mixHex(acc: string, surface: string, a: number): string {
  const p = (h: string) => { const x = h.replace('#', ''); const f = x.length === 3 ? x.split('').map(c => c + c).join('') : x.slice(0, 6); return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16)); };
  const A = p(acc), B = p(surface);
  return '#' + A.map((v, i) => Math.round(v * a + B[i] * (1 - a)).toString(16).padStart(2, '0')).join('');
}

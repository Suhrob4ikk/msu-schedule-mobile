/**
 * Нарисованные сцены праздничной открытки (src/holiday/holidays.ts) — SVG строкой для SvgXml, 360 × 210,
 * обрезаются по ширине (slice). Цвета свои, не токены: это картинка. Тот же рисунок, что на сайте
 * (frontend/src/components/holiday/scenes.ts в репозитории сайта) — меняете там, меняйте и здесь.
 * Отличие: без размытия (filter) и CSS-анимаций — react-native-svg их не рисует.
 */
const R = Math.random;
const rnd = (a: number, b: number) => a + R() * (b - a);

const MOUNT_FAR = "M0 150 L30 120 L55 132 L90 92 L120 118 L150 86 L178 110 L210 78 L240 104 L270 90 L300 112 L330 96 L360 118 L360 210 L0 210Z";
const MOUNT_NEAR = "M0 170 L40 140 L70 156 L110 124 L150 150 L190 130 L230 158 L270 136 L310 156 L360 140 L360 210 L0 210Z";

function stars(n: number, maxY: number): string {
  let s = "";
  for (let i = 0; i < n; i++) {
    s += `<circle cx="${(R() * 360).toFixed(1)}" cy="${(R() * maxY).toFixed(1)}" r="${rnd(0.4, 1.3).toFixed(2)}" fill="#fff" opacity="${rnd(0.4, 1).toFixed(2)}"/>`;
  }
  return s;
}

function pines(color: string): string {
  return [14, 38, 62, 300, 322, 346, 280].map((x, i) => {
    const h = 34 + (i % 3) * 10, y = 192;
    return `<g transform="translate(${x} ${y})"><path d="M0 ${-h} L${h * 0.32} ${-h * 0.45} L${h * 0.18} ${-h * 0.45} L${h * 0.42} 0 L${-h * 0.42} 0 L${-h * 0.18} ${-h * 0.45} L${-h * 0.32} ${-h * 0.45}Z" fill="${color}"/>` +
      `<path d="M0 ${-h} L${h * 0.16} ${-h * 0.72} L${-h * 0.16} ${-h * 0.72}Z M${-h * 0.3} ${-h * 0.44} L${h * 0.3} ${-h * 0.44} L${h * 0.2} ${-h * 0.38} L${-h * 0.2} ${-h * 0.38}Z" fill="#eef4ff" opacity=".9"/></g>`;
  }).join("");
}

const FLOWER_GRADS =
  '<radialGradient id="hd-tR" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#ff8a9b"/><stop offset="1" stop-color="#c2185b"/></radialGradient>' +
  '<radialGradient id="hd-tY" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#fff59d"/><stop offset="1" stop-color="#f9a825"/></radialGradient>' +
  '<radialGradient id="hd-tO" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#ffcc80"/><stop offset="1" stop-color="#e64a19"/></radialGradient>' +
  '<radialGradient id="hd-mim" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#fff9c4"/><stop offset=".6" stop-color="#ffd54f"/><stop offset="1" stop-color="#f9a825"/></radialGradient>' +
  '<radialGradient id="hd-blos" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#fde4ec"/><stop offset="1" stop-color="#f8bbd0"/></radialGradient>';

function tulip(x: number, y: number, grad: string, s: number): string {
  return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 C1 -14 -1 -24 0 -34" stroke="#2f7d32" stroke-width="2.4" fill="none"/>` +
    '<path d="M0 -8 C-10 -12 -14 -22 -12 -30 C-6 -24 -2 -18 0 -12Z" fill="#43a047"/><path d="M0 -14 C8 -18 12 -26 10 -34 C5 -28 2 -22 0 -18Z" fill="#388e3c"/>' +
    `<path d="M-8 -36 C-10 -46 -6 -54 0 -56 C6 -54 10 -46 8 -36 C5 -32 -5 -32 -8 -36Z" fill="url(#${grad})"/><path d="M-3 -37 C-5 -46 -2 -53 2 -55 C5 -50 5 -42 3 -37Z" fill="#fff" opacity=".55"/></g>`;
}

function blossom(x: number, y: number, s: number): string {
  let p = "";
  for (let i = 0; i < 5; i++) p += `<ellipse cx="0" cy="-5" rx="3.4" ry="5" fill="url(#hd-blos)" transform="rotate(${i * 72})"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})">${p}<circle r="1.6" fill="#f06292"/><circle r=".7" cx="1.5" cy="-1" fill="#ffeb3b"/></g>`;
}

function mimosa(x: number, y: number, s: number, rot: number): string {
  const pts = [[0, 0], [6, -4], [12, -7], [18, -11], [24, -14], [3, -8], [9, -12], [15, -15], [21, -19], [8, 2], [14, -1], [20, -4], [26, -8], [30, -12]];
  const balls = pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="${rnd(2.3, 3.2).toFixed(1)}" fill="url(#hd-mim)"/>`).join("");
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M-6 10 C6 2 18 -8 32 -16" stroke="#7cb342" stroke-width="1.6" fill="none"/>` +
    `<path d="M2 6 l-6 6 M10 0 l-5 7 M18 -6 l-4 8" stroke="#8bc34a" stroke-width="1.2"/>${balls}</g>`;
}

const svg = (body: string) => `<svg viewBox="0 0 360 210" preserveAspectRatio="xMidYMid slice">${body}</svg>`;

export type SceneId = "ny" | "navruz" | "mar8" | "sep1" | "indep" | "eid";

/** Цвет под сценой, пока она рисуется. */
export const SCENE_BG: Record<SceneId, string> = {
  ny: "#0b1530", navruz: "#a9c7e6", mar8: "#5a2050", sep1: "#5aa2e0", indep: "#2a2550", eid: "#062226",
};

export function sceneSvg(id: SceneId, wide = false): string {
  const out = sceneBody(id);
  return wide ? out.replace('preserveAspectRatio="xMidYMid slice"', 'preserveAspectRatio="xMaxYMid meet"') : out;
}

function sceneBody(id: SceneId): string {
  switch (id) {
    case "ny":
      return svg('<defs><linearGradient id="hd-sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050a1f"/><stop offset=".6" stop-color="#14204a"/><stop offset="1" stop-color="#2a3a6e"/></linearGradient>' +
        '<linearGradient id="hd-au" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3dffb0" stop-opacity="0"/><stop offset=".3" stop-color="#3dffb0" stop-opacity=".55"/><stop offset=".6" stop-color="#5ab8ff" stop-opacity=".45"/><stop offset="1" stop-color="#b06cff" stop-opacity="0"/></linearGradient>' +
        '<radialGradient id="hd-moon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fffbe8"/><stop offset=".55" stop-color="#fff3c4" stop-opacity=".9"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient>' +
        '<linearGradient id="hd-mf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a6f9e"/><stop offset="1" stop-color="#1f2a4a"/></linearGradient><linearGradient id="hd-mn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3864"/><stop offset="1" stop-color="#0e1530"/></linearGradient>' +
        '</defs><rect width="360" height="210" fill="url(#hd-sk)"/>' + stars(70, 120) +
        '<path opacity=".7" d="M-20 70 C60 30 120 90 200 50 C260 22 320 60 380 40 L380 70 C320 92 260 60 200 84 C120 118 60 66 -20 100Z" fill="url(#hd-au)"/>' +
        '<circle cx="292" cy="44" r="34" fill="url(#hd-moon)"/><circle cx="292" cy="44" r="13" fill="#fffdf2"/>' +
        `<path d="${MOUNT_FAR}" fill="url(#hd-mf)"/><path d="M90 92 L104 104 L98 104 L120 118 L111 112 L104 116 Z M150 86 L163 98 L157 98 L172 106 L160 104 Z M210 78 L224 92 L217 91 L232 100 L220 98 Z" fill="#eaf2ff" opacity=".9"/>` +
        `<path d="${MOUNT_NEAR}" fill="url(#hd-mn)"/><path d="M110 124 L122 134 L116 134 L130 141 Z M190 130 L201 139 L196 139 L208 145Z M270 136 L281 145 L276 145 L288 150Z" fill="#dfe9fb" opacity=".85"/>` +
        pines("#0b1430") + '<g fill="#ffd77a">' + [60, 74, 82, 96, 240, 252, 266, 278].map((x, i) => `<circle cx="${x}" cy="${186 + (i % 3) * 3}" r="1.1"/>`).join("") + "</g>");
    case "navruz":
      return svg("<defs>" + FLOWER_GRADS + '<linearGradient id="hd-sk2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb6e8"/><stop offset=".55" stop-color="#ffd3b0"/><stop offset="1" stop-color="#ffb3a7"/></linearGradient>' +
        '<radialGradient id="hd-sun2" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fffbe0"/><stop offset=".4" stop-color="#ffe9a8" stop-opacity=".9"/><stop offset="1" stop-color="#ffd38a" stop-opacity="0"/></radialGradient>' +
        '<linearGradient id="hd-h1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ccc65"/><stop offset="1" stop-color="#558b2f"/></linearGradient><linearGradient id="hd-h2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cb342"/><stop offset="1" stop-color="#33691e"/></linearGradient></defs>' +
        '<rect width="360" height="210" fill="url(#hd-sk2)"/><circle cx="180" cy="128" r="70" fill="url(#hd-sun2)"/><circle cx="180" cy="128" r="20" fill="#fff6d5"/>' +
        `<path d="${MOUNT_FAR}" fill="#9a8fb8" opacity=".7"/><path d="M0 160 C60 130 120 150 180 140 C240 130 300 150 360 136 L360 210 L0 210Z" fill="url(#hd-h1)"/>` +
        '<path d="M0 182 C70 160 140 178 200 168 C260 158 310 176 360 166 L360 210 L0 210Z" fill="url(#hd-h2)"/>' +
        tulip(40, 206, "hd-tR", 0.8) + tulip(58, 210, "hd-tY", 0.7) + tulip(76, 208, "hd-tO", 0.75) + tulip(300, 208, "hd-tR", 0.75) + tulip(318, 210, "hd-tY", 0.65) + tulip(334, 206, "hd-tR", 0.8) +
        '<path d="M360 0 C330 20 310 36 280 46 M318 28 C310 40 296 52 286 60 M340 14 C344 30 338 44 330 56" stroke="#6d4c41" stroke-width="3.2" fill="none" stroke-linecap="round"/>' +
        [[282, 46, 1], [298, 38, 0.9], [312, 30, 1.1], [288, 58, 0.9], [326, 22, 0.95], [336, 40, 1], [332, 54, 0.85], [304, 48, 0.8], [346, 10, 0.9]].map(b => blossom(b[0], b[1], b[2])).join(""));
    case "mar8":
      return svg("<defs>" + FLOWER_GRADS + '<linearGradient id="hd-sk3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b1640"/><stop offset=".6" stop-color="#7b2a5f"/><stop offset="1" stop-color="#c2477a"/></linearGradient>' +
        '<radialGradient id="hd-glow3" cx=".75" cy=".55" r=".55"><stop offset="0" stop-color="#ffd1e0" stop-opacity=".55"/><stop offset="1" stop-color="#ffd1e0" stop-opacity="0"/></radialGradient></defs>' +
        '<rect width="360" height="210" fill="url(#hd-sk3)"/><rect width="360" height="210" fill="url(#hd-glow3)"/>' +
        '<g transform="translate(292 150) scale(.8)">' + tulip(-26, 0, "hd-tR", 1.25) + tulip(0, 0, "hd-tR", 1.45) + tulip(26, 0, "hd-tR", 1.2) + tulip(-12, 4, "hd-tY", 1.05) + tulip(14, 4, "hd-tO", 1.1) +
        mimosa(-70, -60, 1.3, -20) + mimosa(30, -70, 1.2, -60) + mimosa(-40, -84, 1.1, -40) +
        '<path d="M-34 -6 L34 -6 L22 30 L-22 30Z" fill="#f8bbd0"/><path d="M-34 -6 L0 6 L34 -6" fill="none" stroke="#f48fb1" stroke-width="2"/><path d="M-6 -8 C-16 -16 -20 -4 -8 -4 M6 -8 C16 -16 20 -4 8 -4" stroke="#e91e63" stroke-width="2.5" fill="none"/></g>');
    case "sep1":
      return svg('<defs><linearGradient id="hd-sk4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f80d1"/><stop offset=".7" stop-color="#8fc8f2"/><stop offset="1" stop-color="#d9efff"/></linearGradient>' +
        '<radialGradient id="hd-sun4" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fffef5"/><stop offset=".35" stop-color="#fff2b8" stop-opacity=".9"/><stop offset="1" stop-color="#fff2b8" stop-opacity="0"/></radialGradient></defs>' +
        '<rect width="360" height="210" fill="url(#hd-sk4)"/><circle cx="70" cy="50" r="56" fill="url(#hd-sun4)"/><circle cx="70" cy="50" r="16" fill="#fffef2"/>' +
        '<g fill="#fff" opacity=".9"><ellipse cx="230" cy="52" rx="38" ry="12"/><ellipse cx="256" cy="44" rx="24" ry="14"/><ellipse cx="210" cy="46" rx="18" ry="10"/><ellipse cx="320" cy="84" rx="26" ry="8"/><ellipse cx="336" cy="78" rx="14" ry="9"/></g>' +
        `<path d="${MOUNT_FAR}" fill="#7d93b8" opacity=".55"/><g transform="translate(180 210)"><rect x="-110" y="-70" width="220" height="70" fill="#e9edf5"/><rect x="-110" y="-74" width="220" height="6" fill="#c9d2e3"/>` +
        '<path d="M-40 -74 L0 -104 L40 -74Z" fill="#dfe5f0"/><path d="M-40 -74 L0 -104 L40 -74" fill="none" stroke="#b8c3d8" stroke-width="2"/>' +
        [-96, -78, -60, -42, -24, 24, 42, 60, 78, 96].map(x => `<rect x="${x - 4}" y="-66" width="8" height="52" rx="2" fill="#d2d9e7"/>`).join("") +
        [-87, -69, -51, -33, 33, 51, 69, 87].map(x => `<rect x="${x - 4}" y="-56" width="8" height="12" rx="1" fill="#7aa6d6"/>`).join("") +
        '<rect x="-16" y="-38" width="32" height="38" rx="3" fill="#8d6e63"/><rect x="-1" y="-38" width="2" height="38" fill="#6d4c41"/></g>');
    case "indep":
      return svg('<defs><linearGradient id="hd-sk5" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1b3e"/><stop offset=".55" stop-color="#3a2d5e"/><stop offset="1" stop-color="#d9775b"/></linearGradient></defs>' +
        `<rect width="360" height="210" fill="url(#hd-sk5)"/>${stars(30, 70)}<path d="${MOUNT_FAR}" fill="#2a2347"/><path d="${MOUNT_NEAR}" fill="#17142c"/>` +
        '<rect x="70" y="40" width="3" height="170" fill="#c9ccd6"/><circle cx="71.5" cy="38" r="3.4" fill="#f8c300"/>');
    case "eid":
      return svg('<defs><linearGradient id="hd-sk6" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03151a"/><stop offset=".7" stop-color="#0b3138"/><stop offset="1" stop-color="#145056"/></linearGradient>' +
        '<radialGradient id="hd-halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe8a3" stop-opacity=".55"/><stop offset="1" stop-color="#ffe8a3" stop-opacity="0"/></radialGradient>' +
        '<radialGradient id="hd-lan" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe9a6"/><stop offset=".6" stop-color="#ffb84d"/><stop offset="1" stop-color="#c76a00"/></radialGradient>' +
        '<radialGradient id="hd-lg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffcf6b" stop-opacity=".55"/><stop offset="1" stop-color="#ffcf6b" stop-opacity="0"/></radialGradient></defs>' +
        `<rect width="360" height="210" fill="url(#hd-sk6)"/>${stars(60, 160)}<circle cx="250" cy="66" r="62" fill="url(#hd-halo)"/>` +
        '<path d="M262 30 A38 38 0 1 0 262 102 A30 30 0 1 1 262 30Z" fill="#ffe7a0"/>' +
        [[60, 44], [104, 64], [150, 36]].map((l, i) => `<g transform="translate(${l[0]} 0)"><g><line x1="0" y1="0" x2="0" y2="${l[1]}" stroke="#b08a4a" stroke-width="1"/>` +
          `<g transform="translate(0 ${l[1]})"><circle r="26" fill="url(#hd-lg)"/><path d="M-6 -2 L6 -2 L4 -8 L-4 -8Z" fill="#8a6a2e"/><path d="M-9 0 C-11 10 -9 18 0 22 C9 18 11 10 9 0Z" fill="url(#hd-lan)" stroke="#8a6a2e" stroke-width="1"/>` +
          '<path d="M0 0 L0 22 M-5 1 C-6 10 -5 17 0 21 M5 1 C6 10 5 17 0 21" stroke="#8a6a2e" stroke-width=".8" fill="none"/><path d="M-3 22 L3 22 L0 27Z" fill="#8a6a2e"/></g></g></g>').join("") +
        '<path d="M0 190 L360 190 L360 210 L0 210Z" fill="#06191c"/><path d="M196 190 L196 150 C196 132 214 120 226 112 C238 120 256 132 256 150 L256 190Z" fill="#06191c"/><rect x="178" y="128" width="8" height="62" fill="#06191c"/><path d="M182 112 L186 128 L178 128Z" fill="#06191c"/><rect x="266" y="128" width="8" height="62" fill="#06191c"/><path d="M270 112 L274 128 L266 128Z" fill="#06191c"/>');
  }
}

/** Гирлянда: провод с провисом и лампочки с ореолом (ширина 360, растягивается). */
export function garlandSvg(): string {
  const cols = ["#ff4d5e", "#ffd34d", "#4dff9a", "#4db8ff", "#d64dff"];
  let s = "<defs>";
  cols.forEach((c, i) => {
    s += `<radialGradient id="hd-gb${i}" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity=".85"/></radialGradient>` +
      `<radialGradient id="hd-gh${i}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${c}" stop-opacity=".6"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
  });
  s += "</defs>";
  const seg = 4, w = 360 / seg;
  let path = "M0 4";
  for (let k = 0; k < seg; k++) path += ` Q${k * w + w / 2} 26 ${(k + 1) * w} 4`;
  s += `<path d="${path}" stroke="#1d2b1d" stroke-width="1.6" fill="none"/>`;
  let n = 0;
  for (let k = 0; k < seg; k++) for (let j = 1; j <= 4; j++) {
    const t = j / 5, x = k * w + t * w, y = (1 - t) * (1 - t) * 4 + 2 * (1 - t) * t * 26 + t * t * 4, ci = n % 5;
    s += `<g><circle cx="${x}" cy="${y + 8}" r="11" fill="url(#hd-gh${ci})"/>` +
      `<rect x="${x - 2}" y="${y - 1}" width="4" height="4" rx="1" fill="#3a3a3a"/><ellipse cx="${x}" cy="${y + 8}" rx="3.6" ry="5.2" fill="url(#hd-gb${ci})"/></g>`;
    n++;
  }
  return `<svg viewBox="0 0 360 40" preserveAspectRatio="none">${s}</svg>`;
}

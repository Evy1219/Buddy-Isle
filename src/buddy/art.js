// Procedural pixel paintings. An artwork is just {kind, seed, ...} — the pixels are
// re-generated from the seed whenever needed, so saves stay tiny.
import { RNG, makeNoise2D } from '../core/rng.js';

export const ART_SIZE = 32;

export const ART_KINDS = ['landscape', 'sunset', 'night', 'sea', 'flowers', 'abstract', 'portrait', 'selfportrait', 'memory', 'pattern'];

const hex = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

class Pix {
  constructor(n, rng) {
    this.n = n; this.rng = rng;
    this.d = new Float32Array(n * n * 3);
  }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.n || y >= this.n) return;
    const i = (y * this.n + x) * 3;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2];
  }
  get(x, y) { const i = (y * this.n + x) * 3; return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  rect(x0, y0, w, h, c) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c); }
  circle(cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c);
  }
  vgrad(c1, c2, y0 = 0, y1 = this.n) {
    for (let y = y0; y < y1; y++) { const c = mixc(c1, c2, (y - y0) / Math.max(1, y1 - y0 - 1)); for (let x = 0; x < this.n; x++) this.set(x, y, c); }
  }
  line(x0, y0, x1, y1, c) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) this.set(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, c);
  }
  // painterly grain
  grain(amount = 10) {
    for (let i = 0; i < this.d.length; i += 3) {
      const g = (this.rng.float() - 0.5) * amount;
      this.d[i] += g; this.d[i + 1] += g; this.d[i + 2] += g;
    }
  }
}

function hills(p, rng, baseY, amp, color, freq = 0.12) {
  const noise = makeNoise2D(rng.int(1, 1e9));
  const tops = [];
  for (let x = 0; x < p.n; x++) {
    const top = Math.round(baseY + noise(x * freq, 0.5) * amp);
    tops.push(top);
    for (let y = top; y < p.n; y++) p.set(x, y, color);
  }
  return tops;
}

function tree(p, x, y, c) {
  p.set(x, y, [90, 62, 40]); p.set(x, y - 1, [90, 62, 40]);
  p.rect(x - 1, y - 4, 3, 3, c); p.set(x, y - 5, c);
}

const SKIES = {
  morning: [[120, 180, 235], [250, 214, 180]],
  noon: [[70, 150, 225], [190, 225, 245]],
  dusk: [[60, 70, 140], [250, 140, 90]],
};

function drawLandscape(p, rng, o) {
  const sky = SKIES[rng.pick(['morning', 'noon', 'dusk'])];
  p.vgrad(sky[0], sky[1], 0, 22);
  p.circle(rng.int(5, 26), rng.int(5, 10), rng.int(2, 3), [255, 236, 170]);
  for (let i = 0; i < 3; i++) { const cx = rng.int(0, 31), cy = rng.int(3, 11); p.rect(cx, cy, rng.int(4, 8), 2, [245, 248, 252]); }
  hills(p, rng, 16, 3, [118, 150, 170], 0.09);
  hills(p, rng, 20, 3, [92, 150, 88], 0.13);
  const front = hills(p, rng, 25, 2, [70, 125, 62], 0.2);
  for (let i = 0; i < rng.int(2, 6); i++) { const x = rng.int(2, 29); tree(p, x, front[x] - 1, rng.pick([[60, 120, 60], [230, 150, 190], [215, 120, 50]])); }
  if (o.houseColor) { const x = rng.int(6, 22); p.rect(x, front[x] - 4, 4, 3, [235, 225, 205]); p.rect(x - 1, front[x] - 5, 6, 1, hex(o.houseColor)); p.set(x + 1, front[x] - 2, [90, 62, 40]); }
}

function drawSunset(p, rng) {
  p.vgrad([70, 50, 120], [250, 150, 90], 0, 18);
  p.vgrad([250, 150, 90], [255, 200, 120], 18, 20);
  p.circle(16 + rng.int(-6, 6), 19, rng.int(4, 6), [255, 225, 140]);
  p.vgrad([40, 70, 120], [20, 40, 80], 20, 32);
  for (let y = 21; y < 32; y += 2) {
    const w = rng.int(2, 7), x = 16 - w + rng.int(-3, 3);
    p.rect(x, y, w * 2, 1, [250, 190, 120]);
  }
  if (rng.chance(0.7)) { const x = rng.int(2, 18); p.rect(x, 18, rng.int(5, 10), 2, [40, 30, 50]); p.set(x + 2, 15, [40, 30, 50]); p.rect(x + 1, 16, 3, 2, [40, 30, 50]); }
  for (let i = 0; i < 3; i++) { const x = rng.int(3, 28), y = rng.int(3, 10); p.set(x, y, [40, 30, 60]); p.set(x - 1, y - 1, [40, 30, 60]); p.set(x + 1, y - 1, [40, 30, 60]); }
}

function drawNight(p, rng) {
  p.vgrad([8, 12, 35], [35, 45, 90], 0, 24);
  for (let i = 0; i < 40; i++) p.set(rng.int(0, 31), rng.int(0, 20), rng.chance(0.2) ? [255, 240, 180] : [220, 225, 255]);
  const mx = rng.int(6, 25), my = rng.int(5, 9);
  p.circle(mx, my, 4, [245, 240, 215]);
  if (rng.chance(0.6)) p.circle(mx + 2, my - 1, 3.5, [15, 20, 45]);
  const front = hills(p, rng, 24, 3, [20, 30, 45], 0.12);
  const hx = rng.int(8, 20);
  p.rect(hx, front[hx] - 4, 5, 4, [35, 35, 50]);
  p.rect(hx - 1, front[hx] - 5, 7, 1, [50, 40, 55]);
  p.set(hx + 1, front[hx] - 2, [255, 210, 110]); p.set(hx + 3, front[hx] - 2, [255, 210, 110]);
}

function drawSea(p, rng) {
  p.vgrad([110, 180, 235], [200, 230, 245], 0, 16);
  p.vgrad([40, 130, 190], [20, 80, 140], 16, 26);
  p.vgrad([235, 215, 160], [215, 190, 135], 26, 32);
  for (let i = 0; i < 18; i++) p.rect(rng.int(0, 30), rng.int(17, 25), rng.int(1, 3), 1, [200, 235, 250]);
  for (let x = 0; x < 32; x++) if (rng.chance(0.5)) p.set(x, 26, [245, 250, 255]);
  if (rng.chance(0.8)) { const x = rng.int(4, 24), y = rng.int(16, 20); p.rect(x, y, 6, 1, [120, 80, 50]); p.line(x + 3, y - 1, x + 3, y - 6, [90, 62, 40]); p.rect(x + 4, y - 6, 2, 5, [250, 250, 245]); }
  for (let i = 0; i < 2; i++) { const x = rng.int(3, 28), y = rng.int(3, 10); p.set(x, y, [60, 60, 70]); p.set(x - 1, y - 1, [60, 60, 70]); p.set(x + 1, y - 1, [60, 60, 70]); }
}

function drawFlowers(p, rng, o) {
  const bg = rng.pick([[240, 228, 200], [196, 222, 214], [230, 200, 210], [60, 70, 90]]);
  p.rect(0, 0, 32, 32, bg);
  p.rect(0, 25, 32, 7, [150, 105, 70]);
  const vx = rng.int(11, 17);
  const vase = hex(o.color || 0x3a62c9);
  p.rect(vx, 18, 6, 7, vase); p.rect(vx + 1, 17, 4, 1, vase); p.rect(vx + 1, 25, 4, 1, vase);
  const cols = [[220, 60, 60], [245, 210, 60], [150, 95, 210], [250, 250, 245], [240, 140, 190], [90, 140, 230]];
  for (let i = 0; i < rng.int(5, 8); i++) {
    const fx = vx + 3 + rng.int(-8, 8), fy = rng.int(4, 12);
    p.line(vx + 3, 17, fx, fy, [70, 130, 60]);
    const c = rng.pick(cols);
    p.circle(fx, fy, rng.int(1, 2), c);
    p.set(fx, fy, [255, 220, 90]);
  }
}

function drawAbstract(p, rng, o) {
  const base = hex(o.color || 0xffc65a);
  const pal = [base, [base[2], base[0], base[1]], [255 - base[0] * 0.5, 230, 210], [30, 40, 70], [240, 235, 225]];
  p.rect(0, 0, 32, 32, rng.pick(pal));
  for (let i = 0; i < rng.int(4, 8); i++) {
    const c = rng.pick(pal);
    const t = rng.int(0, 3);
    if (t === 0) p.circle(rng.int(0, 31), rng.int(0, 31), rng.int(3, 9), c);
    else if (t === 1) p.rect(rng.int(-4, 28), rng.int(-4, 28), rng.int(4, 16), rng.int(4, 16), c);
    else if (t === 2) { const y = rng.int(0, 31); for (let k = 0; k < rng.int(1, 4); k++) p.rect(0, y + k * 3, 32, 1, c); }
    else { const x0 = rng.int(0, 31), y0 = rng.int(0, 31); for (let k = 0; k < 3; k++) p.line(x0, y0 + k, rng.int(0, 31), rng.int(0, 31) + k, c); }
  }
}

function drawPortrait(p, rng, o) {
  p.rect(0, 0, 32, 32, rng.pick([[150, 200, 220], [230, 200, 160], [190, 220, 180], [235, 190, 200]]));
  const shirt = hex(o.shirt || 0x3fa7a0);
  p.rect(6, 25, 20, 7, shirt); p.rect(9, 23, 14, 3, shirt);
  const skin = [240, 201, 160];
  p.rect(10, 7, 12, 14, skin);
  p.rect(13, 21, 6, 3, skin);
  const hair = rng.pick([[80, 55, 35], [40, 30, 25], [190, 140, 70], [140, 70, 40]]);
  p.rect(9, 5, 14, 4, hair); p.rect(9, 8, 2, 5, hair); p.rect(21, 8, 2, 5, hair);
  p.rect(12, 12, 2, 2, [40, 40, 50]); p.rect(18, 12, 2, 2, [40, 40, 50]);
  p.rect(13, 17, 6, 1, [180, 90, 80]); p.set(12, 16, [180, 90, 80]); p.set(19, 16, [180, 90, 80]);
  p.set(11, 15, [240, 160, 150]); p.set(20, 15, [240, 160, 150]);
}

function drawSelf(p, rng, o) {
  const c = hex(o.color || 0xffc65a);
  p.rect(0, 0, 32, 32, rng.pick([[40, 60, 90], [220, 235, 240], [250, 225, 190]]));
  p.rect(8, 22, 16, 10, c);
  p.rect(7, 8, 18, 14, [240, 238, 230]);
  p.rect(9, 10, 14, 9, [30, 40, 60]);
  p.rect(11, 12, 3, 4, [140, 240, 255]); p.rect(18, 12, 3, 4, [140, 240, 255]);
  p.rect(14, 17, 4, 1, [140, 240, 255]);
  p.line(16, 8, 16, 3, [120, 120, 130]);
  p.circle(16, 3, 2, c);
  for (let i = 0; i < 6; i++) p.set(rng.int(0, 31), rng.int(0, 6), [255, 255, 255]);
}

function drawMemory(p, rng, o) {
  const evening = rng.chance(0.4);
  if (evening) p.vgrad([70, 60, 130], [250, 160, 110], 0, 22); else p.vgrad([90, 160, 230], [200, 230, 245], 0, 22);
  hills(p, rng, 23, 1, [100, 160, 80], 0.1);
  p.rect(0, 27, 32, 5, [80, 140, 70]);
  const t = o.subject || 'cottage';
  const wall = [235, 225, 205], roof = [184, 71, 58], stone = [140, 145, 150];
  if (t === 'tower' || t === 'lighthouse') {
    for (let y = 6; y < 24; y++) p.rect(13, y, 6, 1, t === 'lighthouse' ? (Math.floor(y / 3) % 2 ? [220, 60, 60] : [245, 245, 240]) : stone);
    p.rect(12, 4, 8, 2, roof); p.rect(15, 12, 2, 2, [255, 220, 120]);
  } else if (t === 'windmill') {
    p.rect(12, 12, 8, 12, wall); p.rect(11, 10, 10, 2, roof);
    p.line(16, 12, 7, 3, [120, 90, 60]); p.line(16, 12, 25, 3, [120, 90, 60]); p.line(16, 12, 7, 21, [120, 90, 60]); p.line(16, 12, 25, 21, [120, 90, 60]);
  } else if (t === 'grove' || t === 'garden' || t === 'flowerfield') {
    for (let i = 0; i < 6; i++) tree(p, rng.int(3, 29), 25, rng.pick([[60, 120, 60], [230, 150, 190], [215, 120, 50]]));
    for (let i = 0; i < 12; i++) p.set(rng.int(0, 31), rng.int(27, 31), rng.pick([[220, 60, 60], [245, 210, 60], [250, 250, 245]]));
  } else if (t === 'pond' || t === 'pier') {
    p.rect(4, 24, 24, 4, [60, 130, 200]); p.rect(8, 23, 16, 1, [60, 130, 200]);
    for (let i = 0; i < 5; i++) p.set(rng.int(6, 26), rng.int(24, 27), [150, 200, 240]);
  } else {
    p.rect(9, 15, 14, 10, wall); p.rect(7, 13, 18, 2, roof); p.rect(9, 11, 14, 2, roof); p.rect(12, 9, 8, 2, roof);
    p.rect(14, 19, 3, 6, [110, 75, 45]); p.rect(19, 17, 2, 2, [255, 220, 130]); p.rect(11, 17, 2, 2, [255, 220, 130]);
  }
  if (evening) p.circle(26, 6, 2, [255, 225, 150]);
}

function drawPattern(p, rng, o) {
  const a = hex(o.color || 0xffc65a), b = rng.pick([[240, 235, 225], [40, 50, 80], [120, 190, 170]]);
  const kind = rng.int(0, 2);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let v;
    if (kind === 0) v = ((x >> 2) + (y >> 2)) % 2;
    else if (kind === 1) v = Math.floor(Math.hypot(x - 15.5, y - 15.5) / 3) % 2;
    else v = Math.floor((x + y) / 4) % 2;
    p.set(x, y, v ? a : b);
  }
}

const DRAW = {
  landscape: drawLandscape, sunset: drawSunset, night: drawNight, sea: drawSea, flowers: drawFlowers,
  abstract: drawAbstract, portrait: drawPortrait, selfportrait: drawSelf, memory: drawMemory, pattern: drawPattern,
};

// Returns ImageData-ready RGBA bytes
export function renderArt(art) {
  const rng = new RNG(art.seed);
  const p = new Pix(ART_SIZE, rng);
  (DRAW[art.kind] || drawLandscape)(p, rng, art.opts || {});
  p.grain(art.kind === 'pattern' ? 4 : 12);
  const out = new Uint8ClampedArray(ART_SIZE * ART_SIZE * 4);
  for (let i = 0, j = 0; i < p.d.length; i += 3, j += 4) {
    out[j] = p.d[i]; out[j + 1] = p.d[i + 1]; out[j + 2] = p.d[i + 2]; out[j + 3] = 255;
  }
  return out;
}

const cache = new Map();
export function artCanvas(art) {
  if (cache.has(art.id)) return cache.get(art.id);
  const c = document.createElement('canvas');
  c.width = c.height = ART_SIZE;
  const ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(renderArt(art), ART_SIZE, ART_SIZE), 0, 0);
  cache.set(art.id, c);
  return c;
}

export function artDataURL(art) { return artCanvas(art).toDataURL(); }

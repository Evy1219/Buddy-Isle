// Things you can collect: fish you catch, and keepsakes your buddy gives you.
import { mulberry32 } from '../core/rng.js';

// where: 'sea' | 'pond' | 'any'; when: 'day' | 'night' | 'any'; rarity: higher = rarer
export const FISH = [
  { id: 'sardine', name: 'Sardine', where: 'sea', when: 'any', rarity: 1, size: [10, 18], body: '#9fb8c8', belly: '#e8eef2', fin: '#7090a8', shape: 'slim' },
  { id: 'mackerel', name: 'Mackerel', where: 'sea', when: 'day', rarity: 1.5, size: [25, 40], body: '#4a7a9a', belly: '#dfe8ea', fin: '#2f5a78', shape: 'slim', stripes: '#1f3f58' },
  { id: 'snapper', name: 'Red Snapper', where: 'sea', when: 'day', rarity: 2, size: [30, 60], body: '#e0584a', belly: '#f6c0b0', fin: '#b83a30', shape: 'round' },
  { id: 'clownfish', name: 'Clownfish', where: 'sea', when: 'day', rarity: 3, size: [6, 11], body: '#ff8a2a', belly: '#ffb060', fin: '#222', shape: 'round', stripes: '#ffffff' },
  { id: 'pufferfish', name: 'Pufferfish', where: 'sea', when: 'any', rarity: 3.5, size: [15, 30], body: '#e8d27a', belly: '#f6eec8', fin: '#b89a40', shape: 'puffer', spots: '#8a6a30' },
  { id: 'squid', name: 'Squid', where: 'sea', when: 'night', rarity: 3, size: [20, 45], body: '#f0b8c8', belly: '#fadce4', fin: '#d890a8', shape: 'squid' },
  { id: 'moonfish', name: 'Moonfish', where: 'sea', when: 'night', rarity: 5, size: [40, 90], body: '#c8d8ff', belly: '#ffffff', fin: '#9fb0e8', shape: 'round', glow: true },
  { id: 'starfish', name: 'Starfish', where: 'sea', when: 'any', rarity: 2.5, size: [8, 20], body: '#ff9a6a', belly: '#ffc09a', fin: '#e07040', shape: 'star' },
  { id: 'tuna', name: 'Bluefin Tuna', where: 'sea', when: 'day', rarity: 4.5, size: [90, 200], body: '#2f4f78', belly: '#d8e0e8', fin: '#f2c84b', shape: 'big' },
  { id: 'goldfish', name: 'Goldfish', where: 'pond', when: 'any', rarity: 1.2, size: [5, 15], body: '#ff9a2a', belly: '#ffd080', fin: '#ff7a1a', shape: 'round' },
  { id: 'carp', name: 'Carp', where: 'pond', when: 'any', rarity: 1, size: [30, 70], body: '#a88a4a', belly: '#e0cfa0', fin: '#7a6030', shape: 'slim' },
  { id: 'koi', name: 'Koi', where: 'pond', when: 'day', rarity: 3, size: [30, 60], body: '#f6f0e8', belly: '#ffffff', fin: '#f6f0e8', shape: 'slim', spots: '#e0482a' },
  { id: 'frog', name: 'Surprised Frog', where: 'pond', when: 'any', rarity: 4, size: [5, 9], body: '#6cc070', belly: '#c8f0a0', fin: '#3f8a46', shape: 'frog' },
  { id: 'catfish', name: 'Catfish', where: 'pond', when: 'night', rarity: 2.5, size: [30, 80], body: '#6a6058', belly: '#c8bca8', fin: '#4a423a', shape: 'slim' },
  { id: 'boot', name: 'Old Boot', where: 'any', when: 'any', rarity: 2, size: [25, 30], body: '#6b4a2f', belly: '#5a3d27', fin: '#3a2618', shape: 'boot', junk: true },
  { id: 'rainbowtrout', name: 'Rainbow Trout', where: 'any', when: 'any', rarity: 4, size: [30, 60], body: '#9fb8a0', belly: '#f0e0e8', fin: '#7a9a80', shape: 'slim', stripes: '#ff8fb6', rain: true },
  { id: 'crystalfish', name: 'Crystal Fish', where: 'any', when: 'night', rarity: 7, size: [12, 24], body: '#9fe3ff', belly: '#e8faff', fin: '#6fc8f0', shape: 'round', glow: true },
];

export function pickFish({ where, night, rain }, rnd = Math.random) {
  const pool = FISH.filter((f) => (f.where === 'any' || f.where === where) && (f.when === 'any' || (f.when === 'night') === night));
  let total = 0;
  const w = pool.map((f) => { let x = 1 / f.rarity ** 1.6; if (f.rain && rain) x *= 6; if (f.rain && !rain) x *= 0.15; total += x; return x; });
  let r = rnd() * total;
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[0];
}

export function fishSize(f, rnd = Math.random) {
  const [a, b] = f.size;
  const k = Math.pow(rnd(), 1.8);
  return Math.round((a + (b - a) * k) * 10) / 10;
}

// Little pixel picture of a fish
export function fishCanvas(f, scale = 4) {
  const W = 24, H = 16;
  const c = document.createElement('canvas');
  c.width = W * scale; c.height = H * scale;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x * scale, y * scale, scale, scale); };
  const r = mulberry32(f.id.length * 977 + f.id.charCodeAt(0));
  const ell = (cx, cy, rx, ry, col, cond = () => true) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 && cond(x, y)) px(x, y, col); };
  switch (f.shape) {
    case 'star':
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = x - 12, dy = y - 8, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
        if (d < 3 + 4.2 * Math.abs(Math.cos(a * 2.5))) px(x, y, d < 3 ? f.belly : f.body);
      }
      break;
    case 'boot':
      for (let y = 2; y < 14; y++) for (let x = 6; x < 13; x++) px(x, y, f.body);
      for (let y = 10; y < 14; y++) for (let x = 6; x < 19; x++) px(x, y, f.body);
      for (let x = 6; x < 19; x++) px(x, 14, f.fin);
      px(9, 4, f.fin); px(10, 6, f.fin); px(9, 8, f.fin);
      break;
    case 'frog':
      ell(12, 9, 7, 5, f.body); ell(12, 11, 5, 2.5, f.belly);
      ell(8, 4, 2, 2, f.body); ell(16, 4, 2, 2, f.body); px(8, 4, '#111'); px(16, 4, '#111');
      for (let x = 10; x < 15; x++) px(x, 9, '#2a5a2a');
      break;
    case 'squid':
      ell(9, 8, 6, 4, f.body);
      for (let i = 0; i < 4; i++) for (let x = 15; x < 22; x++) px(x, 5 + i * 2 + ((x + i) % 2), f.fin);
      px(13, 7, '#111');
      break;
    default: {
      const rx = f.shape === 'big' ? 10 : f.shape === 'round' || f.shape === 'puffer' ? 7 : 8.5;
      const ry = f.shape === 'slim' ? 3.2 : f.shape === 'puffer' ? 6 : f.shape === 'big' ? 5 : 5;
      // tail
      for (let y = 0; y < H; y++) for (let x = 0; x < 6; x++) if (Math.abs(y - 8) <= 6 - x) px(x + 1, y, f.fin);
      ell(13, 8, rx, ry, f.body);
      ell(13, 9.5, rx * 0.8, ry * 0.45, f.belly, (x, y) => y > 8);
      if (f.stripes) for (let x = 8; x < 22; x += 4) for (let y = 2; y < 14; y++) if (((x - 13) / rx) ** 2 + ((y - 8) / ry) ** 2 <= 1) px(x, y, f.stripes);
      if (f.spots) for (let i = 0; i < 6; i++) { const x = 9 + Math.floor(r() * 9), y = 6 + Math.floor(r() * 4); px(x, y, f.spots); }
      if (f.shape === 'puffer') for (let i = 0; i < 10; i++) { const a = r() * Math.PI * 2; px(Math.round(13 + Math.cos(a) * (rx + 1)), Math.round(8 + Math.sin(a) * (ry + 1)), f.fin); }
      px(13 + Math.round(rx * 0.6), 7, '#111'); px(13 + Math.round(rx * 0.6), 6, '#fff');
      for (let y = 4; y < 8; y++) px(12, y - (y > 5 ? 0 : 1), f.fin);
    }
  }
  if (f.glow) { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(160,220,255,0.18)'; g.fillRect(0, 0, c.width, c.height); }
  return c;
}

// ---------- keepsakes the buddy gives you ----------
const SHELLS = ['a spiral shell', 'a pink scallop shell', 'a tiny conch shell', 'a smooth white shell'];
const STONES = ['a heart-shaped pebble', 'a pebble with a hole in it (lucky!)', 'a perfectly round stone', 'a striped pebble'];
const POEMS = [
  ['Blocks in the sun,', 'lanterns at night,', 'everything I build', 'is better in your light.'],
  ['The waves keep time,', 'the trees keep score,', 'and every day you visit', 'I like this place more.'],
  ['I made a tower,', 'I made a bridge,', 'but my favourite thing', 'is you, on the ridge.'],
  ['When you are gone', 'I count the hours', 'by how many blocks', 'are in my towers.'],
];

export function makeGift(game, rng) {
  const st = game.state, b = st.buddy, player = st.playerName || 'friend';
  const opts = [
    ['shell', 3], ['stone', 3], ['flowers', 3], ['crystal', 1.5], ['poem', b.friendship > 60 ? 2 : 0.5],
    ['painting', st.artworks.length ? 2 : 0], ['model', st.projects.filter((p) => p.done).length ? 1.5 : 0], ['star', 1],
  ];
  const kind = rng.weighted(opts);
  switch (kind) {
    case 'shell': { const s = rng.pick(SHELLS); return { kind, title: s[0].toUpperCase() + s.slice(1).replace(/^A /, 'A '), desc: `${b.name} found ${s} on the beach and thought of you.`, icon: 'shell' }; }
    case 'stone': { const s = rng.pick(STONES); return { kind, title: s.replace(/^a /, 'A '), desc: `${b.name} says it's ${s}. You should keep it in your pocket.`, icon: 'stone' }; }
    case 'flowers': return { kind, title: 'A flower crown', desc: `Woven from flowers on the island. ${b.name} says it suits you, ${player}.`, icon: 'flowers' };
    case 'crystal': return { kind, title: 'A glowing crystal', desc: `${b.name} found this deep under the hill. It glows a little at night.`, icon: 'crystal' };
    case 'poem': { const p = rng.pick(POEMS); return { kind, title: 'A poem', desc: p.join('\n'), icon: 'poem' }; }
    case 'painting': { const a = rng.pick(st.artworks); return { kind, title: `A small copy of "${a.title}"`, desc: `${b.name} painted a little copy of this one just for you.`, artId: a.id, icon: 'painting' }; }
    case 'model': { const p = rng.pick(st.projects.filter((q) => q.done && q.type !== 'path')); return { kind, title: `A tiny model of ${p.title}`, desc: `${b.name} built a palm-sized model of ${p.title}. It even has tiny windows.`, icon: 'model' }; }
    default: { const n = `${player}'s Star`; return { kind: 'star', title: n, desc: `${b.name} named a star after you. Look up on a clear night: it's the bright one near the moon.`, icon: 'star' }; }
  }
}

export const KEEPSAKE_ICONS = { shell: '🐚', stone: '🪨', flowers: '💐', crystal: '💎', poem: '📜', painting: '🖼️', model: '🏠', star: '⭐', fish: '🐟' };

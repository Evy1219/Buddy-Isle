import * as THREE from 'three';

// Block palette. ids fit in one byte so saves stay small. Never renumber existing ids.
// shape 'cube' = full block. shape 'boxes' = little models made of boxes (flowers, lanterns, furniture...)
// light: how much warm light the block gives off at night (0..1)
// sway: plants and leaves move in the wind (0..1)
// foliage: 1 grass, 2 leafy trees, 3 evergreen. Used for seasonal colours.
export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, SNOW: 5, LOG: 6, PLANKS: 7, LEAVES: 8,
  BRICK: 9, COBBLE: 10, GLASS: 11, ROOF_RED: 12, ROOF_BLUE: 13, THATCH: 14, LANTERN: 15,
  WATER: 16, FLOWER_RED: 17, FLOWER_YELLOW: 18, FLOWER_PURPLE: 19, FLOWER_WHITE: 20,
  PATH: 21, FENCE: 22, HAY: 23, MARBLE: 24, DARKWOOD: 25, MOSSY: 26, CRYSTAL: 27,
  PUMPKIN: 28, TERRACOTTA: 29, FIRE: 30, LEAVES_PINK: 31, LEAVES_ORANGE: 32, LEAVES_PINE: 33,
  BIRCH: 34, TALLGRASS: 35, ROOF_GREEN: 36, GRAVEL: 37, CROP: 38, MUSHROOM: 39, LILY: 40,
  FLOWER_BLUE: 41, GOLD: 42,
  // paint colours (used for murals, art, accents)
  P_WHITE: 48, P_LGRAY: 49, P_GRAY: 50, P_BLACK: 51, P_RED: 52, P_ORANGE: 53, P_YELLOW: 54,
  P_LIME: 55, P_GREEN: 56, P_TEAL: 57, P_SKY: 58, P_BLUE: 59, P_PURPLE: 60, P_PINK: 61,
  P_BROWN: 62, P_PEACH: 63,
  // furniture + living things (v2)
  BED_X: 64, BED_Z: 65, TABLE: 66, STOOL: 67, BOOKSHELF: 68, RUG_RED: 69, RUG_BLUE: 70, RUG_GREEN: 71,
  POT_FLOWER: 72, BARREL: 73, CRATE: 74, BENCH_X: 75, BENCH_Z: 76, STUMP: 77, SAPLING: 78,
  CROP_YOUNG: 79, CHIMNEY: 80, STONE_BRICK: 81, LAMP: 82, PLANTER: 83, SHELF_POTS: 84, CANDLE: 85,
};

const cube = (name, top, side = top, bottom = side, extra = {}) => ({
  name, shape: 'cube', top, side, bottom, solid: true, opaque: true, ...extra,
});
const boxes = (name, list, extra = {}) => ({
  name, shape: 'boxes', boxes: list, solid: false, opaque: false, ...extra,
});
const stem = (c = 0x4f8a33) => ({ b: [0.46, 0, 0.46, 0.54, 0.42, 0.54], c });
const bloom = (c) => ({ b: [0.34, 0.36, 0.34, 0.66, 0.64, 0.66], c });
const center = (c) => ({ b: [0.42, 0.5, 0.42, 0.58, 0.68, 0.58], c });
const flower = (name, petal, mid) => boxes(name, [stem(), bloom(petal), center(mid)], { sway: 1, plant: true });

export const BLOCKS = [];
BLOCKS[B.AIR] = { name: 'air', shape: 'none', solid: false, opaque: false };
BLOCKS[B.GRASS] = cube('grass', 0x79c25a, 0x8f6c46, 0x8f6c46, { sideTop: 0x6fb24f, foliage: 1 });
BLOCKS[B.DIRT] = cube('dirt', 0x8f6c46);
BLOCKS[B.STONE] = cube('stone', 0x8e9298);
BLOCKS[B.SAND] = cube('sand', 0xe8d59b);
BLOCKS[B.SNOW] = cube('snow', 0xf3f6f8, 0xdfe6ea);
BLOCKS[B.LOG] = cube('log', 0xa98252, 0x7a5230);
BLOCKS[B.PLANKS] = cube('planks', 0xc79c63);
BLOCKS[B.LEAVES] = cube('leaves', 0x4f9e3f, 0x4f9e3f, 0x4f9e3f, { foliage: 2, sway: 0.35 });
BLOCKS[B.BRICK] = cube('brick', 0xb4553e);
BLOCKS[B.COBBLE] = cube('cobblestone', 0x7d8085);
BLOCKS[B.GLASS] = cube('glass', 0xcdeef7, 0xcdeef7, 0xcdeef7, { opaque: false, transparent: true, window: true });
BLOCKS[B.ROOF_RED] = cube('red roof', 0xb8473a, 0xa63f34);
BLOCKS[B.ROOF_BLUE] = cube('blue roof', 0x4a70ab, 0x41639a);
BLOCKS[B.THATCH] = cube('thatch', 0xd7b85e, 0xc8a64f);
BLOCKS[B.LANTERN] = boxes('lantern', [
  { b: [0.3, 0.05, 0.3, 0.7, 0.55, 0.7], c: 0xffd27a, glow: true },
  { b: [0.26, 0.55, 0.26, 0.74, 0.64, 0.74], c: 0x3a2c22 },
  { b: [0.26, 0, 0.26, 0.74, 0.06, 0.74], c: 0x3a2c22 },
], { light: 1 });
BLOCKS[B.WATER] = cube('water', 0x3b8fd0, 0x3b8fd0, 0x3b8fd0, { opaque: false, transparent: true, solid: false, liquid: true });
BLOCKS[B.FLOWER_RED] = flower('red flower', 0xdc4545, 0xffd75e);
BLOCKS[B.FLOWER_YELLOW] = flower('yellow flower', 0xf5d43c, 0xe48a2a);
BLOCKS[B.FLOWER_PURPLE] = flower('purple flower', 0x9b5fd6, 0xf2e3ff);
BLOCKS[B.FLOWER_WHITE] = flower('white flower', 0xf6f4ee, 0xf3c742);
BLOCKS[B.FLOWER_BLUE] = flower('blue flower', 0x5b8fe6, 0xffffff);
BLOCKS[B.PATH] = cube('path', 0xc2a370, 0x9c7c52);
BLOCKS[B.FENCE] = boxes('fence post', [
  { b: [0.37, 0, 0.37, 0.63, 1, 0.63], c: 0x8a6239 },
  { b: [0.33, 0.92, 0.33, 0.67, 1.0, 0.67], c: 0x9d7346 },
], { solid: true });
BLOCKS[B.HAY] = cube('hay', 0xe0c24f, 0xd4b13f);
BLOCKS[B.MARBLE] = cube('marble', 0xece8df);
BLOCKS[B.DARKWOOD] = cube('dark wood', 0x5a3d27);
BLOCKS[B.MOSSY] = cube('mossy stone', 0x6f8a5c, 0x7a8670);
BLOCKS[B.CRYSTAL] = cube('crystal', 0x9fe3ff, 0x9fe3ff, 0x9fe3ff, { glow: true, light: 0.6 });
BLOCKS[B.PUMPKIN] = cube('pumpkin', 0xd9772a, 0xe68a30);
BLOCKS[B.TERRACOTTA] = cube('terracotta', 0xc46f47);
BLOCKS[B.FIRE] = boxes('campfire flame', [
  { b: [0.28, 0, 0.28, 0.72, 0.45, 0.72], c: 0xff8a2a, glow: true },
  { b: [0.38, 0.3, 0.38, 0.62, 0.85, 0.62], c: 0xffd04a, glow: true },
  { b: [0.12, 0, 0.42, 0.88, 0.14, 0.58], c: 0x6b4426 },
  { b: [0.42, 0, 0.12, 0.58, 0.14, 0.88], c: 0x6b4426 },
], { light: 1.2, fire: true });
BLOCKS[B.LEAVES_PINK] = cube('blossom leaves', 0xf2a7c8, 0xf2a7c8, 0xf2a7c8, { sway: 0.35 });
BLOCKS[B.LEAVES_ORANGE] = cube('autumn leaves', 0xe0822e, 0xe0822e, 0xe0822e, { sway: 0.35 });
BLOCKS[B.LEAVES_PINE] = cube('pine needles', 0x2f6e3e, 0x2f6e3e, 0x2f6e3e, { foliage: 3, sway: 0.2 });
BLOCKS[B.BIRCH] = cube('birch log', 0xd7cfb8, 0xeae6da);
BLOCKS[B.TALLGRASS] = boxes('tall grass', [
  { b: [0.2, 0, 0.44, 0.28, 0.5, 0.52], c: 0x6ab04a },
  { b: [0.48, 0, 0.28, 0.56, 0.66, 0.36], c: 0x5ea543 },
  { b: [0.66, 0, 0.6, 0.74, 0.44, 0.68], c: 0x74b955 },
], { sway: 1, plant: true, foliage: 1 });
BLOCKS[B.ROOF_GREEN] = cube('green roof', 0x4f8a5b, 0x467c51);
BLOCKS[B.GRAVEL] = cube('gravel', 0xa6a39c);
BLOCKS[B.CROP] = boxes('wheat', [
  { b: [0.18, 0, 0.2, 0.26, 0.7, 0.28], c: 0xd8bf4c },
  { b: [0.5, 0, 0.18, 0.58, 0.8, 0.26], c: 0xcfb444 },
  { b: [0.3, 0, 0.62, 0.38, 0.75, 0.7], c: 0xe0c858 },
  { b: [0.7, 0, 0.66, 0.78, 0.66, 0.74], c: 0xc9ad3e },
], { sway: 1, plant: true });
BLOCKS[B.MUSHROOM] = boxes('mushroom', [
  { b: [0.43, 0, 0.43, 0.57, 0.3, 0.57], c: 0xf1e9d8 },
  { b: [0.28, 0.28, 0.28, 0.72, 0.46, 0.72], c: 0xd2463c },
], { plant: true });
BLOCKS[B.LILY] = boxes('lily pad', [
  { b: [0.14, -0.13, 0.14, 0.86, -0.09, 0.86], c: 0x4f9a3c },
  { b: [0.42, -0.1, 0.42, 0.58, 0.0, 0.58], c: 0xf2b6d0 },
], { plant: true });
BLOCKS[B.GOLD] = cube('gold', 0xf2c84b, 0xe3b53a);

const PAINTS = [
  ['white', 0xf3f0e8], ['light gray', 0xb9b9b9], ['gray', 0x6c6c6c], ['black', 0x2a2a2e],
  ['red', 0xd13b3b], ['orange', 0xee8a2e], ['yellow', 0xf2d33d], ['lime', 0x8fd14f],
  ['green', 0x3f9b46], ['teal', 0x2fa59a], ['sky', 0x6cc3ec], ['blue', 0x3a62c9],
  ['purple', 0x7b4bc4], ['pink', 0xec8bbd], ['brown', 0x7a4f2f], ['peach', 0xf2c29b],
];
PAINTS.forEach(([n, c], i) => { BLOCKS[48 + i] = cube(`${n} paint`, c, c, c, { paint: true }); });
export const PAINT_COLORS = PAINTS.map(([name, hex], i) => ({ id: 48 + i, name, hex }));

// ---------- furniture ----------
const WOOD = 0xb5875a, WOOD_D = 0x7a5230;
const bed = (axis) => {
  // pillow end at the low side of the axis
  const L = (a0, a1) => (axis === 'x' ? [a0, a1, 0.1, 0.9] : [0.1, 0.9, a0, a1]);
  const box = (a0, a1, y0, y1, c) => { const [x0, x1, z0, z1] = L(a0, a1); return { b: [x0, y0, z0, x1, y1, z1], c }; };
  return boxes('bed', [
    box(0.02, 0.98, 0.0, 0.28, WOOD_D),
    box(0.02, 0.98, 0.28, 0.46, 0xf3efe6),
    box(0.3, 0.98, 0.46, 0.52, 0x5b8fd6),
    box(0.05, 0.28, 0.46, 0.6, 0xffffff),
    box(0.0, 0.08, 0.0, 0.72, WOOD_D),
  ], { solid: true, bed: true, seat: 0.5 });
};
BLOCKS[B.BED_X] = bed('x');
BLOCKS[B.BED_Z] = bed('z');
BLOCKS[B.TABLE] = boxes('table', [
  { b: [0.06, 0.78, 0.06, 0.94, 0.88, 0.94], c: WOOD },
  { b: [0.12, 0, 0.12, 0.22, 0.78, 0.22], c: WOOD_D }, { b: [0.78, 0, 0.12, 0.88, 0.78, 0.22], c: WOOD_D },
  { b: [0.12, 0, 0.78, 0.22, 0.78, 0.88], c: WOOD_D }, { b: [0.78, 0, 0.78, 0.88, 0.78, 0.88], c: WOOD_D },
], { solid: true });
BLOCKS[B.STOOL] = boxes('stool', [
  { b: [0.25, 0.42, 0.25, 0.75, 0.5, 0.75], c: 0xc8483e },
  { b: [0.3, 0, 0.3, 0.38, 0.42, 0.38], c: WOOD_D }, { b: [0.62, 0, 0.3, 0.7, 0.42, 0.38], c: WOOD_D },
  { b: [0.3, 0, 0.62, 0.38, 0.42, 0.7], c: WOOD_D }, { b: [0.62, 0, 0.62, 0.7, 0.42, 0.7], c: WOOD_D },
], { seat: 0.5 });
const books = [0xc8483e, 0x3a62c9, 0x3f9b46, 0xf2c84b, 0x7b4bc4, 0xee8a2e];
const shelf = [{ b: [0, 0, 0, 1, 1, 1], c: 0x6b4a2f }];
for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
  const c = books[(r * 4 + i) % books.length];
  const y0 = 0.12 + r * 0.44, h = 0.26 + ((i * 7 + r * 3) % 3) * 0.04;
  shelf.push({ b: [0.06 + i * 0.22, y0, -0.02, 0.24 + i * 0.22, y0 + h, 1.02], c });
  shelf.push({ b: [-0.02, y0, 0.06 + i * 0.22, 1.02, y0 + h, 0.24 + i * 0.22], c: books[(i + r + 2) % books.length] });
}
BLOCKS[B.BOOKSHELF] = boxes('bookshelf', shelf, { solid: true, opaque: false });
const rug = (n, c, c2) => boxes(n, [{ b: [0, 0, 0, 1, 0.05, 1], c }, { b: [0.15, 0.05, 0.15, 0.85, 0.06, 0.85], c: c2 }]);
BLOCKS[B.RUG_RED] = rug('red rug', 0xb8473a, 0xe0a24e);
BLOCKS[B.RUG_BLUE] = rug('blue rug', 0x3a62c9, 0x9fd0f0);
BLOCKS[B.RUG_GREEN] = rug('green rug', 0x3f8a52, 0xe8d59b);
BLOCKS[B.POT_FLOWER] = boxes('flower pot', [
  { b: [0.3, 0, 0.3, 0.7, 0.36, 0.7], c: 0xc46f47 },
  { b: [0.46, 0.36, 0.46, 0.54, 0.62, 0.54], c: 0x4f8a33 },
  { b: [0.36, 0.56, 0.36, 0.64, 0.78, 0.64], c: 0xec8bbd },
], { sway: 0.4 });
BLOCKS[B.BARREL] = boxes('barrel', [
  { b: [0.16, 0, 0.16, 0.84, 0.9, 0.84], c: 0x8a5a33 },
  { b: [0.13, 0.15, 0.13, 0.87, 0.22, 0.87], c: 0x55575c },
  { b: [0.13, 0.66, 0.13, 0.87, 0.73, 0.87], c: 0x55575c },
], { solid: true });
BLOCKS[B.CRATE] = cube('crate', 0xb98a52, 0xa77a45);
const bench = (axis) => {
  const L = axis === 'x' ? (a0, a1, b0, b1) => [a0, b0, a1, b1] : (a0, a1, b0, b1) => [b0, a0, b1, a1];
  const bx = (a0, a1, b0, b1, y0, y1, c) => { const [x0, z0, x1, z1] = L(a0, a1, b0, b1); return { b: [x0, y0, z0, x1, y1, z1], c }; };
  return boxes('bench', [
    bx(0.0, 1.0, 0.22, 0.78, 0.4, 0.5, WOOD),
    bx(0.08, 0.2, 0.3, 0.7, 0, 0.4, WOOD_D),
    bx(0.8, 0.92, 0.3, 0.7, 0, 0.4, WOOD_D),
  ], { seat: 0.5, seatAxis: axis });
};
BLOCKS[B.BENCH_X] = bench('x');
BLOCKS[B.BENCH_Z] = bench('z');
BLOCKS[B.STUMP] = boxes('stump seat', [
  { b: [0.18, 0, 0.18, 0.82, 0.48, 0.82], c: 0x7a5230 },
  { b: [0.2, 0.48, 0.2, 0.8, 0.5, 0.8], c: 0xc9a46c },
], { seat: 0.5, solid: true });
BLOCKS[B.SAPLING] = boxes('sapling', [
  { b: [0.46, 0, 0.46, 0.54, 0.5, 0.54], c: 0x7a5230 },
  { b: [0.3, 0.42, 0.3, 0.7, 0.72, 0.7], c: 0x5fae48 },
  { b: [0.4, 0.7, 0.4, 0.6, 0.86, 0.6], c: 0x6fbf55 },
], { sway: 0.8, plant: true });
BLOCKS[B.CROP_YOUNG] = boxes('young wheat', [
  { b: [0.2, 0, 0.2, 0.26, 0.32, 0.26], c: 0x7cc957 },
  { b: [0.52, 0, 0.18, 0.58, 0.4, 0.24], c: 0x6fbf55 },
  { b: [0.32, 0, 0.64, 0.38, 0.36, 0.7], c: 0x84cf60 },
  { b: [0.7, 0, 0.66, 0.76, 0.3, 0.72], c: 0x74c45a },
], { sway: 1, plant: true });
BLOCKS[B.CHIMNEY] = cube('chimney', 0x6f6a66, 0x8a7e76);
BLOCKS[B.STONE_BRICK] = cube('stone bricks', 0x9a9ca2, 0x8c8f96);
BLOCKS[B.LAMP] = boxes('lamp post', [
  { b: [0.42, 0, 0.42, 0.58, 0.9, 0.58], c: 0x2f3138 },
  { b: [0.3, 0.9, 0.3, 0.7, 1.0, 0.7], c: 0x2f3138 },
], { solid: true });
BLOCKS[B.PLANTER] = boxes('planter', [
  { b: [0.04, 0, 0.04, 0.96, 0.5, 0.96], c: 0x8a5a33 },
  { b: [0.1, 0.5, 0.1, 0.9, 0.52, 0.9], c: 0x6b4a2f },
  { b: [0.2, 0.52, 0.2, 0.4, 0.8, 0.4], c: 0xdc4545 }, { b: [0.6, 0.52, 0.25, 0.8, 0.75, 0.45], c: 0xf5d43c },
  { b: [0.3, 0.52, 0.6, 0.5, 0.82, 0.8], c: 0x9b5fd6 }, { b: [0.62, 0.52, 0.62, 0.8, 0.7, 0.8], c: 0x5fae48 },
], { solid: true, sway: 0.3 });
BLOCKS[B.SHELF_POTS] = boxes('kitchen counter', [
  { b: [0, 0, 0, 1, 0.82, 1], c: 0xd8cfc0 },
  { b: [-0.01, 0.82, -0.01, 1.01, 0.9, 1.01], c: 0x6b4a2f },
  { b: [0.2, 0.9, 0.3, 0.45, 1.1, 0.55], c: 0xb8473a },
  { b: [0.6, 0.9, 0.45, 0.78, 1.04, 0.63], c: 0x3a62c9 },
], { solid: true });
BLOCKS[B.CANDLE] = boxes('candles', [
  { b: [0.3, 0, 0.3, 0.42, 0.3, 0.42], c: 0xf6f0e0 }, { b: [0.34, 0.3, 0.34, 0.38, 0.38, 0.38], c: 0xffc860, glow: true },
  { b: [0.56, 0, 0.5, 0.68, 0.22, 0.62], c: 0xf6f0e0 }, { b: [0.6, 0.22, 0.54, 0.64, 0.3, 0.58], c: 0xffc860, glow: true },
], { light: 0.55 });

// Fill gaps so lookups never return undefined
for (let i = 0; i < 256; i++) if (!BLOCKS[i]) BLOCKS[i] = BLOCKS[B.AIR];

// Pre-compute linear-space colours for the mesher
const tmp = new THREE.Color();
const lin = (hex) => { tmp.setHex(hex); return [tmp.r, tmp.g, tmp.b]; };
for (const def of BLOCKS) {
  if (def._lin || def.shape === 'none') continue;
  def.light = def.light || 0;
  def.sway = def.sway || 0;
  def.foliage = def.foliage || 0;
  if (def.shape === 'cube') {
    def._lin = { top: lin(def.top), side: lin(def.side), bottom: lin(def.bottom), sideTop: def.sideTop ? lin(def.sideTop) : null };
  } else {
    def._lin = true;
    def.boxes.forEach((bx) => { bx.lc = lin(bx.c); });
  }
}

export const isOpaque = (id) => BLOCKS[id].opaque === true;
export const isSolid = (id) => BLOCKS[id].solid === true;
export const isCube = (id) => BLOCKS[id].shape === 'cube';
export const isPlant = (id) => BLOCKS[id].plant === true;
export const FLOWERS = [B.FLOWER_RED, B.FLOWER_YELLOW, B.FLOWER_PURPLE, B.FLOWER_WHITE, B.FLOWER_BLUE];

// Rotating a building by 90 degrees swaps these
export const ROTATE_SWAP = { [B.BED_X]: B.BED_Z, [B.BED_Z]: B.BED_X, [B.BENCH_X]: B.BENCH_Z, [B.BENCH_Z]: B.BENCH_X };

// What the player can pick in build mode
export const BUILD_PALETTE = [
  B.PLANKS, B.LOG, B.COBBLE, B.STONE_BRICK, B.BRICK, B.STONE, B.GLASS, B.MARBLE, B.DARKWOOD,
  B.ROOF_RED, B.ROOF_BLUE, B.ROOF_GREEN, B.THATCH, B.LEAVES, B.LEAVES_PINK, B.LANTERN, B.FENCE, B.LAMP,
  B.FLOWER_RED, B.FLOWER_YELLOW, B.FLOWER_PURPLE, B.FLOWER_BLUE, B.SAPLING, B.POT_FLOWER, B.PLANTER, B.GRASS, B.DIRT,
  B.SAND, B.PATH, B.GRAVEL, B.WATER, B.HAY, B.PUMPKIN, B.CRYSTAL, B.GOLD, B.TERRACOTTA, B.MOSSY,
  B.BED_X, B.BED_Z, B.TABLE, B.STOOL, B.BENCH_X, B.BENCH_Z, B.BOOKSHELF, B.SHELF_POTS, B.BARREL, B.CRATE,
  B.RUG_RED, B.RUG_BLUE, B.RUG_GREEN, B.CANDLE, B.CHIMNEY,
  ...PAINT_COLORS.map((p) => p.id),
];

export function blockSwatch(id) {
  const d = BLOCKS[id];
  if (d.shape === 'cube') return '#' + d.top.toString(16).padStart(6, '0');
  const glow = d.boxes.find((b) => b.glow);
  const main = glow || d.boxes[d.boxes.length > 1 ? 1 : 0];
  return '#' + main.c.toString(16).padStart(6, '0');
}

// Average display colour (used by the block pop-in animation and blueprint ghosts)
export function blockColor(id) {
  const d = BLOCKS[id];
  if (d.shape === 'cube') return d.side;
  return d.boxes[0].c;
}

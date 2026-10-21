import * as THREE from 'three';

// Block palette. ids fit in one byte so saves stay small.
// shape 'cube' = full block. shape 'boxes' = little models made of boxes (flowers, lanterns...)
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

export const BLOCKS = [];
BLOCKS[B.AIR] = { name: 'air', shape: 'none', solid: false, opaque: false };
BLOCKS[B.GRASS] = cube('grass', 0x79c25a, 0x8f6c46, 0x8f6c46, { sideTop: 0x6fb24f });
BLOCKS[B.DIRT] = cube('dirt', 0x8f6c46);
BLOCKS[B.STONE] = cube('stone', 0x8e9298);
BLOCKS[B.SAND] = cube('sand', 0xe8d59b);
BLOCKS[B.SNOW] = cube('snow', 0xf3f6f8, 0xdfe6ea);
BLOCKS[B.LOG] = cube('log', 0xa98252, 0x7a5230);
BLOCKS[B.PLANKS] = cube('planks', 0xc79c63);
BLOCKS[B.LEAVES] = cube('leaves', 0x4f9e3f);
BLOCKS[B.BRICK] = cube('brick', 0xb4553e);
BLOCKS[B.COBBLE] = cube('cobblestone', 0x7d8085);
BLOCKS[B.GLASS] = cube('glass', 0xcdeef7, 0xcdeef7, 0xcdeef7, { opaque: false, transparent: true });
BLOCKS[B.ROOF_RED] = cube('red roof', 0xb8473a, 0xa63f34);
BLOCKS[B.ROOF_BLUE] = cube('blue roof', 0x4a70ab, 0x41639a);
BLOCKS[B.THATCH] = cube('thatch', 0xd7b85e, 0xc8a64f);
BLOCKS[B.LANTERN] = boxes('lantern', [
  { b: [0.3, 0.05, 0.3, 0.7, 0.55, 0.7], c: 0xffd27a, glow: true },
  { b: [0.26, 0.55, 0.26, 0.74, 0.64, 0.74], c: 0x3a2c22 },
  { b: [0.26, 0, 0.26, 0.74, 0.06, 0.74], c: 0x3a2c22 },
], { solid: false, light: true });
BLOCKS[B.WATER] = cube('water', 0x3b8fd0, 0x3b8fd0, 0x3b8fd0, { opaque: false, transparent: true, solid: false, liquid: true });
BLOCKS[B.FLOWER_RED] = boxes('red flower', [stem(), bloom(0xdc4545), center(0xffd75e)]);
BLOCKS[B.FLOWER_YELLOW] = boxes('yellow flower', [stem(), bloom(0xf5d43c), center(0xe48a2a)]);
BLOCKS[B.FLOWER_PURPLE] = boxes('purple flower', [stem(), bloom(0x9b5fd6), center(0xf2e3ff)]);
BLOCKS[B.FLOWER_WHITE] = boxes('white flower', [stem(), bloom(0xf6f4ee), center(0xf3c742)]);
BLOCKS[B.FLOWER_BLUE] = boxes('blue flower', [stem(), bloom(0x5b8fe6), center(0xffffff)]);
BLOCKS[B.PATH] = cube('path', 0xc2a370, 0x9c7c52);
BLOCKS[B.FENCE] = boxes('fence post', [
  { b: [0.37, 0, 0.37, 0.63, 1, 0.63], c: 0x8a6239 },
  { b: [0.33, 0.92, 0.33, 0.67, 1.0, 0.67], c: 0x9d7346 },
], { solid: true });
BLOCKS[B.HAY] = cube('hay', 0xe0c24f, 0xd4b13f);
BLOCKS[B.MARBLE] = cube('marble', 0xece8df);
BLOCKS[B.DARKWOOD] = cube('dark wood', 0x5a3d27);
BLOCKS[B.MOSSY] = cube('mossy stone', 0x6f8a5c, 0x7a8670);
BLOCKS[B.CRYSTAL] = cube('crystal', 0x9fe3ff, 0x9fe3ff, 0x9fe3ff, { glow: true });
BLOCKS[B.PUMPKIN] = cube('pumpkin', 0xd9772a, 0xe68a30);
BLOCKS[B.TERRACOTTA] = cube('terracotta', 0xc46f47);
BLOCKS[B.FIRE] = boxes('campfire flame', [
  { b: [0.28, 0, 0.28, 0.72, 0.45, 0.72], c: 0xff8a2a, glow: true },
  { b: [0.38, 0.3, 0.38, 0.62, 0.85, 0.62], c: 0xffd04a, glow: true },
  { b: [0.12, 0, 0.42, 0.88, 0.14, 0.58], c: 0x6b4426 },
  { b: [0.42, 0, 0.12, 0.58, 0.14, 0.88], c: 0x6b4426 },
], { light: true });
BLOCKS[B.LEAVES_PINK] = cube('blossom leaves', 0xf2a7c8);
BLOCKS[B.LEAVES_ORANGE] = cube('autumn leaves', 0xe0822e);
BLOCKS[B.LEAVES_PINE] = cube('pine needles', 0x2f6e3e);
BLOCKS[B.BIRCH] = cube('birch log', 0xd7cfb8, 0xeae6da);
BLOCKS[B.TALLGRASS] = boxes('tall grass', [
  { b: [0.2, 0, 0.44, 0.28, 0.5, 0.52], c: 0x6ab04a },
  { b: [0.48, 0, 0.28, 0.56, 0.66, 0.36], c: 0x5ea543 },
  { b: [0.66, 0, 0.6, 0.74, 0.44, 0.68], c: 0x74b955 },
]);
BLOCKS[B.ROOF_GREEN] = cube('green roof', 0x4f8a5b, 0x467c51);
BLOCKS[B.GRAVEL] = cube('gravel', 0xa6a39c);
BLOCKS[B.CROP] = boxes('wheat', [
  { b: [0.18, 0, 0.2, 0.26, 0.7, 0.28], c: 0xd8bf4c },
  { b: [0.5, 0, 0.18, 0.58, 0.8, 0.26], c: 0xcfb444 },
  { b: [0.3, 0, 0.62, 0.38, 0.75, 0.7], c: 0xe0c858 },
  { b: [0.7, 0, 0.66, 0.78, 0.66, 0.74], c: 0xc9ad3e },
]);
BLOCKS[B.MUSHROOM] = boxes('mushroom', [
  { b: [0.43, 0, 0.43, 0.57, 0.3, 0.57], c: 0xf1e9d8 },
  { b: [0.28, 0.28, 0.28, 0.72, 0.46, 0.72], c: 0xd2463c },
]);
BLOCKS[B.LILY] = boxes('lily pad', [
  { b: [0.14, -0.13, 0.14, 0.86, -0.09, 0.86], c: 0x4f9a3c },
  { b: [0.42, -0.1, 0.42, 0.58, 0.0, 0.58], c: 0xf2b6d0 },
]);
BLOCKS[B.GOLD] = cube('gold', 0xf2c84b, 0xe3b53a);

const PAINTS = [
  ['white', 0xf3f0e8], ['light gray', 0xb9b9b9], ['gray', 0x6c6c6c], ['black', 0x2a2a2e],
  ['red', 0xd13b3b], ['orange', 0xee8a2e], ['yellow', 0xf2d33d], ['lime', 0x8fd14f],
  ['green', 0x3f9b46], ['teal', 0x2fa59a], ['sky', 0x6cc3ec], ['blue', 0x3a62c9],
  ['purple', 0x7b4bc4], ['pink', 0xec8bbd], ['brown', 0x7a4f2f], ['peach', 0xf2c29b],
];
PAINTS.forEach(([n, c], i) => { BLOCKS[48 + i] = cube(`${n} paint`, c, c, c, { paint: true }); });
export const PAINT_COLORS = PAINTS.map(([name, hex], i) => ({ id: 48 + i, name, hex }));

// Fill gaps so lookups never return undefined
for (let i = 0; i < 256; i++) if (!BLOCKS[i]) BLOCKS[i] = BLOCKS[B.AIR];

// Pre-compute linear-space colours for the mesher
const tmp = new THREE.Color();
const lin = (hex) => { tmp.setHex(hex); return [tmp.r, tmp.g, tmp.b]; };
for (const def of BLOCKS) {
  if (def._lin || def.shape === 'none') continue;
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
export const isPlant = (id) => [B.FLOWER_RED, B.FLOWER_YELLOW, B.FLOWER_PURPLE, B.FLOWER_WHITE, B.FLOWER_BLUE, B.TALLGRASS, B.CROP, B.MUSHROOM, B.LILY].includes(id);
export const FLOWERS = [B.FLOWER_RED, B.FLOWER_YELLOW, B.FLOWER_PURPLE, B.FLOWER_WHITE, B.FLOWER_BLUE];

// What the player can pick in build mode
export const BUILD_PALETTE = [
  B.PLANKS, B.LOG, B.COBBLE, B.BRICK, B.STONE, B.GLASS, B.MARBLE, B.DARKWOOD, B.ROOF_RED,
  B.ROOF_BLUE, B.ROOF_GREEN, B.THATCH, B.LEAVES, B.LEAVES_PINK, B.LANTERN, B.FENCE,
  B.FLOWER_RED, B.FLOWER_YELLOW, B.FLOWER_PURPLE, B.FLOWER_BLUE, B.GRASS, B.DIRT, B.SAND,
  B.PATH, B.GRAVEL, B.WATER, B.HAY, B.PUMPKIN, B.CRYSTAL, B.GOLD, B.TERRACOTTA, B.MOSSY,
  ...PAINT_COLORS.map((p) => p.id),
];

export function blockSwatch(id) {
  const d = BLOCKS[id];
  if (d.shape === 'cube') return '#' + d.top.toString(16).padStart(6, '0');
  const glow = d.boxes.find((b) => b.glow);
  const main = glow || d.boxes[d.boxes.length > 1 ? 1 : 0];
  return '#' + main.c.toString(16).padStart(6, '0');
}

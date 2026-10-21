import { B, FLOWERS } from '../world/blocks.js';
import { SEA } from '../world/terrain.js';
import { plantTree, lanternPost } from './plan.js';

// Every kind of thing the buddy knows how to build.
// build(plan, rng, ctx) fills a Plan; the brain handles sites, timing and journaling.

export const STYLES = {
  cozy: { wall: B.PLANKS, corner: B.LOG, roof: B.ROOF_RED, floor: B.DARKWOOD, trim: B.DARKWOOD },
  stone: { wall: B.COBBLE, corner: B.LOG, roof: B.ROOF_BLUE, floor: B.PLANKS, trim: B.STONE },
  brick: { wall: B.BRICK, corner: B.DARKWOOD, roof: B.ROOF_GREEN, floor: B.PLANKS, trim: B.STONE },
  cottage: { wall: B.MARBLE, corner: B.DARKWOOD, roof: B.THATCH, floor: B.PLANKS, trim: B.DARKWOOD },
  seaside: { wall: B.MARBLE, corner: B.PLANKS, roof: B.ROOF_BLUE, floor: B.PLANKS, trim: B.P_SKY },
  forest: { wall: B.DARKWOOD, corner: B.LOG, roof: B.ROOF_GREEN, floor: B.PLANKS, trim: B.MOSSY },
};

const pick = (rng, arr) => rng.pick(arr);
const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// ---------- house ----------
function house(p, rng, c, { w, d, H = 3 }) {
  const S = p.size;
  const st = c.style;
  const bx0 = Math.floor((S - w) / 2), bx1 = bx0 + w - 1;
  const bz0 = 2, bz1 = bz0 + d - 1;
  const roofLayers = Math.ceil((d + 2) / 2) + 1;
  p.level(0, 0, S - 1, S - 1, { clear: H + roofLayers + 3 });
  p.fill(bx0, 0, bz0, bx1, 0, bz1, st.floor);
  const doorX = Math.floor((bx0 + bx1) / 2);
  for (let y = 1; y <= H; y++) {
    for (let x = bx0; x <= bx1; x++) for (let z = bz0; z <= bz1; z++) {
      const edgeX = x === bx0 || x === bx1, edgeZ = z === bz0 || z === bz1;
      if (!edgeX && !edgeZ) continue;
      let id = edgeX && edgeZ ? st.corner : st.wall;
      if (z === bz0 && x === doorX && y <= 2) continue; // doorway
      if (y === 2 && !(edgeX && edgeZ)) {
        const midSide = edgeX && (z - bz0) % 2 === 0 && z !== bz0 && z !== bz1;
        const midFront = edgeZ && Math.abs(x - doorX) === 2;
        const back = z === bz1 && (x - bx0) % 2 === 0 && x !== bx0 && x !== bx1 && x !== doorX;
        if (midSide || midFront || back) id = B.GLASS;
      }
      p.put(x, y, z, id);
    }
  }
  // stepped gable roof
  let ridge = H + 1;
  for (let i = 0; ; i++) {
    const zl = bz0 - 1 + i, zr = bz1 + 1 - i, y = H + 1 + i;
    ridge = y;
    if (zr - zl <= 1) {
      for (let z = zl; z <= zr; z++) for (let x = bx0 - 1; x <= bx1 + 1; x++) p.put(x, y, z, st.roof);
      break;
    }
    for (let z = zl + 1; z <= zr - 1; z++) { p.put(bx0, y, z, st.wall); p.put(bx1, y, z, st.wall); }
    for (let x = bx0 - 1; x <= bx1 + 1; x++) {
      p.put(x, y, zl, st.roof); p.put(x, y, zr, st.roof);
      if (zr - zl > 3) { p.put(x, y, zl + 1, st.roof); p.put(x, y, zr - 1, st.roof); }
    }
  }
  if (rng.chance(0.6)) for (let y = H + 1; y <= ridge + 1; y++) p.put(bx1 - 1, y, bz1, B.COBBLE);
  // inside
  p.put(bx0 + 1, 1, bz1 - 1, B.P_WHITE);
  p.put(bx0 + 1, 1, bz1 - 2, c.colorBlock);
  p.put(bx1 - 1, 1, bz1 - 1, B.FENCE);
  p.put(bx1 - 1, 2, bz1 - 1, B.LANTERN);
  p.put(doorX, 0, Math.floor((bz0 + bz1) / 2), c.colorBlock);
  if (w >= 7) p.put(bx1 - 1, 1, bz0 + 1, B.DARKWOOD);
  p.slot(doorX, 2, bz1 - 1, 0, -1);
  p.slot(bx0 + 1, 2, bz0 + 1, 1, 0);
  p.slot(bx1 - 1, 2, bz0 + 1, -1, 0);
  // outside
  p.put(doorX, 0, 0, B.PATH); p.put(doorX, 0, 1, B.PATH);
  lanternPost(p, doorX + 2, 1, bz0 - 1);
  for (let x = bx0; x <= bx1; x++) if (Math.abs(x - doorX) > 2 && rng.chance(0.7)) p.put(x, 1, bz0 - 1, pick(rng, FLOWERS));
  p.setEntrance(doorX, -1);
  return { doorX, bx0, bx1, bz0, bz1 };
}

// ---------- round tower ----------
function ringCells(c, r) {
  const out = [];
  for (let z = -r - 1; z <= r + 1; z++) for (let x = -r - 1; x <= r + 1; x++) {
    const d = Math.hypot(x, z);
    out.push({ x: c + x, z: c + z, wall: d <= r + 0.5 && d > r - 0.5, inside: d <= r - 0.5, d });
  }
  return out;
}

export const BLUEPRINTS = {
  campfire: {
    size: () => 7,
    name: () => 'The Campfire',
    build(p, rng) {
      p.level(0, 0, 6, 6, { clear: 4 });
      p.fill(2, 0, 2, 4, 0, 4, B.COBBLE);
      p.put(3, 0, 3, B.GRAVEL);
      p.put(3, 1, 3, B.FIRE);
      const seats = rng.shuffle([[3, 5], [1, 3], [5, 3], [1, 5], [5, 5]]).slice(0, 3);
      for (const [x, z] of seats) p.put(x, 1, z, B.LOG);
      lanternPost(p, 6, 1, 6);
      for (let i = 0; i < 5; i++) { const x = rng.int(0, 6), z = rng.int(0, 6); if (Math.hypot(x - 3, z - 3) > 2.2) p.put(x, 0, z, B.GRAVEL); }
      p.setEntrance(3, -1);
    },
    story: (c) => `Built a campfire. Now we have somewhere to sit at night, ${c.player}.`,
  },

  cottage: {
    size: (rng, c) => (c.variant === 'player' ? 11 : rng.pick([9, 9, 11])),
    name: (rng, c) => c.variant === 'player' ? `${c.player}'s House`
      : c.variant === 'home' ? `${c.buddy}'s Cottage`
        : `The ${pick(rng, ['Cozy', 'Little', 'Sunny', 'Mossy', 'Sleepy', 'Lantern', 'Honey', 'Crooked', 'Pebble'])} ${pick(rng, ['Cottage', 'Cabin', 'House', 'Hut'])}`,
    build(p, rng, c) {
      const big = p.size >= 11;
      const r = house(p, rng, c, { w: big ? 9 : 7, d: big ? 7 : 6, H: c.variant === 'player' ? 4 : 3 });
      if (c.variant === 'player') p.prop('sign', r.bx0, 1, 0, 0, -1, { title: `${c.player}'s house` });
      if (c.variant === 'home') p.prop('sign', r.bx0, 1, 0, 0, -1, { title: `${c.buddy} lives here` });
    },
    story: (c, rng) => c.variant === 'player' ? `Built you a house, ${c.player}! It has a lantern by the door so you can always find it.`
      : c.variant === 'home' ? `Built myself a little cottage. It's small, but it's home.`
        : pick(rng, ['Built a cottage. I put flowers out front.', 'Finished a little house. Someone should live there someday.', 'Built a cabin. The roof took me three tries.']),
  },

  tower: {
    size: (rng) => rng.pick([9, 11]),
    name: (rng) => `The ${pick(rng, ['Lookout', 'Whispering', 'Star', 'Old Stone', 'Cloudtop', 'Owl', 'Sunrise'])} Tower`,
    site: { high: true },
    build(p, rng, c) {
      const S = p.size, ctr = Math.floor(S / 2), r = S >= 11 ? 3 : 2;
      const H = rng.int(9, 14);
      const mat = rng.pick([B.COBBLE, B.STONE, B.BRICK, B.MARBLE]);
      p.level(0, 0, S - 1, S - 1, { clear: H + 8 });
      const cells = ringCells(ctr, r);
      for (const cl of cells) if (cl.inside) p.put(cl.x, 0, cl.z, B.PLANKS);
      for (let y = 1; y <= H; y++) {
        for (const cl of cells) {
          if (!cl.wall) continue;
          if (cl.x === ctr && cl.z < ctr && y <= 2) continue; // door
          let id = mat === B.COBBLE && rng.chance(0.15) ? B.MOSSY : mat;
          if (y % 4 === 2 && (cl.x === ctr || cl.z === ctr) && y > 2) id = B.GLASS;
          p.put(cl.x, y, cl.z, id);
        }
        if (y % 5 === 0) for (const cl of cells) if (cl.inside) p.put(cl.x, y, cl.z, B.PLANKS);
      }
      // stairs up the inside edge
      for (let y = 1; y <= H; y++) {
        const a = (y / 4) * Math.PI * 2;
        const sx = Math.round(ctr + Math.cos(a) * (r - 1)), sz = Math.round(ctr + Math.sin(a) * (r - 1));
        p.put(sx, y, sz, B.PLANKS);
        p.put(sx, y + 1, sz, B.AIR); p.put(sx, y + 2, sz, B.AIR);
      }
      for (const cl of cells) if (cl.inside || cl.wall) p.put(cl.x, H + 1, cl.z, mat === B.MARBLE ? B.MARBLE : B.STONE);
      if (rng.chance(0.5)) {
        for (const cl of cells) if (cl.wall && (cl.x + cl.z) % 2 === 0) p.put(cl.x, H + 2, cl.z, mat);
        lanternPost(p, ctr, H + 2, ctr);
      } else {
        for (let k = 0; k <= r + 1; k++) for (const cl of ringCells(ctr, r + 1 - k)) if (cl.d <= r + 1.5 - k) p.put(cl.x, H + 2 + k, cl.z, c.style.roof);
        p.put(ctr, H + r + 4, ctr, B.CRYSTAL);
      }
      p.put(ctr, 0, 0, B.PATH); p.put(ctr, 0, 1, B.PATH);
      p.setEntrance(ctr, -1);
    },
    story: (c, rng) => pick(rng, ['Built a tower. You can see the whole island from the top.', 'Stacked up a stone tower on the hill. The view is worth the stairs.', 'Built a tower. I counted every block. I lost count.']),
  },

  garden: {
    size: () => 11,
    name: (rng) => pick(rng, ['The Pumpkin Patch', 'The Sunny Garden', 'The Wildflower Garden', 'The Vegetable Garden', 'The Little Farm']),
    build(p, rng) {
      const S = 11, c = 5;
      p.level(0, 0, S - 1, S - 1, { clear: 4 });
      for (let i = 0; i < S; i++) {
        for (const [x, z] of [[i, 0], [i, S - 1], [0, i], [S - 1, i]]) {
          if (z === 0 && Math.abs(x - c) <= 0) continue;
          p.put(x, 1, z, B.FENCE);
        }
      }
      for (let z = 0; z < S - 1; z++) p.put(c, 0, z, B.PATH);
      const rows = [];
      for (let z = 2; z <= S - 3; z++) rows.push(z);
      for (const z of rows) {
        const kind = rng.pick(['crop', 'pumpkin', 'flower', 'flower', 'crop']);
        const fl = rng.pick(FLOWERS);
        for (let x = 1; x < S - 1; x++) {
          if (x === c) continue;
          if (z % 2 === 1) { p.put(x, 0, z, B.DIRT); continue; }
          if (kind === 'crop') { p.put(x, 0, z, B.DIRT); p.put(x, 1, z, B.CROP); }
          else if (kind === 'pumpkin') { p.put(x, 0, z, B.DIRT); if (rng.chance(0.55)) p.put(x, 1, z, B.PUMPKIN); }
          else p.put(x, 1, z, fl);
        }
      }
      // scarecrow
      p.put(1, 1, S - 2, B.FENCE); p.put(1, 2, S - 2, B.HAY); p.put(1, 3, S - 2, B.PUMPKIN);
      p.put(S - 2, 0, S - 2, B.WATER);
      p.setEntrance(c, -1);
    },
    story: (c, rng) => pick(rng, ['Planted a garden. Pumpkins grow fast here. Faster than they should, honestly.', 'Started a garden with rows of flowers and wheat. I made a scarecrow but it is not scary.', 'Planted a garden. I talk to the plants while you are gone.']),
  },

  grove: {
    size: () => 13,
    noLevel: true,
    site: { maxSpread: 6 },
    name: (rng, c) => `The ${cap(c.treeKind === 'blossom' ? 'blossom' : c.treeKind === 'autumn' ? 'autumn' : c.treeKind)} Grove`,
    pre: (rng, c) => { c.treeKind = rng.pick(['oak', 'oak', 'birch', 'pine', 'blossom', 'autumn']); },
    build(p, rng, c) {
      const pts = [];
      for (let tries = 0; tries < 60 && pts.length < rng.int(5, 8); tries++) {
        const lx = rng.int(1, 11), lz = rng.int(1, 11);
        if (pts.some((q) => Math.hypot(q[0] - lx, q[1] - lz) < 3.2)) continue;
        const [x, z] = p.wx(lx, lz);
        const kind = rng.chance(0.75) ? c.treeKind : rng.pick(['oak', 'birch', 'pine', 'blossom', 'autumn']);
        if (plantTree(p, x, z, kind, rng)) pts.push([lx, lz]);
      }
      for (let i = 0; i < 14; i++) {
        const lx = rng.int(0, 12), lz = rng.int(0, 12);
        const [x, z] = p.wx(lx, lz);
        const g = p.world.surfaceY(x, z);
        if (g > SEA && p.world.get(x, g, z) === B.GRASS) p.putWIfAir(x, g + 1, z, rng.chance(0.2) ? B.MUSHROOM : B.TALLGRASS);
      }
      c.trees = pts.length;
      p.setEntrance(6, -1);
    },
    story: (c) => `Planted ${c.trees} ${c.treeKind === 'blossom' ? 'blossom trees' : c.treeKind === 'autumn' ? 'autumn trees' : c.treeKind + ' trees'}. In my head they are already huge.`,
  },

  pond: {
    size: () => 11,
    name: (rng) => pick(rng, ['Lily Pond', 'Mirror Pond', 'Wishing Pond', 'The Little Lake', 'Frog Pond']),
    build(p, rng) {
      const S = 11, c = 5, rx = rng.int(3, 4) + 0.5, rz = rng.int(2, 3) + 0.5;
      p.level(0, 0, S - 1, S - 1, { clear: 4 });
      for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
        const e = ((x - c) / rx) ** 2 + ((z - c) / rz) ** 2;
        if (e <= 1) {
          p.put(x, 0, z, B.WATER);
          if (e < 0.5) { p.put(x, -1, z, B.WATER); p.put(x, -2, z, B.SAND); } else p.put(x, -1, z, B.SAND);
          if (rng.chance(0.08)) p.put(x, 1, z, B.LILY);
        } else if (e <= 1.7) {
          if (rng.chance(0.5)) p.put(x, 0, z, rng.chance(0.5) ? B.SAND : B.GRAVEL);
          if (rng.chance(0.2)) p.put(x, 1, z, B.TALLGRASS);
          else if (rng.chance(0.1)) p.put(x, 1, z, rng.pick(FLOWERS));
        }
      }
      lanternPost(p, 0, 1, c);
      p.setEntrance(c, -1);
    },
    story: (c, rng) => pick(rng, ['Dug a pond and filled it with water. I added lily pads.', 'Made a little pond. It reflects the sky if you look close.']),
  },

  well: {
    size: () => 7,
    name: () => 'The Wishing Well',
    build(p) {
      const c = 3;
      p.level(0, 0, 6, 6, { clear: 7 });
      for (let z = c - 1; z <= c + 1; z++) for (let x = c - 1; x <= c + 1; x++) {
        if (x === c && z === c) { p.put(x, 0, z, B.WATER); p.put(x, -1, z, B.WATER); p.put(x, -2, z, B.COBBLE); continue; }
        p.put(x, 0, z, B.COBBLE); p.put(x, 1, z, B.COBBLE);
      }
      for (const [x, z] of [[c - 1, c - 1], [c + 1, c - 1], [c - 1, c + 1], [c + 1, c + 1]]) { p.put(x, 2, z, B.FENCE); p.put(x, 3, z, B.FENCE); }
      for (let z = c - 2; z <= c + 2; z++) for (let x = c - 1; x <= c + 1; x++) p.put(x, 4, z, B.ROOF_RED);
      for (let x = c - 1; x <= c + 1; x++) p.put(x, 5, c, B.ROOF_RED);
      p.put(c, 3, c, B.LANTERN);
      for (let i = 0; i < 7; i++) { const x = i, z = i % 2 ? 0 : 6; p.put(x, 0, z, B.GRAVEL); }
      p.setEntrance(c, -1);
    },
    story: () => 'Built a wishing well. I already made a wish. I won\'t tell you what it was.',
  },

  statue: {
    size: () => 7,
    name: (rng, c) => c.statueKind === 'player' ? `Statue of ${c.player}` : c.statueKind === 'self' ? `${c.buddy}, in Marble` : `Sculpture No. ${rng.int(1, 99)}`,
    pre: (rng, c) => { c.statueKind = rng.pick(['player', 'self', 'abstract']); },
    build(p, rng, c) {
      const ctr = 3;
      p.level(0, 0, 6, 6, { clear: 12 });
      for (let z = 0; z < 7; z++) for (let x = 0; x < 7; x++) if (Math.hypot(x - ctr, z - ctr) > 1.6) p.put(x, 0, z, B.PATH);
      p.fill(ctr - 1, 1, ctr - 1, ctr + 1, 1, ctr + 1, B.COBBLE);
      const m = rng.chance(0.15) ? B.GOLD : B.MARBLE;
      if (c.statueKind === 'player') {
        for (let y = 2; y <= 4; y++) { p.put(ctr - 1, y, ctr, m); p.put(ctr + 1, y, ctr, m); }
        p.fill(ctr - 1, 5, ctr, ctr + 1, 7, ctr, m);
        for (let y = 5; y <= 7; y++) { p.put(ctr - 2, y, ctr, m); p.put(ctr + 2, y, ctr, m); }
        p.fill(ctr - 1, 8, ctr - 1, ctr + 1, 10, ctr + 1, m);
      } else if (c.statueKind === 'self') {
        p.fill(ctr - 1, 2, ctr - 1, ctr + 1, 3, ctr + 1, c.colorBlock);
        p.fill(ctr - 2, 4, ctr - 1, ctr + 2, 6, ctr + 1, m);
        p.put(ctr - 1, 5, ctr - 1, B.CRYSTAL); p.put(ctr + 1, 5, ctr - 1, B.CRYSTAL);
        p.put(ctr, 7, ctr, B.FENCE); p.put(ctr, 8, ctr, B.CRYSTAL);
      } else {
        const pal = [c.colorBlock, B.MARBLE, B.CRYSTAL, rng.pick([B.P_PINK, B.P_SKY, B.P_YELLOW, B.P_TEAL])];
        const h = rng.int(6, 10), ph = rng.float() * 6;
        for (let k = 0; k < h; k++) {
          const dx = Math.round(Math.sin(k * 0.8 + ph) * 1.2), dz = Math.round(Math.cos(k * 0.8 + ph) * 1.2);
          p.put(ctr + dx, 2 + k, ctr + dz, pal[k % pal.length]);
          p.put(ctr, 2 + k, ctr, k % 3 === 0 ? B.MARBLE : B.AIR);
          if (k === 0) p.put(ctr, 2, ctr, B.MARBLE);
        }
      }
      lanternPost(p, 0, 1, 0); lanternPost(p, 6, 1, 0);
      p.setEntrance(ctr, -1);
    },
    story: (c) => c.statueKind === 'player' ? `Carved a statue of you, ${c.player}. I think I got your good side.`
      : c.statueKind === 'self' ? 'Made a statue of myself. Is that weird? It might be weird.' : 'Made a sculpture. I don\'t know what it is. That\'s the point.',
  },

  gallery: {
    size: () => 13,
    name: (rng, c) => rng.chance(0.5) ? `${c.buddy}'s Gallery` : pick(rng, ['The Little Museum', 'The Painting Hall', 'The Art House']),
    build(p, rng, c) {
      const bx0 = 1, bx1 = 11, bz0 = 2, bz1 = 10, H = 5;
      p.level(0, 0, 12, 12, { clear: H + 4 });
      p.fill(bx0, 0, bz0, bx1, 0, bz1, B.DARKWOOD);
      for (let z = bz0 + 1; z < bz1; z++) p.put(6, 0, z, c.colorBlock);
      for (let y = 1; y <= H; y++) for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) {
        const ex = x === bx0 || x === bx1, ez = z === bz0 || z === bz1;
        if (!ex && !ez) continue;
        if (z === bz0 && Math.abs(x - 6) <= 1 && y <= 3) continue;
        let id = (ex && ez) ? B.STONE : B.MARBLE;
        if (z === bz0 && y === 3 && (x === 3 || x === 9)) id = B.GLASS;
        p.put(x, y, z, id);
      }
      for (let z = bz0 - 1; z <= bz1 + 1; z++) for (let x = bx0 - 1; x <= bx1 + 1; x++) {
        const rim = x === bx0 - 1 || x === bx1 + 1 || z === bz0 - 1 || z === bz1 + 1;
        p.put(x, H + 1, z, rim ? B.STONE : ((x % 3 === 0 && z % 3 === 0) ? B.GLASS : B.PLANKS));
      }
      for (const [x, z] of [[3, 5], [9, 5], [3, 8], [9, 8], [6, 7]]) p.put(x, H, z, B.LANTERN);
      p.put(6, 1, 6, B.PLANKS);
      for (let x = bx0 + 2; x <= bx1 - 2; x += 2) p.slot(x, 2, bz1 - 1, 0, -1);
      for (let z = bz0 + 2; z <= bz1 - 2; z += 2) { p.slot(bx0 + 1, 2, z, 1, 0); p.slot(bx1 - 1, 2, z, -1, 0); }
      lanternPost(p, 4, 1, 1); lanternPost(p, 8, 1, 1);
      p.put(6, 0, 0, B.PATH); p.put(6, 0, 1, B.PATH);
      p.prop('sign', 2, 1, 0, 0, -1, { title: 'Paintings inside!' });
      p.setEntrance(6, -1);
    },
    story: () => 'Built a gallery so my paintings have somewhere to live. Come see them!',
  },

  windmill: {
    size: () => 9,
    name: (rng) => `The ${pick(rng, ['Breezy', 'Hilltop', 'Old', 'Spinning', 'Sleepy'])} Windmill`,
    site: { high: true },
    build(p, rng) {
      const c = 4;
      p.level(0, 0, 8, 8, { clear: 16 });
      for (let y = 0; y <= 9; y++) for (let z = c - 2; z <= c + 2; z++) for (let x = c - 2; x <= c + 2; x++) {
        const edge = Math.abs(x - c) === 2 || Math.abs(z - c) === 2;
        if (y === 0) { p.put(x, 0, z, B.PLANKS); continue; }
        if (!edge) continue;
        if (z === c - 2 && x === c && y <= 2) continue;
        const corner = Math.abs(x - c) === 2 && Math.abs(z - c) === 2;
        let id = y <= 4 ? B.COBBLE : corner ? B.LOG : B.MARBLE;
        if ((y === 3 || y === 7) && !corner && (x === c || z === c)) id = B.GLASS;
        p.put(x, y, z, id);
      }
      for (let k = 0; k <= 2; k++) for (let z = c - 2 + k; z <= c + 2 - k; z++) for (let x = c - 2 - (k === 0 ? 1 : 0) + k; x <= c + 2 + (k === 0 ? 1 : 0) - k; x++) p.put(x, 10 + k, z, B.ROOF_RED);
      p.prop('windmill', c, 7, c - 3, 0, -1);
      lanternPost(p, c + 2, 1, c - 3);
      p.put(c, 0, 0, B.PATH);
      p.setEntrance(c, -1);
    },
    story: () => 'Built a windmill. It doesn\'t grind anything. It just spins and looks happy.',
  },

  lighthouse: {
    size: () => 9,
    name: (rng, c) => `The ${c.dirName || 'Old'} Lighthouse`,
    site: { coast: true },
    build(p, rng) {
      const c = 4, r = 2, H = rng.int(12, 15);
      p.level(0, 0, 8, 8, { clear: H + 8 });
      const cells = ringCells(c, r);
      for (let y = 1; y <= H; y++) for (const cl of cells) {
        if (!cl.wall) continue;
        if (cl.x === c && cl.z < c && y <= 2) continue;
        p.put(cl.x, y, cl.z, Math.floor((y - 1) / 2) % 2 ? B.P_RED : B.P_WHITE);
      }
      for (const cl of ringCells(c, r + 1)) if (cl.d <= r + 1.5) p.put(cl.x, H + 1, cl.z, B.STONE);
      for (const cl of ringCells(c, r + 1)) if (cl.d <= r + 1.5 && cl.d > r + 0.5) p.put(cl.x, H + 2, cl.z, B.FENCE);
      for (const cl of ringCells(c, 1)) if (cl.wall) { p.put(cl.x, H + 2, cl.z, B.GLASS); p.put(cl.x, H + 3, cl.z, B.GLASS); }
      p.put(c, H + 2, c, B.CRYSTAL); p.put(c, H + 3, c, B.LANTERN);
      for (const cl of ringCells(c, 2)) if (cl.d <= 1.6) p.put(cl.x, H + 4, cl.z, B.ROOF_RED);
      p.put(c, H + 5, c, B.ROOF_RED);
      p.prop('beacon', c, H + 2, c, 0, -1);
      p.setEntrance(c, -1);
    },
    story: () => 'Built a lighthouse by the water. At night it sweeps the sea, in case anyone is out there.',
  },

  mosaic: {
    size: () => 13,
    name: (rng, c) => c.mosaicTitle,
    pre: (rng, c) => {
      const opts = ['heart', 'star', 'flower', 'smile', 'sun', 'moon', 'face', 'letter', 'rainbow', 'spiral'];
      c.pattern = rng.pick(opts);
      const titles = { heart: 'A Giant Heart', star: 'The Star on the Ground', flower: 'The Flower Floor', smile: 'Big Smile', sun: 'The Sun Mosaic', moon: 'Moon Tiles', face: `${c.buddy}'s Face, Tiled`, letter: `The Letter ${(c.player[0] || 'Y').toUpperCase()}`, rainbow: 'Rainbow Tiles', spiral: 'The Spiral' };
      c.mosaicTitle = titles[c.pattern];
    },
    build(p, rng, c) {
      p.level(0, 0, 12, 12, { clear: 3 });
      const img = mosaicPixels(c.pattern, rng, c);
      for (let z = 0; z < 13; z++) for (let x = 0; x < 13; x++) {
        if (x === 0 || z === 0 || x === 12 || z === 12) { p.put(x, 0, z, B.GRAVEL); continue; }
        p.put(x, 0, z, img[(11 - z) * 11 + (11 - x)]);
      }
      lanternPost(p, 0, 1, 0); lanternPost(p, 12, 1, 0); lanternPost(p, 0, 1, 12); lanternPost(p, 12, 1, 12);
      p.setEntrance(6, -1);
    },
    story: (c) => `Drew "${c.mosaicTitle}" on the ground with coloured tiles. It looks best from above.`,
  },

  flowerfield: {
    size: () => 13,
    noLevel: true,
    site: { maxSpread: 7 },
    name: (rng, c) => `The ${c.fieldName} Meadow`,
    pre: (rng, c) => {
      const sets = [['Red', [B.FLOWER_RED, B.FLOWER_WHITE]], ['Golden', [B.FLOWER_YELLOW, B.FLOWER_WHITE]], ['Violet', [B.FLOWER_PURPLE, B.FLOWER_BLUE]], ['Rainbow', FLOWERS], ['Bluebell', [B.FLOWER_BLUE, B.FLOWER_WHITE]]];
      const s = rng.pick(sets); c.fieldName = s[0]; c.fieldFlowers = s[1];
    },
    build(p, rng, c) {
      let n = 0;
      for (let lz = 0; lz < 13; lz++) for (let lx = 0; lx < 13; lx++) {
        const d = Math.hypot(lx - 6, lz - 6) / 6.5;
        if (d > 1 || !rng.chance(0.7 - d * 0.45)) continue;
        const [x, z] = p.wx(lx, lz);
        const g = p.world.surfaceY(x, z);
        if (g <= SEA || p.world.get(x, g, z) !== B.GRASS) continue;
        p.putWIfAir(x, g + 1, z, rng.chance(0.85) ? rng.pick(c.fieldFlowers) : B.TALLGRASS);
        n++;
      }
      c.flowers = n;
      p.setEntrance(6, -1);
    },
    story: (c) => `Planted ${c.flowers} flowers. I named a few of them. Don't ask which.`,
  },

  restspot: {
    size: () => 7,
    name: (rng) => pick(rng, ['The Lookout Bench', 'The Quiet Corner', 'The Sunset Seat', 'The Thinking Spot']),
    build(p, rng) {
      p.level(0, 0, 6, 6, { clear: 8 });
      for (let z = 1; z <= 5; z++) for (let x = 1; x <= 5; x++) p.put(x, 0, z, B.PATH);
      p.put(2, 1, 4, B.DARKWOOD); p.put(3, 1, 4, B.PLANKS); p.put(4, 1, 4, B.DARKWOOD);
      lanternPost(p, 5, 1, 5);
      for (let i = 0; i < 6; i++) { const x = rng.pick([0, 6]), z = rng.int(0, 6); p.put(x, 1, z, rng.pick(FLOWERS)); }
      const [tx, tz] = p.wx(1, 6);
      plantTree(p, tx, tz, rng.pick(['blossom', 'oak', 'autumn']), rng, p.oy);
      p.setEntrance(3, -1);
    },
    story: (c, rng) => pick(rng, ['Built a bench with a nice view. Saving you a seat.', 'Made a little resting spot. Sometimes you just need to sit.']),
  },

  greenhouse: {
    size: () => 11,
    name: () => 'The Greenhouse',
    build(p, rng) {
      const bx0 = 1, bx1 = 9, bz0 = 2, bz1 = 8;
      p.level(0, 0, 10, 10, { clear: 9 });
      for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) p.put(x, 0, z, B.DIRT);
      for (let z = bz0 + 1; z < bz1; z++) p.put(5, 0, z, B.PATH);
      for (let y = 1; y <= 3; y++) for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) {
        const ex = x === bx0 || x === bx1, ez = z === bz0 || z === bz1;
        if (!ex && !ez) continue;
        if (z === bz0 && x === 5 && y <= 2) continue;
        p.put(x, y, z, ex && ez ? B.LOG : y === 1 ? B.COBBLE : B.GLASS);
      }
      for (let i = 0; ; i++) {
        const zl = bz0 + i, zr = bz1 - i, y = 4 + i;
        if (zr - zl <= 1) { for (let z = zl; z <= zr; z++) for (let x = bx0; x <= bx1; x++) p.put(x, y, z, B.GLASS); break; }
        for (let x = bx0; x <= bx1; x++) { p.put(x, y, zl, B.GLASS); p.put(x, y, zr, B.GLASS); }
        for (let z = zl + 1; z < zr; z++) { p.put(bx0, y, z, B.GLASS); p.put(bx1, y, z, B.GLASS); }
      }
      for (let z = bz0 + 1; z < bz1; z++) for (let x = bx0 + 1; x < bx1; x++) {
        if (x === 5) continue;
        p.put(x, 1, z, rng.pick([B.CROP, B.PUMPKIN, ...FLOWERS, B.MUSHROOM]));
      }
      p.put(5, 4, 5, B.LANTERN);
      p.setEntrance(5, -1);
    },
    story: () => 'Built a greenhouse. Everything inside grows a little faster. I think.',
  },

  arch: {
    size: () => 9,
    name: (rng) => pick(rng, ['The Moon Gate', 'The Old Arch', 'The Crystal Arch']),
    build(p, rng) {
      const c = 4;
      p.level(0, 0, 8, 8, { clear: 10 });
      const m = rng.pick([B.STONE, B.MARBLE, B.COBBLE]);
      const mat = () => (rng.chance(0.15) ? B.MOSSY : m);
      for (let z = c - 1; z <= c + 1; z++) {
        for (let y = 1; y <= 5; y++) for (const x of [1, 2, 6, 7]) p.put(x, y, z, mat());
        for (let x = 1; x <= 7; x++) { p.put(x, 6, z, mat()); p.put(x, 7, z, mat()); }
        p.put(3, 5, z, mat()); p.put(5, 5, z, mat());
        p.put(4, 7, z, B.CRYSTAL);
        for (let x = 0; x <= 8; x++) p.put(x, 0, z, B.PATH);
      }
      lanternPost(p, 1, 8, c); lanternPost(p, 7, 8, c);
      p.setEntrance(c, -1);
    },
    story: () => 'Built an arch. Walk through it and make a wish. (It\'s a different wish system from the well.)',
  },

  treehouse: {
    size: () => 11,
    name: () => 'The Treehouse',
    build(p, rng) {
      const c = 5;
      p.level(0, 0, 10, 10, { clear: 16 });
      for (let y = 1; y <= 10; y++) for (const [x, z] of [[c - 1, c - 1], [c, c - 1], [c - 1, c], [c, c]]) p.put(x, y, z, B.LOG);
      for (let z = c - 3; z <= c + 2; z++) for (let x = c - 3; x <= c + 2; x++) {
        if (x >= c - 1 && x <= c && z >= c - 1 && z <= c) continue;
        p.put(x, 5, z, B.PLANKS);
        const edge = x === c - 3 || x === c + 2 || z === c - 3 || z === c + 2;
        if (edge && !(x === c - 3 && z === c - 2)) p.put(x, 6, z, B.FENCE);
      }
      for (let k = 0; k < 4; k++) p.put(c - 4, 1 + k, c + 1 - k, B.PLANKS);
      p.put(c + 1, 6, c + 1, B.LANTERN);
      for (let dy = 0; dy <= 3; dy++) {
        const r = dy === 3 ? 2 : 4;
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          if (Math.hypot(dx, dz) > r + 0.3) continue;
          if (rng.chance(0.08)) continue;
          p.putIfAir(c + dx, 10 + dy, c + dz, rng.chance(0.15) ? B.LEAVES_ORANGE : B.LEAVES);
        }
      }
      p.setEntrance(c - 4, -1);
    },
    story: () => 'Built a treehouse! There are stairs on the side. No grown-ups allowed. Except you.',
  },

  sapling: {
    size: () => 5,
    noLevel: true,
    site: { maxSpread: 3 },
    pre: (rng, c) => { c.treeKind = rng.pick(['oak', 'birch', 'pine', 'blossom', 'autumn']); },
    name: (rng, c) => `A Young ${cap(c.treeKind === 'blossom' ? 'blossom' : c.treeKind === 'autumn' ? 'maple' : c.treeKind)} Tree`,
    build(p, rng, c) {
      const [x, z] = p.wx(2, 2);
      plantTree(p, x, z, c.treeKind, rng);
      for (let i = 0; i < 5; i++) {
        const [fx, fz] = p.wx(rng.int(0, 4), rng.int(0, 4));
        const g = p.world.surfaceY(fx, fz);
        if (g > SEA && p.world.get(fx, g, fz) === B.GRASS) p.putWIfAir(fx, g + 1, fz, rng.pick(FLOWERS));
      }
      c.trees = 1;
      p.setEntrance(2, -1);
    },
    story: (c, rng) => pick(rng, ['Planted a young tree in a quiet corner. It will get big someday.', 'Found a little empty spot and planted a tree there.', 'One more tree. You can never have too many.']),
  },

  pier: {
    special: 'pier',
    name: (rng) => pick(rng, ['The Fishing Pier', 'The Sunset Pier', 'The Little Dock']),
    story: () => 'Built a pier out over the water. Good for sitting and watching the waves.',
  },
};

// ---------- mosaic images (11x11 block ids) ----------
const LETTERS = {
  A: '01110100011000111111100011000110001', B: '11110100011111010001100011000111110', C: '01111100001000010000100001000001111',
  D: '11110100011000110001100011000111110', E: '11111100001111010000100001000011111', F: '11111100001111010000100001000010000',
  G: '01111100001000010011100011000101111', H: '10001100011000111111100011000110001', I: '11111001000010000100001000010011111',
  J: '00111000010000100001100011000101110', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110001100011000110001', N: '10001110011010110011100011000110001', O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
  V: '10001100011000110001100010101000100', W: '10001100011000110101101011101110001', X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
};

function mosaicPixels(kind, rng, c) {
  const N = 11, img = new Array(N * N);
  const bg = rng.pick([B.P_WHITE, B.P_PEACH, B.P_SKY, B.P_LGRAY, B.P_BLACK]);
  img.fill(bg);
  const set = (x, y, id) => { if (x >= 0 && y >= 0 && x < N && y < N) img[y * N + x] = id; };
  const fg = c.colorBlock === bg ? B.P_RED : c.colorBlock;
  const ctr = 5;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - ctr, dy = y - ctr, d = Math.hypot(dx, dy);
    if (kind === 'heart') {
      const X = dx / 4.5, Y = -(dy - 0.5) / 4.5;
      if ((X * X + Y * Y - 1) ** 3 - X * X * Y * Y * Y <= 0) set(x, y, B.P_RED);
    } else if (kind === 'sun') {
      if (d <= 2.6) set(x, y, B.P_YELLOW);
      else if (d <= 5 && (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 2 === 0) && d > 3.4) set(x, y, B.P_ORANGE);
    } else if (kind === 'moon') {
      if (d <= 4.2 && Math.hypot(dx - 1.8, dy + 1) > 3.4) set(x, y, B.P_YELLOW);
      if (rng.chance(0.06) && d > 4.5) set(x, y, B.P_WHITE);
    } else if (kind === 'star') {
      const a = Math.atan2(dy, dx) + Math.PI / 2;
      const r = 2.2 + 2.8 * Math.abs(Math.cos(a * 2.5));
      if (d <= r) set(x, y, B.P_YELLOW);
    } else if (kind === 'flower') {
      if (d <= 1.5) set(x, y, B.P_YELLOW);
      else if (d <= 4.6 && Math.abs(Math.sin(Math.atan2(dy, dx) * 3)) > 0.35) set(x, y, B.P_PINK);
    } else if (kind === 'spiral') {
      const a = Math.atan2(dy, dx);
      if (Math.abs(((d - a * 1.1) % 3.4 + 3.4) % 3.4) < 1.3 && d < 5.6) set(x, y, fg);
    } else if (kind === 'rainbow') {
      const cols = [B.P_RED, B.P_ORANGE, B.P_YELLOW, B.P_LIME, B.P_SKY, B.P_PURPLE];
      const dd = Math.hypot(dx, y - 9);
      const band = Math.floor(7.5 - dd);
      if (y <= 9 && band >= 0 && band < cols.length) set(x, y, cols[band]);
    }
  }
  if (kind === 'smile' || kind === 'face') {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (Math.hypot(x - ctr, y - ctr) <= 5) set(x, y, kind === 'face' ? B.P_BLACK : B.P_YELLOW);
    const eye = kind === 'face' ? B.P_SKY : B.P_BLACK;
    set(3, 3, eye); set(3, 4, eye); set(7, 3, eye); set(7, 4, eye);
    for (let x = 3; x <= 7; x++) set(x, 7, eye);
    set(2, 6, eye); set(8, 6, eye);
  }
  if (kind === 'letter') {
    const L = LETTERS[(c.player[0] || 'Y').toUpperCase()] || LETTERS.Y;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (L[y * 5 + x] === '1') {
      set(3 + x, 2 + y, fg);
    }
  }
  return img;
}

// Pick a house style that fits the buddy's taste
export function pickStyle(rng, traits) {
  return rng.weighted([
    ['cozy', 3 + traits.cozy * 3], ['stone', 2 + traits.grand * 2], ['brick', 2], ['cottage', 2 + traits.cozy * 2],
    ['seaside', 1.5], ['forest', 1 + traits.nature * 3],
  ]);
}

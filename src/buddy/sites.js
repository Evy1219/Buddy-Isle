import { SEA } from '../world/terrain.js';
import { B, BLOCKS, isPlant } from '../world/blocks.js';

// Where should the next thing go? These helpers look at the terrain and at what's
// already built, and score possible spots.

export class Claims {
  constructor(size) { this.size = size; this.grid = new Uint8Array(size * size); }
  mark(x0, z0, w, d, v = 1) {
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++)
      if (x >= 0 && z >= 0 && x < this.size && z < this.size) this.grid[z * this.size + x] = v;
  }
  has(x, z) { return x < 0 || z < 0 || x >= this.size || z >= this.size || this.grid[z * this.size + x] === 1; }
  rebuild(projects) {
    this.grid.fill(0);
    for (const p of projects) this.mark(p.x0, p.z0, p.w, p.d);
  }
}

function isOcean(world, x, z) { return world.surfaceY(x, z) <= SEA - 1 && !world.isBuilt(x, z); }

export function oceanNearby(world, x0, z0, S, reach = 4) {
  let n = 0;
  for (let z = z0 - reach; z < z0 + S + reach; z += 2) for (let x = x0 - reach; x < x0 + S + reach; x += 2) {
    if (x >= x0 && x < x0 + S && z >= z0 && z < z0 + S) continue;
    if (isOcean(world, x, z)) n++;
  }
  return n;
}

export function randomLand(world, rng, tries = 200) {
  const S = world.size;
  for (let i = 0; i < tries; i++) {
    const x = rng.int(8, S - 9), z = rng.int(8, S - 9);
    if (world.surfaceY(x, z) > SEA + 1) return { x, z };
  }
  return null;
}

// Evaluate a square footprint. Returns null if unusable.
export function evalSite(world, claims, x0, z0, S, opts = {}) {
  const margin = 2;
  if (x0 < 3 || z0 < 3 || x0 + S > world.size - 3 || z0 + S > world.size - 3) return null;
  for (let z = z0 - margin; z < z0 + S + margin; z++) for (let x = x0 - margin; x < x0 + S + margin; x++)
    if (claims.has(x, z)) return null;
  const hs = [];
  for (let z = z0; z < z0 + S; z++) for (let x = x0; x < x0 + S; x++) {
    const y = world.surfaceY(x, z);
    if (y <= SEA) return null;
    if (world.isBuilt(x, z)) return null;
    hs.push(y);
  }
  hs.sort((a, b) => a - b);
  const spread = hs[hs.length - 1] - hs[0];
  if (spread > (opts.maxSpread ?? 5)) return null;
  const baseY = hs[Math.floor(hs.length / 2)];
  if (baseY > 52) return null;
  return { x0, z0, size: S, baseY, spread };
}

export function findSite(world, claims, rng, S, opts = {}) {
  let best = null, bestScore = -Infinity;
  const anchors = opts.anchors || [];
  const tries = opts.tries ?? 90;
  for (let i = 0; i < tries; i++) {
    let ax, az;
    if (opts.near) {
      const a = rng.float() * Math.PI * 2, r = rng.range(opts.minR ?? S * 0.8, opts.maxR ?? 26);
      ax = opts.near.x + Math.cos(a) * r; az = opts.near.z + Math.sin(a) * r;
    } else if (anchors.length && rng.chance(0.8)) {
      const an = rng.pick(anchors);
      const a = rng.float() * Math.PI * 2, r = rng.range(S * 0.7 + 6, S * 0.7 + 22);
      ax = an.x + Math.cos(a) * r; az = an.z + Math.sin(a) * r;
    } else {
      const l = randomLand(world, rng);
      if (!l) continue;
      ax = l.x; az = l.z;
    }
    const x0 = Math.round(ax - S / 2), z0 = Math.round(az - S / 2);
    const s = evalSite(world, claims, x0, z0, S, opts);
    if (!s) continue;
    let score = -s.spread * 1.5 + rng.float() * 2;
    const cx = x0 + S / 2, cz = z0 + S / 2;
    if (opts.near) score -= Math.hypot(cx - opts.near.x, cz - opts.near.z) / 5;
    if (opts.high) score += (s.baseY - SEA) * 0.4;
    if (opts.coast) {
      const o = oceanNearby(world, x0, z0, S, 4);
      if (o === 0) continue;
      score += Math.min(o, 10) * 0.6;
    }
    if (anchors.length && !opts.near) {
      let dmin = Infinity;
      for (const an of anchors) dmin = Math.min(dmin, Math.hypot(cx - an.x, cz - an.z));
      score -= Math.abs(dmin - (S * 0.7 + 10)) / 6;
    }
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

// Rotation that points the front door toward a target
export function faceToward(site, tx, tz) {
  const cx = site.x0 + site.size / 2, cz = site.z0 + site.size / 2;
  const dx = tx - cx, dz = tz - cz;
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 1 : 3;
  return dz > 0 ? 2 : 0;
}

// A spot where land meets the sea, plus which way the water is
export function findPierSite(world, claims, rng) {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let i = 0; i < 400; i++) {
    const x = rng.int(10, world.size - 11), z = rng.int(10, world.size - 11);
    const g = world.surfaceY(x, z);
    if (g < SEA || g > SEA + 2 || claims.has(x, z) || world.isBuilt(x, z)) continue;
    for (const [dx, dz] of rng.shuffle(dirs.slice())) {
      const L = rng.int(7, 11);
      let ok = true;
      for (let k = 1; k <= L + 1 && ok; k++) for (let w = -2; w <= 2 && ok; w++) {
        const px = x + dx * k + (dz !== 0 ? w : 0), pz = z + dz * k + (dx !== 0 ? w : 0);
        if (k >= 3 && !isOcean(world, px, pz)) ok = false;
        if (claims.has(px, pz)) ok = false;
      }
      if (ok) return { x, z, dx, dz, L };
    }
  }
  return null;
}

// Find open ocean for a new little island, close enough to bridge to
export function findIsletSite(world, claims, rng, islets) {
  const S = world.size;
  for (let i = 0; i < 300; i++) {
    const r = rng.int(13, 18);
    const x = rng.int(r + 5, S - r - 6), z = rng.int(r + 5, S - r - 6);
    let ok = true;
    for (let dz = -r - 3; dz <= r + 3 && ok; dz += 2) for (let dx = -r - 3; dx <= r + 3 && ok; dx += 2) {
      if (dx * dx + dz * dz > (r + 3) ** 2) continue;
      if (world.naturalHeight(x + dx, z + dz) > SEA - 3 || claims.has(x + dx, z + dz)) ok = false;
    }
    if (!ok || islets.some((it) => Math.hypot(it.x - x, it.z - z) < it.r + r + 6)) continue;
    // nearest land
    let best = null, bd = Infinity;
    for (let a = 0; a < 32; a++) {
      const ang = (a / 32) * Math.PI * 2;
      for (let d = r; d < r + 30; d++) {
        const px = Math.round(x + Math.cos(ang) * d), pz = Math.round(z + Math.sin(ang) * d);
        if (px < 2 || pz < 2 || px >= S - 2 || pz >= S - 2) break;
        if (world.surfaceY(px, pz) > SEA) { if (d < bd) { bd = d; best = { x: px, z: pz }; } break; }
      }
    }
    if (best && bd - r < 22) return { x, z, r, land: best };
  }
  return null;
}

// A* path over the ground between two points. Avoids buildings, allows short bridges.
export function findPath(world, claims, from, to, maxLen = 90) {
  const S = world.size;
  const idx = (x, z) => z * S + x;
  const open = [], g = new Map(), came = new Map();
  const h = (x, z) => Math.abs(x - to.x) + Math.abs(z - to.z);
  const push = (n) => { open.push(n); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p].f <= open[i].f) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
  const pop = () => { const top = open[0]; const last = open.pop(); if (open.length) { open[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < open.length && open[l].f < open[m].f) m = l; if (r < open.length && open[r].f < open[m].f) m = r; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } } return top; };
  const start = idx(from.x, from.z), goal = idx(to.x, to.z);
  g.set(start, 0);
  push({ x: from.x, z: from.z, f: h(from.x, from.z) });
  let expanded = 0;
  while (open.length && expanded < 25000) {
    const cur = pop();
    const ci = idx(cur.x, cur.z);
    if (ci === goal) {
      const path = [];
      let k = ci;
      while (k !== undefined) { path.push({ x: k % S, z: Math.floor(k / S) }); k = came.get(k); }
      path.reverse();
      return path.length <= maxLen ? path : null;
    }
    expanded++;
    const cy = world.surfaceY(cur.x, cur.z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, nz = cur.z + dz;
      if (nx < 1 || nz < 1 || nx >= S - 1 || nz >= S - 1) continue;
      const ni = idx(nx, nz);
      const isGoal = ni === goal;
      if (!isGoal && (claims.has(nx, nz) || world.isBuilt(nx, nz))) continue;
      const ny = world.surfaceY(nx, nz);
      let cost = 1;
      if (ny <= SEA) cost = 3;
      else if (cy > SEA) { const dh = Math.abs(ny - cy); if (dh > 1) continue; cost += dh * 1.5; }
      const top = world.get(nx, ny, nz);
      if (top === B.PATH) cost = 0.6;
      const ng = g.get(ci) + cost;
      if (ng < (g.get(ni) ?? Infinity)) {
        g.set(ni, ng); came.set(ni, ci);
        push({ x: nx, z: nz, f: ng + h(nx, nz) });
      }
    }
  }
  return null;
}

export function pathOps(world, path, rng, lanterns = true) {
  const ops = [];
  let sinceLantern = 0;
  for (let i = 0; i < path.length; i++) {
    const { x, z } = path[i];
    const y = world.surfaceY(x, z);
    if (y <= SEA) {
      ops.push([x, SEA + 1, z, B.PLANKS]);
      if (i % 3 === 0) for (let py = Math.max(1, world.surfaceY(x, z) + 1); py <= SEA; py++) ops.push([x, py, z, B.LOG]);
      continue;
    }
    const top = world.get(x, y, z);
    if ([B.GRASS, B.DIRT, B.SAND, B.SNOW, B.STONE].includes(top)) ops.push([x, y, z, B.PATH]);
    const above = world.get(x, y + 1, z);
    if (isPlant(above)) ops.push([x, y + 1, z, B.AIR]);
    sinceLantern++;
    if (lanterns && sinceLantern > 10 && rng.chance(0.4)) {
      const prev = path[i - 1] || path[i];
      const sx = x + (z - prev.z), sz = z + (x - prev.x);
      const sy = world.surfaceY(sx, sz);
      if (sy > SEA && Math.abs(sy - y) <= 1 && !world.isBuilt(sx, sz) && world.get(sx, sy + 1, sz) === B.AIR) {
        ops.push([sx, sy + 1, sz, B.FENCE], [sx, sy + 2, sz, B.LANTERN]);
        sinceLantern = 0;
      }
    }
  }
  return ops;
}

export function isCoastal(world, x, z) {
  for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) if (world.surfaceY(x + dx, z + dz) <= SEA - 1) return true;
  return false;
}

export { BLOCKS };

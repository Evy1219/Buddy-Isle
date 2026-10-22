import { B, BLOCKS, isPlant, ROTATE_SWAP } from '../world/blocks.js';
import { SEA } from '../world/terrain.js';

// A Plan collects block placements for one project inside a square footprint.
// Local coords: lx, lz in [0, size), ly relative to the base (ground) level.
// The front of a building is the lz = 0 side; `rot` turns the whole thing.
export class Plan {
  constructor(world, site) {
    this.world = world;
    this.x0 = site.x0; this.z0 = site.z0;
    this.size = site.size;
    this.oy = site.baseY;
    this.rot = site.rot || 0;
    this.map = new Map();
    this.props = [];
    this.slots = [];
    this.entrance = null;
    this.meta = {};
    this.growables = [];
  }

  wx(lx, lz) {
    const S = this.size;
    switch (this.rot) {
      case 1: return [this.x0 + S - 1 - lz, this.z0 + lx];
      case 2: return [this.x0 + S - 1 - lx, this.z0 + S - 1 - lz];
      case 3: return [this.x0 + lz, this.z0 + S - 1 - lx];
      default: return [this.x0 + lx, this.z0 + lz];
    }
  }
  wdir(dx, dz) {
    switch (this.rot) {
      case 1: return [-dz, dx];
      case 2: return [-dx, -dz];
      case 3: return [dz, -dx];
      default: return [dx, dz];
    }
  }

  putW(x, y, z, id) {
    if (!this.world.inBounds(x, y, z)) return;
    const k = this.world.key(x, y, z);
    this.map.delete(k);
    this.map.set(k, [x, y, z, id]);
  }
  put(lx, ly, lz, id) {
    const [x, z] = this.wx(lx, lz);
    if (this.rot % 2 === 1 && ROTATE_SWAP[id]) id = ROTATE_SWAP[id];
    this.putW(x, this.oy + ly, z, id);
  }
  // a young plant that grows up later (world coords, y = where the plant goes)
  growW(x, y, z, kind, extra = {}) {
    this.putW(x, y, z, kind === 'crop' ? B.CROP_YOUNG : B.SAPLING);
    this.growables.push({ x, y, z, kind, ...extra });
  }
  grow(lx, ly, lz, kind, extra = {}) {
    const [x, z] = this.wx(lx, lz);
    this.growW(x, this.oy + ly, z, kind, extra);
  }
  // only place if the spot is currently empty (and not already planned)
  putIfAir(lx, ly, lz, id) {
    const [x, z] = this.wx(lx, lz);
    this.putWIfAir(x, this.oy + ly, z, id);
  }
  putWIfAir(x, y, z, id) {
    if (!this.world.inBounds(x, y, z)) return;
    const k = this.world.key(x, y, z);
    const planned = this.map.get(k);
    if (planned && planned[3] !== B.AIR) return;
    if (!planned && this.world.get(x, y, z) !== B.AIR && !isPlant(this.world.get(x, y, z))) return;
    this.putW(x, y, z, id);
  }
  fill(lx0, ly0, lz0, lx1, ly1, lz1, id) {
    for (let y = ly0; y <= ly1; y++) for (let z = lz0; z <= lz1; z++) for (let x = lx0; x <= lx1; x++) this.put(x, y, z, id);
  }
  // planned-or-current block at a local position
  at(lx, ly, lz) {
    const [x, z] = this.wx(lx, lz);
    const k = this.world.key(x, this.oy + ly, z);
    const p = this.map.get(k);
    return p ? p[3] : this.world.get(x, this.oy + ly, z);
  }

  // Flatten the ground: fill dips with dirt, set the top block, clear anything above.
  level(lx0, lz0, lx1, lz1, { clear = 6, top = null, fill = B.DIRT } = {}) {
    for (let lz = lz0; lz <= lz1; lz++) {
      for (let lx = lx0; lx <= lx1; lx++) {
        const [x, z] = this.wx(lx, lz);
        const g = this.world.surfaceY(x, z);
        for (let y = g + 1; y < this.oy; y++) this.putW(x, y, z, fill);
        const natTop = this.world.t.top[z * this.world.size + x];
        const t = top ?? (natTop === B.SAND || natTop === B.SNOW || natTop === B.STONE ? natTop : B.GRASS);
        this.putW(x, this.oy, z, t);
        const hi = Math.max(this.oy + clear, this.world.top(x, z));
        for (let y = this.oy + 1; y <= hi; y++) {
          if (this.world.get(x, y, z) !== B.AIR) this.putW(x, y, z, B.AIR);
        }
      }
    }
  }

  prop(type, lx, ly, lz, dlx, dlz, data = {}) {
    const [x, z] = this.wx(lx, lz);
    this.props.push({ type, x, y: this.oy + ly, z, facing: this.wdir(dlx, dlz), ...data });
  }
  slot(lx, ly, lz, dlx, dlz) {
    const [x, z] = this.wx(lx, lz);
    this.slots.push({ x, y: this.oy + ly, z, facing: this.wdir(dlx, dlz) });
  }
  setEntrance(lx, lz) {
    const [x, z] = this.wx(lx, lz);
    this.entrance = { x, z };
  }

  ops() {
    const out = [];
    for (const op of this.map.values()) if (this.world.get(op[0], op[1], op[2]) !== op[3]) out.push(op);
    return out;
  }
}

// ---------- trees (world coordinates) ----------
export function plantTree(plan, x, z, kind, rng, groundOverride = null, small = false) {
  const w = plan.world;
  const g = groundOverride ?? w.surfaceY(x, z);
  if (g <= SEA) return false;
  const top = groundOverride != null ? B.GRASS : w.get(x, g, z);
  if (![B.GRASS, B.DIRT, B.SAND, B.SNOW, B.STONE, B.PATH].includes(top)) return false;
  const leaf = (lx, ly, lz, id) => plan.putWIfAir(lx, ly, lz, id);
  const trunk = (h, id) => { for (let i = 1; i <= h; i++) plan.putW(x, g + i, z, id); };
  if (groundOverride == null && w.get(x, g + 1, z) !== B.AIR && !isPlant(w.get(x, g + 1, z))) return false;
  if (small) {
    const leafId = kind === 'pine' ? B.LEAVES_PINE : kind === 'blossom' ? B.LEAVES_PINK : kind === 'autumn' ? B.LEAVES_ORANGE : B.LEAVES;
    const h = 2 + (rng.chance(0.5) ? 1 : 0);
    trunk(h, kind === 'birch' ? B.BIRCH : B.LOG);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (Math.abs(dx) + Math.abs(dz) === 2 && rng.chance(0.6)) continue;
      leaf(x + dx, g + h, z + dz, leafId);
      if (dx === 0 || dz === 0) leaf(x + dx, g + h + 1, z + dz, leafId);
    }
    plan.putW(x, g + h, z, kind === 'birch' ? B.BIRCH : B.LOG);
    return true;
  }
  if (kind === 'pine') {
    const h = rng.int(6, 9);
    trunk(h, B.LOG);
    const R = [0, 1, 1, 2, 1, 2, 2, 3, 2, 3, 3];
    for (let y = g + h + 1; y >= g + 3; y--) {
      const layer = g + h + 1 - y;
      const r = R[Math.min(layer, R.length - 1)];
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
        if (dx === 0 && dz === 0 && y <= g + h) continue;
        leaf(x + dx, y, z + dz, B.LEAVES_PINE);
      }
    }
    return true;
  }
  const leafId = kind === 'blossom' ? B.LEAVES_PINK : kind === 'autumn' ? B.LEAVES_ORANGE : B.LEAVES;
  const log = kind === 'birch' ? B.BIRCH : B.LOG;
  const h = kind === 'birch' ? rng.int(5, 7) : kind === 'blossom' ? rng.int(4, 5) : rng.int(4, 6);
  trunk(h, log);
  const ty = g + h;
  const wide = kind === 'blossom' ? 3 : kind === 'birch' ? 1 : 2;
  for (let dy = -2; dy <= 1; dy++) {
    const r = dy === 1 ? Math.max(1, wide - 1) : dy === -2 ? Math.max(1, wide - (kind === 'blossom' ? 0 : 1)) : wide;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const corner = Math.abs(dx) === r && Math.abs(dz) === r;
      if (corner && rng.chance(0.75)) continue;
      if (dx === 0 && dz === 0 && dy <= 0) continue;
      leaf(x + dx, ty + dy, z + dz, leafId);
    }
  }
  if (kind !== 'birch') leaf(x, ty + 2, z, leafId);
  return true;
}

export function lanternPost(plan, lx, ly, lz) {
  plan.put(lx, ly, lz, B.FENCE);
  plan.put(lx, ly + 1, lz, B.LANTERN);
}

export { BLOCKS };

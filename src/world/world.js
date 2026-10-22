import { BLOCKS, B, isOpaque } from './blocks.js';
import { generateTerrain, SEA, MAX_H } from './terrain.js';

export const CHUNK = 16;
export const LIGHT_R = 7.5; // how far lantern light reaches

// Voxel world = deterministic terrain from the seed + a sparse map of edits.
export class World {
  constructor({ seed, size = 256, islets = [], flat = null }) {
    this.seed = seed;
    this.flat = flat;
    this.lights = new Map(); // key -> light level, for blocks that glow
    this.size = size;
    this.H = MAX_H;
    this.islets = islets;
    this.chunksX = size / CHUNK;
    this.edits = new Map();
    this.dirty = new Set();
    this.version = 0;
    this.chunkMinEdit = new Int16Array(this.chunksX * this.chunksX).fill(999);
    this.chunkNatMin = new Int16Array(this.chunksX * this.chunksX);
    this.colTop = new Int16Array(size * size);
    this.onChange = null;
    this._genTerrain();
  }

  _genTerrain() {
    const S = this.size;
    if (this.flat != null) {
      const n = S * S;
      this.t = { h: new Uint8Array(n).fill(this.flat), top: new Uint8Array(n).fill(B.GRASS), deco: new Uint8Array(n), tint: new Float32Array(n) };
    } else this.t = generateTerrain(this.seed, this.size, this.islets);
    this.terrainVersion = (this.terrainVersion || 0) + 1;
    for (let i = 0; i < S * S; i++) this.colTop[i] = this.t.h[i] + (this.t.deco[i] ? 1 : 0);
    // re-apply edits to the column tops
    for (const [k, id] of this.edits) {
      const x = k % S, z = Math.floor(k / S) % S, y = Math.floor(k / (S * S));
      const i = z * S + x;
      if (id !== B.AIR && y > this.colTop[i]) this.colTop[i] = y;
    }
    for (let i = 0; i < S * S; i++) {
      const x = i % S, z = Math.floor(i / S);
      if (this.get(x, this.colTop[i], z) === B.AIR) this._rescanTop(x, z);
    }
    for (let cz = 0; cz < this.chunksX; cz++) {
      for (let cx = 0; cx < this.chunksX; cx++) {
        let mn = 999;
        for (let z = cz * CHUNK - 1; z <= cz * CHUNK + CHUNK; z++) {
          for (let x = cx * CHUNK - 1; x <= cx * CHUNK + CHUNK; x++) {
            if (x < 0 || z < 0 || x >= S || z >= S) continue;
            const hh = this.t.h[z * S + x];
            if (hh < mn) mn = hh;
          }
        }
        this.chunkNatMin[cz * this.chunksX + cx] = mn;
      }
    }
  }

  setIslets(islets, area = null) {
    this.islets = islets;
    this._genTerrain();
    const n = this.chunksX;
    for (let i = 0; i < n * n; i++) {
      if (area) {
        const cx = (i % n) * CHUNK, cz = Math.floor(i / n) * CHUNK;
        if (cx + CHUNK < area.x0 - 1 || cx > area.x1 + 1 || cz + CHUNK < area.z0 - 1 || cz > area.z1 + 1) continue;
      }
      this.dirty.add(i);
    }
    this.version++;
  }

  key(x, y, z) { return (y * this.size + z) * this.size + x; }
  inBounds(x, y, z) { return x >= 0 && z >= 0 && x < this.size && z < this.size && y >= 0 && y < this.H; }

  naturalHeight(x, z) {
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return SEA - 8;
    return this.t.h[z * this.size + x];
  }

  natural(x, y, z) {
    const i = z * this.size + x;
    const hh = this.t.h[i];
    if (y > hh) return y === hh + 1 ? this.t.deco[i] : B.AIR;
    const top = this.t.top[i];
    if (y === hh) return top;
    if (y >= hh - 2) return top === B.SAND ? B.SAND : (top === B.STONE || top === B.SNOW) ? B.STONE : B.DIRT;
    return B.STONE;
  }

  get(x, y, z) {
    x |= 0; y |= 0; z |= 0;
    if (y < 0) return B.STONE;
    if (y >= this.H) return B.AIR;
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return y < SEA - 7 ? B.STONE : B.AIR;
    const e = this.edits.get((y * this.size + z) * this.size + x);
    return e === undefined ? this.natural(x, y, z) : e;
  }

  isSolid(x, y, z) { return BLOCKS[this.get(x, y, z)].solid === true; }
  isOpaqueAt(x, y, z) { return isOpaque(this.get(x, y, z)); }

  set(x, y, z, id) {
    x |= 0; y |= 0; z |= 0;
    if (!this.inBounds(x, y, z)) return false;
    const k = this.key(x, y, z);
    const before = this.get(x, y, z);
    if (before === id) return false;
    if (this.natural(x, y, z) === id) this.edits.delete(k);
    else this.edits.set(k, id);
    const lb = BLOCKS[before].light, la = BLOCKS[id].light;
    if (lb || la) {
      if (la) this.lights.set(k, la); else this.lights.delete(k);
      this._dirtyRadius(x, z, LIGHT_R + 1);
    }

    const S = this.size;
    const i = z * S + x;
    if (id !== B.AIR && y > this.colTop[i]) this.colTop[i] = y;
    else if (id === B.AIR && y >= this.colTop[i]) this._rescanTop(x, z);

    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const ci = cz * this.chunksX + cx;
    if (y < this.chunkMinEdit[ci]) this.chunkMinEdit[ci] = y;
    // neighbours share faces and ambient occlusion, so mark the 3x3 around edits on borders
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    const xs = [cx], zs = [cz];
    if (lx === 0) xs.push(cx - 1);
    if (lx === CHUNK - 1) xs.push(cx + 1);
    if (lz === 0) zs.push(cz - 1);
    if (lz === CHUNK - 1) zs.push(cz + 1);
    for (const ax of xs) for (const az of zs) {
      if (ax >= 0 && az >= 0 && ax < this.chunksX && az < this.chunksX) this.dirty.add(az * this.chunksX + ax);
    }
    this.version++;
    if (this.onChange) this.onChange(x, y, z, id, before);
    return true;
  }

  _dirtyRadius(x, z, r) {
    const n = this.chunksX;
    const c0x = Math.max(0, Math.floor((x - r) / CHUNK)), c1x = Math.min(n - 1, Math.floor((x + r) / CHUNK));
    const c0z = Math.max(0, Math.floor((z - r) / CHUNK)), c1z = Math.min(n - 1, Math.floor((z + r) / CHUNK));
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) this.dirty.add(cz * n + cx);
  }

  // Light sources that can reach a chunk: [[x, y, z, level], ...]
  lightsNear(x0, z0, x1, z1) {
    const out = [];
    const S = this.size;
    for (const [k, lv] of this.lights) {
      const x = k % S, z = Math.floor(k / S) % S;
      if (x < x0 - LIGHT_R || x > x1 + LIGHT_R || z < z0 - LIGHT_R || z > z1 + LIGHT_R) continue;
      out.push([x + 0.5, Math.floor(k / (S * S)) + 0.5, z + 0.5, lv]);
    }
    return out;
  }

  _rescanTop(x, z) {
    const i = z * this.size + x;
    let y = Math.min(this.H - 1, Math.max(this.colTop[i], this.t.h[i]));
    while (y > 0 && this.get(x, y, z) === B.AIR) y--;
    this.colTop[i] = y;
  }

  top(x, z) {
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return SEA - 8;
    return this.colTop[z * this.size + x];
  }

  // Highest solid block in the column (what you'd stand on). Ignores flowers, water, lanterns.
  groundY(x, z, fromY = null) {
    x = Math.floor(x); z = Math.floor(z);
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return SEA - 8;
    let y = fromY == null ? this.colTop[z * this.size + x] : Math.min(fromY, this.colTop[z * this.size + x]);
    while (y > 0) {
      const d = BLOCKS[this.get(x, y, z)];
      if (d.solid) return y;
      y--;
    }
    return 0;
  }

  // Highest opaque full cube (ignores fences, glass) — used for site checks
  surfaceY(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return SEA - 8;
    let y = this.colTop[z * this.size + x];
    while (y > 0) {
      const id = this.get(x, y, z);
      if (BLOCKS[id].shape === 'cube' && BLOCKS[id].solid) return y;
      y--;
    }
    return 0;
  }

  isLand(x, z) { return this.surfaceY(x, z) > SEA; }

  // True if something was built here (higher than nature made it)
  isBuilt(x, z) {
    if (x < 0 || z < 0 || x >= this.size || z >= this.size) return true;
    return this.surfaceY(x, z) > this.t.h[z * this.size + x];
  }

  topBlock(x, z) {
    return this.get(x, this.top(x, z), z);
  }

  // Packs edits as [x, z, y, id] bytes
  packEdits() {
    const out = new Uint8Array(this.edits.size * 4);
    const S = this.size;
    let o = 0;
    for (const [k, id] of this.edits) {
      out[o++] = k % S;
      out[o++] = Math.floor(k / S) % S;
      out[o++] = Math.floor(k / (S * S));
      out[o++] = id;
    }
    return out;
  }

  loadEdits(bytes) {
    if (!bytes) return;
    const S = this.size;
    for (let o = 0; o + 3 < bytes.length; o += 4) {
      const x = bytes[o], z = bytes[o + 1], y = bytes[o + 2], id = bytes[o + 3];
      this.edits.set(this.key(x, y, z), id);
      if (BLOCKS[id].light) this.lights.set(this.key(x, y, z), BLOCKS[id].light);
      const i = z * S + x;
      if (id !== B.AIR && y > this.colTop[i]) this.colTop[i] = y;
      const ci = Math.floor(z / CHUNK) * this.chunksX + Math.floor(x / CHUNK);
      if (y < this.chunkMinEdit[ci]) this.chunkMinEdit[ci] = y;
    }
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
      if (this.get(x, this.colTop[z * S + x], z) === B.AIR) this._rescanTop(x, z);
    }
    for (let i = 0; i < this.chunksX * this.chunksX; i++) this.dirty.add(i);
  }

  // Undo everything inside a box (back to natural terrain)
  revertBox(x0, z0, x1, z1) {
    const S = this.size;
    const keys = [];
    for (const k of this.edits.keys()) {
      const x = k % S, z = Math.floor(k / S) % S;
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) keys.push(k);
    }
    for (const k of keys) {
      const x = k % S, z = Math.floor(k / S) % S, y = Math.floor(k / (S * S));
      this.set(x, y, z, this.natural(x, y, z));
    }
    return keys.length;
  }
}

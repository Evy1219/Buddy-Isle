import { BLOCKS, B } from './blocks.js';
import { CHUNK, LIGHT_R } from './world.js';
import { hash3 } from '../core/rng.js';

// Turns a 16x16 column of blocks into triangles.
// Per vertex we also bake: x = lantern light, y = wind sway, z = foliage kind (seasons), w = can hold snow.

// Face table: normal, 4 corners (counter-clockwise from outside), shade
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.84, kind: 'side' },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.84, kind: 'side' },
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], shade: 1.0, kind: 'top' },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.62, kind: 'bottom' },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.92, kind: 'side' },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.92, kind: 'side' },
];
const AO_CURVE = [0.5, 0.68, 0.84, 1.0];
FACES.forEach((f, i) => { f.axes = [0, 1, 2].filter((k) => f.n[k] === 0); f.i = i; });

class Buf {
  constructor() { this.pos = []; this.norm = []; this.col = []; this.fx = []; this.idx = []; this.n = 0; }
  quad(p, nrm, cols, fxs, flip) {
    const b = this.n;
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.norm.push(nrm[0], nrm[1], nrm[2]);
      this.col.push(cols[i][0], cols[i][1], cols[i][2]);
      const f = fxs[i];
      this.fx.push(f[0], f[1], f[2], f[3]);
    }
    if (flip) this.idx.push(b + 1, b + 2, b + 3, b + 1, b + 3, b);
    else this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.n += 4;
  }
  out() {
    if (this.n === 0) return null;
    return {
      position: new Float32Array(this.pos),
      normal: new Float32Array(this.norm),
      color: new Float32Array(this.col),
      fx: new Float32Array(this.fx),
      index: this.n > 65000 ? new Uint32Array(this.idx) : new Uint16Array(this.idx),
    };
  }
}

function makeLighter(lights) {
  if (!lights.length) return () => 0;
  const R = LIGHT_R;
  return (px, py, pz, n) => {
    let L = 0;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      const dx = l[0] - px, dy = l[1] - py, dz = l[2] - pz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d >= R) continue;
      let f = 1 - d / R;
      f = f * f * (1.4 - 0.4 * f);
      // faces pointing away from the light get less of it
      const facing = d > 0.01 ? (dx * n[0] + dy * n[1] + dz * n[2]) / d : 1;
      L += l[3] * f * (0.3 + 0.7 * Math.max(0, facing));
    }
    return Math.min(1.6, L);
  };
}

function emitBox(buf, x, y, z, bx, color, tint, def, light) {
  const [x0, y0, z0, x1, y1, z1] = bx;
  const sway = def.sway, fol = def.foliage;
  for (const f of FACES) {
    const pts = [], fxs = [];
    for (const c of f.c) {
      const px = x + (c[0] ? x1 : x0), py = y + (c[1] ? y1 : y0), pz = z + (c[2] ? z1 : z0);
      pts.push([px, py, pz]);
      const ly = c[1] ? y1 : y0;
      fxs.push([light(px, py, pz, f.n), sway * Math.max(0, ly) * (sway >= 0.5 ? 1 : 0.6), fol, 0]);
    }
    const s = f.shade * tint;
    const col = [color[0] * s, color[1] * s, color[2] * s];
    buf.quad(pts, f.n, [col, col, col, col], fxs, false);
  }
}

export function meshChunk(world, cx, cz) {
  const opaque = new Buf(), trans = new Buf(), glow = new Buf();
  const S = world.size;
  const ci = cz * world.chunksX + cx;
  let minY = world.chunkNatMin[ci];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const ax = cx + dx, az = cz + dz;
    if (ax < 0 || az < 0 || ax >= world.chunksX || az >= world.chunksX) continue;
    minY = Math.min(minY, world.chunkMinEdit[az * world.chunksX + ax]);
  }
  minY = Math.max(0, minY - 1);
  let maxY = 0;
  for (let z = cz * CHUNK; z < cz * CHUNK + CHUNK; z++)
    for (let x = cx * CHUNK; x < cx * CHUNK + CHUNK; x++) maxY = Math.max(maxY, world.colTop[z * S + x]);

  const lightAt = makeLighter(world.lightsNear(cx * CHUNK, cz * CHUNK, cx * CHUNK + CHUNK, cz * CHUNK + CHUNK));
  const get = (x, y, z) => world.get(x, y, z);
  const opq = (x, y, z) => (BLOCKS[get(x, y, z)].opaque ? 1 : 0);

  for (let z = cz * CHUNK; z < cz * CHUNK + CHUNK; z++) {
    for (let x = cx * CHUNK; x < cx * CHUNK + CHUNK; x++) {
      const colMax = world.colTop[z * S + x];
      for (let y = minY; y <= Math.min(colMax, maxY); y++) {
        const id = get(x, y, z);
        if (id === B.AIR) continue;
        const def = BLOCKS[id];
        const tint = 0.96 + hash3(x, y, z) * 0.08;

        if (def.shape === 'boxes') {
          for (const bx of def.boxes) emitBox(bx.glow ? glow : opaque, x, y, z, bx.b, bx.lc, bx.glow ? 1.6 : tint, def, lightAt);
          continue;
        }

        const lc = def._lin;
        const isTrans = def.transparent;
        const patch = id === B.GRASS ? 1 + world.t.tint[z * S + x] : 1;
        const target = def.glow ? glow : isTrans ? trans : opaque;
        const glowMul = def.glow ? 1.5 : 1;
        for (const f of FACES) {
          const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
          const nid = get(nx, ny, nz);
          const nd = BLOCKS[nid];
          if (nd.opaque) continue;
          if (isTrans && nid === id) continue;
          if (def.liquid && f.n[1] === -1 && nd.solid) continue;

          const base = f.kind === 'top' ? lc.top : f.kind === 'bottom' ? lc.bottom : lc.side;
          const pts = [], cols = [], ao = [], fxs = [];
          // water top sits a bit lower than a full block
          const waterTop = def.liquid && f.n[1] >= 0 && get(x, y + 1, z) !== id;
          // snow settles on tops that are open to the sky
          const snowy = f.kind === 'top' && !isTrans && !def.glow && (nid === B.AIR || nd.plant) ? 1 : 0;
          for (let i = 0; i < 4; i++) {
            const c = f.c[i];
            let py = y + c[1];
            if (waterTop && c[1] === 1) py = y + 0.86;
            const px = x + c[0], pz = z + c[2];
            pts.push([px, py, pz]);
            let a = 3;
            if (!isTrans && !def.glow) {
              // ambient occlusion from the 3 neighbours in front of this corner
              const axes = f.axes;
              const o1 = [0, 0, 0], o2 = [0, 0, 0];
              o1[axes[0]] = c[axes[0]] ? 1 : -1;
              o2[axes[1]] = c[axes[1]] ? 1 : -1;
              const s1 = opq(nx + o1[0], ny + o1[1], nz + o1[2]);
              const s2 = opq(nx + o2[0], ny + o2[1], nz + o2[2]);
              const cc = opq(nx + o1[0] + o2[0], ny + o1[1] + o2[1], nz + o1[2] + o2[2]);
              a = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
            }
            ao.push(a);
            let col = base;
            let fol = def.foliage;
            // grass: green lip on the upper part of sides
            if (lc.sideTop && f.kind === 'side') { if (c[1] === 1) col = lc.sideTop; else fol = 0; }
            if (def.foliage === 1 && f.kind === 'bottom') fol = 0;
            const s = f.shade * (def.glow ? glowMul : tint) * AO_CURVE[a] * (f.kind === 'top' || c[1] === 1 ? patch : 1);
            cols.push([col[0] * s, col[1] * s, col[2] * s]);
            fxs.push([def.glow ? 0 : lightAt(px, py, pz, f.n), def.sway, fol, snowy]);
          }
          target.quad(pts, f.n, cols, fxs, ao[0] + ao[2] < ao[1] + ao[3]);
        }
      }
    }
  }
  return { opaque: opaque.out(), trans: trans.out(), glow: glow.out() };
}

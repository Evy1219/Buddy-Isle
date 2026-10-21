import { BLOCKS, B } from './blocks.js';
import { CHUNK } from './world.js';
import { hash3 } from '../core/rng.js';

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
for (const f of FACES) f.axes = [0, 1, 2].filter((k) => f.n[k] === 0);

class Buf {
  constructor() { this.pos = []; this.norm = []; this.col = []; this.idx = []; this.n = 0; }
  quad(p, nrm, cols, flip) {
    const b = this.n;
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.norm.push(nrm[0], nrm[1], nrm[2]);
      this.col.push(cols[i][0], cols[i][1], cols[i][2]);
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
      index: this.n > 65000 ? new Uint32Array(this.idx) : new Uint16Array(this.idx),
    };
  }
}

function emitBox(buf, x, y, z, bx, color, tint) {
  const [x0, y0, z0, x1, y1, z1] = bx;
  for (const f of FACES) {
    const pts = f.c.map((c) => [
      x + (c[0] ? x1 : x0),
      y + (c[1] ? y1 : y0),
      z + (c[2] ? z1 : z0),
    ]);
    const s = f.shade * tint;
    const col = [color[0] * s, color[1] * s, color[2] * s];
    buf.quad(pts, f.n, [col, col, col, col], false);
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
          for (const bx of def.boxes) emitBox(bx.glow ? glow : opaque, x, y, z, bx.b, bx.lc, bx.glow ? 1 : tint);
          continue;
        }

        const lc = def._lin;
        const isTrans = def.transparent;
        const patch = id === B.GRASS ? 1 + world.t.tint[z * S + x] : 1;
        const target = def.glow ? glow : isTrans ? trans : opaque;
        for (const f of FACES) {
          const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
          const nid = get(nx, ny, nz);
          const nd = BLOCKS[nid];
          if (nd.opaque) continue;
          if (isTrans && nid === id) continue;
          if (def.liquid && f.n[1] === -1 && nd.solid) continue;

          let base = f.kind === 'top' ? lc.top : f.kind === 'bottom' ? lc.bottom : lc.side;
          const pts = [];
          const cols = [];
          const ao = [];
          // water top sits a bit lower than a full block
          const waterTop = def.liquid && f.n[1] >= 0 && get(x, y + 1, z) !== id;
          for (let i = 0; i < 4; i++) {
            const c = f.c[i];
            let py = y + c[1];
            if (waterTop && c[1] === 1) py = y + 0.86;
            pts.push([x + c[0], py, z + c[2]]);
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
            // grass: green lip on the upper part of sides
            if (lc.sideTop && f.kind === 'side' && c[1] === 1) col = lc.sideTop;
            const s = f.shade * (def.glow ? 1 : tint) * AO_CURVE[a] * (f.kind === 'top' || c[1] === 1 ? patch : 1);
            cols.push([col[0] * s, col[1] * s, col[2] * s]);
          }
          target.quad(pts, f.n, cols, ao[0] + ao[2] < ao[1] + ao[3]);
        }
      }
    }
  }
  return { opaque: opaque.out(), trans: trans.out(), glow: glow.out() };
}

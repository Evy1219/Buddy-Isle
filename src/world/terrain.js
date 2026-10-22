import { makeNoise2D, fbm } from '../core/rng.js';
import { smoothstep, clamp } from '../core/util.js';
import { B } from './blocks.js';

export const SEA = 12;          // block y of the sea surface layer
export const WATER_Y = SEA + 0.86; // visual water surface height
export const MAX_H = 64;

// Generates the natural island: one height per column + its top block.
// Islets are extra little islands the buddy can raise later in the game.
export function generateTerrain(seed, size, islets = []) {
  const n1 = makeNoise2D(seed);
  const n2 = makeNoise2D(seed + 1013);
  const n3 = makeNoise2D(seed + 2027);
  const n4 = makeNoise2D(seed + 3041);
  const h = new Uint8Array(size * size);
  const top = new Uint8Array(size * size);
  const deco = new Uint8Array(size * size);   // wild grass + the odd flower
  const tint = new Float32Array(size * size); // lighter/darker meadow patches
  const c = size / 2;

  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c, dz = (z - c) / c;
      const d = Math.sqrt(dx * dx + dz * dz) + n1(x * 0.011, z * 0.011) * 0.13 + n4(x * 0.03, z * 0.03) * 0.03;
      const island = 1 - smoothstep(0.46, 0.7, d);
      const hills = fbm(n2, x * 0.014, z * 0.014, 4) * 0.5 + 0.5;
      const detail = n3(x * 0.07, z * 0.07) * 0.6;
      const m = Math.max(0, fbm(n3, x * 0.007 + 40, z * 0.007 - 17, 3));
      const mountains = m * m * 40 * smoothstep(0.55, 0.2, d);
      const land = 1.5 + hills * 8 + detail + mountains;
      let height = SEA - 8 + island * (8 + land);

      for (const it of islets) {
        const di = Math.hypot(x - it.x, z - it.z) / it.r + n1(x * 0.05 + it.x, z * 0.05) * 0.15;
        const bump = 1 - smoothstep(0.45, 1.0, di);
        if (bump > 0) {
          const ih = SEA - 8 + bump * (8 + 1.5 + (fbm(n2, x * 0.05, z * 0.05, 2) * 0.5 + 0.5) * 4);
          if (ih > height) height = ih;
        }
      }
      const hi = clamp(Math.round(height), 1, MAX_H - 16);
      const i = z * size + x;
      h[i] = hi;
      let t = B.GRASS;
      if (hi <= SEA + 1) t = B.SAND;
      else if (hi > SEA + 25) t = B.SNOW;
      else if (hi > SEA + 18) t = B.STONE;
      else if (hi > SEA + 12 && n4(x * 0.09, z * 0.09) > 0.35) t = B.STONE;
      top[i] = t;
      tint[i] = n4(x * 0.035 + 9, z * 0.035 - 3) * 0.09 + n3(x * 0.15, z * 0.15) * 0.03;
      if (t === B.GRASS) {
        const r = n1(x * 0.9 + 31.7, z * 0.9 - 12.3);
        const patch = n2(x * 0.05 + 70, z * 0.05);
        if (r > 0.55 - patch * 0.25) deco[i] = B.TALLGRASS;
        else if (r < -0.8 && patch > 0.1) deco[i] = [B.FLOWER_YELLOW, B.FLOWER_WHITE, B.FLOWER_BLUE][(x * 7 + z * 13) % 3];
      }
    }
  }
  return { h, top, deco, tint };
}

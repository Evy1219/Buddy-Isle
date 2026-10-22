import { B } from './blocks.js';
import { Plan, plantTree } from '../buddy/plan.js';
import { RNG } from '../core/rng.js';

// Saplings turn into trees and young wheat ripens, on the real clock.
// Things keep growing while you're away.
export const GROW = {
  tree: [20 * 60e3, 100 * 60e3], // sapling -> small tree -> full tree
  crop: [15 * 60e3],
};

export function plantGrowable(state, x, y, z, kind, extra = {}, when = Date.now()) {
  state.growables = state.growables || [];
  state.growables.push({ x, y, z, kind, planted: when, stage: 0, ...extra });
}

// Advance everything that's due. onPlace(x, y, z, id) is how blocks get placed.
export function updateGrowth(game, now = Date.now(), animate = true) {
  const st = game.state, world = game.world;
  const list = st.growables || [];
  let changed = 0;
  const keep = [];
  for (const g of list) {
    const times = GROW[g.kind] || [];
    const due = times.filter((t) => now - g.planted >= t).length;
    if (due <= g.stage) { keep.push(g); continue; }
    if (g.kind === 'crop') {
      if (world.get(g.x, g.y, g.z) === B.CROP_YOUNG) place(game, g.x, g.y, g.z, B.CROP, animate);
      changed++;
      continue; // done
    }
    if (g.kind === 'tree') {
      const here = world.get(g.x, g.y, g.z);
      // gone (removed) or blocked? forget about it
      if (g.stage === 0 && here !== B.SAPLING) continue;
      const rng = new RNG((g.x * 73856093) ^ (g.z * 19349663) ^ g.stage);
      const plan = new Plan(world, { x0: g.x, z0: g.z, size: 1, baseY: g.y - 1 });
      if (due >= 2) {
        // full tree: clear the small one first
        for (let y = g.y; y < g.y + 8; y++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          const id = world.get(g.x + dx, y, g.z + dz);
          if (id === B.LOG || id === B.BIRCH || id === B.LEAVES || id === B.LEAVES_PINK || id === B.LEAVES_ORANGE || id === B.LEAVES_PINE || id === B.SAPLING) {
            if ((g.small || []).includes(`${g.x + dx},${y},${g.z + dz}`)) plan.putW(g.x + dx, y, g.z + dz, B.AIR);
          }
        }
        plan.putW(g.x, g.y, g.z, B.AIR);
        plantTree(plan, g.x, g.z, g.tree || 'oak', rng, g.y - 1);
        for (const op of plan.ops()) place(game, op[0], op[1], op[2], op[3], animate);
        changed++;
        continue; // fully grown
      }
      // small tree
      plan.putW(g.x, g.y, g.z, B.AIR);
      plantTree(plan, g.x, g.z, g.tree || 'oak', rng, g.y - 1, true);
      const ops = plan.ops();
      g.small = ops.filter((o) => o[3] !== B.AIR).map((o) => `${o[0]},${o[1]},${o[2]}`);
      for (const op of ops) place(game, op[0], op[1], op[2], op[3], animate);
      g.stage = 1;
      changed++;
      keep.push(g);
    }
  }
  st.growables = keep;
  return changed;
}

function place(game, x, y, z, id, animate) {
  if (animate && game.fx && game.player && Math.hypot(game.player.pos.x - x, game.player.pos.z - z) < 60) {
    game.fx.sparkle(x + 0.5, y + 0.5, z + 0.5, 0xc8ff9a, 1, 0.4);
  }
  game.world.set(x, y, z, id);
}

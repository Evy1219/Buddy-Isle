import { Particles, SHAPE } from '../render/particles.js';

const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;

// Little effects: building sparkles, smoke, hearts, music notes, embers, fireworks...
export class FX {
  constructor(scene) {
    this.soft = new Particles(scene, 2600, false);
    this.glow = new Particles(scene, 3200, true);
    this.audio = null;
    this.rockets = 0;
  }

  setScale(s) { this.soft.setScale(s); this.glow.setScale(s); }

  // block debris / generic puff of little squares
  spawn(x, y, z, color, n = 6, { speed = 2, life = 0.7, gravity = -6, size = 0.12, up = 1.5 } = {}) {
    for (let i = 0; i < n; i++) {
      this.soft.emit({ x: x + rnd(0.35), y: y + rnd(0.35), z: z + rnd(0.35), vx: rnd(speed / 2), vy: Math.random() * up + 0.6, vz: rnd(speed / 2), color, size: size * 3.2 * (0.6 + Math.random() * 0.7), life: life * (0.7 + Math.random() * 0.6), gravity, shape: SHAPE.SQUARE, spin: rnd(6) });
    }
  }

  sparkle(x, y, z, color = 0xffffff, n = 4, spread = 0.5) {
    for (let i = 0; i < n; i++) this.glow.emit({ x: x + rnd(spread), y: y + rnd(spread), z: z + rnd(spread), vy: 0.4 + Math.random() * 0.8, vx: rnd(0.4), vz: rnd(0.4), color, size: 0.35 + Math.random() * 0.3, life: 0.5 + Math.random() * 0.5, shape: SHAPE.STAR, spin: rnd(4), bright: 1.4 });
  }

  hearts(x, y, z, n = 5) {
    for (let i = 0; i < n; i++) this.soft.emit({ x: x + rnd(0.5), y: y + rnd(0.3), z: z + rnd(0.5), vy: 1 + Math.random(), vx: rnd(0.4), vz: rnd(0.4), color: [0xff6b9a, 0xff8fb6, 0xff4f7d][i % 3], size: 0.45 + Math.random() * 0.25, life: 1.4 + Math.random() * 0.6, shape: SHAPE.HEART, drag: 0.6, wobble: 0.6 });
  }

  notes(x, y, z, color = 0xffd27a) {
    this.soft.emit({ x: x + rnd(0.3), y, z: z + rnd(0.3), vy: 0.8, vx: rnd(0.3), vz: rnd(0.3), color, size: 0.5, life: 2, shape: SHAPE.NOTE, wobble: 1.2, rot: rnd(0.3) });
  }

  zzz(x, y, z) {
    this.soft.emit({ x, y, z, vy: 0.45, vx: 0.25, color: 0xdfe8ff, size: 0.35, grow: 0.25, life: 2.4, shape: SHAPE.Z, wobble: 0.5, fadeIn: 0.2 });
  }

  smoke(x, y, z, { size = 0.9, color = 0xd8d8d8, rise = 0.9, life = 4, wind = 0.35 } = {}) {
    this.soft.emit({ x: x + rnd(0.15), y, z: z + rnd(0.15), vy: rise, vx: wind + rnd(0.1), vz: rnd(0.1), color, size, grow: 0.55, life, shape: SHAPE.PUFF, alpha: 0.55, drag: 0.15, spin: rnd(0.5), fadeIn: 0.15 });
  }

  ember(x, y, z) {
    this.glow.emit({ x: x + rnd(0.2), y, z: z + rnd(0.2), vy: 1.2 + Math.random() * 1.4, vx: rnd(0.3), vz: rnd(0.3), color: Math.random() < 0.5 ? 0xff9a3a : 0xffd060, size: 0.12 + Math.random() * 0.1, life: 0.9 + Math.random() * 0.9, shape: SHAPE.DOT, wobble: 1, bright: 1.6, flicker: 0.3 });
  }

  splash(x, y, z, n = 8, power = 1) {
    for (let i = 0; i < n; i++) this.soft.emit({ x: x + rnd(0.2), y, z: z + rnd(0.2), vx: rnd(1.2 * power), vy: (1.5 + Math.random() * 2) * power, vz: rnd(1.2 * power), color: 0xdff4ff, size: 0.18 + Math.random() * 0.12, life: 0.6, gravity: -12, shape: SHAPE.DOT, alpha: 0.9 });
    this.soft.emit({ x, y: y + 0.02, z, color: 0xffffff, size: 0.5, grow: 2.5 * power, life: 0.5, shape: SHAPE.DOT, alpha: 0.5 });
  }

  spray(x, y, z, power = 1) {
    this.soft.emit({ x: x + rnd(0.1), y, z: z + rnd(0.1), vx: rnd(0.9), vy: 3.6 * power + Math.random(), vz: rnd(0.9), color: 0xcfeeff, size: 0.16 + Math.random() * 0.1, life: 1.1, gravity: -9, shape: SHAPE.DROP, alpha: 0.85 });
  }

  firefly(x, y, z) {
    this.glow.emit({ x, y, z, vx: rnd(0.3), vy: rnd(0.15), vz: rnd(0.3), color: 0xc8ff7a, size: 0.2, life: 3 + Math.random() * 3, shape: SHAPE.DOT, wobble: 1.4, bright: 1.8, flicker: 0.8, fadeIn: 0.25 });
  }

  thruster(x, y, z, color) {
    this.glow.emit({ x: x + rnd(0.08), y, z: z + rnd(0.08), vy: -0.9, vx: rnd(0.15), vz: rnd(0.15), color, size: 0.2, grow: -0.2, life: 0.35, shape: SHAPE.DOT, bright: 1.3 });
  }

  magic(x, y, z, color) {
    this.glow.emit({ x: x + rnd(0.6), y: y + rnd(0.6), z: z + rnd(0.6), vx: rnd(0.2), vy: 0.6, vz: rnd(0.2), color, size: 0.18, life: 0.8, shape: SHAPE.STAR, bright: 1.5, spin: 3 });
  }

  // ---------- fireworks ----------
  firework(x, y, z, { height = 26 + Math.random() * 14, colors = null, kind = null } = {}) {
    const palette = [[0xff5a5a, 0xffd25a], [0x6ad1ff, 0xffffff], [0xb98cff, 0xff8fd8], [0x8cff8a, 0xfff07a], [0xffa04a, 0xff5a5a], [0xffffff, 0x9fe3ff]];
    const cols = colors || palette[Math.floor(Math.random() * palette.length)];
    const k = kind || ['sphere', 'sphere', 'ring', 'willow', 'heart', 'crackle'][Math.floor(Math.random() * 6)];
    const vy = Math.sqrt(2 * 14 * height);
    this.rockets++;
    this.audio?.whistle?.();
    this.glow.emit({
      x, y, z, vx: rnd(0.6), vy, vz: rnd(0.6), gravity: -14, color: 0xffe2a0, size: 0.35, life: vy / 14, shape: SHAPE.DOT, bright: 1.6,
      trail: (p) => { if (Math.random() < 0.8) this.glow.emit({ x: p.x, y: p.y, z: p.z, vx: rnd(0.3), vy: -0.5, vz: rnd(0.3), color: 0xffb060, size: 0.18, life: 0.5, shape: SHAPE.DOT, bright: 1.4 }); },
      onDie: (p) => { this.rockets--; this.burst(p.x, p.y, p.z, cols, k); },
    });
  }

  burst(x, y, z, cols, kind) {
    this.audio?.boom?.(x, y, z);
    const N = kind === 'crackle' ? 70 : 110;
    for (let i = 0; i < N; i++) {
      let vx, vy, vz;
      if (kind === 'ring') {
        const a = (i / N) * Math.PI * 2;
        vx = Math.cos(a) * 11; vy = Math.sin(a) * 11; vz = rnd(1);
      } else if (kind === 'heart') {
        const t = (i / N) * Math.PI * 2;
        vx = 16 * Math.sin(t) ** 3 * 0.62; vy = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 0.62; vz = rnd(0.6);
      } else {
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        const sp = kind === 'willow' ? 7 : 10 + Math.random() * 2;
        vx = r * Math.cos(th) * sp; vy = u * sp; vz = r * Math.sin(th) * sp;
      }
      const c = cols[i % cols.length];
      const willow = kind === 'willow';
      this.glow.emit({
        x, y, z, vx, vy, vz, gravity: willow ? -3 : -5, drag: willow ? 1.4 : 1.1, color: c, size: 0.42, life: willow ? 2.8 : 1.6 + Math.random() * 0.5, shape: SHAPE.DOT, bright: 2.2, flicker: kind === 'crackle' ? 0.9 : 0.15,
        trail: willow ? (p, dt) => { if (Math.random() < dt * 20) this.glow.emit({ x: p.x, y: p.y, z: p.z, vy: -0.4, color: 0xffc860, size: 0.16, life: 0.8, shape: SHAPE.DOT, bright: 1.3 }); } : null,
      });
    }
    this.glow.emit({ x, y, z, color: cols[0], size: 7, grow: -6, life: 0.35, shape: SHAPE.DOT, bright: 2.5, alpha: 0.8 });
  }

  update(dt) {
    this.soft.update(dt);
    this.glow.update(dt);
  }

  clear() { this.soft.clear(); this.glow.clear(); }
}

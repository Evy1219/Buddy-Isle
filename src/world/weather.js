import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';
import { clamp, lerp } from '../core/util.js';
import { WATER_Y } from './terrain.js';

// Weather follows a fixed schedule worked out from the world seed and the real clock,
// so it also "happened" while you were away and the buddy can talk about it.
export const SLOT = 18 * 60e3;
const LOOKS = {
  clear: { cloud: 0.12, overcast: 0, rain: 0, snow: 0, fog: 0, wind: 0.8 },
  partly: { cloud: 0.5, overcast: 0.05, rain: 0, snow: 0, fog: 0, wind: 1 },
  cloudy: { cloud: 0.9, overcast: 0.38, rain: 0, snow: 0, fog: 0.08, wind: 1.3 },
  rain: { cloud: 1, overcast: 0.72, rain: 1, snow: 0, fog: 0.22, wind: 1.8 },
  mist: { cloud: 0.4, overcast: 0.3, rain: 0, snow: 0, fog: 1, wind: 0.4 },
  snow: { cloud: 0.95, overcast: 0.5, rain: 0, snow: 1, fog: 0.3, wind: 0.7 },
};
const WEIGHTS = {
  spring: { clear: 4, partly: 3, cloudy: 2, rain: 2.4, mist: 1 },
  summer: { clear: 6.5, partly: 3, cloudy: 1, rain: 1.2, mist: 0.4 },
  autumn: { clear: 3, partly: 3, cloudy: 2.5, rain: 2.4, mist: 2 },
  winter: { clear: 3, partly: 2, cloudy: 2.2, snow: 3.5, mist: 1.4 },
};
export const WEATHER_NAMES = { clear: 'clear skies', partly: 'a few clouds', cloudy: 'cloudy', rain: 'rain', mist: 'misty', snow: 'snow' };

export function seasonFor(mode, date = new Date()) {
  if (mode && mode !== 'calendar') return mode;
  const m = date.getMonth();
  return m < 2 || m === 11 ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'autumn';
}

export function kindAt(seed, created, t, season) {
  const slot = Math.floor(t / SLOT);
  if (t - created < 30 * 60e3) return 'clear'; // a brand-new island starts sunny
  const r = mulberry32((seed ^ Math.imul(slot, 2654435761)) >>> 0);
  r();
  const w = WEIGHTS[season] || WEIGHTS.summer;
  let total = 0;
  for (const k in w) total += w[k];
  let x = r() * total;
  for (const k in w) { x -= w[k]; if (x <= 0) return k; }
  return 'clear';
}

export function weatherAt(seed, created, t, season, enabled = true) {
  if (!enabled) return { kind: 'clear', ...LOOKS.clear, rainbow: 0 };
  const now = kindAt(seed, created, t, season);
  const prev = kindAt(seed, created, t - SLOT, season);
  const into = (t % SLOT) / 1;
  const f = clamp(into / (2.5 * 60e3), 0, 1);
  const a = LOOKS[prev], b = LOOKS[now];
  const out = { kind: now };
  for (const k in b) out[k] = lerp(a[k], b[k], f);
  const wasWet = prev === 'rain';
  out.rainbow = wasWet && now !== 'rain' && now !== 'mist' ? clamp(Math.min((into - 60e3) / 60e3, (7 * 60e3 - into) / 90e3), 0, 1) : 0;
  return out;
}

// Summary of the weather over a stretch of time (for the "while you were away" letter)
export function weatherBetween(seed, created, t0, t1, season) {
  const counts = {};
  for (let t = t0; t < t1; t += SLOT) {
    const k = kindAt(seed, created, t, season);
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

// Rain streaks and snowflakes around the camera
export class Precipitation {
  constructor(scene) {
    this.scene = scene;
    const N = 2200;
    this.N = N;
    const rnd = mulberry32(7);
    this.drops = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.drops[i * 3] = rnd() * 70 - 35;
      this.drops[i * 3 + 1] = rnd() * 40;
      this.drops[i * 3 + 2] = rnd() * 70 - 35;
    }
    this.rainPos = new Float32Array(N * 6);
    const rg = new THREE.BufferGeometry();
    this.rainAttr = new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage);
    rg.setAttribute('position', this.rainAttr);
    this.rainMat = new THREE.LineBasicMaterial({ color: 0xc8d8ea, transparent: true, opacity: 0, depthWrite: false });
    this.rain = new THREE.LineSegments(rg, this.rainMat);
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    this.snowPos = new Float32Array(N * 3);
    const sg = new THREE.BufferGeometry();
    this.snowAttr = new THREE.BufferAttribute(this.snowPos, 3).setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('position', this.snowAttr);
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'); const r = g.createRadialGradient(16, 16, 0, 16, 16, 15);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32);
    this.snowMat = new THREE.PointsMaterial({ size: 0.28, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false, color: 0xffffff });
    this.snow = new THREE.Points(sg, this.snowMat);
    this.snow.frustumCulled = false;
    scene.add(this.snow);
    this.t = 0;
  }

  update(dt, camera, w, world, fx) {
    this.t += dt;
    const cp = camera.position;
    const rain = w.rain, snow = w.snow;
    this.rain.visible = rain > 0.02;
    this.snow.visible = snow > 0.02;
    if (!this.rain.visible && !this.snow.visible) return;
    const count = Math.floor(this.N * Math.max(rain, snow));
    const D = this.drops;
    const windX = 3 * w.wind, windZ = 1.2 * w.wind;
    for (let i = 0; i < this.N; i++) {
      let x = D[i * 3], y = D[i * 3 + 1], z = D[i * 3 + 2];
      if (rain > 0.02) { y -= dt * 26; x += windX * dt * 0.4; }
      else { y -= dt * 2.2; x += Math.sin(this.t * 0.8 + i) * dt * 0.6 + windX * dt * 0.2; z += Math.cos(this.t * 0.6 + i * 1.3) * dt * 0.5; }
      if (y < -18) { y += 40; x = Math.random() * 70 - 35; z = Math.random() * 70 - 35; }
      D[i * 3] = x; D[i * 3 + 1] = y; D[i * 3 + 2] = z;
      const wx = cp.x + x, wy = cp.y + y - 10, wz = cp.z + z;
      const hidden = i >= count;
      if (rain > 0.02) {
        const o = i * 6;
        const k = hidden ? 0 : 1;
        this.rainPos[o] = wx; this.rainPos[o + 1] = hidden ? -999 : wy; this.rainPos[o + 2] = wz;
        this.rainPos[o + 3] = wx - windX * 0.03 * k; this.rainPos[o + 4] = hidden ? -999 : wy + 0.7; this.rainPos[o + 5] = wz - windZ * 0.03 * k;
      }
      if (snow > 0.02) {
        this.snowPos[i * 3] = wx; this.snowPos[i * 3 + 1] = hidden ? -999 : wy; this.snowPos[i * 3 + 2] = wz;
      }
    }
    if (rain > 0.02) { this.rainAttr.needsUpdate = true; this.rainMat.opacity = 0.42 * rain; }
    if (snow > 0.02) { this.snowAttr.needsUpdate = true; this.snowMat.opacity = 0.95 * snow; }
    // splashes on the ground and water near you
    if (rain > 0.3 && fx && world) {
      const n = Math.floor(rain * 30 * dt * 10);
      for (let i = 0; i < n; i++) {
        const x = cp.x + (Math.random() - 0.5) * 30, z = cp.z + (Math.random() - 0.5) * 30;
        const gy = world.groundY(x, z);
        const y = Math.max(gy + 1.02, WATER_Y + 0.05);
        fx.soft.emit({ x, y, z, color: 0xe6f2ff, size: 0.12, grow: 1.4, life: 0.25, shape: 0, alpha: 0.5 });
      }
    }
  }
}

import * as THREE from 'three';
import { SEA, WATER_Y } from './terrain.js';
import { B, BLOCKS, FLOWERS } from './blocks.js';
import { mulberry32, hashString } from '../core/rng.js';
import { clamp, lerp } from '../core/util.js';

const M = (c) => new THREE.MeshLambertMaterial({ color: c });
const box = (w, h, d, c, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y, z); m.castShadow = true; return m; };

// ---------- critters you can pet ----------
const CRITTERS = {
  chicken: { name: 'chicken', speed: 1.3, make(r) {
    const g = new THREE.Group();
    const white = r() < 0.7;
    g.add(box(0.36, 0.32, 0.46, white ? 0xf6f2ea : 0xb8743a, 0, 0.36, 0));
    g.add(box(0.22, 0.24, 0.22, white ? 0xf6f2ea : 0xb8743a, 0, 0.6, 0.2));
    g.add(box(0.08, 0.06, 0.1, 0xf0a030, 0, 0.58, 0.34));
    g.add(box(0.06, 0.1, 0.12, 0xd8382e, 0, 0.75, 0.2));
    g.add(box(0.05, 0.2, 0.05, 0xf0a030, -0.08, 0.1, 0));
    g.add(box(0.05, 0.2, 0.05, 0xf0a030, 0.08, 0.1, 0));
    g.add(box(0.06, 0.18, 0.2, white ? 0xe8e2d6 : 0x9a5e2c, 0, 0.42, -0.26));
    return g;
  } },
  cat: { name: 'cat', speed: 1.6, make(r) {
    const g = new THREE.Group();
    const col = [0xe08a3a, 0x6a6a72, 0x2c2c32, 0xf3efe6, 0xc9a274][Math.floor(r() * 5)];
    g.add(box(0.3, 0.28, 0.6, col, 0, 0.32, 0));
    g.add(box(0.3, 0.28, 0.28, col, 0, 0.52, 0.34));
    g.add(box(0.08, 0.1, 0.06, col, -0.09, 0.71, 0.36));
    g.add(box(0.08, 0.1, 0.06, col, 0.09, 0.71, 0.36));
    g.add(box(0.06, 0.05, 0.02, 0x9ee070, -0.07, 0.55, 0.49));
    g.add(box(0.06, 0.05, 0.02, 0x9ee070, 0.07, 0.55, 0.49));
    for (const [x, z] of [[-0.1, 0.2], [0.1, 0.2], [-0.1, -0.2], [0.1, -0.2]]) g.add(box(0.08, 0.2, 0.08, col, x, 0.1, z));
    const tail = box(0.07, 0.07, 0.42, col, 0, 0.5, -0.46); tail.rotation.x = -0.6; g.add(tail);
    g.userData.tail = tail;
    return g;
  } },
  duck: { name: 'duck', speed: 0.8, water: true, make(r) {
    const g = new THREE.Group();
    const male = r() < 0.5;
    g.add(box(0.36, 0.26, 0.5, male ? 0xd8d0c0 : 0x9a7a52, 0, 0.13, 0));
    g.add(box(0.2, 0.22, 0.2, male ? 0x2f7a46 : 0x8a6a46, 0, 0.36, 0.2));
    g.add(box(0.12, 0.05, 0.14, 0xf0a030, 0, 0.32, 0.36));
    g.add(box(0.2, 0.1, 0.14, male ? 0xc8c0b0 : 0x7a5a3a, 0, 0.2, -0.26));
    return g;
  } },
  bunny: { name: 'bunny', speed: 2.2, make(r) {
    const g = new THREE.Group();
    const col = [0xc9a274, 0xf3efe6, 0x8a7a6a][Math.floor(r() * 3)];
    g.add(box(0.28, 0.26, 0.38, col, 0, 0.18, 0));
    g.add(box(0.22, 0.22, 0.22, col, 0, 0.36, 0.18));
    g.add(box(0.06, 0.26, 0.05, col, -0.05, 0.58, 0.16));
    g.add(box(0.06, 0.26, 0.05, col, 0.05, 0.58, 0.16));
    g.add(box(0.1, 0.1, 0.08, 0xffffff, 0, 0.22, -0.22));
    return g;
  } },
};

export class Life {
  constructor(scene, world, fx) {
    this.scene = scene;
    this.world = world;
    this.fx = fx;
    this.level = 1;
    this.t = 0;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.critters = [];
    this._makeBirds();
    this._makeButterflies();
    this._makeFish();
    this.fireflyT = 0;
    this.flowerSpots = [];
    this.scanT = 0;
  }

  setWorld(world) { this.world = world; this.flowerSpots = []; }

  // ---------- birds ----------
  _makeBirds() {
    const N = 24;
    this.birdN = N;
    this.birdBody = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.16, 0.6), M(0xffffff), N);
    this.birdWing = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.04, 0.32).translate(0.45, 0, 0), M(0xffffff), N * 2);
    this.birdBody.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.birdWing.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 6), 3);
    this.birdBody.frustumCulled = false; this.birdWing.frustumCulled = false;
    this.scene.add(this.birdBody, this.birdWing);
    const r = mulberry32(99);
    this.birds = [];
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const flock = Math.floor(i / 6);
      const gull = flock === 0 || flock === 2;
      this.birds.push({ flock, gull, off: [r() * 6 - 3, r() * 2, r() * 6 - 3], ph: r() * 6, speed: 0.12 + r() * 0.02 });
      c.setHex(gull ? 0xf2f2f2 : 0x3a3a44);
      this.birdBody.setColorAt(i, c);
      c.setHex(gull ? 0xdedede : 0x2a2a34);
      this.birdWing.setColorAt(i * 2, c); this.birdWing.setColorAt(i * 2 + 1, c);
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
  }

  _updateBirds(dt, ctx) {
    const S = this.world.size, c = S / 2;
    const day = 1 - ctx.night;
    const show = day > 0.3 && ctx.rain < 0.5;
    this.birdBody.visible = this.birdWing.visible = show && this.level > 0.2;
    if (!this.birdBody.visible) return;
    const flocks = Math.max(1, Math.round(4 * this.level));
    for (let i = 0; i < this.birdN; i++) {
      const b = this.birds[i];
      const hidden = b.flock >= flocks;
      const R = b.gull ? S * 0.43 : S * 0.22 + b.flock * 9;
      const a = this.t * b.speed * (b.flock % 2 ? 1 : -1) + b.flock * 1.7;
      const fx = c + Math.cos(a) * R + b.off[0], fz = c + Math.sin(a) * R + b.off[2];
      const fy = SEA + (b.gull ? 22 : 34 + b.flock * 4) + b.off[1] + Math.sin(this.t * 0.7 + b.ph) * 1.5;
      const dir = (b.flock % 2 ? 1 : -1);
      const yaw = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
      const flap = Math.sin(this.t * (b.gull ? 6 : 11) + b.ph) * (b.gull ? 0.5 : 0.8);
      this._s.setScalar(hidden ? 0 : (b.gull ? 1.3 : 1));
      this._e.set(0, yaw, 0); this._q.setFromEuler(this._e);
      this._p.set(fx, fy, fz);
      this._m.compose(this._p, this._q, this._s);
      this.birdBody.setMatrixAt(i, this._m);
      for (const side of [0, 1]) {
        this._e.set(0, yaw + (side ? Math.PI : 0), (side ? -1 : 1) * flap * (side ? -1 : 1));
        this._q.setFromEuler(this._e);
        this._m.compose(this._p, this._q, this._s);
        this.birdWing.setMatrixAt(i * 2 + side, this._m);
      }
    }
    this.birdBody.instanceMatrix.needsUpdate = true;
    this.birdWing.instanceMatrix.needsUpdate = true;
  }

  // ---------- butterflies ----------
  _makeButterflies() {
    const N = 18;
    this.bfN = N;
    const geo = new THREE.PlaneGeometry(0.22, 0.18).translate(0.11, 0, 0).rotateX(-Math.PI / 2);
    this.bfWing = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), N * 2);
    this.bfWing.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 6), 3);
    this.bfWing.frustumCulled = false;
    this.scene.add(this.bfWing);
    const r = mulberry32(5);
    const cols = [0xffb347, 0x9fd0ff, 0xffe066, 0xff9ad5, 0xffffff, 0xb59cf0];
    this.bfs = [];
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      this.bfs.push({ x: 0, y: -100, z: 0, ax: 0, az: 0, ay: 0, ph: r() * 6, vx: 0, vz: 0, active: false });
      c.setHex(cols[i % cols.length]);
      this.bfWing.setColorAt(i * 2, c); this.bfWing.setColorAt(i * 2 + 1, c);
    }
  }

  _scanFlowers(center) {
    const w = this.world, spots = [];
    const cx = Math.floor(center.x), cz = Math.floor(center.z);
    for (let k = 0; k < 900 && spots.length < 40; k++) {
      const x = cx + Math.floor(Math.random() * 60 - 30), z = cz + Math.floor(Math.random() * 60 - 30);
      const y = w.top(x, z);
      const id = w.get(x, y, z);
      if (FLOWERS.includes(id) || id === B.POT_FLOWER || id === B.PLANTER) spots.push({ x: x + 0.5, y: y + 1, z: z + 0.5 });
    }
    this.flowerSpots = spots;
  }

  _updateButterflies(dt, ctx) {
    const day = 1 - ctx.night;
    const show = day > 0.5 && ctx.rain < 0.3 && this.level > 0.3 && this.flowerSpots.length;
    this.bfWing.visible = !!show;
    if (!show) { this.bfs.forEach((b) => { b.active = false; }); return; }
    const active = Math.min(this.bfN, Math.round(this.flowerSpots.length * 0.5 * this.level) + 2);
    for (let i = 0; i < this.bfN; i++) {
      const b = this.bfs[i];
      if (i >= active) { b.active = false; this._s.setScalar(0); this._m.compose(this._p.set(0, -100, 0), this._q, this._s); this.bfWing.setMatrixAt(i * 2, this._m); this.bfWing.setMatrixAt(i * 2 + 1, this._m); continue; }
      if (!b.active) {
        const s = this.flowerSpots[Math.floor(Math.random() * this.flowerSpots.length)];
        Object.assign(b, { x: s.x, y: s.y + 0.6, z: s.z, ax: s.x, ay: s.y, az: s.z, active: true });
      }
      b.ph += dt;
      if (Math.random() < dt * 0.25) {
        const s = this.flowerSpots[Math.floor(Math.random() * this.flowerSpots.length)];
        if (Math.hypot(s.x - b.ax, s.z - b.az) < 12) { b.ax = s.x; b.ay = s.y; b.az = s.z; }
      }
      const tx = b.ax + Math.sin(b.ph * 0.9) * 1.2, tz = b.az + Math.cos(b.ph * 0.7) * 1.2, ty = b.ay + 0.5 + Math.abs(Math.sin(b.ph * 1.3)) * 0.8;
      b.vx = lerp(b.vx, (tx - b.x) * 1.2, dt * 2); b.vz = lerp(b.vz, (tz - b.z) * 1.2, dt * 2);
      b.x += b.vx * dt; b.z += b.vz * dt; b.y = lerp(b.y, ty, dt * 2);
      const yaw = Math.atan2(b.vx, b.vz);
      const flap = Math.sin(this.t * 22 + b.ph * 3) * 1.1;
      this._p.set(b.x, b.y, b.z); this._s.setScalar(1);
      for (const side of [0, 1]) {
        this._e.set(0, yaw + Math.PI / 2 + (side ? Math.PI : 0), side ? -flap : flap, 'YXZ');
        this._q.setFromEuler(this._e);
        this._m.compose(this._p, this._q, this._s);
        this.bfWing.setMatrixAt(i * 2 + side, this._m);
      }
    }
    this.bfWing.instanceMatrix.needsUpdate = true;
  }

  // ---------- fish that jump out of the sea ----------
  _makeFish() {
    const g = new THREE.Group();
    g.add(box(0.16, 0.26, 0.6, 0x7fb8d8));
    const tail = box(0.04, 0.3, 0.2, 0x5f98b8, 0, 0, -0.38); g.add(tail);
    g.visible = false;
    this.fish = g;
    this.fishT = 5;
    this.scene.add(g);
  }

  _updateFish(dt, ctx) {
    const f = this.fish;
    if (f.userData.jump) {
      const j = f.userData.jump;
      j.t += dt;
      const k = j.t / j.dur;
      if (k >= 1) { f.visible = false; f.userData.jump = null; this.fx.splash(j.x1, WATER_Y, j.z1, 6, 0.6); ctx.audio?.plop?.(); return; }
      f.position.set(lerp(j.x0, j.x1, k), WATER_Y + Math.sin(k * Math.PI) * j.h, lerp(j.z0, j.z1, k));
      f.rotation.set(-Math.cos(k * Math.PI) * 1.0, j.yaw, 0);
      return;
    }
    this.fishT -= dt;
    if (this.fishT > 0) return;
    this.fishT = 4 + Math.random() * 10;
    const cam = ctx.camera.position;
    for (let i = 0; i < 20; i++) {
      const x = cam.x + (Math.random() - 0.5) * 60, z = cam.z + (Math.random() - 0.5) * 60;
      if (this.world.naturalHeight(Math.floor(x), Math.floor(z)) > SEA - 3) continue;
      const yaw = Math.random() * Math.PI * 2, len = 1.4 + Math.random();
      const j = { x0: x, z0: z, x1: x + Math.sin(yaw) * len, z1: z + Math.cos(yaw) * len, t: 0, dur: 0.7, h: 0.8 + Math.random() * 0.6, yaw };
      f.userData.jump = j; f.visible = true;
      this.fx.splash(x, WATER_Y, z, 5, 0.5);
      return;
    }
  }

  // ---------- critters ----------
  syncCritters(projects) {
    const want = [];
    const limit = { chicken: 8, cat: 5, duck: 8, bunny: 8 };
    const count = {};
    const add = (kind, p, n) => {
      for (let i = 0; i < n; i++) {
        count[kind] = (count[kind] || 0) + 1;
        if (count[kind] > Math.ceil(limit[kind] * Math.max(0.35, this.level))) return;
        want.push({ key: `${p.id}-${kind}-${i}`, kind, p });
      }
    };
    for (const p of projects) {
      if (!p.done) continue;
      if (p.type === 'garden') add('chicken', p, 2);
      else if (p.type === 'cottage' && (p.variant || (count.cat || 0) < 3)) add('cat', p, 1);
      else if (p.type === 'pond') add('duck', p, 2);
      else if (p.type === 'grove' || p.type === 'flowerfield') add('bunny', p, 1);
    }
    const have = new Map(this.critters.map((c) => [c.key, c]));
    const next = [];
    for (const w of want) {
      if (have.has(w.key)) { next.push(have.get(w.key)); have.delete(w.key); continue; }
      const r = mulberry32(hashString(w.key));
      const mesh = CRITTERS[w.kind].make(r);
      const anchor = { x: w.p.x0 + w.p.w / 2, z: w.p.z0 + w.p.d / 2, y: w.p.baseY };
      const c = { key: w.key, kind: w.kind, mesh, anchor, x: anchor.x + r() * 2 - 1, z: anchor.z + r() * 2 - 1, y: anchor.y + 1, facing: r() * 6, target: null, wait: r() * 3, hop: 0, ph: r() * 6, petT: 0, rad: w.kind === 'duck' ? 2.6 : w.kind === 'cat' ? 7 : 5.5 };
      if (w.kind === 'duck') { c.x = anchor.x; c.z = anchor.z; }
      mesh.position.set(c.x, c.y, c.z);
      this.group.add(mesh);
      next.push(c);
    }
    for (const c of have.values()) this.group.remove(c.mesh);
    this.critters = next;
  }

  _critterGround(c, x, z) {
    if (c.kind === 'duck') return c.anchor.y + 0.82;
    return this.world.groundY(x, z) + 1;
  }

  _updateCritters(dt, ctx) {
    const cam = ctx.camera.position;
    for (const c of this.critters) {
      const far = Math.abs(c.x - cam.x) > 90 || Math.abs(c.z - cam.z) > 90;
      c.mesh.visible = !far;
      if (far) continue;
      c.ph += dt;
      if (c.petT > 0) c.petT -= dt;
      const def = CRITTERS[c.kind];
      const sleeping = ctx.night > 0.7 && c.kind !== 'cat';
      if (!c.target) {
        c.wait -= dt;
        if (c.wait <= 0 && !sleeping && c.petT <= 0) {
          for (let k = 0; k < 6; k++) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * c.rad;
            const tx = c.anchor.x + Math.cos(a) * r, tz = c.anchor.z + Math.sin(a) * r;
            if (c.kind === 'duck') { if (this.world.get(Math.floor(tx), c.anchor.y, Math.floor(tz)) !== B.WATER) continue; }
            else {
              const gy = this.world.groundY(tx, tz);
              if (gy <= SEA || Math.abs(gy + 1 - c.y) > 1.2) continue;
              if (this.world.get(Math.floor(tx), gy + 1, Math.floor(tz)) !== B.AIR && !BLOCKS[this.world.get(Math.floor(tx), gy + 1, Math.floor(tz))].plant) continue;
            }
            c.target = { x: tx, z: tz };
            break;
          }
          c.wait = 1.5 + Math.random() * (c.kind === 'cat' ? 9 : 4);
        }
      } else {
        const dx = c.target.x - c.x, dz = c.target.z - c.z, d = Math.hypot(dx, dz);
        if (d < 0.15) c.target = null;
        else {
          const sp = def.speed * dt;
          const nx = c.x + (dx / d) * Math.min(sp, d), nz = c.z + (dz / d) * Math.min(sp, d);
          const gy = this._critterGround(c, nx, nz);
          if (c.kind !== 'duck' && Math.abs(gy - c.y) > 1.1) c.target = null;
          else { c.x = nx; c.z = nz; }
          let df = Math.atan2(dx, dz) - c.facing;
          while (df > Math.PI) df -= Math.PI * 2;
          while (df < -Math.PI) df += Math.PI * 2;
          c.facing += df * Math.min(1, dt * 8);
          if (c.kind === 'bunny' || c.kind === 'chicken') c.hop = Math.abs(Math.sin(c.ph * (c.kind === 'bunny' ? 9 : 14))) * (c.kind === 'bunny' ? 0.3 : 0.08);
        }
      }
      if (!c.target) c.hop = lerp(c.hop, 0, dt * 8);
      const gy = this._critterGround(c, c.x, c.z);
      c.y = lerp(c.y, gy, Math.min(1, dt * 10));
      const bob = c.kind === 'duck' ? Math.sin(c.ph * 2) * 0.03 : 0;
      c.mesh.position.set(c.x, c.y + c.hop + bob, c.z);
      c.mesh.rotation.y = c.facing;
      c.mesh.rotation.x = sleeping ? 0 : (c.kind === 'chicken' && !c.target ? Math.max(0, Math.sin(c.ph * 1.3)) * 0.5 : 0);
      if (c.mesh.userData.tail) c.mesh.userData.tail.rotation.y = Math.sin(c.ph * 2) * 0.5;
      c.mesh.scale.y = sleeping ? 0.8 : 1;
    }
  }

  nearestCritter(pos, r = 2.6) {
    let best = null, bd = r;
    for (const c of this.critters) {
      if (!c.mesh.visible) continue;
      const d = Math.hypot(c.x - pos.x, c.z - pos.z);
      if (d < bd && Math.abs(c.y - pos.y) < 2) { bd = d; best = c; }
    }
    return best;
  }

  pet(c) {
    c.petT = 3;
    c.target = null;
    this.fx.hearts(c.x, c.y + 0.8, c.z, 4);
    c.hop = 0.25;
  }

  update(dt, ctx) {
    this.t += dt;
    this._updateBirds(dt, ctx);
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 6; this._scanFlowers(ctx.focus); }
    this._updateButterflies(dt, ctx);
    this._updateFish(dt, ctx);
    this._updateCritters(dt, ctx);
    // fireflies drift over the grass at night
    if (ctx.night > 0.6 && ctx.rain < 0.3 && this.level > 0.2) {
      this.fireflyT -= dt;
      if (this.fireflyT < 0) {
        this.fireflyT = 0.25 / this.level;
        const cam = ctx.focus;
        const x = cam.x + (Math.random() - 0.5) * 36, z = cam.z + (Math.random() - 0.5) * 36;
        const gy = this.world.groundY(x, z);
        if (gy > SEA) this.fx.firefly(x, gy + 1.4 + Math.random() * 1.8, z);
      }
    }
  }

  dispose() {
    this.scene.remove(this.group, this.birdBody, this.birdWing, this.bfWing, this.fish);
  }
}

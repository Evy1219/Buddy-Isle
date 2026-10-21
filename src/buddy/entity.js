import * as THREE from 'three';
import { clamp, lerp } from '../core/util.js';
import { WATER_Y } from '../world/terrain.js';

// The buddy's body: a small hovering robot. The Brain decides where it goes.
const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

export class BuddyEntity {
  constructor(scene, world, color) {
    this.scene = scene;
    this.world = world;
    this.pos = new THREE.Vector3();
    this.target = null;      // {x,y?,z}
    this.lookAt = null;      // Vector3
    this.speed = 4.2;
    this.facing = 0;
    this.t = Math.random() * 10;
    this.blinkT = 2;
    this.mood = 'happy';
    this.working = 0;
    this.sitting = false;
    this.buildGlow = 0;
    this.group = this._make(color);
    scene.add(this.group);
    this.beams = [];
  }

  _make(color) {
    const g = new THREE.Group();
    this.bodyMat = lam(color);
    this.accentMat = new THREE.MeshBasicMaterial({ color });
    const shell = lam(0xf1eee6);
    const dark = lam(0x1d2636);
    this.inner = new THREE.Group();
    const body = box(0.72, 0.56, 0.6, this.bodyMat); body.position.y = 0.36;
    const belly = box(0.42, 0.3, 0.05, shell); belly.position.set(0, 0.34, 0.31);
    const head = box(0.9, 0.66, 0.7, shell); head.position.y = 0.98;
    const screen = box(0.72, 0.46, 0.04, dark); screen.position.set(0, 0.98, 0.35);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x9df3ff });
    this.eyeL = box(0.12, 0.17, 0.02, eyeMat); this.eyeL.position.set(-0.16, 1.01, 0.375);
    this.eyeR = box(0.12, 0.17, 0.02, eyeMat); this.eyeR.position.set(0.16, 1.01, 0.375);
    this.mouth = box(0.16, 0.035, 0.02, eyeMat); this.mouth.position.set(0, 0.86, 0.375);
    const ear1 = box(0.08, 0.26, 0.26, this.bodyMat); ear1.position.set(-0.49, 0.98, 0);
    const ear2 = ear1.clone(); ear2.position.x = 0.49;
    const stalk = box(0.05, 0.3, 0.05, dark); stalk.position.y = 1.45;
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), this.accentMat); this.bulb.position.y = 1.64;
    this.armL = new THREE.Group(); this.armR = new THREE.Group();
    const a1 = box(0.14, 0.4, 0.16, this.bodyMat); a1.position.y = -0.18; this.armL.add(a1);
    const a2 = box(0.14, 0.4, 0.16, this.bodyMat); a2.position.y = -0.18; this.armR.add(a2);
    const h1 = box(0.16, 0.12, 0.18, shell); h1.position.y = -0.42; this.armL.add(h1);
    const h2 = box(0.16, 0.12, 0.18, shell); h2.position.y = -0.42; this.armR.add(h2);
    this.armL.position.set(-0.46, 0.58, 0); this.armR.position.set(0.46, 0.58, 0);
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.08, 12), this.accentMat); jet.position.y = 0.04;
    this.inner.add(body, belly, head, screen, this.eyeL, this.eyeR, this.mouth, ear1, ear2, stalk, this.bulb, this.armL, this.armR, jet);
    this.inner.traverse((o) => { if (o.isMesh && o.material !== eyeMat && o.material !== this.accentMat) o.castShadow = true; });
    g.add(this.inner);
    // soft shadow blob on the ground
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    this.shadow = sh;
    this.scene.add(sh);
    return g;
  }

  setColor(c) { this.bodyMat.color.setHex(c); this.accentMat.color.setHex(c); }

  headPos() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.9, this.pos.z); }

  place(x, y, z) { this.pos.set(x, y, z); this.group.position.copy(this.pos); }

  arrived(tol = 0.6) {
    if (!this.target) return true;
    return Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < tol &&
      (this.target.y == null || this.pos.y > this.target.y - 1.2);
  }

  hoverY(x, z) {
    let g = this.world.groundY(x, z);
    const w = Math.max(g + 1, WATER_Y);
    return w + 0.35;
  }

  // Show a little beam from the antenna to a block
  beam(x, y, z, color) {
    const from = this.pos.clone().add(new THREE.Vector3(0, 1.64, 0));
    const geo = new THREE.BufferGeometry().setFromPoints([from, new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5)]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: color ?? this.accentMat.color.getHex(), transparent: true, opacity: 1 }));
    this.scene.add(line);
    this.beams.push({ line, life: 0.28 });
    this.buildGlow = 1;
  }

  update(dt, camera) {
    this.t += dt;
    // movement
    if (this.target) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const boost = Math.min(3, 1 + Math.max(0, d - 16) / 16); // long trips go faster
        const step = Math.min(d, this.speed * boost * dt * clamp(d / 1.5, 0.35, 1));
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        if (!this.lookAt) this._turn(Math.atan2(dx, dz), dt);
      }
      // look ahead so we rise over buildings before bumping into them
      const ahead = d > 0.5 ? 1.2 : 0;
      const hx = this.pos.x + (d > 0 ? dx / d : 0) * ahead, hz = this.pos.z + (d > 0 ? dz / d : 0) * ahead;
      let ty = Math.max(this.hoverY(this.pos.x, this.pos.z), this.hoverY(hx, hz));
      if (this.target.y != null && d < 2.5) ty = Math.max(ty, this.target.y);
      this.pos.y = lerp(this.pos.y, ty, clamp(5 * dt, 0, 1));
    } else {
      this.pos.y = lerp(this.pos.y, this.hoverY(this.pos.x, this.pos.z), clamp(3 * dt, 0, 1));
    }
    if (this.lookAt) this._turn(Math.atan2(this.lookAt.x - this.pos.x, this.lookAt.z - this.pos.z), dt);

    // animation
    const bob = Math.sin(this.t * 2.4) * 0.07;
    this.group.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.group.rotation.y = this.facing;
    this.inner.rotation.z = Math.sin(this.t * 1.3) * 0.03;
    this.blinkT -= dt;
    let eyeH = 1;
    if (this.blinkT < 0) { eyeH = 0.1; if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 3; }
    if (this.mood === 'happy') eyeH *= 0.85;
    if (this.mood === 'sleepy') eyeH = 0.15;
    this.eyeL.scale.y = eyeH; this.eyeR.scale.y = eyeH;
    this.mouth.scale.x = this.mood === 'happy' ? 1.4 : this.mood === 'thinking' ? 0.6 : 1;
    const work = this.working > 0;
    if (work) this.working -= dt;
    const wave = this.mood === 'waving';
    this.armR.rotation.x = work ? -1.2 + Math.sin(this.t * 14) * 0.5 : wave ? 0 : Math.sin(this.t * 2) * 0.15;
    this.armR.rotation.z = wave ? 2.4 + Math.sin(this.t * 10) * 0.4 : 0;
    this.armL.rotation.x = work ? -0.6 + Math.sin(this.t * 14 + 1) * 0.3 : -Math.sin(this.t * 2) * 0.15;
    this.buildGlow = Math.max(0, this.buildGlow - dt * 3);
    const s = 1 + this.buildGlow * 0.6 + Math.sin(this.t * 3) * 0.08;
    this.bulb.scale.setScalar(s);

    const gy = this.world.groundY(this.pos.x, this.pos.z);
    this.shadow.position.set(this.pos.x, Math.max(gy + 1.02, WATER_Y + 0.02), this.pos.z);
    this.shadow.material.opacity = clamp(0.28 - (this.pos.y - gy - 1) * 0.04, 0.05, 0.28);

    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      b.line.material.opacity = Math.max(0, b.life / 0.28);
      if (b.life <= 0) { this.scene.remove(b.line); b.line.geometry.dispose(); this.beams.splice(i, 1); }
    }
  }

  _turn(target, dt) {
    let d = target - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * clamp(6 * dt, 0, 1);
  }

  dispose() {
    this.scene.remove(this.group, this.shadow);
    this.beams.forEach((b) => this.scene.remove(b.line));
  }
}

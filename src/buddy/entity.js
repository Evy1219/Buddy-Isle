import * as THREE from 'three';
import { clamp, lerp } from '../core/util.js';
import { WATER_Y } from '../world/terrain.js';
import { Face } from './face.js';

// The buddy's body: a small hovering robot with a screen for a face.
// The Brain decides where it goes; this file just makes it move and emote nicely.
const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

export class BuddyEntity {
  constructor(scene, world, color, fx = null) {
    this.scene = scene;
    this.world = world;
    this.fx = fx;
    this.pos = new THREE.Vector3();
    this.target = null;      // {x, y?, z}
    this.lookAt = null;      // where the body turns
    this.eyeTarget = null;   // where the eyes look (usually you)
    this.speed = 4.2;
    this.facing = 0;
    this.t = Math.random() * 10;
    this.blinkT = 2;
    this.mood = 'happy';     // legacy: 'happy' | 'sleepy' | 'waving' | 'thinking'
    this.expr = null;        // forced face for a moment
    this.exprT = 0;
    this.baseExpr = 'happy';
    this.pose = 'hover';     // 'hover' | 'sleep' | 'sit' | 'dance'
    this.working = 0;
    this.talking = 0;
    this.tool = null;
    this.buildGlow = 0;
    this.hop = 0; this.hopV = 0;
    this.thrustT = 0; this.zzzT = 0;
    this.color = color;
    this.face = new Face();
    this.group = this._make(color);
    scene.add(this.group);
    this.beams = [];
  }

  _make(color) {
    const g = new THREE.Group();
    this.bodyMat = lam(color);
    this.accentMat = new THREE.MeshBasicMaterial({ color });
    this.accentMat.color.multiplyScalar(1.4);
    const shell = lam(0xf1eee6);
    const dark = lam(0x1d2636);
    this.inner = new THREE.Group();
    const body = box(0.72, 0.56, 0.6, this.bodyMat); body.position.y = 0.36;
    const belly = box(0.42, 0.3, 0.05, shell); belly.position.set(0, 0.34, 0.31);
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), this.accentMat); badge.position.set(0, 0.36, 0.337);
    this.head = new THREE.Group();
    const head = box(0.9, 0.66, 0.7, shell);
    const bezel = box(0.78, 0.52, 0.04, dark); bezel.position.set(0, 0, 0.345);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.46), new THREE.MeshBasicMaterial({ map: this.face.tex }));
    screen.position.set(0, 0, 0.368);
    const ear1 = box(0.08, 0.26, 0.26, this.bodyMat); ear1.position.set(-0.49, 0, 0);
    const ear2 = ear1.clone(); ear2.position.x = 0.49;
    const stalk = box(0.05, 0.3, 0.05, dark); stalk.position.y = 0.47;
    this.bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), this.accentMat); this.bulb.position.y = 0.66;
    this.head.add(head, bezel, screen, ear1, ear2, stalk, this.bulb);
    this.head.position.y = 0.98;
    this.armL = new THREE.Group(); this.armR = new THREE.Group();
    const a1 = box(0.14, 0.4, 0.16, this.bodyMat); a1.position.y = -0.18; this.armL.add(a1);
    const a2 = box(0.14, 0.4, 0.16, this.bodyMat); a2.position.y = -0.18; this.armR.add(a2);
    const h1 = box(0.16, 0.12, 0.18, shell); h1.position.y = -0.42; this.armL.add(h1);
    const h2 = box(0.16, 0.12, 0.18, shell); h2.position.y = -0.42; this.armR.add(h2);
    this.armL.position.set(-0.46, 0.58, 0); this.armR.position.set(0.46, 0.58, 0);
    // tools held in the right hand
    this.tools = {};
    const hammer = new THREE.Group();
    const hh = box(0.05, 0.36, 0.05, lam(0x8a5a33)); hh.position.y = 0;
    const hd = box(0.22, 0.1, 0.1, lam(0x9aa0aa)); hd.position.y = 0.16;
    hammer.add(hh, hd);
    const brush = new THREE.Group();
    const bh = box(0.04, 0.34, 0.04, lam(0xc79c63));
    this.brushTip = new THREE.MeshBasicMaterial({ color: 0xff6b6b });
    const bt = box(0.07, 0.1, 0.07, this.brushTip); bt.position.y = 0.2;
    brush.add(bh, bt);
    const rod = new THREE.Group();
    const rp = box(0.035, 1.6, 0.035, lam(0x7a5230)); rp.position.y = 0.7;
    rod.add(rp);
    for (const [k, m] of Object.entries({ hammer, brush, rod })) {
      m.position.set(0, -0.48, 0.12); m.rotation.x = Math.PI / 2.4; m.visible = false;
      this.armR.add(m); this.tools[k] = m;
    }
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.08, 14), this.accentMat); jet.position.y = 0.04;
    this.inner.add(body, belly, badge, this.head, this.armL, this.armR, jet);
    this.inner.traverse((o) => { if (o.isMesh && o.material.isMeshLambertMaterial) o.castShadow = true; });
    g.add(this.inner);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.45, 18), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    this.shadow = sh;
    this.scene.add(sh);
    return g;
  }

  setColor(c) {
    this.color = c;
    this.bodyMat.color.setHex(c);
    this.accentMat.color.setHex(c).multiplyScalar(1.4);
  }

  setTool(name) {
    if (this.tool === name) return;
    this.tool = name;
    for (const [k, m] of Object.entries(this.tools)) m.visible = k === name;
  }

  emote(expr, seconds = 2.5) { this.expr = expr; this.exprT = seconds; }

  jump(power = 4) { if (this.hop <= 0.01) this.hopV = power; }

  headPos() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.9, this.pos.z); }

  place(x, y, z) { this.pos.set(x, y, z); this.group.position.copy(this.pos); }

  arrived(tol = 0.6) {
    if (!this.target) return true;
    return Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < tol &&
      (this.target.y == null || this.pos.y > this.target.y - 1.2);
  }

  hoverY(x, z) {
    const g = this.world.groundY(x, z);
    const w = Math.max(g + 1, WATER_Y);
    return w + (this.pose === 'sleep' ? 0.05 : this.pose === 'sit' ? 0.2 : 0.35);
  }

  // A glowing beam from the antenna to a block
  beam(x, y, z, color) {
    const from = this.pos.clone().add(new THREE.Vector3(0, 1.64 + this.hop, 0));
    const to = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color: color ?? this.color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    mat.color.multiplyScalar(2.2);
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.beams.push({ line, life: 0.28 });
    this.buildGlow = 1;
  }

  update(dt, camera) {
    this.t += dt;
    if (this.target) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const boost = Math.min(3, 1 + Math.max(0, d - 16) / 16); // long trips go faster
        const step = Math.min(d, this.speed * boost * dt * clamp(d / 1.5, 0.35, 1));
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        if (!this.lookAt) this._turn(Math.atan2(dx, dz), dt);
        this.moving = step / Math.max(dt, 1e-4);
      } else this.moving = 0;
      const ahead = d > 0.5 ? 1.2 : 0;
      const hx = this.pos.x + (d > 0 ? dx / d : 0) * ahead, hz = this.pos.z + (d > 0 ? dz / d : 0) * ahead;
      let ty = Math.max(this.hoverY(this.pos.x, this.pos.z), this.hoverY(hx, hz));
      if (this.target.y != null && d < 2.5) ty = Math.max(ty, this.target.y);
      this.pos.y = lerp(this.pos.y, ty, clamp(5 * dt, 0, 1));
    } else {
      this.moving = 0;
      this.pos.y = lerp(this.pos.y, this.hoverY(this.pos.x, this.pos.z), clamp(3 * dt, 0, 1));
    }
    if (this.lookAt) this._turn(Math.atan2(this.lookAt.x - this.pos.x, this.lookAt.z - this.pos.z), dt);

    // hop
    if (this.hopV !== 0 || this.hop > 0) {
      this.hopV -= 14 * dt;
      this.hop = Math.max(0, this.hop + this.hopV * dt);
      if (this.hop === 0 && this.hopV < 0) this.hopV = 0;
    }

    // body animation
    const sleeping = this.pose === 'sleep' || this.mood === 'sleepy';
    const bob = Math.sin(this.t * (sleeping ? 1.2 : 2.4)) * (sleeping ? 0.04 : 0.07);
    this.group.position.set(this.pos.x, this.pos.y + bob + this.hop, this.pos.z);
    if (this.pose === 'dance') this.facing += dt * 5;
    this.group.rotation.y = this.facing;
    const tiltX = sleeping ? 0.28 : clamp((this.moving || 0) * 0.025, 0, 0.18);
    this.inner.rotation.x = lerp(this.inner.rotation.x, tiltX, clamp(dt * 4, 0, 1));
    this.inner.rotation.z = Math.sin(this.t * 1.3) * 0.03 + (this.pose === 'dance' ? Math.sin(this.t * 8) * 0.15 : 0);

    // arms
    const work = this.working > 0;
    if (work) this.working -= dt;
    const wave = this.mood === 'waving';
    let rx = Math.sin(this.t * 2) * 0.15, rz = 0, lx = -Math.sin(this.t * 2) * 0.15, lz = 0;
    if (work) { rx = -1.2 + Math.sin(this.t * 14) * 0.5; lx = -0.6 + Math.sin(this.t * 14 + 1) * 0.3; }
    if (wave) { rx = 0; rz = 2.4 + Math.sin(this.t * 10) * 0.4; }
    if (this.pose === 'dance') { rz = 2.2 + Math.sin(this.t * 8) * 0.5; lz = -2.2 - Math.sin(this.t * 8 + 1.5) * 0.5; rx = 0; lx = 0; }
    if (sleeping) { rx = 0.25; lx = 0.25; }
    if (this.tool === 'rod' && !work) { rx = -0.9; }
    this.armR.rotation.x = lerp(this.armR.rotation.x, rx, clamp(dt * 12, 0, 1));
    this.armR.rotation.z = lerp(this.armR.rotation.z, rz, clamp(dt * 12, 0, 1));
    this.armL.rotation.x = lerp(this.armL.rotation.x, lx, clamp(dt * 12, 0, 1));
    this.armL.rotation.z = lerp(this.armL.rotation.z, lz, clamp(dt * 12, 0, 1));
    this.buildGlow = Math.max(0, this.buildGlow - dt * 3);
    this.bulb.scale.setScalar(1 + this.buildGlow * 0.6 + Math.sin(this.t * 3) * 0.08);

    // face
    this.blinkT -= dt;
    let blink = 0;
    if (this.blinkT < 0) { blink = 1; if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 3; }
    if (this.exprT > 0) this.exprT -= dt; else this.expr = null;
    let expr = this.expr || (sleeping ? 'sleep' : work ? 'focus' : this.mood === 'thinking' ? 'think' : this.baseExpr);
    let lookX = 0, lookY = 0;
    const et = this.eyeTarget;
    if (et && !sleeping) {
      const ang = Math.atan2(et.x - this.pos.x, et.z - this.pos.z);
      let d = ang - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < 1.8) {
        lookX = clamp(-Math.sin(d) * 1.4, -1, 1);
        const dist = Math.hypot(et.x - this.pos.x, et.z - this.pos.z);
        lookY = clamp(-((et.y ?? this.pos.y) - (this.pos.y + 1)) / Math.max(2, dist), -1, 1);
      }
    }
    if (this.talking > 0) this.talking -= dt;
    this.face.update(dt, { expr, lookX, lookY, blink, talking: this.talking > 0 });
    this.head.rotation.y = lerp(this.head.rotation.y, lookX * -0.25, clamp(dt * 5, 0, 1));
    this.head.rotation.x = lerp(this.head.rotation.x, -lookY * 0.15 + (sleeping ? 0.2 : 0), clamp(dt * 5, 0, 1));

    // shadow
    const gy = this.world.groundY(this.pos.x, this.pos.z);
    this.shadow.position.set(this.pos.x, Math.max(gy + 1.02, WATER_Y + 0.02), this.pos.z);
    this.shadow.material.opacity = clamp(0.28 - (this.pos.y + this.hop - gy - 1) * 0.04, 0.05, 0.28);

    // particles
    if (this.fx) {
      this.thrustT -= dt;
      if (this.thrustT < 0 && !sleeping) { this.thrustT = 0.06; this.fx.thruster(this.pos.x, this.pos.y + bob + this.hop - 0.02, this.pos.z, this.color); }
      if (sleeping) { this.zzzT -= dt; if (this.zzzT < 0) { this.zzzT = 1.6; this.fx.zzz(this.pos.x + 0.3, this.pos.y + 1.8, this.pos.z); } }
    }

    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      b.line.material.opacity = Math.max(0, b.life / 0.28);
      if (b.life <= 0) { this.scene.remove(b.line); b.line.geometry.dispose(); b.line.material.dispose(); this.beams.splice(i, 1); }
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

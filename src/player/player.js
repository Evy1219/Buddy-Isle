import * as THREE from 'three';
import { WATER_Y } from '../world/terrain.js';
import { BLOCKS } from '../world/blocks.js';
import { clamp, lerp } from '../core/util.js';

const W = 0.3, HEIGHT = 1.75;
const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

export class Player {
  constructor(scene, camera, world, input, data) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.input = input;
    this.pos = new THREE.Vector3(data.x, data.y, data.z);
    this.vel = new THREE.Vector3();
    this.yaw = data.yaw ?? 0;
    this.pitch = data.pitch ?? -0.25;
    this.camDist = data.camDist ?? 7;
    this.onGround = false;
    this.inWater = false;
    this.facing = this.yaw + Math.PI;
    this.walkT = 0;
    this.stepT = 0;
    this.camTarget = this.pos.clone();
    this.mesh = this._makeModel(data.shirt ?? 0x3fa7a0);
    scene.add(this.mesh);
    this.frozen = false;
    this.sitting = null;   // { x, y, z, yaw }
    this.riding = null;    // { kind, seat: Object3D, propId }
    this.lying = false;
    this.onJump = null;
    this.onStep = null;
    this.rodOut = false;
    this.camShake = 0;
  }

  _makeModel(shirt) {
    const g = new THREE.Group();
    const skin = 0xf0c9a0, pants = 0x34405f, hair = 0x5b3b24;
    this.body = new THREE.Group();
    this.legL = new THREE.Group(); this.legR = new THREE.Group();
    const ll = box(0.26, 0.72, 0.28, pants); ll.position.y = -0.36; this.legL.add(ll);
    const lr = box(0.26, 0.72, 0.28, pants); lr.position.y = -0.36; this.legR.add(lr);
    const sl = box(0.28, 0.1, 0.32, 0x3a2a20); sl.position.set(0, -0.7, 0.02); this.legL.add(sl);
    const sr = box(0.28, 0.1, 0.32, 0x3a2a20); sr.position.set(0, -0.7, 0.02); this.legR.add(sr);
    this.legL.position.set(-0.14, 0.74, 0); this.legR.position.set(0.14, 0.74, 0);
    this.torso = new THREE.Group();
    const body = box(0.56, 0.68, 0.32, shirt); body.position.y = 0.34;
    this.armL = new THREE.Group(); this.armR = new THREE.Group();
    const al = box(0.2, 0.64, 0.24, shirt); al.position.y = -0.28; this.armL.add(al);
    const ar = box(0.2, 0.64, 0.24, shirt); ar.position.y = -0.28; this.armR.add(ar);
    const hl = box(0.2, 0.14, 0.24, skin); hl.position.y = -0.64; this.armL.add(hl);
    const hr = box(0.2, 0.14, 0.24, skin); hr.position.y = -0.64; this.armR.add(hr);
    this.armL.position.set(-0.39, 0.64, 0); this.armR.position.set(0.39, 0.64, 0);
    this.head = new THREE.Group();
    const head = box(0.5, 0.5, 0.5, skin); head.position.y = 0.25;
    const hairTop = box(0.54, 0.16, 0.54, hair); hairTop.position.y = 0.52;
    const hairBack = box(0.54, 0.34, 0.12, hair); hairBack.position.set(0, 0.37, -0.22);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2a2a35 });
    const e1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.02), eyeMat); e1.position.set(-0.11, 0.27, 0.255);
    const e2 = e1.clone(); e2.position.x = 0.11;
    this.head.add(head, hairTop, hairBack, e1, e2);
    this.head.position.y = 0.7;
    // fishing rod (hidden until you fish)
    this.rod = new THREE.Group();
    const pole = box(0.04, 1.9, 0.04, 0x7a5230); pole.position.y = 0.85;
    const reel = box(0.1, 0.1, 0.1, 0x5c6370); reel.position.y = 0.2;
    this.rod.add(pole, reel);
    this.rod.position.set(0, -0.62, 0.08);
    this.rod.rotation.x = Math.PI / 2.6;
    this.rod.visible = false;
    this.rodTip = new THREE.Object3D(); this.rodTip.position.y = 1.8; this.rod.add(this.rodTip);
    this.armR.add(this.rod);
    this.torso.add(body, this.armL, this.armR, this.head);
    this.torso.position.y = 0.74;
    this.body.add(this.legL, this.legR, this.torso);
    g.add(this.body);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  collides(x, y, z) {
    const w = this.world;
    for (let bx = Math.floor(x - W); bx <= Math.floor(x + W); bx++)
      for (let bz = Math.floor(z - W); bz <= Math.floor(z + W); bz++)
        for (let by = Math.floor(y); by <= Math.floor(y + HEIGHT - 0.01); by++)
          if (w.isSolid(bx, by, bz)) return true;
    return false;
  }

  teleport(x, y, z) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.camTarget.set(x, y + 1.5, z);
  }

  // ---------- sitting, riding ----------
  sit(seat) {
    this.sitting = seat;
    this.vel.set(0, 0, 0);
    this.pos.set(seat.x, seat.y, seat.z);
    this.facing = seat.yaw;
  }
  stand() {
    if (!this.sitting && !this.lying) return;
    const s = this.sitting;
    this.sitting = null;
    this.lying = false;
    if (s) {
      // step off in front of the seat
      const nx = s.x + Math.sin(s.yaw) * 0.9, nz = s.z + Math.cos(s.yaw) * 0.9;
      const gy = this.world.groundY(nx, nz, Math.floor(s.y + 1.5));
      if (!this.collides(nx, gy + 1, nz)) this.teleport(nx, gy + 1, nz);
      else this.teleport(s.x, Math.floor(s.y) + 1, s.z);
    }
  }
  mount(kind, seat, propId) {
    this.riding = { kind, seat, propId };
    this.sitting = null;
    this.vel.set(0, 0, 0);
  }
  dismount(to) {
    this.riding = null;
    if (to) this.teleport(to.x, to.y, to.z);
  }

  update(dt) {
    const look = this.input.consumeLook();
    this.yaw -= look.dx * 0.0026;
    this.pitch = clamp(this.pitch - look.dy * 0.0026, -1.35, 1.0);

    if (this.riding) { this._ride(dt); this._camera(dt); return; }
    if (this.sitting) {
      const s = this.sitting;
      this.pos.set(s.x, s.y, s.z);
      this._pose(dt, 'sit');
      this._camera(dt);
      return;
    }

    const ax = this.frozen ? { x: 0, z: 0 } : this.input.axis();
    const run = this.input.down('ShiftLeft') || this.input.down('ShiftRight');
    const speed = (run ? 7.8 : 4.6) * (this.rodOut ? 0.5 : 1);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    let mx = fx * ax.z + rx * ax.x, mz = fz * ax.z + rz * ax.x;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const accel = this.onGround ? 14 : 5;
    this.vel.x = lerp(this.vel.x, mx * speed, clamp(accel * dt, 0, 1));
    this.vel.z = lerp(this.vel.z, mz * speed, clamp(accel * dt, 0, 1));

    this.inWater = this.pos.y + 0.6 < WATER_Y || this.world.get(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.5), Math.floor(this.pos.z)) === 16;
    const jump = !this.frozen && (this.input.down('Space') || this.input.touchJump);
    if (this.inWater) {
      this.vel.y += (jump ? 12 : -6) * dt;
      this.vel.y *= 1 - clamp(2.5 * dt, 0, 1);
      this.vel.x *= 0.96; this.vel.z *= 0.96;
    } else {
      this.vel.y -= 26 * dt;
      if (jump && this.onGround) { this.vel.y = 8.4; this.onGround = false; this.onJump?.(); }
    }
    this.vel.y = Math.max(this.vel.y, -30);

    const wasGround = this.onGround;
    const vyBefore = this.vel.y;
    const steps = Math.ceil(dt / 0.016);
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) this._move(sdt);
    if (!wasGround && this.onGround && vyBefore < -12) { this.onStep?.(this.surfaceUnder(), 1.4); }

    if (this.pos.y < -10) {
      const gy = this.world.groundY(this.pos.x, this.pos.z);
      this.teleport(this.pos.x, gy + 2, this.pos.z);
    }

    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.4) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let d = target - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facing += d * clamp(12 * dt, 0, 1);
    }
    // footsteps
    if (this.onGround && hs > 1) {
      this.stepT -= dt * hs;
      if (this.stepT <= 0) { this.stepT = 2.3; this.onStep?.(this.surfaceUnder(), 1); }
    }
    this._pose(dt, this.inWater && !this.onGround ? 'swim' : 'walk', hs);
    this._camera(dt);
  }

  _move(dt) {
    const p = this.pos, v = this.vel;
    const nx = p.x + v.x * dt;
    if (this.collides(nx, p.y, p.z)) {
      if ((this.onGround || this.inWater) && !this.collides(nx, p.y + 1.01, p.z) && !this.collides(p.x, p.y + 1.01, p.z)) { p.y += 1.01; p.x = nx; }
      else v.x = 0;
    } else p.x = nx;
    const nz = p.z + v.z * dt;
    if (this.collides(p.x, p.y, nz)) {
      if ((this.onGround || this.inWater) && !this.collides(p.x, p.y + 1.01, nz) && !this.collides(p.x, p.y + 1.01, p.z)) { p.y += 1.01; p.z = nz; }
      else v.z = 0;
    } else p.z = nz;
    const ny = p.y + v.y * dt;
    if (this.collides(p.x, ny, p.z)) {
      if (v.y < 0) {
        p.y = Math.floor(ny) + 1;
        if (this.collides(p.x, p.y, p.z)) p.y = ny;
        this.onGround = true;
      }
      v.y = 0;
    } else {
      p.y = ny;
      this.onGround = false;
    }
  }

  surfaceUnder() {
    return this.world.get(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.2), Math.floor(this.pos.z));
  }

  _pose(dt, kind, hs = 0) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.facing;
    const k = clamp(dt * 12, 0, 1);
    let ll = 0, lr = 0, al = 0, ar = 0, tz = 0, ty = 0.74, tx = 0, bodyX = 0;
    if (kind === 'sit') {
      ll = -1.45; lr = -1.45; al = -0.3; ar = -0.3; ty = 0.74;
      this.mesh.position.y = this.pos.y - 0.62;
    } else if (kind === 'lie') {
      bodyX = -Math.PI / 2;
      this.mesh.position.y = this.pos.y + 0.1;
    } else if (kind === 'swim') {
      this.walkT += dt * 6;
      const s = Math.sin(this.walkT);
      ll = s * 0.6; lr = -s * 0.6; al = -2.6 + s * 0.6; ar = -2.6 - s * 0.6; bodyX = 0.9;
      this.mesh.position.y = this.pos.y - 0.2;
    } else {
      this.walkT += dt * hs * 1.6;
      const sw = Math.sin(this.walkT) * Math.min(1, hs / 4) * 0.8;
      ll = sw; lr = -sw; al = -sw * 0.8; ar = sw * 0.8;
      tz = Math.sin(this.walkT * 2) * 0.02 * Math.min(1, hs / 4);
    }
    if (this.rodOut) { ar = -1.1; }
    this.legL.rotation.x = lerp(this.legL.rotation.x, ll, k);
    this.legR.rotation.x = lerp(this.legR.rotation.x, lr, k);
    this.armL.rotation.x = lerp(this.armL.rotation.x, al, k);
    this.armR.rotation.x = lerp(this.armR.rotation.x, ar, k);
    this.torso.position.y = ty + tz;
    this.torso.rotation.x = tx;
    this.body.rotation.x = lerp(this.body.rotation.x, bodyX, k);
    this.rod.visible = this.rodOut;
  }

  _ride(dt) {
    const r = this.riding;
    if (r.kind === 'boat') {
      // you steer the boat with WASD
      const ax = this.input.axis();
      const boat = r.boatGroup;
      r.speed = lerp(r.speed || 0, ax.z * 4.5, clamp(dt * 1.5, 0, 1));
      boat.rotation.y += -ax.x * dt * 1.4 * (Math.abs(r.speed) > 0.2 ? 1 : 0.6);
      const fx = Math.sin(boat.rotation.y), fz = Math.cos(boat.rotation.y);
      const nx = boat.position.x + fx * r.speed * dt, nz = boat.position.z + fz * r.speed * dt;
      // stay on water
      const ok = (x, z) => this.world.surfaceY(Math.floor(x + fx * 1.2), Math.floor(z + fz * 1.2)) < WATER_Y - 0.9 && this.world.surfaceY(Math.floor(x), Math.floor(z)) < WATER_Y - 0.9;
      if (ok(nx, nz)) { boat.position.x = nx; boat.position.z = nz; } else r.speed *= -0.3;
      boat.position.y = WATER_Y - 0.1;
      const inner = boat.userData.boat;
      inner.position.y = Math.sin(performance.now() / 700) * 0.06;
      inner.rotation.z = Math.sin(performance.now() / 900) * 0.05 + ax.x * -0.06;
      inner.rotation.x = -r.speed * 0.01;
      const oars = boat.userData.oars;
      if (oars && Math.abs(r.speed) > 0.2) { const t = performance.now() / 300; oars[0].rotation.x = Math.sin(t) * 0.5; oars[1].rotation.x = Math.sin(t) * 0.5; }
      r.wakeT = (r.wakeT || 0) - dt;
      if (r.wakeT < 0 && Math.abs(r.speed) > 1) { r.wakeT = 0.12; r.onWake?.(boat.position.x - fx * 1.3, boat.position.z - fz * 1.3); }
    }
    r.seat.updateMatrixWorld(true);
    r.seat.getWorldPosition(_v);
    this.pos.copy(_v);
    r.seat.getWorldQuaternion(_q);
    _e.setFromQuaternion(_q, 'YXZ');
    this.facing = _e.y;
    this.mesh.position.set(_v.x, _v.y - 0.62, _v.z);
    this.mesh.rotation.y = this.facing;
    const k = clamp(dt * 12, 0, 1);
    this.legL.rotation.x = lerp(this.legL.rotation.x, -1.45, k);
    this.legR.rotation.x = lerp(this.legR.rotation.x, -1.45, k);
    const wave = r.kind === 'boat' ? Math.sin(performance.now() / 300) * 0.5 - 0.8 : -0.2;
    this.armL.rotation.x = lerp(this.armL.rotation.x, wave, k);
    this.armR.rotation.x = lerp(this.armR.rotation.x, wave, k);
    this.body.rotation.x = 0;
    this.vel.set(0, 0, 0);
  }

  _camera(dt) {
    const target = new THREE.Vector3(this.pos.x, this.pos.y + (this.sitting || this.riding ? 0.95 : 1.55), this.pos.z);
    this.camTarget.lerp(target, clamp(14 * dt, 0, 1));
    this.camTarget.x = target.x; this.camTarget.z = target.z;
    if (this.riding) this.camTarget.copy(target);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
    const firstPerson = this.camDist < 0.5;
    this.mesh.visible = !firstPerson;
    const dist = this.riding && this.riding.kind === 'balloon' ? Math.max(this.camDist, 8) : this.camDist;
    if (firstPerson) {
      this.camera.position.copy(this.camTarget).add(new THREE.Vector3(0, 0.1, 0));
    } else {
      let d = dist;
      for (let t = 0.5; t <= dist; t += 0.25) {
        const px = this.camTarget.x - dir.x * t, py = this.camTarget.y - dir.y * t, pz = this.camTarget.z - dir.z * t;
        const id = this.world.get(Math.floor(px), Math.floor(py), Math.floor(pz));
        if (BLOCKS[id].opaque) { d = Math.max(0.6, t - 0.3); break; }
      }
      this.camera.position.set(this.camTarget.x - dir.x * d, this.camTarget.y - dir.y * d, this.camTarget.z - dir.z * d);
      if (!this.inWater && this.camera.position.y < WATER_Y + 0.5) this.camera.position.y = WATER_Y + 0.5;
      this.mesh.visible = d > 1.4;
    }
    if (this.camShake > 0) {
      this.camShake -= dt;
      this.camera.position.x += (Math.random() - 0.5) * this.camShake * 0.3;
      this.camera.position.y += (Math.random() - 0.5) * this.camShake * 0.3;
    }
    this.camera.lookAt(this.camTarget.x + dir.x * 10, this.camTarget.y + dir.y * 10, this.camTarget.z + dir.z * 10);
  }

  zoom(delta) {
    if (this.camDist < 0.5 && delta > 0) { this.camDist = 2.5; return; }
    this.camDist = clamp(this.camDist + delta * 1.2, 2, 22);
  }
  toggleFirstPerson() { this.camDist = this.camDist < 0.5 ? 7 : 0; }

  // Where the player is looking (for interaction and fishing)
  forward() {
    if (this.camDist < 0.5 || this.input.locked) {
      this.camera.getWorldDirection(_v);
      return _v.clone();
    }
    return new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  serialize() {
    const p = this.sitting ? { x: this.sitting.x, y: Math.floor(this.sitting.y) + 1, z: this.sitting.z } : this.riding ? { x: this.pos.x, y: this.pos.y + 1, z: this.pos.z } : this.pos;
    return { x: p.x, y: p.y, z: p.z, yaw: this.yaw, pitch: this.pitch, camDist: this.camDist };
  }
}

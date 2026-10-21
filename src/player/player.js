import * as THREE from 'three';
import { WATER_Y } from '../world/terrain.js';
import { clamp, lerp } from '../core/util.js';

const W = 0.3, HEIGHT = 1.75;
const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));

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
    this.camTarget = this.pos.clone();
    this.mesh = this._makeModel(data.shirt ?? 0x3fa7a0);
    scene.add(this.mesh);
    this.frozen = false;
  }

  _makeModel(shirt) {
    const g = new THREE.Group();
    const skin = 0xf0c9a0, pants = 0x34405f, hair = 0x5b3b24;
    this.legL = new THREE.Group(); this.legR = new THREE.Group();
    const ll = box(0.26, 0.72, 0.28, pants); ll.position.y = -0.36; this.legL.add(ll);
    const lr = box(0.26, 0.72, 0.28, pants); lr.position.y = -0.36; this.legR.add(lr);
    this.legL.position.set(-0.14, 0.74, 0); this.legR.position.set(0.14, 0.74, 0);
    const body = box(0.56, 0.68, 0.32, shirt); body.position.y = 1.08;
    this.armL = new THREE.Group(); this.armR = new THREE.Group();
    const al = box(0.2, 0.64, 0.24, shirt); al.position.y = -0.28; this.armL.add(al);
    const ar = box(0.2, 0.64, 0.24, shirt); ar.position.y = -0.28; this.armR.add(ar);
    const hl = box(0.2, 0.14, 0.24, skin); hl.position.y = -0.64; this.armL.add(hl);
    const hr = box(0.2, 0.14, 0.24, skin); hr.position.y = -0.64; this.armR.add(hr);
    this.armL.position.set(-0.39, 1.38, 0); this.armR.position.set(0.39, 1.38, 0);
    const head = box(0.5, 0.5, 0.5, skin); head.position.y = 1.68;
    const hairTop = box(0.54, 0.16, 0.54, hair); hairTop.position.y = 1.95;
    const hairBack = box(0.54, 0.34, 0.12, hair); hairBack.position.set(0, 1.8, -0.22);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2a2a35 });
    const e1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.02), eyeMat); e1.position.set(-0.11, 1.7, 0.255);
    const e2 = e1.clone(); e2.position.x = 0.11;
    g.add(this.legL, this.legR, body, this.armL, this.armR, head, hairTop, hairBack, e1, e2);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
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

  update(dt) {
    const look = this.input.consumeLook();
    this.yaw -= look.dx * 0.0026;
    this.pitch = clamp(this.pitch - look.dy * 0.0026, -1.35, 1.0);

    const ax = this.frozen ? { x: 0, z: 0 } : this.input.axis();
    const run = this.input.down('ShiftLeft') || this.input.down('ShiftRight');
    const speed = run ? 7.8 : 4.6;
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
      if (jump && this.onGround) { this.vel.y = 8.4; this.onGround = false; }
    }
    this.vel.y = Math.max(this.vel.y, -30);

    const steps = Math.ceil(dt / 0.016);
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) this._move(sdt);

    if (this.pos.y < -10) {
      const gy = this.world.groundY(this.pos.x, this.pos.z);
      this.teleport(this.pos.x, gy + 2, this.pos.z);
    }

    // model
    this.mesh.position.copy(this.pos);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.4) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let d = target - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facing += d * clamp(12 * dt, 0, 1);
    }
    this.mesh.rotation.y = this.facing;
    this.walkT += dt * hs * 1.6;
    const sw = Math.sin(this.walkT) * Math.min(1, hs / 4) * 0.8;
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    this.armL.rotation.x = -sw * 0.8; this.armR.rotation.x = sw * 0.8;

    this._camera(dt);
  }

  _move(dt) {
    const p = this.pos, v = this.vel;
    // X
    let nx = p.x + v.x * dt;
    if (this.collides(nx, p.y, p.z)) {
      if ((this.onGround || this.inWater) && !this.collides(nx, p.y + 1.01, p.z) && !this.collides(p.x, p.y + 1.01, p.z)) { p.y += 1.01; p.x = nx; }
      else v.x = 0;
    } else p.x = nx;
    // Z
    let nz = p.z + v.z * dt;
    if (this.collides(p.x, p.y, nz)) {
      if ((this.onGround || this.inWater) && !this.collides(p.x, p.y + 1.01, nz) && !this.collides(p.x, p.y + 1.01, p.z)) { p.y += 1.01; p.z = nz; }
      else v.z = 0;
    } else p.z = nz;
    // Y
    const ny = p.y + v.y * dt;
    if (this.collides(p.x, ny, p.z)) {
      if (v.y < 0) {
        p.y = Math.floor(ny) + 1;
        if (this.collides(p.x, p.y, p.z)) p.y = ny; // safety
        this.onGround = true;
      }
      v.y = 0;
    } else {
      p.y = ny;
      this.onGround = false;
    }
  }

  _camera(dt) {
    const target = new THREE.Vector3(this.pos.x, this.pos.y + 1.55, this.pos.z);
    this.camTarget.lerp(target, clamp(14 * dt, 0, 1));
    this.camTarget.x = target.x; this.camTarget.z = target.z;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
    const firstPerson = this.camDist < 0.5;
    this.mesh.visible = !firstPerson;
    if (firstPerson) {
      this.camera.position.copy(this.camTarget).add(new THREE.Vector3(0, 0.1, 0));
    } else {
      // pull the camera in if a block is in the way
      let d = this.camDist;
      for (let t = 0.5; t <= this.camDist; t += 0.25) {
        const px = this.camTarget.x - dir.x * t, py = this.camTarget.y - dir.y * t, pz = this.camTarget.z - dir.z * t;
        if (this.world.isOpaqueAt(Math.floor(px), Math.floor(py), Math.floor(pz))) { d = Math.max(0.6, t - 0.3); break; }
      }
      this.camera.position.set(this.camTarget.x - dir.x * d, this.camTarget.y - dir.y * d, this.camTarget.z - dir.z * d);
      // keep the camera above the sea unless you're swimming
      if (!this.inWater && this.camera.position.y < WATER_Y + 0.5) this.camera.position.y = WATER_Y + 0.5;
      this.mesh.visible = d > 1.4;
    }
    this.camera.lookAt(this.camTarget.x + dir.x * 10, this.camTarget.y + dir.y * 10, this.camTarget.z + dir.z * 10);
  }

  zoom(delta) {
    if (this.camDist < 0.5 && delta > 0) { this.camDist = 2.5; return; }
    this.camDist = clamp(this.camDist + delta * 1.2, 2, 20);
  }
  toggleFirstPerson() { this.camDist = this.camDist < 0.5 ? 7 : 0; }

  serialize() {
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, pitch: this.pitch, camDist: this.camDist };
  }
}

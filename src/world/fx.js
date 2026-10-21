import * as THREE from 'three';

// Tiny particle puffs: sparkles when blocks appear, paint dabs, hearts.
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.mats = new Map();
    this.parts = [];
  }
  mat(color) {
    if (!this.mats.has(color)) this.mats.set(color, new THREE.MeshBasicMaterial({ color, transparent: true }));
    return this.mats.get(color);
  }
  spawn(x, y, z, color, n = 6, { speed = 2, life = 0.7, gravity = -3, size = 0.12, up = 1.5 } = {}) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 260) this._kill(0);
      const m = new THREE.Mesh(this.geo, this.mat(color).clone());
      m.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      m.position.set(x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.6);
      const v = new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * up + 0.5, (Math.random() - 0.5) * speed);
      this.scene.add(m);
      this.parts.push({ m, v, life, max: life, gravity });
    }
  }
  _kill(i) {
    const p = this.parts[i];
    this.scene.remove(p.m);
    p.m.material.dispose();
    this.parts.splice(i, 1);
  }
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this._kill(i); continue; }
      p.v.y += p.gravity * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += dt * 3; p.m.rotation.y += dt * 2;
      p.m.material.opacity = Math.min(1, p.life / p.max * 2);
    }
  }
}

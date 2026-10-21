import * as THREE from 'three';
import { meshChunk } from './mesher.js';
import { CHUNK } from './world.js';

export class ChunkRenderer {
  constructor(scene, world, shadows = true) {
    this.scene = scene;
    this.world = world;
    this.shadows = shadows;
    this.group = new THREE.Group();
    this.group.name = 'chunks';
    scene.add(this.group);
    this.meshes = new Map();
    this.mats = {
      opaque: new THREE.MeshLambertMaterial({ vertexColors: true }),
      trans: new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    };
  }

  setShadows(on) {
    this.shadows = on;
    for (const m of this.meshes.values()) {
      if (m.opaque) { m.opaque.castShadow = on; m.opaque.receiveShadow = on; }
    }
  }

  _geom(data) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
    g.setAttribute('color', new THREE.BufferAttribute(data.color, 3));
    g.setIndex(new THREE.BufferAttribute(data.index, 1));
    g.computeBoundingSphere();
    return g;
  }

  rebuild(ci) {
    const cx = ci % this.world.chunksX, cz = Math.floor(ci / this.world.chunksX);
    const data = meshChunk(this.world, cx, cz);
    const old = this.meshes.get(ci);
    if (old) {
      for (const k of ['opaque', 'trans', 'glow']) {
        if (old[k]) { this.group.remove(old[k]); old[k].geometry.dispose(); }
      }
    }
    const entry = {};
    for (const k of ['opaque', 'trans', 'glow']) {
      if (!data[k]) continue;
      const mesh = new THREE.Mesh(this._geom(data[k]), this.mats[k]);
      mesh.matrixAutoUpdate = false;
      if (k === 'opaque') { mesh.castShadow = this.shadows; mesh.receiveShadow = this.shadows; }
      if (k === 'trans') mesh.renderOrder = 2;
      this.group.add(mesh);
      entry[k] = mesh;
    }
    this.meshes.set(ci, entry);
  }

  // Build everything (used when a world opens). Yields so a progress bar can update.
  async buildAll(onProgress) {
    const total = this.world.chunksX * this.world.chunksX;
    this.world.dirty.clear();
    let done = 0;
    for (let ci = 0; ci < total; ci++) {
      this.rebuild(ci);
      done++;
      if (done % 8 === 0) {
        onProgress && onProgress(done / total);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    onProgress && onProgress(1);
  }

  // Rebuild changed chunks, nearest to the focus point first
  update(fx, fz, budget = 3) {
    const d = this.world.dirty;
    if (!d.size) return;
    const list = [...d];
    if (list.length > budget) {
      const cx = fx / CHUNK, cz = fz / CHUNK, n = this.world.chunksX;
      list.sort((a, b) => Math.hypot(a % n - cx, Math.floor(a / n) - cz) - Math.hypot(b % n - cx, Math.floor(b / n) - cz));
    }
    for (let i = 0; i < Math.min(budget, list.length); i++) {
      d.delete(list[i]);
      this.rebuild(list[i]);
    }
  }

  dispose() {
    for (const e of this.meshes.values()) for (const k of ['opaque', 'trans', 'glow']) if (e[k]) e[k].geometry.dispose();
    this.scene.remove(this.group);
    this.meshes.clear();
  }
}

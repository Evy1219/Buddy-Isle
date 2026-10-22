import * as THREE from 'three';
import { B, BLOCKS, BUILD_PALETTE, isPlant } from '../world/blocks.js';

// Amanatides & Woo voxel traversal
export function raycastVoxel(world, origin, dir, maxDist, skip = 0) {
  let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
  const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
  const tdx = sx ? Math.abs(1 / dir.x) : Infinity, tdy = sy ? Math.abs(1 / dir.y) : Infinity, tdz = sz ? Math.abs(1 / dir.z) : Infinity;
  let tmx = sx > 0 ? (x + 1 - origin.x) * tdx : sx < 0 ? (origin.x - x) * tdx : Infinity;
  let tmy = sy > 0 ? (y + 1 - origin.y) * tdy : sy < 0 ? (origin.y - y) * tdy : Infinity;
  let tmz = sz > 0 ? (z + 1 - origin.z) * tdz : sz < 0 ? (origin.z - z) * tdz : Infinity;
  let t = 0, nx = 0, ny = 0, nz = 0;
  while (t <= maxDist) {
    const id = world.get(x, y, z);
    if (id !== B.AIR && t >= skip && !(BLOCKS[id].liquid)) return { x, y, z, nx, ny, nz, t, id };
    if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
  }
  return null;
}

export class BuildMode {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.slot = 0;
    this.target = null;
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02));
    this.box = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    this.box.visible = false;
    game.scene.add(this.box);
    this.mouse = new THREE.Vector2();
    window.addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    });
    this.ray = new THREE.Raycaster();
  }

  get blockId() { return BUILD_PALETTE[this.slot]; }

  toggle(on = !this.active) {
    this.active = on;
    this.box.visible = false;
    this.g.ui.setBuildMode(on);
  }

  select(i) {
    this.slot = (i + BUILD_PALETTE.length) % BUILD_PALETTE.length;
    this.g.ui.setBuildSlot(this.slot);
  }

  _ray() {
    const cam = this.g.camera;
    if (this.g.input.locked) {
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      return { origin: cam.position.clone(), dir };
    }
    this.ray.setFromCamera(this.mouse, cam);
    return { origin: this.ray.ray.origin.clone(), dir: this.ray.ray.direction.clone() };
  }

  update() {
    if (!this.active) return;
    const { origin, dir } = this._ray();
    const reach = this.g.player.camDist + 9;
    this.target = raycastVoxel(this.g.world, origin, dir, reach, 0);
    if (this.target) {
      this.box.visible = true;
      this.box.position.set(this.target.x + 0.5, this.target.y + 0.5, this.target.z + 0.5);
    } else this.box.visible = false;
  }

  place() {
    const t = this.target;
    if (!t) return;
    let x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
    if (isPlant(t.id)) { x = t.x; y = t.y; z = t.z; }
    const p = this.g.player.pos;
    const id = this.blockId;
    if (BLOCKS[id].solid && x === Math.floor(p.x) && z === Math.floor(p.z) && (y === Math.floor(p.y) || y === Math.floor(p.y + 1))) return;
    if (this.g.world.set(x, y, z, id)) this.g.onPlayerBuild(x, y, z, id, false);
  }

  remove() {
    const t = this.target;
    if (!t || t.y <= 0) return;
    if (this.g.world.set(t.x, t.y, t.z, B.AIR)) this.g.onPlayerBuild(t.x, t.y, t.z, t.id, true);
  }
}

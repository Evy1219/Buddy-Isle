import * as THREE from 'three';
import { Hologram } from '../world/ghost.js';
import { raycastVoxel } from './build.js';
import { RNG } from '../core/rng.js';
import { evalSite } from '../buddy/sites.js';
import { BLUEPRINTS, CATALOG } from '../buddy/blueprints.js';
import { SEA } from '../world/terrain.js';

// Pick exactly where the buddy should build something. A see-through preview follows
// your aim: green means it fits, red means it doesn't. R turns it, click to confirm.
export class Placement {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.holo = new Hologram(game.scene, 4000);
    this.ray = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    window.addEventListener('pointermove', (e) => this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
    this.outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.2, 1)), new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.outline.visible = false;
    game.scene.add(this.outline);
  }

  start(type) {
    this.type = type;
    this.active = true;
    this.rot = 0;
    this.seed = Math.floor(Math.random() * 1e9);
    this.size = this.g.brain.previewSize(type, this.seed);
    this.lastKey = null;
    this.site = null;
    this.valid = false;
    this.planT = 0;
    this.g.buildMode.toggle(false);
    this.g.ui.setPlacement({ type, label: CATALOG[type]?.label || type });
  }

  cancel() {
    this.active = false;
    this.holo.clear();
    this.outline.visible = false;
    this.g.ui.setPlacement(null);
  }

  rotate() { this.rot = (this.rot + 1) % 4; this.lastKey = null; }

  confirm() {
    if (!this.active) return;
    if (!this.valid || !this.site) { this.g.ui.toast("That spot doesn't work. It needs open, fairly flat land with a little room around it."); this.g.audio.error?.(); return; }
    const g = this.g;
    const msg = g.brain.request(this.type, { site: { ...this.site }, rot: this.rot, seed: this.seed, requested: true });
    g.brain.say(msg || `On it! I'll build the ${(CATALOG[this.type]?.label || this.type).toLowerCase()} right there.`);
    g.ui.toast(`${g.state.buddy.name} will build it there`);
    g.audio.chime();
    this.cancel();
  }

  _aim() {
    const cam = this.g.camera;
    let origin, dir;
    if (this.g.input.locked) { origin = cam.position.clone(); dir = new THREE.Vector3(); cam.getWorldDirection(dir); }
    else { this.ray.setFromCamera(this.mouse, cam); origin = this.ray.ray.origin.clone(); dir = this.ray.ray.direction.clone(); }
    return raycastVoxel(this.g.world, origin, dir, 90, 0);
  }

  update(dt) {
    if (!this.active) return;
    this.holo.update(dt, 0.9);
    this.planT -= dt;
    const hit = this._aim();
    if (!hit) { this.holo.clear(); this.outline.visible = false; this.valid = false; return; }
    const S = this.size;
    const x0 = Math.round(hit.x + 0.5 - S / 2), z0 = Math.round(hit.z + 0.5 - S / 2);
    const key = `${x0},${z0},${this.rot}`;
    if (key === this.lastKey || this.planT > 0) return;
    this.planT = 0.1;
    this.lastKey = key;
    const g = this.g;
    const site = evalSite(g.world, g.brain.claims, x0, z0, S, { maxSpread: 9 });
    this.valid = !!site;
    const baseY = site ? site.baseY : Math.max(SEA + 1, g.world.surfaceY(hit.x, hit.z));
    this.site = { x0, z0, size: S, baseY, rot: this.rot };
    const bp = BLUEPRINTS[this.type];
    let ops = [];
    try {
      const { plan } = g.brain.planBuild(this.type, { ...this.site }, {}, new RNG(this.seed));
      ops = plan.ops().filter((o) => o[3] !== 0);
      if (bp.noLevel) ops = ops.concat([]);
    } catch (e) { console.warn(e); }
    this.holo.show(ops, key, this.valid ? 0x7dffa0 : 0xff6b6b, 0.55);
    this.outline.visible = true;
    this.outline.scale.set(S, 1, S);
    this.outline.position.set(x0 + S / 2, baseY + 1.05, z0 + S / 2);
    this.outline.material.color.setHex(this.valid ? 0x7dffa0 : 0xff6b6b);
  }
}

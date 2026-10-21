import * as THREE from 'three';
import { artCanvas } from '../buddy/art.js';

// Props = things in the world that aren't blocks: paintings, easels, windmill sails,
// the lighthouse beam, and signs with notes from the buddy.
const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
const darkwood = new THREE.MeshLambertMaterial({ color: 0x4a3222 });
const sailMat = new THREE.MeshLambertMaterial({ color: 0xf2eee4 });
const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

export class Props {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.objs = new Map();
    this.time = 0;
  }

  load() {
    for (const o of this.objs.values()) this.group.remove(o);
    this.objs.clear();
    for (const p of this.state.props) this._create(p);
  }

  add(p) {
    p.id = p.id || `p${this.state.nextId++}`;
    this.state.props.push(p);
    this._create(p);
    return p;
  }

  remove(id) {
    const i = this.state.props.findIndex((p) => p.id === id);
    if (i >= 0) this.state.props.splice(i, 1);
    const o = this.objs.get(id);
    if (o) { this.group.remove(o); this.objs.delete(id); }
  }

  removeInBox(x0, z0, x1, z1) {
    const ids = this.state.props.filter((p) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1).map((p) => p.id);
    ids.forEach((id) => this.remove(id));
    return ids;
  }

  // temporary prop that isn't saved (the easel while the buddy paints)
  addTemp(p) {
    this.removeTemp();
    this._create({ ...p, id: '__temp' });
  }
  removeTemp() {
    const o = this.objs.get('__temp');
    if (o) { this.group.remove(o); this.objs.delete('__temp'); }
  }

  refreshArt(artId) {
    for (const p of this.state.props) if (p.artId === artId) { this.remove(p.id); this.add(p); }
  }

  _artMesh(art, size = 0.9) {
    const tex = new THREE.CanvasTexture(artCanvas(art));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: tex }));
    return m;
  }

  _create(p) {
    const g = new THREE.Group();
    g.userData.propId = p.id;
    const [fx, fz] = p.facing || [0, 1];
    const rotY = Math.atan2(fx, fz);
    const art = p.artId ? this.state.artworks.find((a) => a.id === p.artId) : null;

    if (p.type === 'painting' && art) {
      const frame = box(1.1, 1.1, 0.08, darkwood);
      const pic = this._artMesh(art);
      pic.position.z = 0.045;
      g.add(frame, pic);
      g.position.set(p.x + 0.5 - fx * 0.45, p.y + 0.5, p.z + 0.5 - fz * 0.45);
      g.rotation.y = rotY;
      g.userData.pick = 'art';
    } else if (p.type === 'easel') {
      const l1 = box(0.08, 1.7, 0.08, wood); l1.position.set(-0.35, 0.85, 0); l1.rotation.z = -0.12;
      const l2 = box(0.08, 1.7, 0.08, wood); l2.position.set(0.35, 0.85, 0); l2.rotation.z = 0.12;
      const l3 = box(0.08, 1.6, 0.08, wood); l3.position.set(0, 0.8, -0.35); l3.rotation.x = -0.3;
      const ledge = box(0.95, 0.06, 0.14, wood); ledge.position.set(0, 0.62, 0.06);
      g.add(l1, l2, l3, ledge);
      if (art) {
        const pic = this._artMesh(art, 0.85);
        const frame = box(0.92, 0.92, 0.05, darkwood);
        const holder = new THREE.Group();
        holder.add(frame, pic);
        pic.position.z = 0.03;
        holder.position.set(0, 1.1, 0.08);
        holder.rotation.x = -0.12;
        g.add(holder);
        g.userData.pick = 'art';
      }
      g.position.set(p.x + 0.5, p.y, p.z + 0.5);
      g.rotation.y = rotY;
    } else if (p.type === 'windmill') {
      const hub = new THREE.Group();
      hub.add(box(0.5, 0.5, 0.5, darkwood));
      for (let i = 0; i < 4; i++) {
        const arm = new THREE.Group();
        const pole = box(0.16, 4.6, 0.16, wood); pole.position.y = 2.3;
        const sail = box(1.1, 3.4, 0.05, sailMat); sail.position.set(0.62, 2.8, 0.04);
        arm.add(pole, sail);
        arm.rotation.z = (i * Math.PI) / 2;
        hub.add(arm);
      }
      hub.position.z = 0.35;
      g.add(hub);
      g.userData.spin = hub;
      g.position.set(p.x + 0.5, p.y + 0.5, p.z + 0.5);
      g.rotation.y = rotY;
    } else if (p.type === 'beacon') {
      const geo = new THREE.ConeGeometry(2.6, 30, 16, 1, true);
      geo.translate(0, -15, 0);
      geo.rotateZ(Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const beam = new THREE.Mesh(geo, mat);
      g.add(beam);
      g.userData.beam = mat;
      g.userData.spin2 = g;
      g.position.set(p.x + 0.5, p.y + 0.5, p.z + 0.5);
    } else if (p.type === 'sign') {
      const post = box(0.14, 1.2, 0.14, wood); post.position.y = 0.6;
      const board = box(1.3, 0.75, 0.08, wood); board.position.y = 1.25;
      const c = document.createElement('canvas');
      c.width = 256; c.height = 148;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#c79c63'; ctx.fillRect(0, 0, 256, 148);
      ctx.fillStyle = '#3a2618';
      ctx.font = 'bold 22px "Atkinson Hyperlegible", system-ui, sans-serif';
      ctx.textAlign = 'center';
      const words = String(p.title || p.text || '').split(' ');
      const lines = []; let cur = '';
      for (const w of words) {
        if (ctx.measureText(cur + ' ' + w).width > 230 && cur) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
      }
      if (cur) lines.push(cur);
      lines.slice(0, 4).forEach((l, i) => ctx.fillText(l, 128, 34 + i * 30 - (Math.min(lines.length, 4) - 1) * 15 + 30));
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.7), new THREE.MeshLambertMaterial({ map: tex }));
      face.position.set(0, 1.25, 0.045);
      g.add(post, board, face);
      g.position.set(p.x + 0.5, p.y, p.z + 0.5);
      g.rotation.y = rotY;
      g.userData.pick = 'sign';
    } else {
      return;
    }
    g.traverse((o) => { if (o.isMesh && !g.userData.beam) { o.castShadow = true; o.receiveShadow = true; } o.userData.propId = p.id; });
    this.group.add(g);
    this.objs.set(p.id, g);
  }

  update(dt, night) {
    this.time += dt;
    for (const g of this.objs.values()) {
      if (g.userData.spin) g.userData.spin.rotation.z -= dt * 0.6;
      if (g.userData.beam) {
        g.rotation.y += dt * 0.7;
        g.userData.beam.opacity = 0.16 * night;
        g.visible = night > 0.02;
      }
    }
  }

  pickTargets() {
    const out = [];
    for (const g of this.objs.values()) if (g.userData.pick) g.traverse((o) => { if (o.isMesh) out.push(o); });
    return out;
  }
}

import * as THREE from 'three';
import { artCanvas } from '../buddy/art.js';
import { WATER_Y, SEA } from './terrain.js';

// Props = things in the world that aren't blocks: paintings, easels, doors, windmill sails,
// the lighthouse beam, signs, chimney smoke, rides, gifts...
const M = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
const wood = M(0x6b4a2f), darkwood = M(0x4a3222), sailMat = M(0xf2eee4), metal = M(0x5c6370), white = M(0xf3efe6);
const glowMat = (c, k = 1.8) => { const m = new THREE.MeshBasicMaterial({ color: c }); m.color.multiplyScalar(k); return m; };
const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
const cyl = (r1, r2, h, mat, seg = 12) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);

// The lighthouse beam: a soft cone of light that fades out with distance and towards its edges.
function beamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 0 }, uColor: { value: new THREE.Color(0xfff1b0) } },
    vertexShader: /* glsl */`
      varying float vT; varying vec3 vN; varying vec3 vV;
      void main() {
        vT = clamp(position.x / 40.0, 0.0, 1.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uStrength; uniform vec3 uColor;
      varying float vT; varying vec3 vN; varying vec3 vV;
      void main() {
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float a = uStrength * pow(1.0 - vT, 1.6) * pow(facing, 2.0) * smoothstep(0.0, 0.06, vT);
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

export const RIDES = { ferris: 'Ride the Ferris wheel', balloon: 'Take a balloon ride', boat: 'Get in the boat' };

function stripeTexture(cols) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  cols.forEach((col, i) => { g.fillStyle = col; g.fillRect(i * (256 / cols.length), 0, 256 / cols.length + 1, 64); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

export class Props {
  constructor(scene, state, fx) {
    this.scene = scene;
    this.state = state;
    this.fx = fx;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.objs = new Map();
    this.time = 0;
    this.riding = null; // prop id currently being ridden
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

  get(id) { return this.state.props.find((p) => p.id === id); }
  obj(id) { return this.objs.get(id); }

  remove(id) {
    const i = this.state.props.findIndex((p) => p.id === id);
    if (i >= 0) this.state.props.splice(i, 1);
    const o = this.objs.get(id);
    if (o) { this.group.remove(o); this.objs.delete(id); }
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

  removeInBox(x0, z0, x1, z1) {
    const ids = this.state.props.filter((p) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1).map((p) => p.id);
    ids.forEach((id) => this.remove(id));
    return ids;
  }

  refreshArt(artId) {
    for (const p of [...this.state.props]) if (p.artId === artId) { const o = this.objs.get(p.id); if (o) this.group.remove(o); this.objs.delete(p.id); this._create(p); }
  }

  _artMesh(art, size = 0.9) {
    const tex = new THREE.CanvasTexture(artCanvas(art));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: tex }));
  }

  _create(p) {
    const g = new THREE.Group();
    g.userData.propId = p.id;
    g.userData.type = p.type;
    const [fx, fz] = p.facing || [0, 1];
    const rotY = Math.atan2(fx, fz);
    const art = p.artId ? this.state.artworks.find((a) => a.id === p.artId) : null;
    let shadows = true;

    switch (p.type) {
      case 'painting': {
        if (!art) return;
        const frame = box(1.1, 1.1, 0.08, darkwood);
        const pic = this._artMesh(art);
        pic.position.z = 0.045;
        g.add(frame, pic);
        g.position.set(p.x + 0.5 - fx * 0.45, p.y + 0.5, p.z + 0.5 - fz * 0.45);
        g.rotation.y = rotY;
        g.userData.pick = 'art';
        break;
      }
      case 'easel': {
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
        } else {
          const canvas = box(0.8, 0.8, 0.04, white); canvas.position.set(0, 1.1, 0.08); canvas.rotation.x = -0.12;
          g.add(canvas);
        }
        g.position.set(p.x + 0.5, p.y, p.z + 0.5);
        g.rotation.y = rotY;
        break;
      }
      case 'door': {
        // hinge on the left edge of the doorway, swings inward
        const hinge = new THREE.Group();
        const col = p.color ?? 0x7a4f2f;
        const panel = box(0.9, 1.92, 0.1, M(col));
        panel.position.set(0.45, 0.96, 0);
        const trim = box(0.7, 0.08, 0.12, M(0x5a3d27)); trim.position.set(0.45, 1.3, 0);
        const trim2 = trim.clone(); trim2.position.y = 0.6;
        const knob = box(0.08, 0.08, 0.16, M(0xe8c45a)); knob.position.set(0.78, 0.95, 0);
        const win = box(0.32, 0.32, 0.12, M(0xcdeef7, { transparent: true, opacity: 0.7 })); win.position.set(0.45, 1.55, 0);
        hinge.add(panel, trim, trim2, knob, win);
        hinge.position.set(-0.45, 0, 0);
        g.add(hinge);
        g.userData.hinge = hinge;
        g.userData.open = 0;
        g.position.set(p.x + 0.5, p.y, p.z + 0.5);
        g.rotation.y = rotY;
        break;
      }
      case 'windmill': {
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
        break;
      }
      case 'beacon': {
        const geo = new THREE.ConeGeometry(3.2, 40, 24, 1, true);
        geo.translate(0, -20, 0);
        geo.rotateZ(Math.PI / 2);
        const mat = beamMaterial();
        const beam = new THREE.Mesh(geo, mat);
        beam.renderOrder = 5;
        beam.frustumCulled = false;
        g.add(beam);
        g.userData.beam = mat;
        g.position.set(p.x + 0.5, p.y + 0.5, p.z + 0.5);
        shadows = false;
        break;
      }
      case 'sign': {
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
        const shown = lines.slice(0, 4);
        shown.forEach((l, i) => ctx.fillText(l, 128, 82 + (i - (shown.length - 1) / 2) * 30));
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const face = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.7), new THREE.MeshLambertMaterial({ map: tex }));
        face.position.set(0, 1.25, 0.045);
        g.add(post, board, face);
        g.position.set(p.x + 0.5, p.y, p.z + 0.5);
        g.rotation.y = rotY;
        g.userData.pick = 'sign';
        break;
      }
      case 'smoke': case 'embers': case 'spray': case 'fireflies': {
        g.position.set(p.x + 0.5, p.y, p.z + 0.5);
        g.userData.emit = p.type;
        g.userData.emitT = Math.random();
        break;
      }
      case 'ferris': {
        const R = p.r || 6;
        const wheel = new THREE.Group();
        const rimMat = M(0xf3efe6), spokeMat = M(0xd8d2c4);
        const bulbs = glowMat(0xffd27a, 2);
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2, a2 = ((i + 1) / 24) * Math.PI * 2;
          const x1 = Math.cos(a) * R, y1 = Math.sin(a) * R, x2 = Math.cos(a2) * R, y2 = Math.sin(a2) * R;
          const len = Math.hypot(x2 - x1, y2 - y1);
          for (const zz of [-0.45, 0.45]) {
            const seg = box(len + 0.05, 0.18, 0.12, rimMat);
            seg.position.set((x1 + x2) / 2, (y1 + y2) / 2, zz); seg.rotation.z = Math.atan2(y2 - y1, x2 - x1);
            wheel.add(seg);
          }
          const b = box(0.16, 0.16, 0.16, bulbs); b.position.set(x1, y1, 0.56); wheel.add(b);
        }
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          for (const zz of [-0.45, 0.45]) {
            const s = box(R, 0.1, 0.08, spokeMat); s.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, zz); s.rotation.z = a; wheel.add(s);
          }
        }
        wheel.add(cyl(0.35, 0.35, 1.3, metal).rotateX(Math.PI / 2));
        const cabins = [];
        const cabCols = [0xe0584a, 0x4a8fe0, 0xf2c84b, 0x6cc070, 0xb07ae0, 0xff9a4a, 0x4ac8c0, 0xf28bb8];
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const cab = new THREE.Group();
          const cm = M(cabCols[i]);
          const floor = box(1.2, 0.1, 1.0, cm); floor.position.y = -1.2;
          const back = box(1.2, 0.5, 0.08, cm); back.position.set(0, -0.95, -0.46);
          const side1 = box(0.08, 0.5, 1.0, cm); side1.position.set(-0.58, -0.95, 0);
          const side2 = side1.clone(); side2.position.x = 0.58;
          const roof = box(1.3, 0.1, 1.1, white); roof.position.y = 0.05;
          const bar = box(0.06, 1.2, 0.06, metal); bar.position.y = -0.55;
          const seat = new THREE.Object3D(); seat.position.set(0, -1.15, 0.05);
          cab.add(floor, back, side1, side2, roof, bar, seat);
          cab.userData.seat = seat;
          cab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
          wheel.add(cab);
          cabins.push(cab);
        }
        wheel.position.y = R + 1.8;
        // A-frame legs
        for (const zz of [-0.9, 0.9]) for (const sx of [-1, 1]) {
          const leg = box(0.25, R + 2.8, 0.25, M(0x8a8f99));
          leg.position.set(sx * 1.6, (R + 1.8) / 2, zz);
          leg.rotation.z = sx * 0.28;
          g.add(leg);
        }
        g.add(wheel);
        g.userData.wheel = wheel;
        g.userData.cabins = cabins;
        g.userData.bulbs = bulbs;
        g.userData.ride = 'ferris';
        g.position.set(p.x + 0.5, p.y, p.z + 0.5);
        g.rotation.y = rotY;
        break;
      }
      case 'balloon': {
        const bal = new THREE.Group();
        const tex = stripeTexture(p.colors || ['#e0584a', '#f2c84b', '#e0584a', '#f3efe6', '#4a8fe0', '#f3efe6']);
        tex.repeat.set(2, 1);
        const env = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 18), new THREE.MeshLambertMaterial({ map: tex }));
        env.scale.set(1, 1.18, 1);
        env.position.y = 5.6;
        const skirt = cyl(1.0, 0.7, 0.9, M(0xc8483e), 16); skirt.position.y = 2.75;
        const basket = new THREE.Group();
        const bb = box(1.3, 0.75, 1.3, M(0xa8753e)); bb.position.y = 0.38;
        const rim = box(1.4, 0.1, 1.4, M(0x7a5230)); rim.position.y = 0.78;
        basket.add(bb, rim);
        for (const [sx, sz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
          const rope = box(0.03, 2.1, 0.03, M(0x5a4a3a)); rope.position.set(sx * 0.9, 1.85, sz * 0.9); rope.rotation.z = -sx * 0.18; rope.rotation.x = sz * 0.18; bal.add(rope);
        }
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 10), glowMat(0xffa040, 2.2)); flame.position.y = 2.2; flame.visible = false;
        const seat = new THREE.Object3D(); seat.position.set(0, 0.15, 0);
        bal.add(env, skirt, basket, flame, seat);
        g.add(bal);
        // tether post
        const post = box(0.2, 1.2, 0.2, wood); post.position.set(1.4, 0.6, 0); g.add(post);
        g.userData.balloon = bal;
        g.userData.flame = flame;
        g.userData.seat = seat;
        g.userData.ride = 'balloon';
        g.position.set(p.x + 0.5, p.y, p.z + 0.5);
        g.userData.home = g.position.clone();
        break;
      }
      case 'boat': {
        const b = new THREE.Group();
        const hm = M(p.color ?? 0xb5875a), dm = M(0x7a5230);
        const bottom = box(1.2, 0.18, 2.4, hm); bottom.position.y = 0.1;
        const l = box(0.12, 0.45, 2.5, hm); l.position.set(-0.62, 0.32, 0);
        const r = l.clone(); r.position.x = 0.62;
        const f = box(1.3, 0.45, 0.12, hm); f.position.set(0, 0.32, 1.22);
        const bk = f.clone(); bk.position.z = -1.22;
        const bench = box(1.2, 0.1, 0.4, dm); bench.position.set(0, 0.38, -0.3);
        const bow = box(0.9, 0.3, 0.4, hm); bow.position.set(0, 0.42, 1.4);
        const oarL = box(0.06, 0.06, 1.8, dm); oarL.position.set(-0.9, 0.5, -0.1); oarL.rotation.y = 0.3;
        const oarR = oarL.clone(); oarR.position.x = 0.9; oarR.rotation.y = -0.3;
        const seat = new THREE.Object3D(); seat.position.set(0, 0.35, -0.3);
        b.add(bottom, l, r, f, bk, bench, bow, oarL, oarR, seat);
        g.add(b);
        g.userData.boat = b;
        g.userData.oars = [oarL, oarR];
        g.userData.seat = seat;
        g.userData.ride = 'boat';
        g.position.set((p.bx ?? p.x + 0.5), WATER_Y - 0.1, (p.bz ?? p.z + 0.5));
        g.rotation.y = p.byaw ?? rotY;
        shadows = false;
        break;
      }
      case 'gift': {
        const gb = new THREE.Group();
        const colors = [[0xe0584a, 0xf2c84b], [0x4a8fe0, 0xffffff], [0x6cc070, 0xff8fb6], [0xb07ae0, 0xf2c84b]];
        const [c1, c2] = colors[(p.colorIdx ?? 0) % colors.length];
        const body = box(0.62, 0.5, 0.62, M(c1)); body.position.y = 0.25;
        const lid = box(0.7, 0.14, 0.7, M(c1)); lid.position.y = 0.55;
        const r1 = box(0.66, 0.66, 0.12, M(c2)); r1.position.y = 0.32;
        const r2 = box(0.12, 0.66, 0.66, M(c2)); r2.position.y = 0.32;
        const bow1 = box(0.3, 0.16, 0.08, M(c2)); bow1.position.set(-0.1, 0.7, 0); bow1.rotation.z = 0.5;
        const bow2 = bow1.clone(); bow2.position.x = 0.1; bow2.rotation.z = -0.5;
        gb.add(body, lid, r1, r2, bow1, bow2);
        g.add(gb);
        g.userData.gift = gb;
        g.userData.pick = 'gift';
        g.position.set(p.x + 0.5, p.y, p.z + 0.5);
        break;
      }
      case 'telescope': {
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const leg = box(0.06, 1.3, 0.06, wood); leg.position.set(Math.cos(a) * 0.3, 0.6, Math.sin(a) * 0.3); leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); g.add(leg);
        }
        const tube = cyl(0.16, 0.22, 1.5, M(0x3a62c9), 14);
        tube.rotation.x = -Math.PI / 3; tube.position.set(0, 1.45, 0.25);
        const ring = cyl(0.24, 0.24, 0.12, M(0xe8c45a), 14); ring.rotation.x = -Math.PI / 3; ring.position.set(0, 1.45, 0.25);
        g.add(tube, ring);
        g.userData.pick = 'telescope';
        g.position.set(p.x + 0.5, p.y, p.z + 0.5);
        g.rotation.y = rotY;
        break;
      }
      default:
        return;
    }
    g.traverse((o) => { if (o.isMesh && shadows && !(o.material && o.material.isMeshBasicMaterial)) { o.castShadow = true; o.receiveShadow = true; } o.userData.propId = p.id; });
    this.group.add(g);
    this.objs.set(p.id, g);
  }

  // ctx: { night, camera, player, buddyPos, rideT }
  update(dt, ctx) {
    this.time += dt;
    const cam = ctx.camera.position;
    for (const [id, g] of this.objs) {
      const ud = g.userData;
      const near = Math.abs(g.position.x - cam.x) < 110 && Math.abs(g.position.z - cam.z) < 110;
      if (ud.spin) ud.spin.rotation.z -= dt * 0.6;
      if (ud.beam) {
        g.rotation.y += dt * 0.7;
        ud.beam.uniforms.uStrength.value = 0.5 * ctx.night;
        g.visible = ctx.night > 0.02;
      }
      if (ud.hinge) {
        let want = 0;
        const check = (q) => q && Math.hypot(q.x - g.position.x, q.z - g.position.z) < 2.2 && Math.abs(q.y - g.position.y) < 2.5;
        if (check(ctx.player) || check(ctx.buddyPos)) want = 1;
        ud.open += (want - ud.open) * Math.min(1, dt * 6);
        ud.hinge.rotation.y = -ud.open * 1.75;
      }
      if (ud.emit && near) {
        ud.emitT -= dt;
        if (ud.emitT <= 0) {
          const { x, y, z } = g.position;
          if (ud.emit === 'smoke') { ud.emitT = 0.45 + Math.random() * 0.3; this.fx.smoke(x, y + 0.2, z, { color: ctx.night > 0.5 ? 0x8a8f9a : 0xdedede }); }
          else if (ud.emit === 'embers') { ud.emitT = 0.12 + Math.random() * 0.2; this.fx.ember(x, y + 0.4, z); if (Math.random() < 0.15) this.fx.smoke(x, y + 1, z, { size: 0.5, color: 0x9a9a9a, life: 2.5 }); }
          else if (ud.emit === 'spray') { ud.emitT = 0.03; this.fx.spray(x, y, z); }
          else if (ud.emit === 'fireflies') { ud.emitT = 0.6; if (ctx.night > 0.5) this.fx.firefly(x + (Math.random() - 0.5) * 8, y + Math.random() * 2, z + (Math.random() - 0.5) * 8); }
        }
      }
      if (ud.wheel) {
        if (near) {
          ud.wheel.rotation.z += dt * 0.09;
          for (const c of ud.cabins) c.rotation.z = -ud.wheel.rotation.z;
          ud.bulbs.color.setRGB(1, 0.82, 0.48).multiplyScalar(0.6 + ctx.night * 1.6 + 0.2 * Math.sin(this.time * 3));
        }
      }
      if (ud.balloon) this._balloon(g, dt, id === this.riding, ctx);
      if (ud.boat && id !== this.riding) {
        const p = this.get(id);
        ud.boat.position.y = Math.sin(this.time * 1.4 + g.position.x) * 0.06;
        ud.boat.rotation.z = Math.sin(this.time * 1.1 + g.position.z) * 0.04;
        if (p) { g.position.y = WATER_Y - 0.1; }
      }
      if (ud.gift) {
        ud.gift.rotation.y += dt * 0.8;
        ud.gift.position.y = 0.08 + Math.abs(Math.sin(this.time * 2.2)) * 0.12;
        if (near && Math.random() < dt * 3) this.fx.sparkle(g.position.x, g.position.y + 0.8, g.position.z, 0xffe8a0, 1, 0.5);
      }
    }
  }

  _balloon(g, dt, riding, ctx) {
    const ud = g.userData;
    const home = ud.home;
    if (!riding) {
      // tethered: gently bobbing
      ud.flyT = 0;
      g.position.lerp(home, Math.min(1, dt * 0.8));
      ud.balloon.position.y = Math.sin(this.time * 0.8) * 0.18;
      ud.balloon.rotation.y += dt * 0.05;
      ud.flame.visible = ctx.night > 0.5 && Math.sin(this.time * 0.5) > 0.7;
      return;
    }
    ud.flyT = (ud.flyT || 0) + dt;
    const t = ud.flyT;
    const c = ctx.worldCenter;
    const cruise = SEA + 52;
    const R = ctx.worldSize * 0.3;
    const startA = Math.atan2(home.z - c.z, home.x - c.x);
    let x, y, z;
    const RISE = 12, OUT = 10, LOOP = 70, BACK = 10, DOWN = 12;
    const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    const ease = (k) => k * k * (3 - 2 * k);
    const ringPt = (a) => [c.x + Math.cos(a) * R, cruise, c.z + Math.sin(a) * R];
    const up = [home.x, cruise - 14, home.z];
    if (t < RISE) [x, y, z] = lerp3([home.x, home.y, home.z], up, ease(t / RISE));
    else if (t < RISE + OUT) [x, y, z] = lerp3(up, ringPt(startA), ease((t - RISE) / OUT));
    else if (t < RISE + OUT + LOOP) [x, y, z] = ringPt(startA + ((t - RISE - OUT) / LOOP) * Math.PI * 2);
    else if (t < RISE + OUT + LOOP + BACK) [x, y, z] = lerp3(ringPt(startA), up, ease((t - RISE - OUT - LOOP) / BACK));
    else if (t < RISE + OUT + LOOP + BACK + DOWN) [x, y, z] = lerp3(up, [home.x, home.y, home.z], ease((t - RISE - OUT - LOOP - BACK) / DOWN));
    else { x = home.x; y = home.y; z = home.z; ud.done = true; }
    g.position.set(x, y + Math.sin(this.time * 0.9) * 0.2, z);
    ud.flame.visible = t < RISE + OUT + 4 || Math.sin(this.time * 2) > 0.6;
    ud.flame.scale.setScalar(0.8 + Math.random() * 0.4);
  }

  rideDone(id) { const g = this.objs.get(id); return !!(g && g.userData.done); }
  resetRide(id) { const g = this.objs.get(id); if (g) { g.userData.done = false; g.userData.flyT = 0; } }

  // seat object for a ride
  seat(id) {
    const g = this.objs.get(id);
    if (!g) return null;
    if (g.userData.cabins) {
      // the cabin closest to the bottom
      let best = null, by = Infinity;
      const v = new THREE.Vector3();
      for (const c of g.userData.cabins) { c.getWorldPosition(v); if (v.y < by) { by = v.y; best = c; } }
      return best.userData.seat;
    }
    return g.userData.seat || null;
  }

  pickTargets() {
    const out = [];
    for (const g of this.objs.values()) if (g.userData.pick) g.traverse((o) => { if (o.isMesh) out.push(o); });
    return out;
  }

  // Things you can press E on, for the interaction prompt
  interactables() {
    const out = [];
    for (const [id, g] of this.objs) {
      const t = g.userData.pick || g.userData.ride;
      if (!t || id === '__temp') continue;
      out.push({ id, kind: t, pos: g.position, obj: g });
    }
    return out;
  }
}

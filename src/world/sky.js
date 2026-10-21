import * as THREE from 'three';
import { WATER_Y, SEA } from './terrain.js';
import { clamp, lerp } from '../core/util.js';
import { mulberry32 } from '../core/rng.js';

// Colour keys by sun elevation (-1 = midnight, 1 = noon)
const KEYS = [
  { e: -1.0, top: 0x060b1e, hor: 0x121e3c, light: 0x9fb4ff, li: 0.45, hemi: 0x5068a8, ground: 0x1c2232, hi: 0.8, water: 0x0d2445 },
  { e: -0.12, top: 0x0b1633, hor: 0x26325e, light: 0xa9b8ff, li: 0.35, hemi: 0x52639c, ground: 0x20263a, hi: 0.8, water: 0x122c52 },
  { e: 0.0, top: 0x2f417c, hor: 0xf08a5c, light: 0xff9a66, li: 0.4, hemi: 0x8a7fa8, ground: 0x4a3b33, hi: 0.75, water: 0x2a4f7c },
  { e: 0.12, top: 0x4a7fc4, hor: 0xffc597, light: 0xffcf9a, li: 1.5, hemi: 0xb7c8e6, ground: 0x6b5a45, hi: 1.0, water: 0x2f78b4 },
  { e: 0.4, top: 0x4b98de, hor: 0xbfe1f3, light: 0xfff2dc, li: 2.4, hemi: 0xcfe6ff, ground: 0x7a6a50, hi: 1.15, water: 0x2d86c6 },
  { e: 1.0, top: 0x3d8ddf, hor: 0xc6e6f6, light: 0xffffff, li: 2.6, hemi: 0xd6ecff, ground: 0x7d6d52, hi: 1.2, water: 0x2a88c9 },
];
const cA = new THREE.Color(), cB = new THREE.Color();
function mix(key, e, out) {
  let i = 0;
  while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = clamp((e - a.e) / (b.e - a.e), 0, 1);
  if (typeof a[key] === 'number' && key !== 'li' && key !== 'hi') {
    cA.setHex(a[key]); cB.setHex(b[key]);
    return out.copy(cA).lerp(cB, t);
  }
  return lerp(a[key], b[key], t);
}

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.night = 0;
    this.sunDir = new THREE.Vector3(0, 1, 0);

    this.domeMat = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 hor; varying vec3 vP;
        void main(){ float h = clamp(vP.y, -0.2, 1.0); float t = pow(clamp(h, 0.0, 1.0), 0.55);
        vec3 c = mix(hor, top, t); if (h < 0.0) c = mix(hor, hor*0.75, -h*5.0); gl_FragColor = vec4(c,1.0);
        #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(480, 24, 16), this.domeMat);
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    this.sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: 0xfff1c4, fog: false, transparent: true, depthWrite: false }));
    this.moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.MeshBasicMaterial({ color: 0xe8ecff, fog: false, transparent: true, depthWrite: false }));
    scene.add(this.sunMesh, this.moonMesh);

    // stars
    const rnd = mulberry32(42);
    const pts = [];
    for (let i = 0; i < 900; i++) {
      const u = rnd(), v = rnd();
      const th = u * Math.PI * 2, ph = Math.acos(v * 0.95);
      pts.push(Math.sin(ph) * Math.cos(th) * 450, Math.cos(ph) * 450, Math.sin(ph) * Math.sin(th) * 450);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    scene.add(this.stars);

    // lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -52; sc.right = 52; sc.top = 52; sc.bottom = -52; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);

    scene.fog = new THREE.Fog(0xbfe1f3, 70, 230);

    // ocean + seabed
    this.waterMat = new THREE.MeshLambertMaterial({ color: 0x2d86c6, transparent: true, opacity: 0.8, depthWrite: false });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), this.waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = WATER_Y;
    this.water.renderOrder = 1;
    this.water.receiveShadow = true;
    scene.add(this.water);
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshLambertMaterial({ color: 0xa89466 }));
    bed.rotation.x = -Math.PI / 2;
    bed.position.y = SEA - 7.02;
    scene.add(bed);

    // drifting block clouds
    this.clouds = new THREE.Group();
    const cmat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 22; i++) {
      const g = new THREE.Group();
      const parts = 2 + Math.floor(rnd() * 4);
      for (let p = 0; p < parts; p++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(8 + rnd() * 14, 2.5 + rnd() * 2, 6 + rnd() * 10), cmat);
        m.position.set(p * 7 - parts * 3 + rnd() * 3, rnd() * 1.5, rnd() * 6 - 3);
        g.add(m);
      }
      g.position.set(rnd() * 600 - 300, 78 + rnd() * 18, rnd() * 600 - 300);
      g.userData.speed = 0.6 + rnd() * 0.8;
      this.clouds.add(g);
    }
    scene.add(this.clouds);
    this.tmpColor = new THREE.Color();
  }

  // dayT: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
  update(dayT, focus, dt, camera) {
    const ang = (dayT - 0.25) * Math.PI * 2;
    const e = Math.sin(ang);
    this.sunDir.set(Math.cos(ang), e, 0.35).normalize();
    this.night = clamp(-e * 4 + 0.2, 0, 1);

    const top = mix('top', e, new THREE.Color());
    const hor = mix('hor', e, new THREE.Color());
    this.domeMat.uniforms.top.value.copy(top);
    this.domeMat.uniforms.hor.value.copy(hor);
    this.scene.fog.color.copy(hor);
    this.renderer.setClearColor(hor);

    const isDay = e > -0.05;
    const dir = isDay ? this.sunDir : this.tmpV || (this.tmpV = new THREE.Vector3());
    if (!isDay) dir.set(-this.sunDir.x, -this.sunDir.y, 0.25).normalize();
    const fade = clamp(Math.abs(e + 0.05) * 6, 0.15, 1);
    mix('light', e, this.sun.color);
    this.sun.intensity = mix('li', e) * fade;
    mix('hemi', e, this.hemi.color);
    mix('ground', e, this.hemi.groundColor);
    this.hemi.intensity = mix('hi', e);
    mix('water', e, this.waterMat.color);

    const fx = Math.round(focus.x / 4) * 4, fz = Math.round(focus.z / 4) * 4;
    this.sun.position.set(fx + dir.x * 120, focus.y + dir.y * 120, fz + dir.z * 120);
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.target.updateMatrixWorld();

    // sky objects follow the camera
    const cp = camera.position;
    this.dome.position.copy(cp);
    this.stars.position.copy(cp);
    this.stars.rotation.y = dayT * Math.PI * 2 * 0.25;
    this.starMat.opacity = this.night;
    this.sunMesh.position.set(cp.x + this.sunDir.x * 400, cp.y + this.sunDir.y * 400, cp.z + this.sunDir.z * 400);
    this.sunMesh.lookAt(cp);
    this.sunMesh.material.opacity = clamp(e * 8 + 0.6, 0, 1);
    this.moonMesh.position.set(cp.x - this.sunDir.x * 400, cp.y - this.sunDir.y * 400, cp.z + this.sunDir.z * 400);
    this.moonMesh.lookAt(cp);
    this.moonMesh.material.opacity = clamp(-e * 8 + 0.6, 0, 1);

    for (const c of this.clouds.children) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > cp.x + 320) c.position.x -= 640;
      if (c.position.x < cp.x - 320) c.position.x += 640;
      if (c.position.z > cp.z + 320) c.position.z -= 640;
      if (c.position.z < cp.z - 320) c.position.z += 640;
    }
    this.water.position.x = cp.x;
    this.water.position.z = cp.z;
  }
}

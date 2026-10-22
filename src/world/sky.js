import * as THREE from 'three';
import { SEA } from './terrain.js';
import { clamp, lerp } from '../core/util.js';
import { mulberry32 } from '../core/rng.js';

// Colour keys by sun elevation (-1 = midnight, 1 = noon)
const KEYS = [
  { e: -1.0, top: 0x050a1c, hor: 0x111d3c, light: 0x9fb4ff, li: 0.42, hemi: 0x4d64a6, ground: 0x1a2030, hi: 0.75, deep: 0x06182e, shallow: 0x123a58, glow: 0x000000 },
  { e: -0.12, top: 0x0b1633, hor: 0x29345f, light: 0xa9b8ff, li: 0.32, hemi: 0x52639c, ground: 0x20263a, hi: 0.78, deep: 0x0a2240, shallow: 0x1a4a6a, glow: 0x3a1e40 },
  { e: 0.0, top: 0x2d3f7c, hor: 0xf28a5a, light: 0xff9a66, li: 0.45, hemi: 0x8a7fa8, ground: 0x4a3b33, hi: 0.8, deep: 0x1d3d6a, shallow: 0x3a7090, glow: 0xff7a3a },
  { e: 0.12, top: 0x4a7fc4, hor: 0xffc597, light: 0xffcf9a, li: 1.6, hemi: 0xb7c8e6, ground: 0x6b5a45, hi: 1.0, deep: 0x175a92, shallow: 0x3aa8bc, glow: 0xffb070 },
  { e: 0.4, top: 0x4b98de, hor: 0xbfe1f3, light: 0xfff2dc, li: 2.4, hemi: 0xcfe6ff, ground: 0x7a6a50, hi: 1.15, deep: 0x0f5a96, shallow: 0x2fb8c6, glow: 0xfff0c8 },
  { e: 1.0, top: 0x3d8ddf, hor: 0xc6e6f6, light: 0xffffff, li: 2.6, hemi: 0xd6ecff, ground: 0x7d6d52, hi: 1.2, deep: 0x0d5694, shallow: 0x2dbac8, glow: 0xffffff },
];
const cA = new THREE.Color(), cB = new THREE.Color();
function mix(key, e, out) {
  let i = 0;
  while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = clamp((e - a.e) / (b.e - a.e), 0, 1);
  if (key !== 'li' && key !== 'hi') {
    cA.setHex(a[key]); cB.setHex(b[key]);
    return out.copy(cA).lerp(cB, t);
  }
  return lerp(a[key], b[key], t);
}

const DOME_VERT = /* glsl */`
varying vec3 vP;
void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const DOME_FRAG = /* glsl */`
uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 glow; uniform float overcast; uniform float sunVis;
varying vec3 vP;
void main() {
  vec3 d = normalize(vP);
  float h = d.y;
  vec3 c = mix(hor, top, pow(clamp(h, 0.0, 1.0), 0.5));
  if (h < 0.0) c = mix(hor, hor * 0.72, clamp(-h * 4.0, 0.0, 1.0));
  float sd = max(dot(d, sunDir), 0.0);
  c += glow * (pow(sd, 6.0) * 0.28 + pow(sd, 48.0) * 0.5) * (1.0 - overcast * 0.7);
  c += vec3(1.0, 0.97, 0.88) * smoothstep(0.99935, 0.9997, sd) * 1.6 * sunVis * (1.0 - overcast);
  float g = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(g) * vec3(0.92, 0.95, 1.0) * 0.92, overcast * 0.85);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

const STAR_VERT = /* glsl */`
attribute float aPhase; attribute float aSize;
uniform float uTime;
varying float vTw;
void main() {
  vTw = 0.55 + 0.45 * sin(uTime * (1.0 + aPhase * 2.0) + aPhase * 40.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize;
  gl_Position = projectionMatrix * mv;
}
`;
const STAR_FRAG = /* glsl */`
uniform float uAlpha;
varying float vTw;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * 1.4, a * uAlpha * vTw);
}
`;

const BOW_VERT = /* glsl */`
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const BOW_FRAG = /* glsl */`
uniform float uStrength; uniform float uInner; uniform float uOuter;
varying vec2 vP;
vec3 hue(float t) { return clamp(abs(mod(t * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
void main() {
  float r = length(vP);
  float t = (r - uInner) / (uOuter - uInner);
  if (t < 0.0 || t > 1.0) discard;
  vec3 c = hue(0.83 - t * 0.83);
  float a = sin(t * 3.14159) * uStrength * smoothstep(0.0, 40.0, vP.y);
  gl_FragColor = vec4(c * a, 1.0);
}
`;

function moonCanvas(phase) {
  // phase 0 = new moon, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter
  const N = 64, R = 28;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  const craters = [[-0.3, -0.25, 0.22], [0.25, 0.2, 0.28], [0.15, -0.4, 0.14], [-0.28, 0.35, 0.15], [0.45, -0.1, 0.1]];
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const x = (px + 0.5 - N / 2) / R, y = (py + 0.5 - N / 2) / R;
    const r2 = x * x + y * y;
    if (r2 > 1) continue;
    const edge = Math.sqrt(1 - y * y);
    const lit = phase < 0.5 ? x > Math.cos(phase * Math.PI * 2) * edge : x < -Math.cos(phase * Math.PI * 2) * edge;
    let shade = 1;
    for (const [cx, cy, cr] of craters) if ((x - cx) ** 2 + (y - cy) ** 2 < cr * cr) shade = 0.82;
    const i = (py * N + px) * 4;
    const a = Math.min(1, (1 - r2) * 18);
    img.data[i] = 232 * shade; img.data[i + 1] = 236 * shade; img.data[i + 2] = 255 * shade;
    img.data[i + 3] = (lit ? 255 : 26) * a;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function moonPhase(date = new Date()) {
  const known = Date.UTC(2000, 0, 6, 18, 14);
  const p = ((date.getTime() - known) / 864e5) / 29.530588;
  return p - Math.floor(p);
}

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.night = 0;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, -1, 0);
    this.horizon = new THREE.Color();
    this.waterDeep = new THREE.Color();
    this.waterShallow = new THREE.Color();
    this.fogNear = 80; this.fogFar = 260;
    this.time = 0;

    this.domeMat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: this.sunDir },
        glow: { value: new THREE.Color() }, overcast: { value: 0 }, sunVis: { value: 1 },
      },
      vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 20), this.domeMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    this.phase = moonPhase();
    const mtex = new THREE.CanvasTexture(moonCanvas(this.phase));
    mtex.colorSpace = THREE.SRGBColorSpace;
    this.moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshBasicMaterial({ map: mtex, color: 0xffffff, fog: false, transparent: true, depthWrite: false }));
    this.moonMesh.renderOrder = -9;
    scene.add(this.moonMesh);

    // stars that twinkle
    const rnd = mulberry32(42);
    const pts = [], ph = [], sz = [];
    for (let i = 0; i < 1400; i++) {
      const u = rnd(), v = rnd();
      const th = u * Math.PI * 2, phi = Math.acos(v * 0.96);
      pts.push(Math.sin(phi) * Math.cos(th) * 450, Math.cos(phi) * 450, Math.sin(phi) * Math.sin(th) * 450);
      ph.push(rnd());
      sz.push(rnd() < 0.08 ? 3.2 : 1.2 + rnd() * 1.4);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    sg.setAttribute('aPhase', new THREE.Float32BufferAttribute(ph, 1));
    sg.setAttribute('aSize', new THREE.Float32BufferAttribute(sz, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
      vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    scene.add(this.stars);

    // shooting star
    this.shoot = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.35), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.shootT = 0; this.shootNext = 20;
    scene.add(this.shoot);

    // lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -56; sc.right = 56; sc.top = 56; sc.bottom = -56; sc.near = 1; sc.far = 280;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);
    scene.fog = new THREE.Fog(0xbfe1f3, 80, 260);

    // seabed past the edge of the world
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshLambertMaterial({ color: 0x9c8a60 }));
    bed.rotation.x = -Math.PI / 2;
    bed.position.y = SEA - 7.02;
    this.bed = bed;
    scene.add(bed);

    // puffy block clouds (one draw call)
    const CLOUDS = 30;
    this.cloudData = [];
    let n = 0;
    for (let i = 0; i < CLOUDS; i++) {
      const parts = [];
      const k = 2 + Math.floor(rnd() * 5);
      for (let p = 0; p < k; p++) {
        parts.push({ x: p * 6.5 - k * 3 + rnd() * 3, y: rnd() * 2 - (p === Math.floor(k / 2) ? -1.2 : 0), z: rnd() * 7 - 3.5, w: 8 + rnd() * 12, h: 2.4 + rnd() * 2.2, d: 6 + rnd() * 9 });
        n++;
      }
      this.cloudData.push({ x: rnd() * 640 - 320, y: 80 + rnd() * 22, z: rnd() * 640 - 320, speed: 0.6 + rnd() * 0.9, parts, order: rnd() });
    }
    this.cloudData.sort((a, b) => a.order - b.order);
    this.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.93, emissive: 0x000000 });
    this.clouds = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.cloudMat, n);
    this.clouds.frustumCulled = false;
    scene.add(this.clouds);
    this.cloudCover = 0.3;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();

    // rainbow
    this.bowMat = new THREE.ShaderMaterial({
      uniforms: { uStrength: { value: 0 }, uInner: { value: 150 }, uOuter: { value: 172 } },
      vertexShader: BOW_VERT, fragmentShader: BOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    });
    this.bow = new THREE.Mesh(new THREE.RingGeometry(150, 172, 96, 1, 0, Math.PI), this.bowMat);
    this.bow.renderOrder = -8;
    this.bow.frustumCulled = false;
    scene.add(this.bow);
    this.tmpV = new THREE.Vector3();
  }

  // dayT: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
  update(dayT, focus, dt, camera, weather, fogScale = 1) {
    this.time += dt;
    const ang = (dayT - 0.25) * Math.PI * 2;
    const e = Math.sin(ang);
    this.elevation = e;
    this.sunDir.set(Math.cos(ang), e, 0.35).normalize();
    this.moonDir.set(-this.sunDir.x, -this.sunDir.y, 0.25).normalize();
    this.night = clamp(-e * 4 + 0.2, 0, 1);
    const w = weather || { cloud: 0.3, overcast: 0, fog: 0, rain: 0, snow: 0, rainbow: 0 };
    const oc = w.overcast;

    const top = mix('top', e, new THREE.Color());
    const hor = mix('hor', e, this.horizon);
    this.domeMat.uniforms.top.value.copy(top);
    this.domeMat.uniforms.hor.value.copy(hor);
    mix('glow', e, this.domeMat.uniforms.glow.value);
    this.domeMat.uniforms.overcast.value = oc;
    this.domeMat.uniforms.sunVis.value = clamp(e * 10 + 0.5, 0, 1);
    const g = hor.r * 0.299 + hor.g * 0.587 + hor.b * 0.114;
    this.horizon.lerp(new THREE.Color(g * 0.92, g * 0.95, g), oc * 0.75);
    this.scene.fog.color.copy(this.horizon);
    this.renderer.setClearColor(this.horizon);

    const isDay = e > -0.05;
    const dir = isDay ? this.sunDir : this.moonDir;
    const fade = clamp(Math.abs(e + 0.05) * 6, 0.15, 1);
    mix('light', e, this.sun.color);
    this.sun.intensity = mix('li', e) * fade * (1 - oc * 0.55);
    mix('hemi', e, this.hemi.color);
    mix('ground', e, this.hemi.groundColor);
    this.hemi.intensity = mix('hi', e) * (1 - oc * 0.12);
    mix('deep', e, this.waterDeep);
    mix('shallow', e, this.waterShallow);
    if (oc > 0) { this.waterDeep.multiplyScalar(1 - oc * 0.3); this.waterShallow.lerp(this.waterDeep, oc * 0.4); }

    const fx = Math.round(focus.x / 4) * 4, fz = Math.round(focus.z / 4) * 4;
    this.sun.position.set(fx + dir.x * 130, focus.y + dir.y * 130, fz + dir.z * 130);
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.target.updateMatrixWorld();

    // fog closes in with rain and mist
    const near = lerp(80 * fogScale, 6, w.fog * 0.9);
    const far = lerp(260 * fogScale, 70, Math.max(w.fog * 0.85, w.rain * 0.45, w.snow * 0.5));
    this.scene.fog.near = near;
    this.scene.fog.far = far;

    // sky objects follow the camera
    const cp = camera.position;
    this.dome.position.copy(cp);
    this.stars.position.copy(cp);
    this.stars.rotation.y = dayT * Math.PI * 2 * 0.25;
    this.starMat.uniforms.uTime.value = this.time;
    this.starMat.uniforms.uAlpha.value = this.night * (1 - oc * 0.9);
    this.moonMesh.position.set(cp.x + this.moonDir.x * 400, cp.y + this.moonDir.y * 400, cp.z + this.moonDir.z * 400);
    this.moonMesh.lookAt(cp);
    this.moonMesh.material.opacity = clamp(-e * 8 + 0.6, 0, 1) * (1 - oc * 0.8);

    // shooting stars on clear nights
    this.shootNext -= dt;
    if (this.shootNext < 0 && this.night > 0.8 && oc < 0.3) {
      this.shootNext = 25 + Math.random() * 60;
      this.shootT = 1.1;
      const a = Math.random() * Math.PI * 2;
      this.shootFrom = new THREE.Vector3(Math.cos(a) * 300, 180 + Math.random() * 80, Math.sin(a) * 300);
      this.shootDir = new THREE.Vector3(-Math.sin(a) + (Math.random() - 0.5), -0.35, Math.cos(a) + (Math.random() - 0.5)).normalize();
    }
    if (this.shootT > 0) {
      this.shootT -= dt;
      const t = 1.1 - this.shootT;
      const p = this.shootFrom.clone().addScaledVector(this.shootDir, t * 160);
      this.shoot.position.copy(cp).add(p);
      this.shoot.lookAt(cp);
      const ahead = this.shoot.position.clone().add(this.shootDir);
      const v1 = ahead.project(camera), v0 = this.shoot.position.clone().project(camera);
      this.shoot.rotateZ(Math.atan2(v1.y - v0.y, (v1.x - v0.x) * camera.aspect));
      this.shoot.material.opacity = Math.sin((t / 1.1) * Math.PI) * 0.9;
    } else this.shoot.material.opacity = 0;

    // clouds
    this.cloudCover = lerp(this.cloudCover, w.cloud, clamp(dt * 0.3, 0, 1));
    const visible = Math.round(6 + this.cloudCover * (this.cloudData.length - 6));
    const shade = new THREE.Color().copy(this.hemi.color).multiplyScalar(0.5).add(new THREE.Color(0.5, 0.5, 0.5).multiplyScalar(1 - this.night * 0.85));
    this.cloudMat.color.setRGB(1, 1, 1).lerp(new THREE.Color(0.58, 0.6, 0.66), oc);
    this.cloudMat.emissive.copy(shade).multiplyScalar(0.25 * (1 - this.night));
    let k = 0;
    for (let i = 0; i < this.cloudData.length; i++) {
      const c = this.cloudData[i];
      c.x += c.speed * dt * (1 + w.rain);
      if (c.x > cp.x + 330) c.x -= 660;
      if (c.x < cp.x - 330) c.x += 660;
      if (c.z > cp.z + 330) c.z -= 660;
      if (c.z < cp.z - 330) c.z += 660;
      const on = i < visible;
      for (const p of c.parts) {
        this._p.set(c.x + p.x, c.y + p.y - oc * 14, c.z + p.z);
        if (on) this._s.set(p.w * (1 + oc * 0.5), p.h, p.d * (1 + oc * 0.5)); else this._s.set(0, 0, 0);
        this._m.compose(this._p, this._q, this._s);
        this.clouds.setMatrixAt(k++, this._m);
      }
    }
    this.clouds.instanceMatrix.needsUpdate = true;

    // rainbow opposite the sun after rain
    const bowS = w.rainbow * clamp(e * 4, 0, 1);
    this.bow.visible = bowS > 0.01;
    if (this.bow.visible) {
      this.tmpV.set(-this.sunDir.x, 0, -this.sunDir.z).normalize();
      this.bow.position.set(cp.x + this.tmpV.x * 380, cp.y - 30, cp.z + this.tmpV.z * 380);
      this.bow.lookAt(cp.x, cp.y - 30, cp.z);
      this.bowMat.uniforms.uStrength.value = bowS * 0.35;
    }
  }
}

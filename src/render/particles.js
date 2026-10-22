import * as THREE from 'three';

// Fast particles: one draw call per system. Shapes come from a small texture atlas.
export const SHAPE = { DOT: 0, SQUARE: 1, HEART: 2, STAR: 3, NOTE: 4, Z: 5, PUFF: 6, DROP: 7 };

function makeAtlas() {
  const C = 64, N = 8;
  const c = document.createElement('canvas');
  c.width = C * N; c.height = C;
  const g = c.getContext('2d');
  const cell = (i) => { g.save(); g.translate(i * C + C / 2, C / 2); };
  // 0 soft dot
  cell(0); { const r = g.createRadialGradient(0, 0, 0, 0, 0, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.8)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(-32, -32, 64, 64); } g.restore();
  // 1 square (pixel debris)
  cell(1); g.fillStyle = '#fff'; g.fillRect(-20, -20, 40, 40); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(-20, 6, 40, 14); g.fillRect(6, -20, 14, 40); g.restore();
  // 2 heart
  cell(2); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, 22); g.bezierCurveTo(-30, 2, -24, -24, 0, -10); g.bezierCurveTo(24, -24, 30, 2, 0, 22); g.fill(); g.restore();
  // 3 sparkle star
  cell(3); g.fillStyle = '#fff'; g.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = i % 2 ? 6 : 28; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.fill(); { const r = g.createRadialGradient(0, 0, 0, 0, 0, 16); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(-16, -16, 32, 32); } g.restore();
  // 4 music note
  cell(4); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(-8, 14, 11, 8, -0.4, 0, Math.PI * 2); g.fill(); g.fillRect(1, -24, 5, 38); g.beginPath(); g.moveTo(6, -24); g.quadraticCurveTo(22, -16, 18, -2); g.quadraticCurveTo(16, -12, 6, -14); g.fill(); g.restore();
  // 5 Z
  cell(5); g.fillStyle = '#fff'; g.font = 'bold 48px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('z', 0, 2); g.restore();
  // 6 smoke puff
  cell(6); for (let i = 0; i < 7; i++) {
    const a = i * 0.9, rr = 9 + (i % 3) * 3, x = Math.cos(a) * 10, y = Math.sin(a) * 9;
    const r = g.createRadialGradient(x, y, 0, x, y, rr + 8); r.addColorStop(0, 'rgba(255,255,255,0.65)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(-32, -32, 64, 64);
  } g.restore();
  // 7 drop
  cell(7); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -24); g.quadraticCurveTo(14, 4, 0, 18); g.quadraticCurveTo(-14, 4, 0, -24); g.fill(); g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
let ATLAS = null;

const VERT = /* glsl */`
attribute vec3 aColor;
attribute vec3 aData; // size, alpha, shape
attribute float aRot;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
varying float vRot;
#include <fog_pars_vertex>
void main() {
  vColor = aColor; vAlpha = aData.y; vShape = aData.z; vRot = aRot;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aData.x * uScale / max(0.1, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const FRAG = /* glsl */`
uniform sampler2D uAtlas;
uniform float uAdditive;
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
varying float vRot;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) discard;
  vec4 t = texture2D(uAtlas, vec2((floor(vShape + 0.5) + p.x) / 8.0, 1.0 - p.y));
  float a = t.a * vAlpha;
  if (a < 0.01) discard;
  vec3 col = vColor * t.rgb;
  gl_FragColor = uAdditive > 0.5 ? vec4(col * a, 1.0) : vec4(col, a);
  #include <fog_fragment>
}
`;

export class Particles {
  constructor(scene, max = 2000, additive = false) {
    if (!ATLAS) ATLAS = makeAtlas();
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.data = new Float32Array(max * 3);
    this.rot = new Float32Array(max);
    this.p = [];
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.BufferAttribute(this.data, 3).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aData', this.aData);
    g.setAttribute('aRot', this.aRot);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 500 }, uAtlas: { value: ATLAS }, uAdditive: { value: additive ? 1 : 0 } }]),
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mat.uniforms.uAtlas.value = ATLAS;
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
    scene.add(this.points);
    this.tmpC = new THREE.Color();
  }

  setScale(s) { this.mat.uniforms.uScale.value = s; }

  emit(o) {
    if (this.p.length >= this.max) this.p.shift();
    const c = typeof o.color === 'number' ? this.tmpC.setHex(o.color) : (o.color || this.tmpC.setRGB(1, 1, 1));
    this.p.push({
      x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      r: c.r * (o.bright || 1), g: c.g * (o.bright || 1), b: c.b * (o.bright || 1),
      size: o.size || 0.3, grow: o.grow || 0, life: o.life || 1, max: o.life || 1,
      gravity: o.gravity ?? 0, drag: o.drag ?? 0, shape: o.shape ?? SHAPE.DOT, alpha: o.alpha ?? 1,
      fadeIn: o.fadeIn || 0, rot: o.rot || 0, spin: o.spin || 0, flicker: o.flicker || 0,
      wobble: o.wobble || 0, ph: Math.random() * 6.28, onDie: o.onDie, trail: o.trail,
    });
  }

  update(dt) {
    const list = this.p;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) { if (p.onDie) p.onDie(p); continue; }
      p.vy += p.gravity * dt;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.wobble) { p.ph += dt * 3; p.x += Math.sin(p.ph) * p.wobble * dt; p.z += Math.cos(p.ph * 0.7) * p.wobble * dt; }
      p.rot += p.spin * dt;
      p.size += p.grow * dt;
      if (p.trail) p.trail(p, dt);
      list[n++] = p;
      if (n > this.max) break;
    }
    list.length = Math.min(n, this.max);
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const t = p.life / p.max;
      let a = p.alpha * Math.min(1, t * 2.5);
      if (p.fadeIn) a *= Math.min(1, (1 - t) / p.fadeIn);
      if (p.flicker) a *= 1 - p.flicker * (0.5 + 0.5 * Math.sin(p.ph * 4 + p.life * 20));
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.g; this.col[i * 3 + 2] = p.b;
      this.data[i * 3] = p.size; this.data[i * 3 + 1] = a; this.data[i * 3 + 2] = p.shape;
      this.rot[i] = p.rot;
    }
    this.points.geometry.setDrawRange(0, list.length);
    if (list.length) {
      this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aData.needsUpdate = true; this.aRot.needsUpdate = true;
    }
  }

  clear() { this.p.length = 0; this.points.geometry.setDrawRange(0, 0); }
}

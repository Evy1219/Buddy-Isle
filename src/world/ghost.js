import * as THREE from 'three';
import { BLOCKS, B, blockColor } from './blocks.js';
import { CHUNK } from './world.js';

const HOLO_VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vW;
void main() {
  vUv = uv;
  vColor = instanceColor;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const HOLO_FRAG = /* glsl */`
uniform float uTime;
uniform float uAlpha;
uniform vec3 uTint;
uniform float uTintAmt;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vW;
void main() {
  vec2 e = min(vUv, 1.0 - vUv);
  float edge = 1.0 - smoothstep(0.0, 0.08, min(e.x, e.y));
  float scan = 0.5 + 0.5 * sin(vW.y * 6.0 - uTime * 4.0);
  vec3 c = mix(vColor, uTint, uTintAmt);
  float a = (0.07 + edge * 0.55 + scan * 0.05) * uAlpha;
  gl_FragColor = vec4(c * (1.0 + edge * 0.6), a);
}
`;

// A see-through hologram of a set of blocks. Used to show what the buddy is about to
// build, and for previews when you pick where something should go.
export class Hologram {
  constructor(scene, max = 3000) {
    this.max = max;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 }, uTint: { value: new THREE.Color(0x7fe6ff) }, uTintAmt: { value: 0.45 } },
      vertexShader: HOLO_VERT, fragmentShader: HOLO_FRAG, transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), this.mat, max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
    this.map = new Map();
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
    this.key = null;
  }

  // ops: [[x, y, z, id], ...]
  show(ops, key = null, tint = 0x7fe6ff, tintAmt = 0.45) {
    this.key = key;
    this.map.clear();
    let n = 0;
    for (let i = 0; i < ops.length && n < this.max; i++) {
      const [x, y, z, id] = ops[i];
      if (id === B.AIR) continue;
      const def = BLOCKS[id];
      const small = def.shape === 'boxes';
      this._m.makeScale(small ? 0.5 : 1.0, small ? 0.5 : 1.0, small ? 0.5 : 1.0);
      this._m.setPosition(x + 0.5, y + (small ? 0.25 : 0.5), z + 0.5);
      this.mesh.setMatrixAt(n, this._m);
      this._c.setHex(blockColor(id));
      this.mesh.setColorAt(n, this._c);
      this.map.set(i, n);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mat.uniforms.uTint.value.setHex(tint);
    this.mat.uniforms.uTintAmt.value = tintAmt;
    this.mesh.visible = n > 0;
  }

  hideOp(i) {
    const n = this.map.get(i);
    if (n == null) return;
    this._m.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(n, this._m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() { this.mesh.count = 0; this.mesh.visible = false; this.key = null; this.map.clear(); }

  update(dt, alpha = 1) {
    this.mat.uniforms.uTime.value += dt;
    this.mat.uniforms.uAlpha.value = alpha;
  }
}

// Blocks placed by the buddy grow into place with a little bounce before they become part of the world.
export class PopIn {
  constructor(scene, world) {
    this.world = world;
    this.max = 400;
    this.mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.mat, this.max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    this.items = [];
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
    this.scene = scene;
  }

  setWorld(world) { this.flush(); this.world = world; }

  add(x, y, z, id) {
    if (this.items.length >= this.max) { this.world.set(x, y, z, id); return; }
    this.items.push({ x, y, z, id, t: 0, committed: false, ci: Math.floor(z / CHUNK) * this.world.chunksX + Math.floor(x / CHUNK) });
  }

  pendingAt(x, y, z) { return this.items.some((p) => p.x === x && p.y === y && p.z === z && !p.committed); }

  flush() {
    for (const p of this.items) if (!p.committed) this.world.set(p.x, p.y, p.z, p.id);
    this.items.length = 0;
    this.mesh.count = 0;
  }

  update(dt) {
    let n = 0;
    const keep = [];
    for (const p of this.items) {
      p.t += dt;
      if (!p.committed && p.t >= 0.26) { this.world.set(p.x, p.y, p.z, p.id); p.committed = true; }
      if (p.committed && (!this.world.dirty.has(p.ci) || p.t > 1.2)) continue; // the chunk has caught up
      keep.push(p);
      const k = Math.min(1, p.t / 0.26);
      const s = k < 1 ? 0.2 + 0.95 * Math.sin(k * Math.PI * 0.62) / Math.sin(Math.PI * 0.62) : 1.0;
      this._m.makeScale(s, s, s);
      this._m.setPosition(p.x + 0.5, p.y + 0.5 * s, p.z + 0.5);
      this.mesh.setMatrixAt(n, this._m);
      const def = BLOCKS[p.id];
      this._c.setHex(def.shape === 'cube' ? def.side : blockColor(p.id));
      this.mesh.setColorAt(n, this._c);
      n++;
    }
    this.items = keep;
    this.mesh.count = n;
    if (n) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
  }
}

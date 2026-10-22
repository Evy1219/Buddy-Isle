import * as THREE from 'three';
import { SEA, WATER_Y } from './terrain.js';
import { ENV } from '../render/materials.js';

// The sea: gentle waves, clearer water in the shallows, foam where it meets the sand,
// a bright glint under the sun and a soft one under the moon.
const VERT = /* glsl */`
uniform float uTime;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float w = sin(wp.x * 0.33 + uTime * 1.1) * 0.06 + sin(wp.z * 0.27 - uTime * 0.85) * 0.05 + sin((wp.x + wp.z) * 0.6 + uTime * 1.7) * 0.025;
  wp.y += w;
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform float uNight;
uniform float uRain;
uniform sampler2D uHeight;
uniform float uSize;
uniform float uSea;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hsh(i), hsh(i + vec2(1.0, 0.0)), u.x), mix(hsh(i + vec2(0.0, 1.0)), hsh(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  vec2 uv = vWorld.xz / uSize;
  float h = uSea - 8.0;
  if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) h = texture2D(uHeight, uv).r * 255.0;
  float depth = max(0.0, (uSea + 0.86) - (h + 1.0));

  vec2 q = vWorld.xz * 0.55;
  float n1 = vnoise(q + uTime * vec2(0.32, 0.21));
  float n2 = vnoise(q * 1.9 - uTime * vec2(0.27, 0.36));
  float n3 = vnoise(q * 4.3 + uTime * vec2(0.6, -0.4));
  vec3 N = normalize(vec3((n1 - 0.5) * 0.34 + (n2 - 0.5) * 0.22 + (n3 - 0.5) * 0.1 * (1.0 + uRain * 3.0), 1.0,
                          (n2 - 0.5) * 0.34 - (n1 - 0.5) * 0.2 + (n3 - 0.5) * 0.1 * (1.0 + uRain * 3.0)));
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  float shallow = 1.0 - smoothstep(0.0, 6.5, depth);
  vec3 col = mix(uDeep, uShallow, shallow * 0.9);
  // sand ripples showing through very shallow water
  col += vec3(0.05, 0.06, 0.03) * shallow * shallow * vnoise(vWorld.xz * 2.0 + n1);
  col = mix(col, uSky, clamp(fres * 0.85 + 0.06, 0.0, 0.8));

  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 260.0) * (1.0 - uNight) * (1.0 - uRain * 0.8);
  col += uSunColor * spec * 3.0;
  vec3 Hm = normalize(uMoonDir + V);
  col += vec3(0.55, 0.65, 1.0) * pow(max(dot(N, Hm), 0.0), 320.0) * uNight * 1.4;

  // foam where the water meets the shore
  float ring = sin(uTime * 1.5 - depth * 4.5 + vnoise(vWorld.xz * 0.7) * 5.0) * 0.5 + 0.5;
  float foamLine = smoothstep(1.3, 0.0, depth) * (0.45 + 0.55 * ring);
  float foamN = vnoise(vWorld.xz * 1.8 + uTime * 0.35);
  float foam = clamp(foamLine * smoothstep(0.3, 0.75, foamN + 0.25), 0.0, 1.0);
  col = mix(col, vec3(0.95, 0.98, 1.0) * (1.0 - uNight * 0.55), foam * 0.85);

  float alpha = mix(0.93, 0.5, shallow);
  alpha = max(alpha, foam);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export class Ocean {
  constructor(scene, world) {
    this.scene = scene;
    const S = world.size;
    this.tex = new THREE.DataTexture(new Uint8Array(S * S), S, S, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: ENV.uTime, uNight: ENV.uNight,
        uDeep: { value: new THREE.Color(0x0e4a7a) }, uShallow: { value: new THREE.Color(0x2fb3c4) },
        uSky: { value: new THREE.Color(0xbfe1f3) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(1, 0.95, 0.85) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uRain: { value: 0 }, uHeight: { value: this.tex }, uSize: { value: S }, uSea: { value: SEA },
      }]),
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true,
    });
    // keep shared uniforms linked after merge (merge clones them)
    this.mat.uniforms.uTime = ENV.uTime;
    this.mat.uniforms.uNight = ENV.uNight;
    const geo = new THREE.PlaneGeometry(1400, 1400, 140, 140);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = WATER_Y;
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.setWorld(world);
  }

  setWorld(world) {
    const S = world.size;
    if (this.tex.image.width !== S) {
      this.tex.dispose();
      this.tex = new THREE.DataTexture(new Uint8Array(S * S), S, S, THREE.RedFormat, THREE.UnsignedByteType);
      this.tex.magFilter = THREE.LinearFilter;
      this.tex.minFilter = THREE.LinearFilter;
      this.mat.uniforms.uHeight.value = this.tex;
      this.mat.uniforms.uSize.value = S;
    }
    this.tex.image.data.set(world.t.h);
    this.tex.needsUpdate = true;
    this.world = world;
    this.version = world.terrainVersion;
  }

  update(camera, sky, weather) {
    if (this.world && this.world.terrainVersion !== this.version) this.setWorld(this.world);
    const step = 10;
    this.mesh.position.x = Math.round(camera.position.x / step) * step;
    this.mesh.position.z = Math.round(camera.position.z / step) * step;
    const u = this.mat.uniforms;
    u.uSunDir.value.copy(sky.sunDir);
    u.uMoonDir.value.copy(sky.moonDir);
    u.uSky.value.copy(sky.horizon);
    u.uDeep.value.copy(sky.waterDeep);
    u.uShallow.value.copy(sky.waterShallow);
    u.uSunColor.value.copy(sky.sun.color);
    u.uRain.value = weather ? weather.rain : 0;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}

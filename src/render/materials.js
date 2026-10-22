import * as THREE from 'three';

// One set of uniforms shared by every block material, updated once per frame by the
// environment (time of day, weather, season).
export const ENV = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uWind: { value: 1 },
  uWet: { value: 0 },
  uSnow: { value: 0 },
  uTorch: { value: new THREE.Color(1.0, 0.62, 0.3) },
  uGrassTarget: { value: new THREE.Color(0.32, 0.45, 0.1) },
  uGrassAmt: { value: 0 },
  uLeafA: { value: new THREE.Color(0.75, 0.25, 0.03) },
  uLeafB: { value: new THREE.Color(0.8, 0.52, 0.04) },
  uLeafAmt: { value: 0 },
  uPineAmt: { value: 0 },
};

// Season looks. amt = how strongly grass/leaves are pulled toward these colours.
export const SEASONS = {
  spring: { grass: [0.12, 0.42, 0.06], grassAmt: 0.22, leafA: [0.2, 0.55, 0.1], leafB: [0.55, 0.7, 0.2], leafAmt: 0.25, pine: 0, snow: 0 },
  summer: { grass: [0.1, 0.3, 0.04], grassAmt: 0, leafA: [0.1, 0.3, 0.05], leafB: [0.1, 0.3, 0.05], leafAmt: 0, pine: 0, snow: 0 },
  autumn: { grass: [0.36, 0.4, 0.08], grassAmt: 0.42, leafA: [0.78, 0.2, 0.03], leafB: [0.85, 0.5, 0.04], leafAmt: 0.85, pine: 0.1, snow: 0 },
  winter: { grass: [0.3, 0.32, 0.22], grassAmt: 0.55, leafA: [0.35, 0.3, 0.25], leafB: [0.45, 0.4, 0.33], leafAmt: 0.7, pine: 0.35, snow: 1 },
};

const VERT_HEAD = /* glsl */`
attribute vec4 aFx;
uniform float uTime;
uniform float uWind;
uniform float uWet;
uniform vec3 uGrassTarget; uniform float uGrassAmt;
uniform vec3 uLeafA; uniform vec3 uLeafB; uniform float uLeafAmt; uniform float uPineAmt;
varying float vTorch;
varying float vSnowW;
float bi_lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float bi_hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
`;

const VERT_COLOR = /* glsl */`
#include <color_vertex>
{
  vec3 wpos = position;
  float fk = aFx.z;
  float lum = bi_lum(vColor.rgb);
  if (fk > 0.5 && fk < 1.5) {
    vColor.rgb = mix(vColor.rgb, uGrassTarget * (lum / 0.43), uGrassAmt);
  } else if (fk > 1.5 && fk < 2.5) {
    float h = bi_hash(floor(wpos.xz / 5.0));
    vec3 tgt = mix(uLeafA, uLeafB, h);
    vColor.rgb = mix(vColor.rgb, tgt * (lum / 0.27), uLeafAmt * (0.75 + 0.25 * h));
  } else if (fk > 2.5) {
    vColor.rgb *= (1.0 - uPineAmt * 0.35);
  }
  vColor.rgb *= (1.0 - uWet * 0.22);
  vTorch = aFx.x;
  vSnowW = aFx.w;
}
`;

const VERT_SWAY = /* glsl */`
#include <begin_vertex>
if (aFx.y > 0.0) {
  float t = uTime * 1.7;
  float s = sin(t + position.x * 0.55 + position.z * 0.35) + 0.45 * sin(t * 2.3 + position.x * 1.3 - position.z * 0.9);
  transformed.x += s * 0.055 * aFx.y * uWind;
  transformed.z += cos(t * 0.8 + position.z * 0.6 + position.x * 0.2) * 0.04 * aFx.y * uWind;
}
`;

const FRAG_HEAD = /* glsl */`
uniform float uNight;
uniform float uSnow;
uniform vec3 uTorch;
varying float vTorch;
varying float vSnowW;
`;

const FRAG_SNOW = /* glsl */`
#include <color_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.94, 0.98), clamp(vSnowW * uSnow, 0.0, 1.0) * 0.92);
`;

const FRAG_TORCH = /* glsl */`
outgoingLight += diffuseColor.rgb * uTorch * (min(vTorch, 1.4) * (0.04 + 1.35 * uNight));
#include <envmap_fragment>
`;

export function patchBlockMaterial(mat, key) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ENV);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
      .replace('#include <color_vertex>', VERT_COLOR)
      .replace('#include <begin_vertex>', VERT_SWAY);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <color_fragment>', FRAG_SNOW)
      .replace('#include <envmap_fragment>', FRAG_TORCH);
  };
  mat.customProgramCacheKey = () => 'block-' + key;
  return mat;
}

// Glowing parts (lantern glass, fire, crystals) flicker a little and get brighter at night
const GLOW_HEAD = /* glsl */`
uniform float uTime;
uniform float uNight;
`;
export function patchGlowMaterial(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = ENV.uTime;
    shader.uniforms.uNight = ENV.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFx;\nvarying vec3 vWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLOW_HEAD + 'varying vec3 vWp;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float fl = 0.92 + 0.08 * sin(uTime * 9.0 + vWp.x * 3.1 + vWp.z * 1.7) * sin(uTime * 5.3 + vWp.y * 2.0);
        diffuseColor.rgb *= fl * (0.85 + 0.75 * uNight);`);
  };
  mat.customProgramCacheKey = () => 'glow-v1';
  return mat;
}

export function makeBlockMaterials() {
  return {
    opaque: patchBlockMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), 'opaque'),
    trans: patchBlockMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.62, depthWrite: false }), 'trans'),
    glow: patchGlowMaterial(new THREE.MeshBasicMaterial({ vertexColors: true })),
  };
}

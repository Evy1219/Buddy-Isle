import * as THREE from 'three';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/addons/postprocessing/ShaderPass.js';

export const PRESETS = {
  fancy: { label: 'Fancy', pixelRatio: 2, shadows: true, shadowSize: 4096, bloom: true, life: 1, fog: 1.25, msaa: 4 },
  balanced: { label: 'Balanced', pixelRatio: 1.5, shadows: true, shadowSize: 2048, bloom: true, life: 0.7, fog: 1, msaa: 4 },
  fast: { label: 'Fast', pixelRatio: 1, shadows: false, shadowSize: 1024, bloom: false, life: 0.35, fog: 0.8, msaa: 0 },
};

// Soft vignette + a touch of warmth, and a fade for sleeping / screen transitions
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.28 }, uFade: { value: 0 }, uFadeColor: { value: new THREE.Color(0x06101c) }, uSat: { value: 1.06 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette; uniform float uFade; uniform vec3 uFadeColor; uniform float uSat; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float g = dot(c.rgb, vec3(0.299,0.587,0.114)); c.rgb = mix(vec3(g), c.rgb, uSat);
    vec2 d = vUv - 0.5; float v = 1.0 - dot(d, d) * uVignette * 2.2; c.rgb *= v; c.rgb = mix(c.rgb, uFadeColor, uFade); gl_FragColor = c; }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;
    this.fade = 0;
    this.build(4);
  }

  build(msaa) {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: msaa });
    this.composer?.dispose?.();
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.4, 0.55, 0.85);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.msaa = msaa;
  }

  setSize(w, h) {
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
  }

  // night: 0..1. Lanterns and fireworks bloom more in the dark.
  update(night, overcast = 0) {
    this.bloom.strength = 0.18 + night * 0.75;
    this.bloom.threshold = 0.92 - night * 0.38;
    this.bloom.radius = 0.5 + night * 0.25;
    this.grade.uniforms.uFade.value = this.fade;
    this.grade.uniforms.uSat.value = 1.08 - overcast * 0.12;
  }

  render(dt) {
    if (this.enabled) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}

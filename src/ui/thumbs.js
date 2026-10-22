import * as THREE from 'three';
import { World, CHUNK } from '../world/world.js';
import { meshChunk } from '../world/mesher.js';
import { makeBlockMaterials, ENV } from '../render/materials.js';
import { Plan } from '../buddy/plan.js';
import { BLUEPRINTS, STYLES } from '../buddy/blueprints.js';
import { Props } from '../world/props.js';
import { RNG } from '../core/rng.js';
import { SEA } from '../world/terrain.js';
import { B } from '../world/blocks.js';

// Little pictures of each kind of building for the "ask your buddy to build" catalog.
// Each one is built in a tiny flat test world and photographed from above.
const KEY = 'buddy-isle-thumbs-v2';
const cache = new Map();
try { const saved = JSON.parse(localStorage.getItem(KEY) || '{}'); for (const k in saved) cache.set(k, saved[k]); } catch (_) { /* no storage */ }
let mats = null;
const queue = [];
let busy = false;

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(cache))); } catch (_) { /* full or blocked: fine */ }
}

export function thumbFor(renderer, type, opts = {}) {
  if (cache.has(type)) return cache.get(type);
  const url = render(renderer, type, opts);
  cache.set(type, url);
  persist();
  return url;
}

// Ask for a picture; cb(url) is called when it's ready. Pictures are made one at a time.
export function thumbLater(renderer, type, cb) {
  if (cache.has(type)) { cb(cache.get(type)); return; }
  queue.push({ renderer, type, cb });
  pump();
}
function pump() {
  if (busy || !queue.length) return;
  busy = true;
  setTimeout(() => {
    const job = queue.shift();
    try { job.cb(thumbFor(job.renderer, job.type)); } catch (e) { console.warn('thumb failed', e); job.cb(null); }
    busy = false;
    pump();
  }, 30);
}

function render(renderer, type, { color = 0xffc65a, buddy = 'Pip', player = 'You' } = {}) {
  const bp = BLUEPRINTS[type];
  if (!bp || bp.special) return null;
  if (!mats) mats = makeBlockMaterials();
  const SIZE = 48, base = SEA + 2;
  const world = new World({ seed: 1, size: SIZE, flat: base });
  const rng = new RNG(7 + type.length * 13);
  const ctx = { buddy, player, color, colorBlock: B.P_YELLOW, style: STYLES.cozy, traits: { cozy: 0.5, grand: 0.5, nature: 0.5, artsy: 0.5 } };
  bp.pre?.(rng, ctx);
  const S = bp.size(rng, ctx);
  const x0 = Math.floor(SIZE / 2 - S / 2), z0 = x0;
  const plan = new Plan(world, { x0, z0, size: S, baseY: base, rot: 0 });
  bp.build(plan, rng, ctx);
  let minY = base, maxY = base + 1;
  for (const [x, y, z, id] of plan.ops()) { world.set(x, y, z, id); if (id) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); } }
  for (const g of plan.growables) world.set(g.x, g.y, g.z, g.kind === 'crop' ? B.CROP : B.SAPLING);

  const scene = new THREE.Scene();
  const group = new THREE.Group();
  scene.add(group);
  const n = world.chunksX;
  for (let cz = 0; cz < n; cz++) for (let cx = 0; cx < n; cx++) {
    const data = meshChunk(world, cx, cz);
    for (const k of ['opaque', 'trans', 'glow']) {
      if (!data[k]) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(data[k].position, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(data[k].normal, 3));
      g.setAttribute('color', new THREE.BufferAttribute(data[k].color, 3));
      g.setAttribute('aFx', new THREE.BufferAttribute(data[k].fx, 4));
      g.setIndex(new THREE.BufferAttribute(data[k].index, 1));
      group.add(new THREE.Mesh(g, mats[k]));
    }
  }
  const props = new Props(scene, { props: [], artworks: [], nextId: 1 }, { smoke() {}, ember() {}, spray() {}, firefly() {}, sparkle() {} });
  for (const pr of plan.props) props.add({ ...pr });
  props.update(0.01, { night: 0, camera: { position: new THREE.Vector3() }, worldCenter: { x: 0, z: 0 }, worldSize: SIZE });
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x6b5a45, 1.3));
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
  sun.position.set(-20, 40, 30);
  scene.add(sun);

  const cx = x0 + S / 2, cz = z0 + S / 2, cy = (minY + maxY) / 2 + 0.5;
  const span = Math.max(S * 0.62, (maxY - minY + 2) * 0.62);
  const cam = new THREE.OrthographicCamera(-span, span, span, -span, 0.1, 400);
  cam.position.set(cx - 40, cy + 34, cz + 40);
  cam.lookAt(cx, cy, cz);
  cam.updateMatrixWorld();

  const W = 128;
  const rt = new THREE.WebGLRenderTarget(W, W, { samples: 4 });
  const prevRT = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevNight = ENV.uNight.value, prevSnow = ENV.uSnow.value;
  ENV.uNight.value = 0; ENV.uSnow.value = 0;
  const prevShadow = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = false;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  const px = new Uint8Array(W * W * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W, W, px);
  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.shadowMap.enabled = prevShadow;
  ENV.uNight.value = prevNight; ENV.uSnow.value = prevSnow;
  rt.dispose();
  group.traverse((o) => o.geometry && o.geometry.dispose());

  const c = document.createElement('canvas');
  c.width = c.height = W;
  const g2 = c.getContext('2d');
  const img = g2.createImageData(W, W);
  const toSRGB = (v) => { v /= 255; return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); };
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const s = ((W - 1 - y) * W + x) * 4, d = (y * W + x) * 4;
    img.data[d] = toSRGB(px[s]); img.data[d + 1] = toSRGB(px[s + 1]); img.data[d + 2] = toSRGB(px[s + 2]); img.data[d + 3] = px[s + 3];
  }
  g2.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

export { CHUNK };

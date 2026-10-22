import * as THREE from 'three';
import { World } from './world/world.js';
import { ChunkRenderer } from './world/chunks.js';
import { Sky } from './world/sky.js';
import { Ocean } from './world/ocean.js';
import { Props } from './world/props.js';
import { FX } from './world/fx.js';
import { Life } from './world/life.js';
import { PopIn, Hologram } from './world/ghost.js';
import { Precipitation, weatherAt, seasonFor } from './world/weather.js';
import { updateGrowth } from './world/growth.js';
import { SEA, WATER_Y } from './world/terrain.js';
import { B, BLOCKS } from './world/blocks.js';
import { ENV, SEASONS } from './render/materials.js';
import { Post, PRESETS } from './render/post.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { RNG, hashString } from './core/rng.js';
import * as store from './core/storage.js';
import { Player } from './player/player.js';
import { BuildMode } from './player/build.js';
import { Touch } from './player/touch.js';
import { Interact } from './player/interact.js';
import { Placement } from './player/placement.js';
import { BuddyEntity } from './buddy/entity.js';
import { Brain } from './buddy/brain.js';
import { catchUp, awayLetter } from './buddy/offline.js';
import { line } from './buddy/voice.js';
import { AI_DEFAULTS, aiEnabled, aiRewriteJournal, aiIdeaReason } from './buddy/llm.js';
import { UI } from './ui/ui.js';
import { formatDuration, clamp, lerp } from './core/util.js';

const DAY_SECONDS = 24 * 60; // one in-game day = 24 real minutes
const FORCED = {
  rain: { cloud: 1, overcast: 0.72, rain: 1, fog: 0.22, wind: 1.8 }, snow: { cloud: 0.95, overcast: 0.5, snow: 1, fog: 0.3, wind: 0.7 },
  mist: { cloud: 0.4, overcast: 0.3, fog: 1, wind: 0.4 }, cloudy: { cloud: 0.9, overcast: 0.38, fog: 0.08, wind: 1.3 }, rainbow: { rainbow: 1, cloud: 0.4 },
};
const DEFAULT_SETTINGS = {
  music: 0.45, sfx: 0.6, ambience: 0.6, graphics: 'balanced', sensitivity: 1, invertY: false,
  minimap: true, compass: true, aiExtras: true, ai: { ...AI_DEFAULTS },
};

export function newWorldRecord(o) {
  const seed = o.seed ? (/^\d+$/.test(String(o.seed).trim()) ? Number(o.seed) >>> 0 : hashString(String(o.seed))) : (Math.random() * 2 ** 31) >>> 0;
  const rng = new RNG(seed ^ 0x5eed);
  const traits = { cozy: rng.float(), grand: rng.float(), nature: rng.float(), artsy: rng.float() };
  const bias = { cheerful: 'cozy', chill: 'nature', dreamy: 'artsy', goofy: 'grand' }[o.personality];
  if (bias) traits[bias] = Math.min(1, traits[bias] + 0.4);
  const now = Date.now();
  return {
    id: 'w' + now.toString(36) + Math.floor(Math.random() * 1e6).toString(36),
    version: 2, name: o.name || 'My Island', seed, size: 256, created: now, lastSeen: now,
    islets: [], edits: new Uint8Array(0), playerName: o.playerName || '',
    player: { x: null, y: null, z: null, yaw: 0.6, pitch: -0.25, shirt: o.shirt ?? 0x3fa7a0 },
    spawn: null,
    buddy: {
      name: o.buddyName || 'Pip', color: o.buddyColor ?? 0xffc65a, personality: o.personality || 'cheerful', traits,
      stats: { blocks: 0, builds: 0, paintings: 0, trees: 0, chats: 0, paths: 0 }, milestones: {}, requests: [], queue: [],
      facts: [], likes: {}, dislikes: {}, friendship: 0, energy: 90, happy: 75, ideas: [], job: null, paused: null, pos: null, met: false,
    },
    projects: [], props: [], artworks: [], journal: [], chatLog: [], growables: [], keepsakes: [], fish: {},
    time: { day: 0.32, dayCount: 0 }, settings: { pace: o.pace || 'normal', clock: 'game', weather: true, season: 'calendar' }, thumb: null, nextId: 1,
  };
}

class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    // phones and tablets start on the lighter graphics (you can change it in the menu)
    const phone = (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 900) || /Android|iPhone|iPad/i.test(navigator.userAgent);
    this.settings = store.loadSettings({ ...DEFAULT_SETTINGS, graphics: phone ? 'fast' : DEFAULT_SETTINGS.graphics });
    if (this.settings.quality === 'low') { this.settings.graphics = 'fast'; delete this.settings.quality; }
    if (!PRESETS[this.settings.graphics]) this.settings.graphics = 'balanced';
    this.preset = PRESETS[this.settings.graphics];
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.preset.pixelRatio));
    this.renderer.shadowMap.enabled = this.preset.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 900);
    this.sky = new Sky(this.scene, this.renderer);
    this.sky.sun.shadow.mapSize.set(this.preset.shadowSize, this.preset.shadowSize);
    this.fx = new FX(this.scene);
    this.precip = new Precipitation(this.scene);
    this.post = new Post(this.renderer, this.scene, this.camera);
    this.post.enabled = this.preset.bloom;
    this.input = new Input(this.canvas);
    this.input.sensitivity = this.settings.sensitivity;
    this.input.invertY = this.settings.invertY;
    this.audio = new Audio();
    this.audio.setVolumes(this.settings.music, this.settings.sfx, this.settings.ambience);
    this.fx.audio = this.audio;
    this.ui = new UI(this);
    this.touch = new Touch(this);
    this.mode = 'boot';
    this.state = null;
    this.clock = new THREE.Clock();
    this.saveT = 0; this.orbitT = 0; this.envT = 0; this.growT = 5; this.critterKey = '';
    this.weather = { kind: 'clear', cloud: 0.2, overcast: 0, rain: 0, snow: 0, fog: 0, wind: 1, rainbow: 0 };
    const q = new URLSearchParams(location.search);
    // test switches: ?fast (8x speed), ?weather=rain|snow|mist|clear, ?season=winter, ?time=0.9
    this.timeScale = q.has('fast') ? 8 : 1;
    this.forceWeather = q.get('weather');
    this.forceSeason = q.get('season');
    this.forceTime = q.has('time') ? Number(q.get('time')) : null;
    this.perf = { t: 0, frames: 0, slow: 0, warned: false };
    this.photoMode = false;

    window.addEventListener('resize', () => this.resize());
    this.resize();
    const startAudio = () => this.audio.start();
    window.addEventListener('pointerdown', startAudio);
    window.addEventListener('keydown', startAudio);

    this.input.on('key', (e) => this.onKey(e));
    this.input.on('click', (btn, e, unlocked) => this.onClick(btn, e, unlocked));
    this.input.on('wheel', (d) => {
      if (this.mode !== 'play') return;
      if (this.buildMode?.active) this.buildMode.select(this.buildMode.slot + d);
      else this.player.zoom(d);
    });
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.saveNow(true));
    window.addEventListener('beforeunload', () => this.saveNow(true));

    this.boot();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const scale = (h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.fx.setScale(scale);
  }

  async boot() {
    this.ui.showLoading('Waking up the island…', 0);
    let worlds = [];
    try { worlds = await store.listWorlds(); } catch (err) { console.warn('storage unavailable', err); this.ui.storageWarning(); }
    if (worlds.length) {
      const rec = await store.loadWorld(worlds[0].id).catch(() => null);
      if (rec) { await this.open(rec, { title: true }); return; }
    }
    await this.openDemo();
  }

  // A pretend island for the title screen when there are no saves yet
  async openDemo() {
    const rec = newWorldRecord({ name: 'Demo', playerName: 'friend', buddyName: 'Pip', personality: 'cheerful' });
    rec.demo = true;
    rec.created -= 2 * 864e5;
    rec.lastSeen = Date.now() - 12 * 3600e3;
    rec.settings.pace = 'busy';
    rec.buddy.friendship = 40;
    await this.open(rec, { title: true, demoActivities: 30 });
  }

  // ---------- opening a world ----------
  async open(rec, { title = false, demoActivities = 0 } = {}) {
    this.mode = 'loading';
    this.ui.showLoading('Growing the island…', 0.02);
    await new Promise((r) => setTimeout(r, 30));
    this.closeWorld();
    const backup = store.lastSeenBackup(rec.id);
    if (backup > rec.lastSeen) rec.lastSeen = backup;
    // fill in fields added by newer versions
    const b = rec.buddy;
    b.requests ||= []; b.queue ||= []; b.facts ||= []; b.likes ||= {}; b.dislikes ||= {}; b.ideas ||= []; b.milestones ||= {};
    b.energy ??= 85; b.happy ??= 72; b.friendship ??= 0;
    rec.islets ||= []; rec.chatLog ||= []; rec.props ||= []; rec.growables ||= []; rec.keepsakes ||= []; rec.fish ||= {};
    rec.settings ||= { pace: 'normal', clock: 'game' };
    rec.settings.weather ??= true; rec.settings.season ||= 'calendar';
    this.state = rec;

    this.world = new World({ seed: rec.seed, size: rec.size, islets: rec.islets });
    this.world.loadEdits(rec.edits);
    this.world.onChange = () => { this.ui.mapDirty = true; };
    if (!rec.spawn) rec.spawn = this.findSpawn();
    if (rec.player.x == null) {
      const g = this.world.groundY(rec.spawn.x, rec.spawn.z);
      Object.assign(rec.player, { x: rec.spawn.x + 0.5, y: g + 1, z: rec.spawn.z + 0.5 });
    }
    this.props = new Props(this.scene, rec, this.fx);
    this.player = new Player(this.scene, this.camera, this.world, this.input, rec.player);
    this.player.onJump = () => this.brain?.onPlayerJump();
    this.player.onStep = (surface, k) => this.audio.step(surface, k);
    this.buddyEntity = new BuddyEntity(this.scene, this.world, b.color, this.fx);
    const bp = b.pos || { x: rec.spawn.x + 2.5, y: this.world.groundY(rec.spawn.x + 2, rec.spawn.z) + 1.4, z: rec.spawn.z + 1.5 };
    this.buddyEntity.place(bp.x, bp.y, bp.z);
    this.pop = new PopIn(this.scene, this.world);
    this.holo = new Hologram(this.scene);
    this.brain = new Brain(this);
    this.buildMode = new BuildMode(this);
    this.interact = new Interact(this);
    this.placement = new Placement(this);
    this.ocean = new Ocean(this.scene, this.world);
    this.life = new Life(this.scene, this.world, this.fx);
    this.life.level = this.preset.life;
    this.fx.clear();

    // catch up on the time we were away
    const now = Date.now();
    const away = now - rec.lastSeen;
    let summary = null;
    if (demoActivities) {
      const old = rec.settings.pace;
      rec.settings.pace = 'busy';
      rec.lastSeen = now - demoActivities * 10 * 60e3;
      summary = catchUp(this, demoActivities * 10 * 60e3);
      rec.settings.pace = old;
    } else {
      summary = catchUp(this, away);
    }
    this.advanceClock(away / 1000);
    if (this.forceTime != null) rec.time.day = this.forceTime;
    rec.lastSeen = now;
    this.props.load();
    this.life.syncCritters(rec.projects);

    this.chunks = new ChunkRenderer(this.scene, this.world, this.preset.shadows);
    await this.chunks.buildAll((p) => this.ui.showLoading('Growing the island…', 0.05 + p * 0.95));
    this.pendingAway = summary && !rec.demo && (summary.results.length || away > 10 * 60e3) ? summary : null;
    this.pendingAwayMs = away;
    this.updateEnvironment(0, true);
    this.ui.hideLoading();
    this.ui.onWorldOpened();
    if (title) this.showTitle();
    else this.enterPlay();
  }

  closeWorld() {
    if (!this.world) return;
    this.pop?.flush();
    this.chunks?.dispose();
    this.player && this.scene.remove(this.player.mesh);
    this.buddyEntity?.dispose();
    this.props && this.scene.remove(this.props.group);
    this.buildMode && this.scene.remove(this.buildMode.box);
    this.ocean?.dispose();
    this.life?.dispose();
    this.holo && this.scene.remove(this.holo.mesh);
    this.pop && this.scene.remove(this.pop.mesh);
    this.placement && (this.scene.remove(this.placement.holo.mesh), this.scene.remove(this.placement.outline));
    this.interact && (this.scene.remove(this.interact.bobber), this.scene.remove(this.interact.line));
    this.world = null;
  }

  findSpawn() {
    const c = this.world.size / 2;
    for (let r = 0; r < 80; r++) {
      for (let a = 0; a < 16; a++) {
        const x = Math.round(c + Math.cos(a / 16 * Math.PI * 2) * r * 1.5), z = Math.round(c + Math.sin(a / 16 * Math.PI * 2) * r * 1.5);
        const y = this.world.surfaceY(x, z);
        if (y < SEA + 2 || y > SEA + 12) continue;
        let flat = true;
        for (let dz = -3; dz <= 3 && flat; dz++) for (let dx = -3; dx <= 3 && flat; dx++) if (Math.abs(this.world.surfaceY(x + dx, z + dz) - y) > 1) flat = false;
        if (flat) return { x, z };
      }
    }
    return { x: Math.round(c), z: Math.round(c) };
  }

  showTitle() {
    this.mode = 'title';
    this.input.unlock();
    this.player.mesh.visible = false;
    this.ui.showTitle();
  }

  enterPlay() {
    this.mode = 'play';
    this.player.mesh.visible = true;
    this.player.camTarget.copy(this.player.pos);
    this.ui.showHUD();
    const b = this.state.buddy;
    const player = this.state.playerName || 'friend';
    if (!b.met) {
      b.met = true;
      this.brain.interrupt({ kind: 'visit', stage: 'travel', t: 12, text: line('firstMeet', b.personality, { player, buddy: b.name }) });
      this.ui.showHint(true);
    } else if (this.pendingAway) {
      const s = this.pendingAway;
      const letter = awayLetter(this, s);
      this.ui.showAwayLetter(letter, s);
      this.aiLetter?.(letter, s);
      this.brain.interrupt({ kind: 'visit', stage: 'travel', t: 20, text: line('welcomeBack', b.personality, { player, away: formatDuration(s.awayMs) }) });
      if (s.awayMs > 864e5) b.queue.unshift({ type: 'fireworks', why: 'you coming back' });
    } else {
      this.brain.interrupt({ kind: 'visit', stage: 'travel', t: 15, text: line('greet', b.personality, { player }) });
    }
    this.pendingAway = null;
    this.saveNow();
  }

  advanceClock(seconds) {
    const t = this.state.time;
    if (this.state.settings.clock === 'real') {
      const d = new Date();
      t.day = (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
      return;
    }
    const before = t.day;
    t.day += seconds / DAY_SECONDS;
    t.dayCount += Math.floor(t.day) - Math.floor(before);
    t.day = t.day % 1;
  }

  // Weather, season, sounds of the place you're standing in
  updateEnvironment(dt, force = false) {
    this.envT -= dt;
    if (this.envT > 0 && !force) return;
    this.envT = 0.5;
    const st = this.state;
    const season = this.forceSeason || seasonFor(st.settings.season);
    let target = weatherAt(st.seed, st.created, Date.now(), season, st.settings.weather !== false && !st.demo);
    if (this.forceWeather) target = weatherAt(0, 0, 0, season, false), Object.assign(target, FORCED[this.forceWeather] || {}), target.kind = this.forceWeather;
    const k = force ? 1 : 0.25;
    for (const key of ['cloud', 'overcast', 'rain', 'snow', 'fog', 'wind', 'rainbow']) this.weather[key] = lerp(this.weather[key], target[key], k);
    this.weather.kind = target.kind;
    this.season = season;
    const S = SEASONS[season];
    ENV.uGrassTarget.value.setRGB(...S.grass); ENV.uGrassAmt.value = S.grassAmt;
    ENV.uLeafA.value.setRGB(...S.leafA); ENV.uLeafB.value.setRGB(...S.leafB); ENV.uLeafAmt.value = S.leafAmt;
    ENV.uPineAmt.value = S.pine;
    ENV.uSnow.value = Math.min(1, S.snow * 0.85 + this.weather.snow * 0.6);
    ENV.uWet.value = lerp(ENV.uWet.value, this.weather.rain, force ? 1 : 0.1);
    ENV.uWind.value = 0.7 + this.weather.wind * 0.6;
    // soundscape
    if (this.mode === 'play' || this.mode === 'title') {
      const p = this.mode === 'play' ? this.player.pos : this.camera.position;
      let sea = 0, n = 0;
      for (let a = 0; a < 12; a++) for (const r of [6, 14]) {
        const x = p.x + Math.cos(a / 12 * Math.PI * 2) * r, z = p.z + Math.sin(a / 12 * Math.PI * 2) * r;
        n++; if (this.world.surfaceY(x, z) < SEA) sea++;
      }
      let fire = 0;
      const S2 = this.world.size;
      for (const [key] of this.world.lights) {
        const x = key % S2, z = Math.floor(key / S2) % S2, y = Math.floor(key / (S2 * S2));
        const d = Math.hypot(x - p.x, z - p.z, y - p.y);
        if (d < 9 && this.world.get(x, y, z) === B.FIRE) fire = Math.max(fire, 1 - d / 9);
      }
      const night = this.sky.night, w = this.weather;
      this.audio.setEnv({
        ocean: Math.min(1, sea / n * 1.6) * (this.mode === 'title' ? 0.5 : 1), wind: w.wind * (0.4 + Math.max(0, p.y - SEA - 10) / 30),
        rain: w.rain, fire, birds: (1 - night) * (1 - w.rain) * (1 - w.snow * 0.7), crickets: night * (1 - w.rain) * (this.season === 'winter' ? 0.2 : 1),
      });
      this.audio.night = night;
    }
  }

  // ---------- the loop ----------
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.world || this.mode === 'loading' || this.mode === 'boot') {
      this.post.render(dt);
      return;
    }
    this.advanceClock(dt);
    ENV.uTime.value += dt;
    const st = this.state;
    if (this.mode === 'play') {
      this.player.update(dt);
      this.buildMode.update();
      this.placement.update(dt);
      this.interact.update(dt);
    } else if (this.mode === 'title') {
      this.orbitT += dt * 0.03;
      const c = this.world.size / 2;
      const r = this.world.size * 0.42;
      const tx = c + Math.cos(this.orbitT) * r, tz = c + Math.sin(this.orbitT) * r;
      this.camera.position.set(tx, SEA + this.world.size * 0.2 + Math.sin(this.orbitT * 3) * 3, tz);
      this.camera.lookAt(c, SEA + 4, c);
    }
    for (let i = 0; i < this.timeScale; i++) this.brain.update(dt);
    this.buddyEntity.update(Math.min(dt * this.timeScale, 0.2), this.camera);
    this.pop.update(dt);
    this.holo.update(dt, this.mode === 'play' ? 0.85 : 0);
    const focus = this.mode === 'play' ? this.player.pos : { x: this.world.size / 2, y: SEA, z: this.world.size / 2 };
    this.chunks.update(focus.x, focus.z, this.mode === 'play' ? 3 : 6);
    this.updateEnvironment(dt);
    this.sky.update(st.time.day, focus, dt, this.camera, this.weather, this.preset.fog * (this.mode === 'title' ? 1.8 : 1));
    ENV.uNight.value = this.sky.night;
    this.ocean.update(this.camera, this.sky, this.weather);
    this.precip.update(dt, this.camera, this.weather, this.world, this.fx);
    const ctx = { night: this.sky.night, camera: this.camera, player: this.mode === 'play' ? this.player.pos : null, buddyPos: this.buddyEntity.pos, worldCenter: { x: this.world.size / 2, z: this.world.size / 2 }, worldSize: this.world.size, rain: this.weather.rain, focus: this.mode === 'play' ? this.player.pos : this.camera.position, audio: this.audio };
    this.props.update(dt, ctx);
    this.life.update(dt, ctx);
    this.fx.update(dt);
    this.touch.update(dt);
    if (this.debugCam) { this.camera.position.copy(this.debugCam.pos); this.camera.lookAt(this.debugCam.look); }
    this.ui.update(dt);
    this.post.update(this.sky.night, this.weather.overcast);
    this.post.render(dt);
    if (this.wantThumb) { this.wantThumb = false; this.captureThumb(); }
    if (this.wantPhoto) { this.wantPhoto = false; this.capturePhoto(); }

    // plants grow, animals follow the buildings
    this.growT -= dt;
    if (this.growT <= 0) { this.growT = 10; if (updateGrowth(this, Date.now(), true)) this.ui.mapDirty = true; }
    const ck = st.projects.filter((p) => p.done).length + ':' + this.life.level;
    if (ck !== this.critterKey) { this.critterKey = ck; this.life.syncCritters(st.projects); }

    // save every 15 real seconds (not game seconds, so slow computers save just as often)
    const nowMs = performance.now();
    if (!this.lastSaveMs) this.lastSaveMs = nowMs;
    if (nowMs - this.lastSaveMs > 15000) { this.lastSaveMs = nowMs; this.saveNow(); }
    this.watchPerf(dt);
  }

  // If things are slow for a while, offer the faster graphics setting once
  watchPerf(dt) {
    const p = this.perf;
    if (this.mode !== 'play' || p.warned || this.settings.graphics === 'fast') return;
    p.t += dt; p.frames++;
    if (p.t >= 5) {
      const fps = p.frames / p.t;
      p.slow = fps < 24 ? p.slow + 1 : 0;
      p.t = 0; p.frames = 0;
      if (p.slow >= 3) { p.warned = true; this.ui.suggestFaster(); }
    }
  }

  captureThumb() {
    try {
      const c = document.createElement('canvas');
      c.width = 240; c.height = 135;
      this.post.render(0);
      const src = this.renderer.domElement;
      const ar = src.width / src.height;
      let sw = src.width, sh = src.height;
      if (ar > 16 / 9) sw = sh * 16 / 9; else sh = sw * 9 / 16;
      c.getContext('2d').drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, 240, 135);
      this.state.thumb = c.toDataURL('image/jpeg', 0.72);
    } catch (_) { /* ignore */ }
  }

  // ---------- photo mode ----------
  togglePhotoMode(on = !this.photoMode) {
    this.photoMode = on;
    this.ui.setPhotoMode(on);
  }

  capturePhoto() {
    try {
      this.post.render(0);
      const src = this.renderer.domElement;
      const maxW = 1600;
      const k = Math.min(1, maxW / src.width);
      const c = document.createElement('canvas');
      c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      const t = document.createElement('canvas');
      t.width = 320; t.height = Math.round(320 * c.height / c.width);
      t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
      const photo = { id: 'ph' + Date.now().toString(36), worldId: this.state.id, t: Date.now(), data: c.toDataURL('image/jpeg', 0.88), thumb: t.toDataURL('image/jpeg', 0.75), w: c.width, h: c.height };
      store.savePhoto(photo).catch((e) => console.warn(e));
      this.audio.shutter();
      this.ui.photoTaken(photo);
      if (this.brain.playerNear(14)) { this.buddyEntity.emote('happy', 2); if (Math.random() < 0.5) this.brain.say(this.state.buddy.personality === 'goofy' ? 'Did you get my good side?' : 'Ooh, a photo! Did I blink?'); }
    } catch (e) { console.warn('photo failed', e); this.ui.toast("Couldn't take the photo."); }
  }

  async saveNow(sync = false) {
    const st = this.state;
    if (!st || st.demo || !this.world || this.mode === 'loading') return;
    this.pop?.flush();
    this.brain.serialize();
    if (this.mode === 'play') st.player = { ...this.player.serialize(), shirt: st.player.shirt };
    const e = this.buddyEntity.pos;
    st.buddy.pos = { x: e.x, y: e.y, z: e.z };
    // keep boats where you left them
    if (this.props.riding) {
      const pr = this.props.get(this.props.riding), obj = this.props.obj(this.props.riding);
      if (pr && obj && pr.type === 'boat') { pr.bx = obj.position.x; pr.bz = obj.position.z; pr.byaw = obj.rotation.y; }
    }
    st.edits = this.world.packEdits();
    st.lastSeen = Date.now();
    store.markSeen(st.id);
    if (!sync && !this.photoMode) this.wantThumb = true;
    try { await store.saveWorld(st); } catch (err) { console.warn('save failed', err); }
  }

  onVisibility() {
    if (document.hidden) {
      this.hiddenAt = Date.now();
      this.saveNow(true);
      return;
    }
    if (!this.hiddenAt || !this.state || this.state.demo) return;
    const away = Date.now() - this.hiddenAt;
    this.hiddenAt = 0;
    if (away < 90e3) return;
    this.pop.flush();
    this.state.lastSeen = Date.now() - away;
    const summary = catchUp(this, away);
    this.advanceClock(away / 1000);
    this.state.lastSeen = Date.now();
    this.props.load();
    if (summary && summary.results.length && this.mode === 'play') {
      this.ui.showAwayLetter(awayLetter(this, summary), summary);
      this.brain.interrupt({ kind: 'visit', stage: 'travel', t: 20, text: line('welcomeBack', this.state.buddy.personality, { player: this.state.playerName || 'friend', away: formatDuration(away) }) });
    }
    this.ui.refreshJournal();
  }

  // ---------- input ----------
  onKey(e) {
    if (this.mode !== 'play') return;
    if (this.ui.modalOpen()) { if (e.code === 'Escape') this.ui.closeModal(); return; }
    if (this.ui.buddyMenuOpen()) { if (this.ui.buddyMenuKey(e)) return; }
    if (this.photoMode) {
      if (e.code === 'KeyC' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.wantPhoto = true; }
      if (e.code === 'Escape') this.togglePhotoMode(false);
      return;
    }
    if (this.placement.active) {
      if (e.code === 'KeyR') { this.placement.rotate(); return; }
      if (e.code === 'Escape') { this.placement.cancel(); return; }
      if (e.code === 'Enter') { this.placement.confirm(); return; }
    }
    if (this.interact.scope && (e.code === 'Escape' || e.code === 'KeyE')) { this.interact.stopScope(); return; }
    switch (e.code) {
      case 'Enter': case 'KeyT': e.preventDefault(); this.ui.openChat(); break;
      case 'Slash': e.preventDefault(); this.ui.openChat('/'); break;
      case 'KeyE': if (!this.buildMode.active) this.interact.press(); else this.buildMode.select(this.buildMode.slot + 1); break;
      case 'KeyJ': this.ui.togglePanel('journal'); break;
      case 'KeyG': this.ui.togglePanel('collection'); break;
      case 'KeyM': this.ui.togglePanel('map'); break;
      case 'KeyP': this.ui.togglePanel('plans'); break;
      case 'KeyI': this.ui.togglePanel('buddy'); break;
      case 'KeyH': this.ui.togglePanel('help'); break;
      case 'KeyB': this.buildMode.toggle(); break;
      case 'KeyC': this.togglePhotoMode(true); break;
      case 'KeyV': this.player.toggleFirstPerson(); break;
      case 'KeyF': this.toggleFollow(); break;
      case 'Escape':
        if (this.interact.fish) { this.interact.stopFishing(); break; }
        if (this.ui.panelOpen()) this.ui.closePanel(); else if (!this.input.locked) this.ui.togglePanel('settings');
        break;
      default:
        if (this.buildMode.active && /^Digit[1-9]$/.test(e.code)) this.buildMode.select(Number(e.code.slice(5)) - 1 + this.ui.hotbarPage * 9);
        if (this.buildMode.active && e.code === 'KeyQ') this.buildMode.select(this.buildMode.slot - 1);
    }
  }

  toggleFollow() {
    const brain = this.brain;
    brain.mode = brain.mode === 'follow' ? 'auto' : 'follow';
    if (brain.mode === 'follow' && brain.job?.kind === 'sleep') brain.wake();
    brain.say(line(brain.mode === 'follow' ? 'follow' : 'release', this.state.buddy.personality));
  }

  onClick(btn, e, unlocked) {
    if (this.mode !== 'play') return;
    if (this.photoMode) { if (btn === 0) this.wantPhoto = true; return; }
    if (this.placement.active) {
      if (btn === 0) this.placement.confirm();
      else if (btn === 2) this.placement.cancel();
      return;
    }
    // clicking a painting, sign or present opens it
    const ray = new THREE.Raycaster();
    if (this.input.locked) ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    else ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), this.camera);
    ray.far = 14 + this.player.camDist;
    const hits = ray.intersectObjects(this.props.pickTargets(), false);
    if (hits.length && btn === 0 && !this.buildMode.active) {
      const id = hits[0].object.userData.propId;
      const p = this.state.props.find((q) => q.id === id);
      if (p) {
        this.input.unlock();
        if (p.type === 'gift') this.openGift(p.id);
        else if (p.type === 'telescope') this.interact.startScope(p.id);
        else this.ui.openProp(p);
        return;
      }
    }
    if (this.buildMode.active) {
      if (btn === 0) this.buildMode.remove();
      else if (btn === 2) this.buildMode.place();
      return;
    }
    if (unlocked) this.input.lock();
  }

  onPlayerBuild(x, y, z, id, removed) {
    removed ? this.audio.playerBreak() : this.audio.playerPlace();
    if (!removed) this.fx.spawn(x + 0.5, y + 0.5, z + 0.5, 0xffffff, 4, { size: 0.08, life: 0.4 });
    else this.fx.spawn(x + 0.5, y + 0.5, z + 0.5, BLOCKS[id].shape === 'cube' ? BLOCKS[id].side : 0xaaaaaa, 8, { size: 0.12, life: 0.6 });
    const b = this.state.buddy;
    b.playerBlocks = (b.playerBlocks || 0) + 1;
    this.recentBuild = (this.recentBuild || 0) + 1;
    clearTimeout(this.recentBuildT);
    this.recentBuildT = setTimeout(() => {
      if (this.recentBuild >= 12) {
        if (this.brain.playerNear(30)) this.brain.say(line('playerBuilding', b.personality, { player: this.state.playerName }));
        this.brain.journal('player', `${this.state.playerName || 'My friend'} was building something near (${x}, ${z}). I'll leave it be.`);
      }
      this.recentBuild = 0;
    }, 8000);
  }

  // ---------- things you can do ----------
  startRide(kind, propId) {
    const p = this.player;
    const seat = this.props.seat(propId);
    if (!seat) return;
    if (this.interact.fish) this.interact.stopFishing();
    this.brain.standUp();
    this.rideCam = { dist: p.camDist, pitch: p.pitch };
    p.mount(kind, seat, propId);
    this.props.riding = propId;
    if (kind === 'ferris') {
      seat.updateMatrixWorld(true);
      const obj = this.props.obj(propId);
      p.yaw = obj.rotation.y + Math.PI; p.pitch = -0.12; p.camDist = 0;
    }
    if (kind === 'boat') {
      const obj = this.props.obj(propId);
      p.riding.boatGroup = obj;
      p.riding.onWake = (x, z) => this.fx.splash(x, WATER_Y, z, 2, 0.4);
      p.yaw = obj.rotation.y + Math.PI;
    }
    if (kind === 'balloon') { this.props.resetRide(propId); p.pitch = -0.35; p.camDist = 10; }
    const lines = { ferris: 'ferrisRide', balloon: 'balloonRide', boat: 'boatRide' };
    if (this.brain.playerNear(25)) { this.brain.say(line(lines[kind], this.state.buddy.personality)); this.buddyEntity.emote('excited', 2); }
    this.ui.toast(kind === 'boat' ? 'Row with W A S D. Get out near the shore with E.' : kind === 'balloon' ? 'Sit back and enjoy the tour. It lands by itself.' : 'Press E to get off.');
    this.brain.befriend(0.2);
  }

  onRideEnd(kind) {
    if (this.rideCam) { this.player.camDist = this.rideCam.dist < 0.5 ? 7 : this.rideCam.dist; this.player.pitch = this.rideCam.pitch; this.rideCam = null; }
    if (kind === 'balloon') this.brain.journal('ride', `${this.state.playerName || 'My friend'} took the balloon all the way around the island.`);
  }

  sleepInBed(t) {
    const p = this.player;
    if (this.state.settings.clock === 'real') { this.ui.toast('Day and night follow your real clock, so you can only rest here, not skip the night.'); }
    p.sit({ x: t.x + 0.5, y: t.y + 0.55, z: t.z + 0.5, yaw: p.facing });
    p.lying = true;
    if (this.state.settings.clock === 'real') return;
    const night = this.sky.night > 0.5;
    this.ui.fadeTo(1, 900, () => {
      const day = this.state.time.day;
      if (night) this.state.time.day = 0.29; else this.state.time.day = (day + 1 / 12) % 1;
      if (night && day > 0.5) this.state.time.dayCount++;
      p.stand();
      this.brain.mood(3, 10);
      this.ui.fadeTo(0, 1200);
      this.ui.toast(night ? 'Good morning!' : 'You took a little nap.');
      if (night && this.brain.playerNear(40)) setTimeout(() => this.brain.say(line('wake', this.state.buddy.personality)), 1400);
    });
  }

  openGift(id) {
    const pr = this.props.get(id);
    if (!pr) return;
    const item = { ...(pr.item || { kind: 'shell', title: 'A shell', desc: 'A pretty shell.' }), id: 'k' + this.state.nextId++, t: Date.now(), from: this.state.buddy.name };
    this.state.keepsakes.push(item);
    const obj = this.props.obj(id);
    if (obj) { this.fx.sparkle(obj.position.x, obj.position.y + 0.6, obj.position.z, 0xffe8a0, 16, 0.8); this.fx.hearts(obj.position.x, obj.position.y + 0.8, obj.position.z, 4); }
    this.props.remove(id);
    this.audio.gift();
    this.ui.showGift(item);
    this.brain.befriend(2, 'They loved the present.');
    this.brain.mood(8);
    if (this.brain.playerNear(30)) this.brain.say(line('giftThanks', this.state.buddy.personality));
    this.brain.journal('gift', `${this.state.playerName || 'My friend'} opened my present: ${item.title.toLowerCase()}.`);
  }

  visitProject(p) {
    if (this.player.riding) return;
    this.player.stand();
    this.brain.standUp();
    const e = p.entrance || { x: p.x0 + p.w / 2, z: p.z0 + p.d / 2 };
    const x = e.x + 0.5, z = e.z + 0.5;
    const g = this.world.groundY(x, z);
    this.player.teleport(x, Math.max(g, SEA) + 1.05, z);
    const cx = p.x0 + p.w / 2, cz = p.z0 + p.d / 2;
    this.player.yaw = Math.atan2(-(cx - x), -(cz - z));
    this.player.facing = this.player.yaw + Math.PI;
    this.player.pitch = -0.15;
    this.ui.closePanel();
  }

  removeProject(p, { by = 'player', when = Date.now() } = {}) {
    const pad = 1;
    this.pop.flush();
    this.world.revertBox(p.x0 - pad, p.z0 - pad, p.x0 + p.w - 1 + pad, p.z0 + p.d - 1 + pad);
    const removedProps = this.state.props.filter((q) => q.x >= p.x0 - pad && q.x <= p.x0 + p.w - 1 + pad && q.z >= p.z0 - pad && q.z <= p.z0 + p.d - 1 + pad && q.type !== 'gift');
    for (const q of removedProps) {
      if (q.artId) { const a = this.state.artworks.find((x) => x.id === q.artId); if (a) { a.hung = false; a.where = null; } }
      this.props.remove(q.id);
    }
    this.state.growables = (this.state.growables || []).filter((g) => !(g.x >= p.x0 - pad && g.x <= p.x0 + p.w - 1 + pad && g.z >= p.z0 - pad && g.z <= p.z0 + p.d - 1 + pad));
    this.state.projects = this.state.projects.filter((q) => q.id !== p.id);
    if (this.brain.job && this.brain.job.projectId === p.id && this.brain.job.kind === 'build') { this.brain.job = null; this.holo.clear(); }
    this.brain.claims.rebuild(this.state.projects);
    if (p.type === 'cottage' && p.variant === 'home') this.state.buddy.milestones.home = false;
    if (p.type === 'cottage' && p.variant === 'player') this.state.buddy.milestones.playerHouse = false;
    if (by === 'player') {
      this.brain.journal('removed', `${this.state.playerName || 'My friend'} asked me to take down ${p.title}. That's okay, I'll build something else.`, {}, when);
      this.brain.mood(-6);
      this.saveNow();
    } else {
      this.brain.journal('removed', `Took down ${p.title} to make room for something new.`, {}, when);
    }
    this.ui.mapDirty = true;
  }

  onWorldChanged() { this.ui.mapDirty = true; }

  // ---------- optional AI extras ----------
  aiJournal(entry) {
    if (!this.settings.aiExtras || !aiEnabled(this.settings.ai)) return;
    aiRewriteJournal(this, entry).then((t) => { if (t) { entry.text = t; entry.ai = true; this.ui.refreshJournal(); } }).catch(() => {});
  }
  aiIdea(idea) {
    if (!this.settings.aiExtras || !aiEnabled(this.settings.ai)) return;
    aiIdeaReason(this, idea).then((t) => { if (t) { idea.reason = t; this.ui.refreshPlans?.(); } }).catch(() => {});
  }

  applySettings() {
    store.saveSettings(this.settings);
    const pr = PRESETS[this.settings.graphics] || PRESETS.balanced;
    const changedRes = pr !== this.preset;
    this.preset = pr;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, pr.pixelRatio));
    this.renderer.shadowMap.enabled = pr.shadows;
    this.chunks?.setShadows(pr.shadows);
    this.sky.sun.castShadow = pr.shadows;
    if (this.sky.sun.shadow.mapSize.x !== pr.shadowSize) {
      this.sky.sun.shadow.mapSize.set(pr.shadowSize, pr.shadowSize);
      this.sky.sun.shadow.map?.dispose(); this.sky.sun.shadow.map = null;
    }
    this.post.enabled = pr.bloom;
    if (this.life) this.life.level = pr.life;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    this.audio.setVolumes(this.settings.music, this.settings.sfx, this.settings.ambience);
    this.input.sensitivity = this.settings.sensitivity;
    this.input.invertY = this.settings.invertY;
    if (changedRes) this.resize();
    this.ui.applyHudSettings?.();
  }

  // ---------- worlds ----------
  async createWorld(opts) {
    const rec = newWorldRecord(opts);
    await store.saveWorld(rec).catch(() => {});
    await this.open(rec, { title: false });
  }

  async playWorld(id) {
    if (this.state && this.state.id === id && !this.state.demo) { this.enterPlay(); return; }
    await this.saveNow();
    const rec = await store.loadWorld(id);
    if (rec) await this.open(rec, { title: false });
  }

  async quitToTitle() {
    if (this.player.riding) { this.props.riding = null; this.player.dismount(); }
    this.player.stand();
    this.interact.stopFishing();
    this.interact.stopScope();
    this.placement.cancel();
    await this.saveNow();
    this.buildMode.toggle(false);
    this.ui.closePanel();
    this.showTitle();
  }
}

window.game = new Game();

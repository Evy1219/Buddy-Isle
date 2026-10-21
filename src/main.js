import * as THREE from 'three';
import { World } from './world/world.js';
import { ChunkRenderer } from './world/chunks.js';
import { Sky } from './world/sky.js';
import { Props } from './world/props.js';
import { FX } from './world/fx.js';
import { SEA } from './world/terrain.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { RNG, hashString } from './core/rng.js';
import * as store from './core/storage.js';
import { Player } from './player/player.js';
import { BuildMode } from './player/build.js';
import { Touch } from './player/touch.js';
import { BuddyEntity } from './buddy/entity.js';
import { Brain } from './buddy/brain.js';
import { catchUp, awayLetter } from './buddy/offline.js';
import { line } from './buddy/voice.js';
import { AI_DEFAULTS } from './buddy/llm.js';
import { UI } from './ui/ui.js';
import { formatDuration } from './core/util.js';

const DAY_SECONDS = 24 * 60; // one in-game day = 24 real minutes
const DEFAULT_SETTINGS = { music: 0.45, sfx: 0.6, shadows: true, sensitivity: 1, invertY: false, quality: 'auto', ai: { ...AI_DEFAULTS } };

export function newWorldRecord(o) {
  const seed = o.seed ? (/^\d+$/.test(String(o.seed).trim()) ? Number(o.seed) >>> 0 : hashString(String(o.seed))) : (Math.random() * 2 ** 31) >>> 0;
  const rng = new RNG(seed ^ 0x5eed);
  const traits = { cozy: rng.float(), grand: rng.float(), nature: rng.float(), artsy: rng.float() };
  const bias = { cheerful: 'cozy', chill: 'nature', dreamy: 'artsy', goofy: 'grand' }[o.personality];
  if (bias) traits[bias] = Math.min(1, traits[bias] + 0.4);
  const now = Date.now();
  return {
    id: 'w' + now.toString(36) + Math.floor(Math.random() * 1e6).toString(36),
    version: 1, name: o.name || 'My Island', seed, size: 256, created: now, lastSeen: now,
    islets: [], edits: new Uint8Array(0), playerName: o.playerName || '',
    player: { x: null, y: null, z: null, yaw: 0.6, pitch: -0.25, shirt: o.shirt ?? 0x3fa7a0 },
    spawn: null,
    buddy: {
      name: o.buddyName || 'Pip', color: o.buddyColor ?? 0xffc65a, personality: o.personality || 'cheerful', traits,
      stats: { blocks: 0, builds: 0, paintings: 0, trees: 0, chats: 0, paths: 0 }, milestones: {}, requests: [], queue: [],
      facts: [], likes: {}, friendship: 0, job: null, paused: null, pos: null, met: false,
    },
    projects: [], props: [], artworks: [], journal: [], chatLog: [],
    time: { day: 0.32, dayCount: 0 }, settings: { pace: o.pace || 'normal', clock: 'game' }, thumb: null, nextId: 1,
  };
}

class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    this.settings = store.loadSettings(DEFAULT_SETTINGS);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.settings.quality === 'low' ? 1 : 1.75));
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 900);
    this.sky = new Sky(this.scene, this.renderer);
    this.fx = new FX(this.scene);
    this.input = new Input(this.canvas);
    this.input.sensitivity = this.settings.sensitivity;
    this.input.invertY = this.settings.invertY;
    this.audio = new Audio();
    this.audio.setVolumes(this.settings.music, this.settings.sfx);
    this.ui = new UI(this);
    this.touch = new Touch(this);
    this.mode = 'boot';
    this.state = null;
    this.clock = new THREE.Clock();
    this.saveT = 0;
    this.orbitT = 0;
    this.buildMode = null;
    // add ?fast to the URL to watch the buddy work 8x faster
    this.timeScale = new URLSearchParams(location.search).has('fast') ? 8 : 1;

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
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
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
    rec.lastSeen = Date.now() - 12 * 3600e3;
    rec.settings.pace = 'busy';
    await this.open(rec, { title: true, demoActivities: 26 });
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
    rec.buddy.requests ||= []; rec.buddy.queue ||= []; rec.buddy.facts ||= []; rec.buddy.likes ||= {};
    rec.buddy.milestones ||= {}; rec.islets ||= []; rec.chatLog ||= []; rec.props ||= []; rec.settings ||= { pace: 'normal', clock: 'game' };
    this.state = rec;

    this.world = new World({ seed: rec.seed, size: rec.size, islets: rec.islets });
    this.world.loadEdits(rec.edits);
    this.world.onChange = (x, y, z, id, before) => this.ui.mapDirty = true;
    if (!rec.spawn) rec.spawn = this.findSpawn();
    if (rec.player.x == null) {
      const g = this.world.groundY(rec.spawn.x, rec.spawn.z);
      Object.assign(rec.player, { x: rec.spawn.x + 0.5, y: g + 1, z: rec.spawn.z + 0.5 });
    }
    this.props = new Props(this.scene, rec);
    this.player = new Player(this.scene, this.camera, this.world, this.input, rec.player);
    this.buddyEntity = new BuddyEntity(this.scene, this.world, rec.buddy.color);
    const bp = rec.buddy.pos || { x: rec.spawn.x + 2.5, y: this.world.groundY(rec.spawn.x + 2, rec.spawn.z) + 1.4, z: rec.spawn.z + 1.5 };
    this.buddyEntity.place(bp.x, bp.y, bp.z);
    this.brain = new Brain(this);
    this.buildMode = new BuildMode(this);

    // catch up on the time we were away
    const now = Date.now();
    const away = now - rec.lastSeen;
    let summary = null;
    if (demoActivities) {
      const old = rec.settings.pace;
      rec.settings.pace = 'busy';
      summary = catchUp(this, demoActivities * 8 * 60e3);
      rec.settings.pace = old;
    } else {
      summary = catchUp(this, away);
    }
    this.advanceClock(away / 1000);
    rec.lastSeen = now;
    this.props.load();

    this.chunks = new ChunkRenderer(this.scene, this.world, this.settings.shadows);
    await this.chunks.buildAll((p) => this.ui.showLoading('Growing the island…', 0.05 + p * 0.95));
    this.pendingAway = summary && summary.results.length && !rec.demo ? summary : (summary && !rec.demo && away > 10 * 60e3 ? summary : null);
    this.pendingAwayMs = away;
    this.ui.hideLoading();
    this.ui.onWorldOpened();
    if (title) this.showTitle();
    else this.enterPlay();
  }

  closeWorld() {
    if (!this.world) return;
    this.chunks?.dispose();
    this.player && this.scene.remove(this.player.mesh);
    this.buddyEntity?.dispose();
    this.props && this.scene.remove(this.props.group);
    this.buildMode && this.scene.remove(this.buildMode.box);
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
    if (!b.met) {
      b.met = true;
      this.brain.interrupt({ kind: 'visit', stage: 'travel', t: 12, text: line('firstMeet', b.personality, { player: this.state.playerName || 'friend', buddy: b.name }) });
      this.ui.showHint(true);
    } else if (this.pendingAway) {
      const letter = awayLetter(this, this.pendingAway);
      this.ui.showAwayLetter(letter, this.pendingAway);
      this.brain.interrupt({ kind: 'visit', stage: 'travel', t: 20, text: line('welcomeBack', b.personality, { player: this.state.playerName || 'friend', away: formatAway(this.pendingAway.awayMs) }) });
    } else {
      this.brain.interrupt({ kind: 'visit', stage: 'travel', t: 15, text: line('greet', b.personality, { player: this.state.playerName || 'friend' }) });
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

  // ---------- the loop ----------
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.world || this.mode === 'loading' || this.mode === 'boot') {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.advanceClock(dt);
    const st = this.state;
    if (this.mode === 'play') {
      this.player.update(dt);
      this.buildMode.update();
    } else if (this.mode === 'title') {
      this.orbitT += dt * 0.035;
      const c = this.world.size / 2;
      const r = this.world.size * 0.42;
      const tx = c + Math.cos(this.orbitT) * r, tz = c + Math.sin(this.orbitT) * r;
      this.camera.position.set(tx, SEA + this.world.size * 0.21, tz);
      this.camera.lookAt(c, SEA + 4, c);
    }
    const sdt = dt * this.timeScale;
    for (let i = 0; i < this.timeScale; i++) this.brain.update(dt);
    this.buddyEntity.update(Math.min(sdt, 0.2), this.camera);
    const focus = this.mode === 'play' ? this.player.pos : { x: this.world.size / 2, y: SEA, z: this.world.size / 2 };
    this.chunks.update(focus.x, focus.z, this.mode === 'play' ? 3 : 6);
    this.sky.update(st.time.day, focus, dt, this.camera);
    this.audio.night = this.sky.night;
    this.props.update(dt, this.sky.night);
    this.fx.update(dt);
    this.touch.update(dt);
    this.ui.update(dt);
    this.renderer.render(this.scene, this.camera);
    if (this.wantThumb) { this.wantThumb = false; this.captureThumb(); }

    this.saveT += dt;
    if (this.saveT > 15) { this.saveT = 0; this.saveNow(); }
  }

  captureThumb() {
    try {
      const c = document.createElement('canvas');
      c.width = 240; c.height = 135;
      const src = this.renderer.domElement;
      const ar = src.width / src.height;
      let sw = src.width, sh = src.height;
      if (ar > 16 / 9) sw = sh * 16 / 9; else sh = sw * 9 / 16;
      c.getContext('2d').drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, 240, 135);
      this.state.thumb = c.toDataURL('image/jpeg', 0.72);
    } catch (_) { /* ignore */ }
  }

  async saveNow(sync = false) {
    const st = this.state;
    if (!st || st.demo || !this.world || this.mode === 'loading') return;
    this.brain.serialize();
    if (this.mode === 'play') st.player = { ...this.player.serialize(), shirt: st.player.shirt };
    const e = this.buddyEntity.pos;
    st.buddy.pos = { x: e.x, y: e.y, z: e.z };
    st.edits = this.world.packEdits();
    st.lastSeen = Date.now();
    store.markSeen(st.id);
    if (!sync) this.wantThumb = true;
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
    this.state.lastSeen = Date.now() - away;
    const summary = catchUp(this, away);
    this.advanceClock(away / 1000);
    this.state.lastSeen = Date.now();
    this.props.load();
    if (summary && summary.results.length && this.mode === 'play') {
      this.ui.showAwayLetter(awayLetter(this, summary), summary);
      this.brain.interrupt({ kind: 'visit', stage: 'travel', t: 20, text: line('welcomeBack', this.state.buddy.personality, { player: this.state.playerName || 'friend', away: formatAway(away) }) });
    }
    this.ui.refreshJournal();
  }

  // ---------- input ----------
  onKey(e) {
    if (this.mode !== 'play') return;
    if (this.ui.modalOpen()) { if (e.code === 'Escape') this.ui.closeModal(); return; }
    switch (e.code) {
      case 'Enter': case 'KeyT': e.preventDefault(); this.ui.openChat(); break;
      case 'Slash': e.preventDefault(); this.ui.openChat('/'); break;
      case 'KeyJ': this.ui.togglePanel('journal'); break;
      case 'KeyG': this.ui.togglePanel('gallery'); break;
      case 'KeyM': this.ui.togglePanel('map'); break;
      case 'KeyH': this.ui.togglePanel('help'); break;
      case 'KeyB': this.buildMode.toggle(); break;
      case 'KeyV': this.player.toggleFirstPerson(); break;
      case 'KeyF': this.brain.mode = this.brain.mode === 'follow' ? 'auto' : 'follow'; this.brain.say(line(this.brain.mode === 'follow' ? 'follow' : 'release', this.state.buddy.personality)); break;
      case 'Escape': if (this.ui.panelOpen()) this.ui.closePanel(); else if (!this.input.locked) this.ui.togglePanel('settings'); break;
      default:
        if (this.buildMode.active && /^Digit[1-9]$/.test(e.code)) this.buildMode.select(Number(e.code.slice(5)) - 1 + this.ui.hotbarPage * 9);
        if (this.buildMode.active && e.code === 'KeyQ') this.buildMode.select(this.buildMode.slot - 1);
        if (this.buildMode.active && e.code === 'KeyE') this.buildMode.select(this.buildMode.slot + 1);
    }
  }

  onClick(btn, e, unlocked) {
    if (this.mode !== 'play') return;
    // clicking a painting or sign opens it
    const ray = new THREE.Raycaster();
    if (this.input.locked) ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    else ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), this.camera);
    ray.far = 14 + this.player.camDist;
    const hits = ray.intersectObjects(this.props.pickTargets(), false);
    if (hits.length && btn === 0 && !this.buildMode.active) {
      const id = hits[0].object.userData.propId;
      const p = this.state.props.find((q) => q.id === id);
      if (p) { this.input.unlock(); this.ui.openProp(p); return; }
    }
    if (this.buildMode.active) {
      if (btn === 0) { this.buildMode.remove(); }
      else if (btn === 2) { this.buildMode.place(); }
      return;
    }
    if (unlocked) this.input.lock();
  }

  onPlayerBuild(x, y, z, id, removed) {
    removed ? this.audio.playerBreak() : this.audio.playerPlace();
    if (!removed) this.fx.spawn(x + 0.5, y + 0.5, z + 0.5, 0xffffff, 4, { size: 0.08, life: 0.4 });
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

  visitProject(p) {
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
    this.world.revertBox(p.x0 - pad, p.z0 - pad, p.x0 + p.w - 1 + pad, p.z0 + p.d - 1 + pad);
    const removedProps = this.state.props.filter((q) => q.x >= p.x0 - pad && q.x <= p.x0 + p.w - 1 + pad && q.z >= p.z0 - pad && q.z <= p.z0 + p.d - 1 + pad);
    for (const q of removedProps) {
      if (q.artId) { const a = this.state.artworks.find((x) => x.id === q.artId); if (a) { a.hung = false; a.where = null; } }
      this.props.remove(q.id);
    }
    this.state.projects = this.state.projects.filter((q) => q.id !== p.id);
    if (this.brain.job && this.brain.job.projectId === p.id && this.brain.job.kind === 'build') this.brain.job = null;
    this.brain.claims.rebuild(this.state.projects);
    if (p.type === 'cottage' && p.variant === 'home') this.state.buddy.milestones.home = false;
    if (p.type === 'cottage' && p.variant === 'player') this.state.buddy.milestones.playerHouse = false;
    if (by === 'player') {
      this.brain.journal('removed', `${this.state.playerName || 'My friend'} asked me to take down ${p.title}. That's okay, I'll build something else.`, {}, when);
      this.saveNow();
    } else {
      this.brain.journal('removed', `Took down ${p.title} to make room for something new.`, {}, when);
    }
    this.ui.mapDirty = true;
  }

  onWorldChanged() { this.ui.mapDirty = true; }

  applySettings() {
    store.saveSettings(this.settings);
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.chunks?.setShadows(this.settings.shadows);
    this.sky.sun.castShadow = this.settings.shadows;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    this.audio.setVolumes(this.settings.music, this.settings.sfx);
    this.input.sensitivity = this.settings.sensitivity;
    this.input.invertY = this.settings.invertY;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.settings.quality === 'low' ? 1 : 1.75));
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
    await this.saveNow();
    this.buildMode.toggle(false);
    this.ui.closePanel();
    this.showTitle();
  }
}

const formatAway = (ms) => formatDuration(ms);

window.game = new Game();

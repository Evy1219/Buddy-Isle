// All sound is generated live with WebAudio: soft music, an ambient soundscape
// (waves, wind, rain, birds, crickets, crackling fires) and little effects. No audio files.
import { B } from '../world/blocks.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PENTA = [0, 2, 4, 7, 9];
const PROGS = [
  [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]],
  [[0, 4, 7, 14], [5, 9, 12, 16], [9, 12, 16, 19], [7, 11, 14, 19]],
  [[2, 5, 9, 12], [7, 11, 14, 17], [0, 4, 7, 11], [0, 4, 7, 11]],
];
const TUNE = [72, 74, 76, 79, 76, 74, 72, 67, 69, 72, 74, 72, 69, 67, 72, null, 76, 79, 81, 79, 76, 74, 76, 72];

export class Audio {
  constructor() {
    this.ctx = null;
    this.music = 0.5; this.sfx = 0.6; this.amb = 0.6;
    this.night = 0;
    this.prog = 0; this.chordI = 0;
    this.nextNote = 0; this.nextChord = 0;
    this.lastPlace = 0;
    this.env = { ocean: 0.5, wind: 0.5, rain: 0, fire: 0, birds: 0.5, crickets: 0, underwater: 0 };
    this.tune = null;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9;
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 3;
    this.master.connect(this.comp); this.comp.connect(c.destination);
    this.musicGain = c.createGain(); this.musicGain.connect(this.master);
    this.sfxGain = c.createGain(); this.sfxGain.connect(this.master);
    this.ambGain = c.createGain(); this.ambGain.connect(this.master);
    this.setVolumes(this.music, this.sfx, this.amb);
    // echo for music
    this.delay = c.createDelay(1.5); this.delay.delayTime.value = 0.42;
    const fb = c.createGain(); fb.gain.value = 0.33;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    this.delay.connect(lp); lp.connect(fb); fb.connect(this.delay); lp.connect(this.musicGain);
    // noise for ambience
    const len = c.sampleRate * 3;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
    this.noiseBuf = buf;
    const layer = (type, freq, q) => {
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = 0.7 + Math.random() * 0.6;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.ambGain); src.start();
      return { f, g };
    };
    this.ocean = layer('lowpass', 520, 0.5);
    this.wind = layer('bandpass', 700, 0.7);
    this.rain = layer('highpass', 1800, 0.3);
    this.rainLow = layer('lowpass', 900, 0.4);
    this.timer = setInterval(() => this.tick(), 100);
  }

  setVolumes(music, sfx, amb = this.amb) {
    this.music = music; this.sfx = sfx; this.amb = amb;
    if (!this.ctx) return;
    this.musicGain.gain.value = music * 0.33;
    this.sfxGain.gain.value = sfx * 0.55;
    this.ambGain.gain.value = amb * 0.5;
  }

  setEnv(e) { Object.assign(this.env, e); }

  tick() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const now = c.currentTime, e = this.env;
    // ambience
    const swell = 0.6 + 0.4 * Math.sin(now * 0.45) * Math.sin(now * 0.17 + 1);
    const setG = (l, v) => l.g.gain.setTargetAtTime(v, now, 0.6);
    setG(this.ocean, e.ocean * 0.55 * swell);
    this.ocean.f.frequency.setTargetAtTime(360 + swell * 380, now, 0.5);
    setG(this.wind, e.wind * (0.06 + 0.05 * Math.sin(now * 0.3)));
    this.wind.f.frequency.setTargetAtTime(500 + 300 * Math.sin(now * 0.21), now, 0.8);
    setG(this.rain, e.rain * 0.22);
    setG(this.rainLow, e.rain * 0.3);
    if (e.birds > 0.1 && Math.random() < 0.012 * e.birds) this.bird();
    if (e.crickets > 0.1 && Math.random() < 0.05 * e.crickets) this.cricket();
    if (e.fire > 0.05 && Math.random() < 0.25 * e.fire) this.crackle(e.fire);
    if (e.rain > 0.6 && Math.random() < 0.0015) this.thunder();
    // music
    if (this.music <= 0) return;
    const root = 60 - (this.night > 0.5 ? 3 : 0);
    if (now >= this.nextChord) {
      if (this.chordI === 3 && Math.random() < 0.3) this.prog = Math.floor(Math.random() * PROGS.length);
      this.chordI = (this.chordI + 1) % 4;
      for (const n of PROGS[this.prog][this.chordI]) this.pad(mtof(root - 12 + n), now, 9);
      this.pad(mtof(root - 24 + PROGS[this.prog][this.chordI][0]), now, 9, 0.05);
      this.nextChord = now + 8;
    }
    if (now >= this.nextNote && !this.tune) {
      const oct = Math.random() < 0.3 ? 12 : 0;
      const n = root + PENTA[Math.floor(Math.random() * PENTA.length)] + oct + (Math.random() < 0.2 ? -12 : 0);
      this.pluck(mtof(n), now + 0.02, 0.085);
      if (Math.random() < 0.25) this.pluck(mtof(n + 7), now + 0.32, 0.05);
      this.nextNote = now + (this.night > 0.5 ? 2.4 : 1.2) + Math.random() * 2.5 + e.rain * 1.5;
    }
    if (this.tune) {
      const t = this.tune;
      if (now >= t.next) {
        const n = TUNE[t.i % TUNE.length];
        if (n) { this.pluck(mtof(n), now, 0.12, null, 'triangle'); if (t.i % 4 === 0) this.pluck(mtof(n - 12), now, 0.06); }
        t.i++; t.next = now + 0.36;
      }
    }
  }

  pad(freq, t, dur, vol = 0.032) {
    const c = this.ctx;
    for (const det of [-5, 5]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq; o.detune.value = det;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 2.5);
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }

  pluck(freq, t, vol, dest = null, type = 'triangle') {
    const c = this.ctx;
    if (!c) return;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
    const g = c.createGain(), g2 = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    g2.gain.setValueAtTime(vol * 0.3, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g); o2.connect(g2);
    const out = dest || this.musicGain;
    g.connect(out); g2.connect(out);
    if (!dest) g.connect(this.delay);
    o.start(t); o.stop(t + 1.6); o2.start(t); o2.stop(t + 0.5);
  }

  noiseHit(t, dur, { type = 'bandpass', freq = 1000, q = 1, vol = 0.2, dest = null } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.playbackRate.value = 1;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    src.start(t, Math.random() * 2); src.stop(t + dur + 0.05);
  }

  blip(freq, dur = 0.08, type = 'sine', vol = 0.18, slide = 1.5) {
    const c = this.ctx;
    if (!c || this.sfx <= 0) return;
    const t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // ---------- ambience ----------
  bird() {
    const c = this.ctx, t = c.currentTime;
    const base = 2200 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const s = t + i * (0.09 + Math.random() * 0.06);
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(base * (1 + Math.random() * 0.2), s);
      o.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.7), s + 0.07);
      const g = c.createGain(); g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.035, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.09);
      const pan = c.createStereoPanner ? c.createStereoPanner() : null;
      o.connect(g);
      if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; g.connect(pan); pan.connect(this.ambGain); } else g.connect(this.ambGain);
      o.start(s); o.stop(s + 0.1);
    }
  }

  cricket() {
    const c = this.ctx, t = c.currentTime;
    const f = 4200 + Math.random() * 600;
    for (let i = 0; i < 3; i++) {
      const s = t + i * 0.05;
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const g = c.createGain(); g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.008, s + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.035);
      o.connect(g); g.connect(this.ambGain); o.start(s); o.stop(s + 0.04);
    }
  }

  crackle(level) {
    const t = this.ctx.currentTime;
    this.noiseHit(t, 0.02 + Math.random() * 0.03, { type: 'highpass', freq: 2000 + Math.random() * 3000, vol: 0.12 * level, dest: this.ambGain });
  }

  thunder() {
    const t = this.ctx.currentTime + 0.5 + Math.random() * 2;
    this.noiseHit(t, 3.5, { type: 'lowpass', freq: 160, q: 0.5, vol: 0.9, dest: this.ambGain });
    this.noiseHit(t + 0.1, 1.2, { type: 'lowpass', freq: 400, q: 0.5, vol: 0.4, dest: this.ambGain });
  }

  // ---------- effects ----------
  place(pos, listener) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastPlace < 0.07) return;
    this.lastPlace = now;
    let vol = 0.12;
    if (pos && listener) vol *= Math.max(0, 1 - Math.hypot(pos.x - listener.x, pos.z - listener.z) / 35);
    if (vol < 0.01) return;
    this.blip(520 + Math.random() * 300, 0.06, 'sine', vol);
    this.noiseHit(now, 0.05, { freq: 900, q: 2, vol: vol * 0.6 });
  }

  playerPlace() { this.blip(380 + Math.random() * 60, 0.07, 'square', 0.05); if (this.ctx) this.noiseHit(this.ctx.currentTime, 0.06, { freq: 700, q: 1.5, vol: 0.12 }); }
  playerBreak() { this.blip(180 + Math.random() * 40, 0.09, 'sawtooth', 0.04, 0.6); if (this.ctx) this.noiseHit(this.ctx.currentTime, 0.12, { freq: 500, q: 0.8, vol: 0.2 }); }

  step(surface, strength = 1) {
    if (!this.ctx || this.sfx <= 0) return;
    const t = this.ctx.currentTime;
    const wood = [B.PLANKS, B.DARKWOOD, B.LOG, B.BIRCH, B.CRATE].includes(surface);
    const stone = [B.STONE, B.COBBLE, B.STONE_BRICK, B.MARBLE, B.BRICK, B.GRAVEL].includes(surface);
    const sand = [B.SAND, B.SNOW].includes(surface);
    if (wood) { this.blip(160 + Math.random() * 40, 0.06, 'triangle', 0.07 * strength, 0.7); this.noiseHit(t, 0.04, { freq: 1200, q: 2, vol: 0.05 * strength }); }
    else if (stone) this.noiseHit(t, 0.04, { type: 'highpass', freq: 2500, q: 1, vol: 0.06 * strength });
    else if (sand) this.noiseHit(t, 0.12, { type: 'bandpass', freq: 1800, q: 0.6, vol: 0.05 * strength });
    else this.noiseHit(t, 0.08, { type: 'bandpass', freq: 900 + Math.random() * 300, q: 0.8, vol: 0.06 * strength });
  }

  chirp(len = 4, mood = 'happy') {
    const c = this.ctx;
    if (!c || this.sfx <= 0) return;
    const t0 = c.currentTime;
    const base = mood === 'sad' ? 520 : mood === 'excited' ? 900 : 720;
    for (let i = 0; i < Math.min(len, 7); i++) {
      const t = t0 + i * 0.075;
      const o = c.createOscillator(); o.type = 'sine';
      const f = base + Math.random() * 500;
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (mood === 'sad' ? 0.8 : 1.15), t + 0.06);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + 0.08);
    }
  }

  chime() {
    const c = this.ctx;
    if (!c || this.sfx <= 0) return;
    const t = c.currentTime;
    [72, 76, 79, 84].forEach((n, i) => this.pluck(mtof(n), t + i * 0.09, 0.1, this.sfxGain));
  }
  fanfare() {
    const c = this.ctx;
    if (!c || this.sfx <= 0) return;
    const t = c.currentTime;
    [67, 72, 76, 79, 84, 88].forEach((n, i) => this.pluck(mtof(n), t + i * 0.1, 0.12, this.sfxGain));
  }
  click() { this.blip(900, 0.03, 'sine', 0.05, 1.2); }
  open() { this.blip(500, 0.12, 'sine', 0.05, 1.8); }
  error() { this.blip(220, 0.15, 'square', 0.04, 0.8); }
  shutter() { if (!this.ctx) return; const t = this.ctx.currentTime; this.noiseHit(t, 0.05, { type: 'highpass', freq: 3000, vol: 0.25 }); this.noiseHit(t + 0.09, 0.06, { type: 'highpass', freq: 2200, vol: 0.2 }); }
  clap() { if (!this.ctx) return; const t = this.ctx.currentTime; this.noiseHit(t, 0.08, { freq: 1500, q: 0.7, vol: 0.35 }); }
  purr() { if (!this.ctx) return; this.blip(880, 0.12, 'sine', 0.06, 1.3); setTimeout(() => this.blip(1100, 0.14, 'sine', 0.06, 1.25), 120); }
  critter(kind) {
    if (!this.ctx) return;
    if (kind === 'chicken') { this.blip(700, 0.08, 'square', 0.04, 1.4); setTimeout(() => this.blip(620, 0.1, 'square', 0.04, 0.8), 110); }
    else if (kind === 'cat') { this.blip(600, 0.35, 'sawtooth', 0.03, 1.3); }
    else if (kind === 'duck') { this.blip(380, 0.12, 'sawtooth', 0.05, 0.9); setTimeout(() => this.blip(360, 0.12, 'sawtooth', 0.05, 0.9), 160); }
    else this.blip(1300, 0.06, 'sine', 0.05, 1.5);
  }
  cast() { if (!this.ctx) return; this.noiseHit(this.ctx.currentTime, 0.35, { type: 'bandpass', freq: 2500, q: 0.6, vol: 0.12 }); }
  plop() { this.blip(420, 0.12, 'sine', 0.12, 0.45); }
  bite() { this.blip(300, 0.1, 'sine', 0.15, 0.5); setTimeout(() => this.blip(300, 0.1, 'sine', 0.15, 0.5), 140); }
  catch() { const c = this.ctx; if (!c) return; const t = c.currentTime; [76, 79, 83, 88].forEach((n, i) => this.pluck(mtof(n), t + i * 0.07, 0.1, this.sfxGain)); }
  gift() { this.fanfare(); }
  whistle() {
    const c = this.ctx;
    if (!c || this.sfx <= 0) return;
    const t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(700, t + 1.4);
    const g = c.createGain(); g.gain.setValueAtTime(0.025, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + 1.6);
  }
  boom() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.15;
    this.noiseHit(t, 1.4, { type: 'lowpass', freq: 220, q: 0.6, vol: 0.7 });
    this.noiseHit(t, 0.25, { type: 'bandpass', freq: 1400, q: 0.5, vol: 0.25 });
    for (let i = 0; i < 6; i++) this.noiseHit(t + 0.3 + Math.random() * 0.9, 0.03, { type: 'highpass', freq: 3500, vol: 0.06 });
  }
  startTune() { if (this.ctx) this.tune = { i: 0, next: this.ctx.currentTime + 0.2 }; }
  stopTune() { this.tune = null; }
}

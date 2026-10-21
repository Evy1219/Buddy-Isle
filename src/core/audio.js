// Soft generative music + little sound effects, all made with WebAudio (no files).
const PENTA = [0, 2, 4, 7, 9];
const CHORDS = [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.music = 0.5;
    this.sfx = 0.6;
    this.night = 0;
    this.chordI = 0;
    this.nextNote = 0;
    this.nextChord = 0;
    this.lastPlace = 0;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(c.destination);
    this.musicGain = c.createGain(); this.musicGain.gain.value = this.music * 0.35; this.musicGain.connect(this.master);
    this.sfxGain = c.createGain(); this.sfxGain.gain.value = this.sfx * 0.5; this.sfxGain.connect(this.master);
    // simple echo for a dreamy space
    this.delay = c.createDelay(1.5); this.delay.delayTime.value = 0.42;
    const fb = c.createGain(); fb.gain.value = 0.35;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    this.delay.connect(lp); lp.connect(fb); fb.connect(this.delay); lp.connect(this.musicGain);
    this.timer = setInterval(() => this.tick(), 250);
  }

  setVolumes(music, sfx) {
    this.music = music; this.sfx = sfx;
    if (this.musicGain) this.musicGain.gain.value = music * 0.35;
    if (this.sfxGain) this.sfxGain.gain.value = sfx * 0.5;
  }

  tick() {
    const c = this.ctx;
    if (!c || c.state !== 'running' || this.music <= 0) return;
    const now = c.currentTime;
    const root = 60 - (this.night > 0.5 ? 3 : 0);
    if (now >= this.nextChord) {
      this.chordI = (this.chordI + 1) % CHORDS.length;
      for (const n of CHORDS[this.chordI]) this.pad(mtof(root - 12 + n), now, 9);
      this.nextChord = now + 8;
    }
    if (now >= this.nextNote) {
      const oct = Math.random() < 0.3 ? 12 : 0;
      const n = root + PENTA[Math.floor(Math.random() * PENTA.length)] + oct + (Math.random() < 0.2 ? -12 : 0);
      this.pluck(mtof(n), now + 0.02, 0.09);
      this.nextNote = now + (this.night > 0.5 ? 2.2 : 1.2) + Math.random() * 2.5;
    }
  }

  pad(freq, t, dur) {
    const c = this.ctx;
    for (const det of [-4, 4]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq; o.detune.value = det;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.035, t + 2.5);
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }

  pluck(freq, t, vol, dest = null) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(g);
    g.connect(dest || this.musicGain);
    if (!dest) g.connect(this.delay);
    o.start(t); o.stop(t + 1.5);
  }

  blip(freq, dur = 0.08, type = 'sine', vol = 0.18) {
    const c = this.ctx;
    if (!c || this.sfx <= 0) return;
    const t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // block placed by the buddy (quieter when far away)
  place(pos, listener) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastPlace < 0.07) return;
    this.lastPlace = now;
    let vol = 0.12;
    if (pos && listener) vol *= Math.max(0, 1 - Math.hypot(pos.x - listener.x, pos.z - listener.z) / 35);
    if (vol < 0.01) return;
    this.blip(500 + Math.random() * 300, 0.06, 'sine', vol);
  }

  playerPlace() { this.blip(380 + Math.random() * 60, 0.07, 'square', 0.06); }
  playerBreak() { this.blip(180 + Math.random() * 40, 0.09, 'sawtooth', 0.05); }

  // little robot voice
  chirp(len = 4) {
    const c = this.ctx;
    if (!c || this.sfx <= 0) return;
    const t0 = c.currentTime;
    for (let i = 0; i < Math.min(len, 7); i++) {
      const t = t0 + i * 0.075;
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(700 + Math.random() * 600, t);
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
}

import { RNG } from '../core/rng.js';
import { BLUEPRINTS, pickStyle, STYLES } from './blueprints.js';
import { Plan } from './plan.js';
import { findSite, faceToward, findPierSite, findIsletSite, findPath, pathOps, isCoastal, Claims, randomLand } from './sites.js';
import { line, ART_TITLES, ART_COMMENTS, fillTitle } from './voice.js';
import { B, PAINT_COLORS, BLOCKS } from '../world/blocks.js';
import { SEA, WATER_Y } from '../world/terrain.js';
import { formatClock } from '../core/util.js';

// How fast the buddy works. offlineEvery = one activity per this much time away.
export const PACES = {
  chill: { label: 'Chill', desc: 'About 1 or 2 things an hour while you\'re away', placeDelay: 0.42, restMin: 45, restMax: 110, offlineEvery: 40 * 60e3, offlineMax: 10 },
  normal: { label: 'Normal', desc: 'About 2 or 3 things an hour while you\'re away', placeDelay: 0.26, restMin: 20, restMax: 60, offlineEvery: 24 * 60e3, offlineMax: 20 },
  busy: { label: 'Busy', desc: 'About 6 things an hour while you\'re away', placeDelay: 0.13, restMin: 6, restMax: 20, offlineEvery: 10 * 60e3, offlineMax: 40 },
};

const MAX_ISLETS = 8;
const RENOVATABLE = ['restspot', 'flowerfield', 'mosaic', 'statue', 'arch', 'well', 'sapling', 'pond', 'garden', 'tower'];
const ISLET_NAMES = ['Pebble', 'Clover', 'Sprout', 'Little Moon', 'Driftwood', 'Seashell', 'Lantern', 'Tumble', 'Biscuit', 'Starfish'];

export const BUILD_TYPES = Object.keys(BLUEPRINTS);

export class Brain {
  constructor(game) {
    this.g = game;
    this.world = game.world;
    this.state = game.state;
    this.rng = new RNG((Date.now() ^ (game.state.seed * 7)) >>> 0);
    this.claims = new Claims(this.world.size);
    this.claims.rebuild(this.state.projects);
    const b = this.b;
    this.job = b.job || null;
    this.paused = b.paused || null;
    // after a reload, walk back to unfinished work (and set the easel up again)
    if (this.job && this.job.kind === 'build' && this.job.i > 0) this.job.stage = 'travel';
    if (this.job && this.job.kind === 'paint' && this.job.stage === 'paint') this.job.stage = 'travel';
    if (this.job) this.job.tt = 0;
    this.mode = 'auto';
    this.idleT = 2;
    this.thoughtT = 50 + Math.random() * 40;
    this.placeT = 0;
    this.offline = false;
  }

  get b() { return this.state.buddy; }
  get pace() { return PACES[this.state.settings.pace] || PACES.normal; }
  get entity() { return this.g.buddyEntity; }

  colorBlock() {
    const c = this.b.color;
    const r = (c >> 16) & 255, g = (c >> 8) & 255, bl = c & 255;
    let best = PAINT_COLORS[0], bd = Infinity;
    for (const p of PAINT_COLORS) {
      const dd = (((p.hex >> 16) & 255) - r) ** 2 + (((p.hex >> 8) & 255) - g) ** 2 + ((p.hex & 255) - bl) ** 2;
      if (dd < bd) { bd = dd; best = p; }
    }
    return best.id;
  }

  ctx(extra = {}) {
    return {
      buddy: this.b.name, player: this.state.playerName || 'friend', color: this.b.color,
      colorBlock: this.colorBlock(), style: STYLES[pickStyle(this.rng, this.b.traits)], traits: this.b.traits, ...extra,
    };
  }

  // ---------- memory ----------
  journal(kind, text, extra = {}, when = Date.now()) {
    this.state.journal.push({ id: `j${this.state.nextId++}`, t: when, kind, text, ...extra });
    if (this.state.journal.length > 600) this.state.journal.splice(0, this.state.journal.length - 600);
    if (!this.offline) this.g.ui?.refreshJournal?.();
  }

  say(text, opts = {}) {
    if (this.offline || !text) return;
    this.g.ui?.buddySay(text, opts);
  }

  playerNear(r = 30) {
    if (this.g.mode !== 'play') return false;
    const p = this.g.player?.pos;
    if (!p || !this.entity) return false;
    return Math.hypot(p.x - this.entity.pos.x, p.z - this.entity.pos.z) < r;
  }

  doneProjects() { return this.state.projects.filter((p) => p.done); }

  hub() {
    const fire = this.state.projects.find((p) => p.type === 'campfire');
    if (fire) return fire.entrance || { x: fire.x0 + 3, z: fire.z0 + 3 };
    const sp = this.state.spawn;
    return { x: sp.x, z: sp.z };
  }

  home() {
    const h = this.state.projects.find((p) => p.type === 'cottage' && p.variant === 'home' && p.done);
    return h ? h.entrance : this.hub();
  }

  // ---------- deciding what to do ----------
  chooseActivity() {
    const s = this.state, b = this.b, rng = this.rng, t = b.traits;
    const count = (type) => s.projects.filter((p) => p.type === type).length;
    const ms = b.milestones;
    if (!count('campfire')) return { type: 'campfire' };
    if (!ms.home) return { type: 'cottage', variant: 'home' };
    if (!ms.playerHouse) return { type: 'cottage', variant: 'player' };
    if (!count('grove')) return { type: 'grove' };
    if (!ms.firstPainting) return { type: 'paint' };
    if (!count('garden')) return { type: 'garden' };
    const likes = b.likes || {};
    const w = (type, base, max = 99) => {
      const n = count(type);
      if (n >= max) return 0;
      return base / (1 + n * 0.35) * (1 + (likes[type] || 0) * 0.8);
    };
    const unhung = s.artworks.filter((a) => !a.hung).length;
    const signs = s.props.filter((p) => p.type === 'sign' && p.note).length;
    const crowded = this.isCrowded();
    const items = [
      ['cottage', w('cottage', 5, 16) * (1 + t.cozy)],
      ['tower', w('tower', 3, 6) * (1 + t.grand)],
      ['garden', w('garden', 3, 6) * (1 + (t.nature + t.cozy) / 2)],
      ['grove', w('grove', 5, 22) * (1 + t.nature)],
      ['pond', w('pond', 3, 6) * (1 + t.nature)],
      ['well', w('well', 2, 2)],
      ['statue', w('statue', 2.5, 6) * (1 + (t.artsy + t.grand) / 2)],
      ['gallery', unhung >= 2 ? 16 : 0],
      ['windmill', w('windmill', 2.5, 4)],
      ['lighthouse', w('lighthouse', 2.5, 2) * (1 + t.grand / 2)],
      ['pier', w('pier', 2.5, 3)],
      ['mosaic', w('mosaic', 3, 8) * (1 + t.artsy)],
      ['flowerfield', w('flowerfield', 4, 14) * (1 + t.nature)],
      ['restspot', w('restspot', 3, 8) * (1 + t.cozy)],
      ['greenhouse', w('greenhouse', 2, 3) * (1 + t.nature / 2)],
      ['arch', w('arch', 1.5, 3) * (1 + t.grand)],
      ['treehouse', w('treehouse', 2, 2) * (1 + t.nature / 2)],
      ['paint', ((6 + (likes.paint || 0) * 3) * (1 + t.artsy) + (this.g.sky && this.g.sky.night > 0.5 ? 2 : 0)) / (1 + Math.max(0, unhung - 2) * 0.5)],
      ['note', signs < 8 ? 1.2 : 0],
      ['sapling', crowded ? 6 : 0.8],
    ];
    if (!this.offline) items.push(['admire', 2]);
    if (crowded) {
      // the island is full: raise a new one, or redo an old corner
      if (s.islets.length < MAX_ISLETS && !this.noIsletRoom) items.push(['islet', 25]);
      else items.push(['renovate', 6]);
    }
    return { type: rng.weighted(items) };
  }

  // Is there still room for a normal-sized build anywhere?
  isCrowded() {
    const n = this.state.projects.length;
    if (n < 12) return false;
    if (this.crowdCheck && this.crowdCheck.n === n) return this.crowdCheck.v;
    let v = !findSite(this.world, this.claims, this.rng, 11, { anchors: this.anchors(), tries: 160, maxSpread: 5 });
    if (v) v = !findSite(this.world, this.claims, this.rng, 9, { tries: 200, maxSpread: 5 });
    this.crowdCheck = { n, v };
    return v;
  }

  makeRenovateJob() {
    const now = Date.now();
    const old = this.doneProjects().filter((p) => RENOVATABLE.includes(p.type) && !p.requested && now - (p.completed || p.created) > 2 * 864e5);
    if (!old.length) return null;
    old.sort((a, b) => (a.completed || a.created) - (b.completed || b.created));
    const p = old[Math.floor(this.rng.float() * Math.min(4, old.length))];
    return { kind: 'renovate', projectId: p.id, title: p.title, stage: 'travel', t: 3 };
  }

  planNext() {
    const b = this.b;
    while (b.requests.length) {
      const r = b.requests.shift();
      const job = this.makeJob(r.type, { ...r, requested: true });
      if (job) return job;
      this.say(line('noSite', b.personality));
    }
    while (b.queue.length) {
      const q = b.queue.shift();
      const job = this.makeJob(q.type, q);
      if (job) return job;
    }
    for (let i = 0; i < 5; i++) {
      const act = this.chooseActivity();
      const job = this.makeJob(act.type, act);
      if (job) { b.failedSites = 0; return job; }
      if (BLUEPRINTS[act.type]) { b.failedSites = (b.failedSites || 0) + 1; this.crowdCheck = null; }
    }
    return { kind: 'rest', t: 10 };
  }

  makeJob(type, opts = {}) {
    if (type === 'paint') return this.makePaintJob(opts);
    if (type === 'rest') return { kind: 'rest', t: opts.t || 20 };
    if (type === 'admire') {
      const done = this.doneProjects().filter((p) => p.type !== 'path');
      if (!done.length) return null;
      const p = this.rng.pick(done);
      return { kind: 'admire', projectId: p.id, stage: 'travel', t: 5 };
    }
    if (type === 'path') return this.makePathJob(opts);
    if (type === 'pier') return this.makePierJob(opts);
    if (type === 'islet') return this.makeIsletJob(opts);
    if (type === 'note') return this.makeNoteJob(opts);
    if (type === 'renovate') return this.makeRenovateJob(opts);
    if (type === 'visit') return { kind: 'visit', text: opts.text, stage: 'travel', t: 20 };
    const bp = BLUEPRINTS[type];
    if (!bp || bp.special) return null;
    return this.makeBuildJob(type, bp, opts);
  }

  anchors() {
    const a = this.doneProjects().concat(this.state.projects.filter((p) => !p.done))
      .map((p) => ({ x: p.x0 + p.w / 2, z: p.z0 + p.d / 2 }));
    if (!a.length) a.push(this.hub());
    return a;
  }

  makeBuildJob(type, bp, opts) {
    const rng = this.rng;
    const ctx = this.ctx({ variant: opts.variant });
    bp.pre?.(rng, ctx);
    const S = bp.size(rng, ctx);
    const siteOpts = { ...(bp.site || {}), anchors: this.anchors(), maxSpread: bp.site?.maxSpread ?? (bp.noLevel ? 7 : 6) };
    let near = opts.near;
    if (!near && type === 'campfire') near = this.state.spawn;
    if (!near && opts.variant === 'home') near = this.hub();
    if (!near && opts.variant === 'player') near = this.hub();
    let site = near ? findSite(this.world, this.claims, rng, S, { ...siteOpts, near, minR: type === 'campfire' ? 2 : S * 0.6 + 4, maxR: type === 'campfire' ? 14 : 24 }) : null;
    if (!site) site = findSite(this.world, this.claims, rng, S, siteOpts);
    if (!site) return null;
    const hub = (opts.near && opts.requested) ? opts.near : this.hub();
    site.rot = faceToward(site, hub.x, hub.z);
    const cx = site.x0 + S / 2, cz = site.z0 + S / 2;
    if (type === 'lighthouse') {
      const c = this.world.size / 2;
      const ang = Math.atan2(cz - c, cx - c);
      ctx.dirName = ['East', 'South', 'West', 'North'][Math.round(((ang + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2)) % 4];
    }
    const plan = new Plan(this.world, site);
    bp.build(plan, rng, ctx);
    let title = bp.name(rng, ctx);
    for (let k = 0; k < 6 && this.state.projects.some((p) => p.title === title); k++) title = bp.name(rng, ctx);
    if (this.state.projects.some((p) => p.title === title)) title += ` No. ${this.state.projects.filter((p) => p.title.startsWith(title)).length + 1}`;
    const ops = plan.ops();
    const project = {
      id: `b${this.state.nextId++}`, type, variant: opts.variant || null, title,
      x0: site.x0, z0: site.z0, w: S, d: S, baseY: site.baseY, rot: site.rot,
      entrance: plan.entrance || { x: Math.round(cx), z: Math.round(cz) },
      slots: plan.slots, done: false, created: Date.now(), requested: !!opts.requested,
      extra: { trees: ctx.trees, flowers: ctx.flowers },
    };
    this.claims.mark(project.x0, project.z0, S, S);
    this.state.projects.push(project);
    return {
      kind: 'build', type, title, projectId: project.id, ops, i: 0, props: plan.props,
      story: bp.story(ctx, rng), stage: 'travel', cx, cz, y: site.baseY, requested: !!opts.requested,
    };
  }

  makePathJob(opts) {
    const from = this.state.projects.find((p) => p.id === opts.projectId);
    if (!from || !from.entrance) return null;
    const others = this.doneProjects().filter((p) => p.id !== from.id && p.entrance && p.type !== 'pier');
    if (!others.length) return null;
    others.sort((a, b) => Math.hypot(a.entrance.x - from.entrance.x, a.entrance.z - from.entrance.z) - Math.hypot(b.entrance.x - from.entrance.x, b.entrance.z - from.entrance.z));
    const to = others[0];
    if (Math.hypot(to.entrance.x - from.entrance.x, to.entrance.z - from.entrance.z) > 55) return null;
    const path = findPath(this.world, this.claims, from.entrance, to.entrance);
    if (!path || path.length < 2) return null;
    const ops = pathOps(this.world, path, this.rng, this.b.traits.cozy + 0.3 > this.rng.float());
    if (!ops.length) return null;
    const mid = path[Math.floor(path.length / 2)];
    return { kind: 'build', type: 'path', title: 'a path', ops, i: 0, props: [], silent: true, stage: 'travel', cx: mid.x, cz: mid.z, y: this.world.surfaceY(mid.x, mid.z), fromTitle: from.title, toTitle: to.title };
  }

  makePierJob(opts) {
    const ps = findPierSite(this.world, this.claims, this.rng);
    if (!ps) return null;
    const plan = new Plan(this.world, { x0: 0, z0: 0, size: 1, baseY: 0 });
    const { x, z, dx, dz, L } = ps;
    const px = dz !== 0 ? 1 : 0, pz = dx !== 0 ? 1 : 0;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k <= L; k++) for (let w = -1; w <= 1; w++) {
      const cx = x + dx * k + px * w, cz = z + dz * k + pz * w;
      x0 = Math.min(x0, cx); z0 = Math.min(z0, cz); x1 = Math.max(x1, cx); z1 = Math.max(z1, cz);
      const g = this.world.surfaceY(cx, cz);
      if (g <= SEA) {
        plan.putW(cx, SEA + 1, cz, B.PLANKS);
        if (k % 3 === 2 && w !== 0) for (let y = g + 1; y <= SEA; y++) plan.putW(cx, y, cz, B.LOG);
      } else plan.putW(cx, g, cz, B.PLANKS);
    }
    for (const w of [-1, 1]) {
      const cx = x + dx * L + px * w, cz = z + dz * L + pz * w;
      plan.putW(cx, SEA + 2, cz, B.FENCE); plan.putW(cx, SEA + 3, cz, B.LANTERN);
    }
    const title = BLUEPRINTS.pier.name(this.rng, this.ctx());
    const project = {
      id: `b${this.state.nextId++}`, type: 'pier', title, x0, z0, w: x1 - x0 + 1, d: z1 - z0 + 1, baseY: SEA + 1, rot: 0,
      entrance: { x: x - dx, z: z - dz }, slots: [], done: false, created: Date.now(), requested: !!opts.requested, extra: {},
    };
    this.claims.mark(project.x0, project.z0, project.w, project.d);
    this.state.projects.push(project);
    return { kind: 'build', type: 'pier', title, projectId: project.id, ops: plan.ops(), i: 0, props: [], story: BLUEPRINTS.pier.story(), stage: 'travel', cx: x + dx * (L / 2), cz: z + dz * (L / 2), y: SEA + 1, requested: !!opts.requested };
  }

  makeIsletJob() {
    const site = findIsletSite(this.world, this.claims, this.rng, this.state.islets);
    if (!site) { this.noIsletRoom = true; return null; }
    const used = new Set(this.state.islets.map((i) => i.name));
    const name = ISLET_NAMES.find((n) => !used.has(n)) || `Isle ${this.state.islets.length + 1}`;
    return { kind: 'islet', islet: { x: site.x, z: site.z, r: site.r, name }, land: site.land, stage: 'travel', t: 5 };
  }

  makeNoteJob() {
    const house = this.state.projects.find((p) => p.type === 'cottage' && p.variant === 'player' && p.done);
    const base = house ? house.entrance : this.hub();
    for (let i = 0; i < 40; i++) {
      const x = Math.round(base.x + this.rng.range(-7, 7)), z = Math.round(base.z + this.rng.range(-7, 7));
      if (this.claims.has(x, z) || this.world.isBuilt(x, z)) continue;
      const y = this.world.surfaceY(x, z);
      if (y <= SEA || this.world.get(x, y + 1, z) !== B.AIR) continue;
      if (this.state.props.some((p) => Math.abs(p.x - x) < 2 && Math.abs(p.z - z) < 2)) continue;
      const dx = base.x - x, dz = base.z - z;
      const facing = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dz) || 1];
      return { kind: 'note', x, y: y + 1, z, facing, text: this.noteText(), stage: 'travel' };
    }
    return null;
  }

  noteText() {
    const p = this.state.playerName || 'friend';
    const last = this.doneProjects().slice(-1)[0];
    const facts = this.b.facts || [];
    const opts = [
      `Hi ${p}! Hope you're having a good day.`,
      `${p}, I saved you a seat by the campfire.`,
      'Gone building. Back soon!',
      `Dear ${p}: the island missed you.`,
      last ? `Did you see ${last.title}? I made it for you.` : 'More buildings coming soon!',
      'Note to self: plant more flowers.',
    ];
    if (facts.length) opts.push(`I remember: ${facts[this.rng.int(0, facts.length - 1)].text}`);
    return this.rng.pick(opts);
  }

  // ---------- painting ----------
  chooseArtKind() {
    const done = this.doneProjects().filter((p) => p.type !== 'path');
    return this.rng.weighted([
      ['landscape', 3], ['sunset', 2], ['night', this.g.sky?.night > 0.5 ? 4 : 1.5], ['sea', 2], ['flowers', 2],
      ['abstract', 1.5 + this.b.traits.artsy * 2], ['portrait', 1.2], ['selfportrait', 0.8], ['memory', done.length ? 3 : 0], ['pattern', 1],
    ]);
  }

  makePaintJob(opts) {
    const kind = opts.artKind || this.chooseArtKind();
    let spot = null;
    if (['sea', 'sunset'].includes(kind)) {
      for (let i = 0; i < 80 && !spot; i++) {
        const l = randomLand(this.world, this.rng);
        if (l && isCoastal(this.world, l.x, l.z)) spot = l;
      }
    }
    if (!spot) {
      const h = opts.near || this.home();
      spot = { x: h.x + this.rng.range(-4, 4), z: h.z + this.rng.range(-4, 4) };
    }
    return { kind: 'paint', artKind: kind, subjectProjectId: opts.subjectProjectId, stage: 'travel', t: 0, spot: { x: spot.x, z: spot.z } };
  }

  createArtwork(job, when) {
    const kind = job.artKind;
    const rng = this.rng;
    const done = this.doneProjects().filter((p) => p.type !== 'path');
    const subj = job.subjectProjectId ? this.state.projects.find((p) => p.id === job.subjectProjectId) : (kind === 'memory' && done.length ? rng.pick(done) : null);
    const n = this.state.artworks.filter((a) => a.kind === kind).length + 1;
    const colorName = PAINT_COLORS.find((p) => p.id === this.colorBlock())?.name || 'Gold';
    const hour = new Date(when).getHours();
    const vars = {
      n, player: this.state.playerName || 'You', buddy: this.b.name, world: this.state.name,
      color: colorName[0].toUpperCase() + colorName.slice(1), project: subj ? subj.title : 'Home',
      time: hour < 11 ? 'Morning' : hour < 17 ? 'Noon' : hour < 21 ? 'Dusk' : 'Night',
    };
    const title = fillTitle(rng.pick(ART_TITLES[kind]), vars);
    const art = {
      id: `a${this.state.nextId++}`, kind, seed: rng.int(1, 2 ** 30), title,
      comment: rng.pick(ART_COMMENTS[kind]), created: when, hung: false, where: null,
      opts: { color: this.b.color, shirt: this.state.player.shirt, subject: subj ? subj.type : null, houseColor: 0xb8473a },
    };
    this.state.artworks.push(art);
    this.b.stats.paintings++;
    this.b.milestones.firstPainting = true;
    return art;
  }

  freeSlot() {
    const used = new Set(this.state.props.filter((p) => p.type === 'painting').map((p) => `${p.x},${p.y},${p.z}`));
    const projects = this.doneProjects().filter((p) => p.slots && p.slots.length);
    projects.sort((a, b) => (b.type === 'gallery') - (a.type === 'gallery'));
    for (const p of projects) for (const s of p.slots) if (!used.has(`${s.x},${s.y},${s.z}`)) return { ...s, title: p.title, projectId: p.id };
    return null;
  }

  easelSpot() {
    const easels = this.state.props.filter((p) => p.type === 'easel').length;
    if (easels >= 4) return null;
    const h = this.home();
    for (let i = 0; i < 40; i++) {
      const x = Math.round(h.x + this.rng.range(-5, 5)), z = Math.round(h.z + this.rng.range(-5, 5));
      if (this.claims.has(x, z) || this.world.isBuilt(x, z)) continue;
      const y = this.world.surfaceY(x, z);
      if (y <= SEA || this.world.get(x, y + 1, z) !== B.AIR) continue;
      if (this.state.props.some((p) => Math.abs(p.x - x) < 2 && Math.abs(p.z - z) < 2)) continue;
      const dx = h.x - x, dz = h.z - z;
      const facing = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dz) || 1];
      return { x, y: y + 1, z, facing };
    }
    return null;
  }

  hangArt(art, when) {
    const slot = this.freeSlot();
    if (slot) {
      this.g.props.add({ type: 'painting', artId: art.id, x: slot.x, y: slot.y, z: slot.z, facing: slot.facing });
      art.hung = true; art.where = slot.title;
      return slot;
    }
    const e = this.easelSpot();
    if (e) {
      this.g.props.add({ type: 'easel', artId: art.id, x: e.x, y: e.y, z: e.z, facing: e.facing });
      art.hung = true; art.where = 'an easel outside';
      return e;
    }
    return null;
  }

  // ---------- finishing things ----------
  complete(job, when = Date.now()) {
    const b = this.b;
    if (job.kind === 'build') {
      b.stats.blocks += job.ops.length;
      if (job.type === 'path') { b.stats.paths = (b.stats.paths || 0) + 1; return; }
      const project = this.state.projects.find((p) => p.id === job.projectId);
      if (project) { project.done = true; project.completed = when; }
      for (const pr of job.props || []) this.g.props.add({ ...pr });
      b.stats.builds++;
      if (job.type === 'grove') b.stats.trees += project?.extra?.trees || 0;
      if (job.type === 'cottage' && project?.variant === 'home') b.milestones.home = true;
      if (job.type === 'cottage' && project?.variant === 'player') b.milestones.playerHouse = true;
      const text = job.requested ? `${job.story} (You asked for this one!)` : job.story;
      this.journal('build', text, { projectId: job.projectId, title: job.title, type: job.type }, when);
      if (!this.offline) {
        this.g.ui?.toast(`${b.name} finished ${job.title}`);
        if (this.playerNear(40)) this.say(line('finishBuild', b.personality, { title: job.title }));
        this.g.audio?.chime();
      }
      if (job.type !== 'pier' && job.type !== 'islet') b.queue.push({ type: 'path', projectId: job.projectId });
      // put any leftover paintings up in the new gallery
      if (job.type === 'gallery' || (project?.slots?.length)) {
        for (const art of this.state.artworks.filter((a) => !a.hung)) if (!this.hangArt(art, when)) break;
      }
    } else if (job.kind === 'paint') {
      // handled in finishPainting
    }
    this.g.onWorldChanged?.();
  }

  finishPainting(job, when) {
    const art = this.createArtwork(job, when);
    job.art = art.id;
    this.journal('paint', `Painted "${art.title}". ${art.comment}`, { artId: art.id, title: art.title }, when);
    if (!this.offline) {
      this.g.ui?.toast(`${this.b.name} painted "${art.title}"`);
      if (this.playerNear(40)) this.say(line('paintDone', this.b.personality, { title: art.title }));
    }
    return art;
  }

  raiseIslet(job, when) {
    const it = job.islet;
    this.state.islets.push(it);
    this.world.setIslets(this.state.islets, { x0: it.x - it.r - 4, z0: it.z - it.r - 4, x1: it.x + it.r + 4, z1: it.z + it.r + 4 });
    // bridge from the island toward the nearest land
    const ops = [];
    const dx = job.land.x - it.x, dz = job.land.z - it.z;
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const px = Math.abs(ux) > Math.abs(uz) ? 0 : 1, pz = px ? 0 : 1;
    let k = 0;
    for (let d = 0; d <= len + 2; d++) {
      const cx = Math.round(it.x + ux * d), cz = Math.round(it.z + uz * d);
      const g = this.world.surfaceY(cx, cz);
      if (g > SEA) continue;
      for (const w of [0, 1]) ops.push([cx + px * w, SEA + 1, cz + pz * w, B.PLANKS]);
      if (k % 4 === 0) {
        ops.push([cx - px, SEA + 2, cz - pz, B.FENCE]);
        ops.push([cx + px * 2, SEA + 2, cz + pz * 2, B.FENCE]);
        if (k % 8 === 0) { ops.push([cx - px, SEA + 3, cz - pz, B.LANTERN]); ops.push([cx + px * 2, SEA + 3, cz + pz * 2, B.LANTERN]); }
      }
      k++;
    }
    const project = {
      id: `b${this.state.nextId++}`, type: 'islet', title: `${it.name} Isle`, x0: it.x - 3, z0: it.z - 3, w: 6, d: 6, baseY: SEA + 2, rot: 0,
      entrance: { x: it.x, z: it.z }, slots: [], done: false, created: when, extra: {},
    };
    this.state.projects.push(project);
    this.b.failedSites = 0;
    return { kind: 'build', type: 'islet', title: project.title, projectId: project.id, ops, i: 0, props: [], stage: 'work', cx: it.x, cz: it.z, y: SEA + 2, story: `Raised a brand new little island out of the sea and built a bridge to it. I'm calling it ${it.name} Isle.` };
  }

  // ---------- instant (used for "while you were away") ----------
  runInstant(job, when) {
    if (!job) return null;
    if (job.kind === 'build') {
      for (let i = job.i; i < job.ops.length; i++) { const o = job.ops[i]; this.world.set(o[0], o[1], o[2], o[3]); }
      job.i = job.ops.length;
      this.complete(job, when);
      return job.type === 'path' ? null : { kind: 'build', title: job.title, type: job.type, projectId: job.projectId, when };
    }
    if (job.kind === 'paint') {
      const art = job.art ? this.state.artworks.find((a) => a.id === job.art) : this.finishPainting(job, when);
      if (art && !art.hung) this.hangArt(art, when);
      return { kind: 'paint', title: art.title, artId: art.id, when };
    }
    if (job.kind === 'islet') {
      const bj = this.raiseIslet(job, when);
      return this.runInstant(bj, when);
    }
    if (job.kind === 'renovate') {
      this.doRenovate(job, when);
      return null;
    }
    if (job.kind === 'note') {
      this.placeNote(job, when);
      return { kind: 'note', title: 'a note for you', text: job.text, when };
    }
    return null;
  }

  doRenovate(job, when) {
    const p = this.state.projects.find((q) => q.id === job.projectId);
    if (!p) return;
    this.g.removeProject(p, { by: 'buddy', when });
    this.crowdCheck = null;
  }

  placeNote(job, when) {
    this.g.props.add({ type: 'sign', x: job.x, y: job.y, z: job.z, facing: job.facing, title: job.text, note: true, created: when });
    this.journal('note', `Left you a note: "${job.text}"`, {}, when);
  }

  // ---------- requests from the player ----------
  request(type, opts = {}) {
    const b = this.b;
    if (this.mode !== 'auto') this.mode = 'auto';
    b.requests.push({ type, ...opts });
    const busy = this.job && ['build', 'paint', 'islet', 'note'].includes(this.job.kind);
    if (busy) {
      if (this.job.kind === 'build' && this.job.i === 0 && this.job.stage === 'travel') this.cancelJob(); // not started yet
      else if (this.job.kind === 'build' && this.job.type === 'path') { this.job = null; } // paths can wait
      else return line('ackLater', b.personality, { current: this.job.kind === 'paint' ? 'this painting' : this.job.kind === 'note' ? 'this note' : this.job.title });
    } else {
      this.job = null;
    }
    this.idleT = 0;
    return null;
  }

  cancelJob() {
    const j = this.job;
    if (!j) return;
    if (j.kind === 'build' && j.projectId && j.i === 0) {
      this.state.projects = this.state.projects.filter((p) => p.id !== j.projectId);
      this.claims.rebuild(this.state.projects);
    }
    this.job = null;
  }

  interrupt(job) {
    if (this.job && ['build', 'paint', 'islet'].includes(this.job.kind) && !this.paused) this.paused = this.job;
    this.job = job;
  }

  finishJob() {
    const was = this.job;
    this.job = null;
    if (this.paused) { this.job = this.paused; this.paused = null; if (this.job.kind === 'build') this.job.stage = 'travel'; return; }
    if (was && ['build', 'paint', 'note', 'islet'].includes(was.kind) && !this.b.requests.length) {
      const p = this.pace;
      if (!(was.kind === 'build' && was.type === 'path')) this.job = { kind: 'rest', t: this.rng.range(p.restMin, p.restMax) };
    }
    this.idleT = 0.5;
  }

  // ---------- live behaviour ----------
  update(dt) {
    const e = this.entity;
    if (!e) return;
    const player = this.g.player;
    this.thoughtT -= dt;

    if (this.mode === 'follow' && player) {
      const tx = player.pos.x + Math.sin(player.facing + 2.5) * 2.6, tz = player.pos.z + Math.cos(player.facing + 2.5) * 2.6;
      e.target = { x: tx, z: tz, y: Math.max(player.pos.y + 0.6, e.hoverY(tx, tz)) };
      e.speed = Math.max(4.2, Math.hypot(player.vel.x, player.vel.z) * 1.15);
      e.lookAt = Math.hypot(player.vel.x, player.vel.z) < 0.5 ? player.pos : null;
      this.ambient(dt);
      return;
    }
    e.speed = 4.2;
    if (this.mode === 'stay') {
      e.target = null;
      e.lookAt = this.playerNear(14) ? player.pos : null;
      this.ambient(dt);
      return;
    }
    if (!this.job) {
      this.idleT -= dt;
      if (this.idleT > 0) return;
      this.job = this.planNext();
      this.placeT = 0;
    }
    this.step(this.job, dt);
  }

  ambient() {
    if (this.thoughtT > 0) return;
    this.thoughtT = 70 + Math.random() * 80;
    if (!this.playerNear(22)) return;
    const night = this.g.sky?.night > 0.6;
    const key = night && Math.random() < 0.5 ? 'night' : 'idle';
    this.say(line(key, this.b.personality), { thought: true });
  }

  step(job, dt) {
    const e = this.entity, b = this.b, player = this.g.player;
    switch (job.kind) {
      case 'build': {
        if (job.stage === 'travel') {
          e.lookAt = null;
          e.target = { x: job.cx, z: job.cz, y: job.y + 4 };
          job.tt = (job.tt || 0) + dt;
          if (e.arrived(2.5) || job.tt > 40) {
            job.stage = 'work';
            if (!job.silent && job.i === 0 && this.playerNear(45)) this.say(line('startBuild', b.personality, { title: job.title }));
          }
          return;
        }
        this.placeT -= dt;
        let placed = 0;
        while (this.placeT <= 0 && job.i < job.ops.length && placed < 6) {
          const o = job.ops[job.i++];
          if (this.world.get(o[0], o[1], o[2]) === o[3]) continue;
          this.world.set(o[0], o[1], o[2], o[3]);
          placed++;
          const delay = (o[3] === B.AIR ? 0.3 : BLOCKS[o[3]].shape === 'boxes' ? 0.7 : 1) * this.pace.placeDelay * (job.silent ? 0.6 : 1);
          this.placeT += delay;
          // fly near the block
          const ox = o[0] + 0.5 - job.cx, oz = o[2] + 0.5 - job.cz;
          const ol = Math.hypot(ox, oz) || 1;
          const tx = o[0] + 0.5 + (ox / ol) * 2.2, tz = o[2] + 0.5 + (oz / ol) * 2.2, ty = o[1] + 1.4;
          if (!e.target || Math.hypot(e.target.x - tx, e.target.z - tz) > 2.6 || Math.abs((e.target.y ?? 0) - ty) > 2) e.target = { x: tx, z: tz, y: ty };
          e.lookAt = { x: o[0] + 0.5, z: o[2] + 0.5 };
          e.working = 0.4;
          if (o[3] !== B.AIR) {
            e.beam(o[0], o[1], o[2]);
            this.g.fx?.spawn(o[0] + 0.5, o[1] + 0.5, o[2] + 0.5, 0xffffff, 3, { size: 0.08, life: 0.5 });
            this.g.audio?.place(e.pos, this.g.mode === 'play' ? this.g.player.pos : null);
          } else {
            this.g.fx?.spawn(o[0] + 0.5, o[1] + 0.5, o[2] + 0.5, 0x9c7c52, 2, { size: 0.1, life: 0.4 });
          }
        }
        if (this.placeT < -1) this.placeT = 0;
        if (job.i >= job.ops.length) {
          this.complete(job);
          this.finishJob();
        }
        return;
      }
      case 'paint': {
        if (job.stage === 'travel') {
          e.target = { x: job.spot.x, z: job.spot.z };
          e.lookAt = null;
          job.tt = (job.tt || 0) + dt;
          if (e.arrived(1) || job.tt > 40) {
            job.stage = 'paint';
            job.t = 12 + Math.random() * 10;
            const gy = this.world.surfaceY(job.spot.x, job.spot.z);
            const ex = Math.floor(job.spot.x + Math.sin(e.facing) * 1.6), ez = Math.floor(job.spot.z + Math.cos(e.facing) * 1.6);
            job.easel = { x: ex, y: Math.max(gy, this.world.surfaceY(ex, ez)) + 1, z: ez };
            this.g.props.addTemp({ type: 'easel', x: ex, y: job.easel.y, z: ez, facing: [-Math.round(Math.sin(e.facing)), -Math.round(Math.cos(e.facing))] });
            if (this.playerNear(35)) this.say(line('paintStart', b.personality));
          }
          return;
        }
        if (job.stage === 'paint') {
          job.t -= dt;
          e.target = null;
          e.lookAt = { x: job.easel.x + 0.5, z: job.easel.z + 0.5 };
          e.working = 0.3;
          if (Math.random() < dt * 4) {
            const cols = [0xdc4545, 0xf5d43c, 0x5b8fe6, 0x7cc957, 0xec8bbd, b.color];
            this.g.fx?.spawn(job.easel.x + 0.5, job.easel.y + 1.1, job.easel.z + 0.5, cols[Math.floor(Math.random() * cols.length)], 1, { size: 0.07, life: 0.6, up: 0.6, speed: 0.8 });
          }
          if (job.t <= 0) {
            this.g.props.removeTemp();
            const art = this.finishPainting(job, Date.now());
            const slot = this.freeSlot();
            job.stage = 'hang';
            job.hang = slot ? { x: slot.x + 0.5, y: slot.y + 0.5, z: slot.z + 0.5 } : null;
            job.artId = art.id;
            if (!job.hang) { this.hangArt(art); this.finishJob(); }
          }
          return;
        }
        if (job.stage === 'hang') {
          e.target = { x: job.hang.x, z: job.hang.z, y: job.hang.y };
          e.lookAt = null;
          job.ht = (job.ht || 0) + dt;
          if (e.arrived(1.2) || job.ht > 30) {
            const art = this.state.artworks.find((a) => a.id === job.artId);
            if (art && !art.hung) { this.hangArt(art); e.beam(job.hang.x - 0.5, job.hang.y - 0.5, job.hang.z - 0.5); }
            this.finishJob();
          }
        }
        return;
      }
      case 'note': {
        e.target = { x: job.x + 0.5, z: job.z + 0.5 };
        if (e.arrived(1.5)) {
          this.placeNote(job, Date.now());
          e.beam(job.x, job.y, job.z);
          this.finishJob();
        }
        return;
      }
      case 'islet': {
        if (job.stage === 'travel') {
          e.target = { x: job.islet.x, z: job.islet.z, y: WATER_Y + 4 };
          e.lookAt = null;
          job.tt = (job.tt || 0) + dt;
          if (e.arrived(2) || job.tt > 50) { job.stage = 'raise'; job.t = 5; if (this.playerNear(60)) this.say(line('islet', b.personality)); }
          return;
        }
        job.t -= dt;
        e.working = 0.3;
        if (Math.random() < dt * 20) this.g.fx?.spawn(job.islet.x + (Math.random() - 0.5) * job.islet.r * 1.5, WATER_Y, job.islet.z + (Math.random() - 0.5) * job.islet.r * 1.5, 0xbfe9ff, 2, { up: 4, life: 1.2, size: 0.18 });
        if (job.t <= 0) {
          this.g.audio?.chime();
          this.job = this.raiseIslet(job, Date.now());
        }
        return;
      }
      case 'renovate': {
        const p = this.state.projects.find((q) => q.id === job.projectId);
        if (!p) { this.finishJob(); return; }
        if (job.stage === 'travel') {
          e.target = { x: p.x0 + p.w / 2, z: p.z0 + p.d / 2, y: p.baseY + 6 };
          job.tt = (job.tt || 0) + dt;
          if (e.arrived(2.5) || job.tt > 40) { job.stage = 'clear'; job.t = 3; }
          return;
        }
        job.t -= dt;
        e.working = 0.3;
        if (Math.random() < dt * 25) this.g.fx?.spawn(p.x0 + Math.random() * p.w, p.baseY + 1 + Math.random() * 3, p.z0 + Math.random() * p.d, 0xc2a370, 2, { life: 0.6 });
        if (job.t <= 0) { this.doRenovate(job, Date.now()); this.finishJob(); }
        return;
      }
      case 'admire': {
        const p = this.state.projects.find((q) => q.id === job.projectId);
        if (!p) { this.finishJob(); return; }
        if (job.stage === 'travel') {
          e.target = { x: p.entrance.x + 0.5, z: p.entrance.z + 0.5 };
          if (e.arrived(1.5)) { job.stage = 'look'; if (this.playerNear(25)) this.say(line('admire', b.personality, { title: p.title }), { thought: true }); }
          return;
        }
        e.lookAt = { x: p.x0 + p.w / 2, z: p.z0 + p.d / 2 };
        job.t -= dt;
        if (job.t <= 0) this.finishJob();
        return;
      }
      case 'visit': {
        if (!player) { this.finishJob(); return; }
        const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z, d = Math.hypot(dx, dz);
        e.target = { x: player.pos.x - (dx / (d || 1)) * 2, z: player.pos.z - (dz / (d || 1)) * 2, y: player.pos.y + 0.6 };
        e.speed = 7;
        job.t -= dt;
        if (d < 3.5 || job.t <= 0) {
          e.lookAt = player.pos;
          e.mood = 'waving';
          setTimeout(() => { if (e.mood === 'waving') e.mood = 'happy'; }, 2500);
          if (job.text) this.say(job.text);
          this.finishJob();
        }
        return;
      }
      case 'rest':
      default: {
        job.t = (job.t ?? 10) - dt;
        if (!job.spot) {
          if (player && this.playerNear(30)) job.spot = { player: true };
          else { const h = this.hub(); job.spot = { x: h.x + Math.random() * 3 - 1.5, z: h.z + Math.random() * 3 - 1.5 }; }
        }
        if (job.spot.player && player) {
          const d = Math.hypot(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
          if (d > 4) e.target = { x: player.pos.x + 2, z: player.pos.z + 1.5 };
          else e.target = null;
          e.lookAt = player.pos;
        } else {
          e.target = { x: job.spot.x, z: job.spot.z };
          e.lookAt = null;
        }
        e.mood = this.g.sky?.night > 0.8 && !job.spot.player ? 'sleepy' : 'happy';
        this.ambient(dt);
        if (job.t <= 0) { e.mood = 'happy'; this.finishJob(); }
      }
    }
  }

  serialize() {
    this.b.job = this.job ? JSON.parse(JSON.stringify(this.job)) : null;
    this.b.paused = this.paused ? JSON.parse(JSON.stringify(this.paused)) : null;
    if (this.b.job && ['rest', 'admire', 'visit'].includes(this.b.job.kind)) this.b.job = null;
  }
}

export function describeJob(job, buddyName) {
  if (!job) return `${buddyName} is thinking about what to do`;
  switch (job.kind) {
    case 'build':
      if (job.type === 'path') return `${buddyName} is laying a path`;
      if (job.stage === 'travel') return `${buddyName} is heading off to build ${job.title}`;
      return `${buddyName} is building ${job.title}`;
    case 'paint': return job.stage === 'hang' ? `${buddyName} is hanging up a new painting` : job.stage === 'paint' ? `${buddyName} is painting` : `${buddyName} is looking for something to paint`;
    case 'islet': return `${buddyName} is raising a new island`;
    case 'note': return `${buddyName} is writing you a note`;
    case 'admire': return `${buddyName} is admiring the view`;
    case 'renovate': return `${buddyName} is clearing away ${job.title} to make room for something new`;
    case 'visit': return `${buddyName} is coming to say hi`;
    default: return `${buddyName} is taking a break`;
  }
}

export function jobProgress(job) {
  if (job && job.kind === 'build' && job.stage === 'work' && job.ops.length) return job.i / job.ops.length;
  if (job && job.kind === 'paint' && job.stage === 'paint') return null;
  return null;
}

export { formatClock };

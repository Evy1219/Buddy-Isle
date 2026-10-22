import { RNG } from '../core/rng.js';
import { BLUEPRINTS, pickStyle, STYLES, CATALOG } from './blueprints.js';
import { Plan } from './plan.js';
import { findSite, faceToward, findPierSite, findIsletSite, findPath, pathOps, isCoastal, Claims, randomLand, evalSite } from './sites.js';
import { line, ART_TITLES, ART_COMMENTS, IDEA_REASONS, fillTitle } from './voice.js';
import { B, PAINT_COLORS, BLOCKS } from '../world/blocks.js';
import { SEA, WATER_Y } from '../world/terrain.js';
import { plantGrowable } from '../world/growth.js';
import { pickFish, fishSize, makeGift } from './collect.js';
import { formatClock, clamp } from '../core/util.js';

// How fast the buddy works. offlineEvery = one activity per this much time away.
export const PACES = {
  chill: { label: 'Chill', desc: 'About 1 or 2 things an hour while you\'re away', placeDelay: 0.42, restMin: 45, restMax: 110, offlineEvery: 40 * 60e3, offlineMax: 10 },
  normal: { label: 'Normal', desc: 'About 2 or 3 things an hour while you\'re away', placeDelay: 0.26, restMin: 20, restMax: 60, offlineEvery: 24 * 60e3, offlineMax: 20 },
  busy: { label: 'Busy', desc: 'About 6 things an hour while you\'re away', placeDelay: 0.13, restMin: 6, restMax: 20, offlineEvery: 10 * 60e3, offlineMax: 40 },
};

const MAX_ISLETS = 8;
const RENOVATABLE = ['restspot', 'flowerfield', 'mosaic', 'statue', 'arch', 'well', 'sapling', 'pond', 'garden', 'tower'];
const ISLET_NAMES = ['Pebble', 'Clover', 'Sprout', 'Little Moon', 'Driftwood', 'Seashell', 'Lantern', 'Tumble', 'Biscuit', 'Starfish'];
export const FRIEND_LEVELS = [
  { at: 0, name: 'New friends' }, { at: 12, name: 'Pals' }, { at: 35, name: 'Good friends' },
  { at: 70, name: 'Close friends' }, { at: 120, name: 'Best friends' }, { at: 200, name: 'Inseparable' },
];
export function friendLevel(points = 0) {
  let i = 0;
  while (i < FRIEND_LEVELS.length - 1 && points >= FRIEND_LEVELS[i + 1].at) i++;
  const cur = FRIEND_LEVELS[i], next = FRIEND_LEVELS[i + 1];
  return { level: i + 1, name: cur.name, progress: next ? (points - cur.at) / (next.at - cur.at) : 1, next: next ? next.name : null };
}

export const BUILD_TYPES = Object.keys(BLUEPRINTS);
const QUIET_JOBS = ['rest', 'admire', 'visit', 'sleep', 'music', 'dance', 'fireworks', 'sit', 'fish', 'react'];

export class Brain {
  constructor(game) {
    this.g = game;
    this.world = game.world;
    this.state = game.state;
    this.rng = new RNG((Date.now() ^ (game.state.seed * 7)) >>> 0);
    this.claims = new Claims(this.world.size);
    this.claims.rebuild(this.state.projects);
    const b = this.b;
    b.energy ??= 85; b.happy ??= 72; b.friendship ??= 0; b.ideas ||= []; b.dislikes ||= {};
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
    this.togetherT = 0;
    this.lastNear = Date.now();
    this.jumpTimes = [];
    this.weatherSaid = null;
    this.lastLevel = friendLevel(b.friendship).level;
    this.refillIdeas();
  }

  get b() { return this.state.buddy; }
  get pace() { return PACES[this.state.settings.pace] || PACES.normal; }
  get entity() { return this.g.buddyEntity; }
  get night() { return this.g.sky ? this.g.sky.night : 0; }

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

  ctx(extra = {}, rng = this.rng) {
    return {
      buddy: this.b.name, player: this.state.playerName || 'friend', color: this.b.color,
      colorBlock: this.colorBlock(), style: STYLES[pickStyle(rng, this.b.traits)], traits: this.b.traits, ...extra,
    };
  }

  // ---------- feelings ----------
  mood(dHappy = 0, dEnergy = 0) {
    const b = this.b;
    b.happy = clamp(b.happy + dHappy, 0, 100);
    b.energy = clamp(b.energy + dEnergy, 0, 100);
  }

  befriend(points, why = '') {
    const b = this.b;
    b.friendship = (b.friendship || 0) + points;
    const lv = friendLevel(b.friendship);
    if (lv.level > this.lastLevel) {
      this.lastLevel = lv.level;
      this.journal('friend', `${this.state.playerName || 'My friend'} and I are ${lv.name.toLowerCase()} now.${why ? ' ' + why : ''}`);
      if (!this.offline) {
        this.say(line('levelUp', b.personality, { player: this.state.playerName || 'friend', level: lv.name.toLowerCase() }));
        this.entity?.emote('love', 4);
        this.g.fx?.hearts(this.entity.pos.x, this.entity.pos.y + 1.8, this.entity.pos.z, 10);
        this.g.ui?.toast(`You and ${b.name} are now ${lv.name.toLowerCase()}`);
        this.g.audio?.fanfare?.();
        if (lv.level >= 3) this.b.queue.unshift({ type: 'fireworks', why: `we became ${lv.name.toLowerCase()}` });
        if (lv.level === 2) this.b.queue.push({ type: 'gift' });
      }
    }
  }

  baseExpression() {
    const b = this.b;
    if (b.happy >= 85) return 'happy';
    if (b.happy >= 55) return 'happy';
    if (b.happy >= 32) return 'neutral';
    return 'sad';
  }

  // ---------- memory ----------
  journal(kind, text, extra = {}, when = Date.now()) {
    const entry = { id: `j${this.state.nextId++}`, t: when, kind, text, ...extra };
    this.state.journal.push(entry);
    if (this.state.journal.length > 800) this.state.journal.splice(0, this.state.journal.length - 800);
    if (!this.offline) this.g.ui?.refreshJournal?.();
    if (!this.offline && (kind === 'build' || kind === 'paint')) this.g.aiJournal?.(entry);
    return entry;
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

  homeProject() { return this.state.projects.find((p) => p.type === 'cottage' && p.variant === 'home' && p.done); }
  home() { const h = this.homeProject(); return h ? h.entrance : this.hub(); }
  playerHouse() { return this.state.projects.find((p) => p.type === 'cottage' && p.variant === 'player' && p.done); }

  // ---------- ideas: what the buddy wants to build next ----------
  buildWeights() {
    const s = this.state, b = this.b, t = b.traits;
    const count = (type) => s.projects.filter((p) => p.type === type).length;
    const likes = b.likes || {}, dis = b.dislikes || {};
    const w = (type, base, max = 99) => {
      const n = count(type);
      if (n >= max) return 0;
      return base / (1 + n * 0.35) * (1 + (likes[type] || 0) * 0.8) * Math.pow(0.35, dis[type] || 0);
    };
    const unhung = s.artworks.filter((a) => !a.hung).length;
    const builds = s.projects.length;
    const grandMood = b.happy > 80 ? 1.4 : 1;
    return [
      ['cottage', w('cottage', 5, 16) * (1 + t.cozy)],
      ['tower', w('tower', 3, 6) * (1 + t.grand) * grandMood],
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
      ['fountain', builds >= 6 ? w('fountain', 3.5, 3) * (1 + t.cozy / 2) : 0],
      ['gazebo', builds >= 5 ? w('gazebo', 2.5, 3) * (1 + t.cozy) : 0],
      ['ferris', builds >= 10 ? w('ferris', 3, 1) * (1 + t.grand) * grandMood : 0],
      ['balloon', builds >= 9 ? w('balloon', 3, 1) * (1 + t.grand) * grandMood : 0],
      ['observatory', builds >= 12 ? w('observatory', 2.5, 1) * (1 + t.artsy) : 0],
    ];
  }

  ideaReason(type) {
    const b = this.b, player = this.state.playerName || 'you';
    const likes = b.likes || {};
    if (likes[type] > 0) {
      const fact = (b.facts || []).slice().reverse().find((f) => f.text.toLowerCase().includes((CATALOG[type]?.label || type).toLowerCase().split(' ')[0]));
      return fact ? `You told me "${fact.text}", so...` : `You seem to like these, ${player}.`;
    }
    return this.rng.pick(IDEA_REASONS[type] || ['I have a good feeling about this one.']);
  }

  refillIdeas() {
    const b = this.b;
    b.ideas = (b.ideas || []).filter((i) => i && BLUEPRINTS[i.type]);
    let guard = 0;
    while (b.ideas.length < 3 && guard++ < 12) {
      const type = this.rng.weighted(this.buildWeights().filter(([t]) => !b.ideas.some((i) => i.type === t) || t === 'cottage' || t === 'grove'));
      if (!type) break;
      const idea = { id: `i${this.state.nextId++}`, type, reason: this.ideaReason(type), t: Date.now() };
      b.ideas.push(idea);
      if (!this.offline) this.g.aiIdea?.(idea);
    }
  }

  promoteIdea(id) {
    const b = this.b;
    const i = b.ideas.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [idea] = b.ideas.splice(i, 1);
    b.ideas.unshift(idea);
    b.requests.push({ type: idea.type, fromIdea: idea.id });
    this.befriend(0.3);
    const r = this.request(null);
    return r || line('plans', b.personality);
  }

  vetoIdea(id) {
    const b = this.b;
    const i = b.ideas.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [idea] = b.ideas.splice(i, 1);
    b.dislikes[idea.type] = (b.dislikes[idea.type] || 0) + 1;
    this.refillIdeas();
    return line('veto', b.personality);
  }

  // ---------- deciding what to do ----------
  chooseActivity() {
    const s = this.state, b = this.b, rng = this.rng;
    const count = (type) => s.projects.filter((p) => p.type === type).length;
    const ms = b.milestones;
    if (!count('campfire')) return { type: 'campfire' };
    if (!ms.home) return { type: 'cottage', variant: 'home' };
    if (!ms.playerHouse) return { type: 'cottage', variant: 'player' };
    if (!count('grove')) return { type: 'grove' };
    if (!ms.firstPainting) return { type: 'paint' };
    if (!count('garden')) return { type: 'garden' };
    const likes = b.likes || {};
    const unhung = s.artworks.filter((a) => !a.hung).length;
    const signs = s.props.filter((p) => p.type === 'sign' && p.note).length;
    const crowded = this.isCrowded();
    const night = this.night > 0.6;
    const lv = friendLevel(b.friendship).level;
    const now = Date.now();
    const tired = b.energy < 25;
    const items = [
      ['build', crowded ? 0 : (tired ? 3 : 14) * (b.energy > 70 ? 1.2 : 1)],
      ['paint', ((6 + (likes.paint || 0) * 3) * (1 + b.traits.artsy) + (night ? 2 : 0)) / (1 + Math.max(0, unhung - 2) * 0.5)],
      ['note', signs < 8 ? 1.2 : 0],
      ['sapling', crowded ? 6 : 0.8],
      ['gift', lv >= 2 && now - (b.lastGift || 0) > 3 * 3600e3 ? 1.6 + lv * 0.3 : 0],
      ['fish', !night && s.projects.some((p) => p.type === 'pier' && p.done) ? 1.5 : (!night ? 0.5 : 0)],
    ];
    if (!this.offline) {
      items.push(['admire', 2]);
      items.push(['music', night && s.projects.some((p) => (p.type === 'gazebo' || p.type === 'campfire') && p.done) ? 2.5 : 0]);
      items.push(['fireworks', night && b.happy > 82 && now - (b.lastFireworks || 0) > 4 * 3600e3 && this.playerNear(60) ? 2 : 0]);
      items.push(['rest', tired ? 8 : 0.5]);
    }
    if (crowded) {
      if (s.islets.length < MAX_ISLETS && !this.noIsletRoom) items.push(['islet', 25]);
      else items.push(['renovate', 6]);
    }
    const kind = rng.weighted(items);
    if (kind === 'build') {
      this.refillIdeas();
      const idea = b.ideas[0];
      return idea ? { type: idea.type, fromIdea: idea.id } : { type: 'grove' };
    }
    return { type: kind };
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
    // bedtime
    if (!this.offline && this.night > 0.75 && b.energy < 60 && !this.playerNear(20) && this.homeProject()) return this.makeSleepJob();
    while (b.requests.length) {
      const r = b.requests.shift();
      const job = this.makeJob(r.type, { ...r, requested: !r.fromIdea || r.requested });
      if (job) { this.consumeIdea(r.type, r.fromIdea); return job; }
      if (r.type !== 'gift') this.say(line('noSite', b.personality));
    }
    while (b.queue.length) {
      const q = b.queue.shift();
      const job = this.makeJob(q.type, q);
      if (job) return job;
    }
    for (let i = 0; i < 5; i++) {
      const act = this.chooseActivity();
      const job = this.makeJob(act.type, act);
      if (job) { b.failedSites = 0; this.consumeIdea(act.type, act.fromIdea); return job; }
      if (BLUEPRINTS[act.type]) {
        b.failedSites = (b.failedSites || 0) + 1; this.crowdCheck = null;
        if (act.fromIdea) { b.ideas = b.ideas.filter((x) => x.id !== act.fromIdea); this.refillIdeas(); }
      }
    }
    return { kind: 'rest', t: 10 };
  }

  consumeIdea(type, id) {
    const b = this.b;
    const before = b.ideas.length;
    if (id) b.ideas = b.ideas.filter((x) => x.id !== id);
    else if (b.ideas[0] && b.ideas[0].type === type) b.ideas.shift();
    if (b.ideas.length !== before) this.refillIdeas();
  }

  makeJob(type, opts = {}) {
    switch (type) {
      case 'paint': return this.makePaintJob(opts);
      case 'rest': return { kind: 'rest', t: opts.t || 20 };
      case 'admire': {
        const done = this.doneProjects().filter((p) => p.type !== 'path');
        if (!done.length) return null;
        const p = this.rng.pick(done);
        return { kind: 'admire', projectId: p.id, stage: 'travel', t: 5 };
      }
      case 'path': return this.makePathJob(opts);
      case 'pier': return this.makePierJob(opts);
      case 'islet': return this.makeIsletJob(opts);
      case 'note': return this.makeNoteJob(opts);
      case 'renovate': return this.makeRenovateJob(opts);
      case 'visit': return { kind: 'visit', text: opts.text, stage: 'travel', t: 20 };
      case 'gift': return this.makeGiftJob(opts);
      case 'fish': return this.makeFishJob(opts);
      case 'music': return this.makeMusicJob(opts);
      case 'fireworks': return this.makeFireworksJob(opts);
      case 'sleep': return this.makeSleepJob(opts);
      case 'dance': return { kind: 'dance', t: opts.t || 7 };
      default: {
        const bp = BLUEPRINTS[type];
        if (!bp || bp.special) return null;
        return this.makeBuildJob(type, bp, opts);
      }
    }
  }

  anchors() {
    const a = this.doneProjects().concat(this.state.projects.filter((p) => !p.done))
      .map((p) => ({ x: p.x0 + p.w / 2, z: p.z0 + p.d / 2 }));
    if (!a.length) a.push(this.hub());
    return a;
  }

  // Plan a building (also used for previews when you choose where it goes)
  planBuild(type, site, opts = {}, rng = this.rng) {
    const bp = BLUEPRINTS[type];
    const ctx = this.ctx({ variant: opts.variant }, rng);
    bp.pre?.(rng, ctx);
    const S = site.size;
    const cx = site.x0 + S / 2, cz = site.z0 + S / 2;
    if (type === 'lighthouse') {
      const c = this.world.size / 2;
      const ang = Math.atan2(cz - c, cx - c);
      ctx.dirName = ['East', 'South', 'West', 'North'][Math.round(((ang + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2)) % 4];
    }
    const plan = new Plan(this.world, site);
    bp.build(plan, rng, ctx);
    return { plan, ctx, bp };
  }

  // Size + seed for a spot the player picks, so the preview matches what gets built
  previewSize(type, seed) {
    const bp = BLUEPRINTS[type];
    const rng = new RNG(seed);
    const ctx = this.ctx({}, rng);
    bp.pre?.(rng, ctx);
    return bp.size(rng, ctx);
  }

  makeBuildJob(type, bp, opts) {
    let rng = this.rng;
    let site = null;
    if (opts.site) {
      rng = new RNG(opts.seed || this.rng.int(1, 1e9));
      site = { ...opts.site };
      site.rot = opts.rot ?? site.rot ?? 0;
      if (!evalSite(this.world, this.claims, site.x0, site.z0, site.size, { maxSpread: 12 })) return null;
    } else {
      const ctx0 = this.ctx({ variant: opts.variant });
      bp.pre?.(rng, ctx0);
      const S = bp.size(rng, ctx0);
      const siteOpts = { ...(bp.site || {}), anchors: this.anchors(), maxSpread: bp.site?.maxSpread ?? (bp.noLevel ? 7 : 6) };
      let near = opts.near;
      if (!near && type === 'campfire') near = this.state.spawn;
      if (!near && opts.variant === 'home') near = this.hub();
      if (!near && opts.variant === 'player') near = this.hub();
      site = near ? findSite(this.world, this.claims, rng, S, { ...siteOpts, near, minR: type === 'campfire' ? 2 : S * 0.6 + 4, maxR: type === 'campfire' ? 14 : 24 }) : null;
      if (!site) site = findSite(this.world, this.claims, rng, S, siteOpts);
      if (!site) return null;
      const hub = (opts.near && opts.requested) ? opts.near : this.hub();
      site.rot = faceToward(site, hub.x, hub.z);
    }
    const { plan, ctx } = this.planBuild(type, site, opts, rng);
    const SS = site.size;
    const cx = site.x0 + SS / 2, cz = site.z0 + SS / 2;
    let title = bp.name(rng, ctx);
    for (let k = 0; k < 6 && this.state.projects.some((p) => p.title === title); k++) title = bp.name(rng, ctx);
    if (this.state.projects.some((p) => p.title === title)) title += ` No. ${this.state.projects.filter((p) => p.title.startsWith(title)).length + 1}`;
    const ops = plan.ops();
    const project = {
      id: `b${this.state.nextId++}`, type, variant: opts.variant || null, title,
      x0: site.x0, z0: site.z0, w: SS, d: SS, baseY: site.baseY, rot: site.rot,
      entrance: plan.entrance || { x: Math.round(cx), z: Math.round(cz) },
      slots: plan.slots, done: false, created: Date.now(), requested: !!opts.requested,
      extra: { trees: ctx.trees, flowers: ctx.flowers },
    };
    this.claims.mark(project.x0, project.z0, SS, SS);
    this.state.projects.push(project);
    return {
      kind: 'build', type, title, projectId: project.id, ops, i: 0, props: plan.props, growables: plan.growables,
      story: bp.story(ctx, rng), stage: 'travel', cx, cz, y: site.baseY, requested: !!opts.requested,
    };
  }

  // Check a spot the player picked. Returns a site or null.
  siteFor(type, x0, z0, S) {
    const s = evalSite(this.world, this.claims, x0, z0, S, { maxSpread: 9 });
    return s;
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
    plan.putW(x + dx * (L - 2) + px, SEA + 2, z + dz * (L - 2) + pz, B.BARREL);
    const title = BLUEPRINTS.pier.name(this.rng, this.ctx());
    const project = {
      id: `b${this.state.nextId++}`, type: 'pier', title, x0, z0, w: x1 - x0 + 1, d: z1 - z0 + 1, baseY: SEA + 1, rot: 0,
      entrance: { x: x - dx, z: z - dz }, slots: [], done: false, created: Date.now(), requested: !!opts.requested, extra: { end: { x: x + dx * L, z: z + dz * L }, dir: [dx, dz] },
    };
    this.claims.mark(project.x0, project.z0, project.w, project.d);
    this.state.projects.push(project);
    const bx = x + dx * (L - 2) + px * 2.6 + 0.5, bz = z + dz * (L - 2) + pz * 2.6 + 0.5;
    const props = [{ type: 'boat', x: Math.floor(bx), y: SEA + 1, z: Math.floor(bz), bx, bz, byaw: Math.atan2(dx, dz), color: this.rng.pick([0xb5875a, 0xe0584a, 0x4a8fe0, 0xf3efe6]) }];
    return { kind: 'build', type: 'pier', title, projectId: project.id, ops: plan.ops(), i: 0, props, story: BLUEPRINTS.pier.story(), stage: 'travel', cx: x + dx * (L / 2), cz: z + dz * (L / 2), y: SEA + 1, requested: !!opts.requested };
  }

  makeIsletJob() {
    const site = findIsletSite(this.world, this.claims, this.rng, this.state.islets);
    if (!site) { this.noIsletRoom = true; return null; }
    const used = new Set(this.state.islets.map((i) => i.name));
    const name = ISLET_NAMES.find((n) => !used.has(n)) || `Isle ${this.state.islets.length + 1}`;
    return { kind: 'islet', islet: { x: site.x, z: site.z, r: site.r, name }, land: site.land, stage: 'travel', t: 5 };
  }

  openSpotNear(base, r = 7, avoidProps = true) {
    for (let i = 0; i < 50; i++) {
      const x = Math.round(base.x + this.rng.range(-r, r)), z = Math.round(base.z + this.rng.range(-r, r));
      if (this.claims.has(x, z) || this.world.isBuilt(x, z)) continue;
      const y = this.world.surfaceY(x, z);
      if (y <= SEA || (this.world.get(x, y + 1, z) !== B.AIR && !BLOCKS[this.world.get(x, y + 1, z)].plant)) continue;
      if (avoidProps && this.state.props.some((p) => Math.abs(p.x - x) < 2 && Math.abs(p.z - z) < 2)) continue;
      return { x, y: y + 1, z };
    }
    return null;
  }

  makeNoteJob() {
    const house = this.playerHouse();
    const base = house ? house.entrance : this.hub();
    const s = this.openSpotNear(base, 7);
    if (!s) return null;
    const dx = base.x - s.x, dz = base.z - s.z;
    const facing = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dz) || 1];
    return { kind: 'note', ...s, facing, text: this.noteText(), stage: 'travel' };
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
      'Check the plans board. I have ideas!',
    ];
    if (facts.length) opts.push(`I remember: ${facts[this.rng.int(0, facts.length - 1)].text}`);
    return this.rng.pick(opts);
  }

  makeGiftJob() {
    const house = this.playerHouse();
    const toPlayer = !this.offline && this.playerNear(70);
    const base = toPlayer ? { x: this.g.player.pos.x, z: this.g.player.pos.z } : house ? house.entrance : this.hub();
    const s = this.openSpotNear(base, toPlayer ? 2.5 : 4);
    if (!s) return null;
    const item = makeGift(this.g, this.rng);
    return { kind: 'gift', ...s, item, toPlayer, stage: 'travel' };
  }

  makeFishJob() {
    const pier = this.doneProjects().filter((p) => p.type === 'pier' && p.extra?.end);
    let spot = null, look = null;
    if (pier.length) {
      const p = this.rng.pick(pier);
      spot = { x: p.extra.end.x + 0.5, z: p.extra.end.z + 0.5 };
      look = { x: spot.x + p.extra.dir[0] * 4, z: spot.z + p.extra.dir[1] * 4 };
    } else {
      for (let i = 0; i < 60 && !spot; i++) {
        const l = randomLand(this.world, this.rng);
        if (l && isCoastal(this.world, l.x, l.z)) {
          spot = { x: l.x + 0.5, z: l.z + 0.5 };
          for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) if (this.world.surfaceY(l.x + dx, l.z + dz) <= SEA - 1) look = { x: l.x + dx, z: l.z + dz };
        }
      }
    }
    if (!spot) return null;
    return { kind: 'fish', spot, look, stage: 'travel', t: 25 + this.rng.float() * 25 };
  }

  makeMusicJob() {
    const places = this.doneProjects().filter((p) => p.type === 'gazebo' || p.type === 'campfire');
    if (!places.length) return null;
    const p = places.find((q) => q.type === 'gazebo') || places[0];
    return { kind: 'music', spot: { x: p.x0 + p.w / 2, z: p.z0 + p.d / 2 }, title: p.title, stage: 'travel', t: 40 };
  }

  makeFireworksJob(opts = {}) {
    const p = this.playerNear(80) ? this.g.player.pos : this.hub();
    return { kind: 'fireworks', spot: { x: p.x + this.rng.range(-6, 6), z: p.z + this.rng.range(-6, 6) }, stage: 'travel', n: opts.n || this.rng.int(8, 14), why: opts.why || '', t: 0 };
  }

  makeSleepJob() {
    const h = this.homeProject();
    const spot = h ? { x: h.x0 + h.w / 2, z: h.z0 + h.d / 2 + 1 } : this.hub();
    this.say(line('sleepy', this.b.personality));
    return { kind: 'sleep', spot, stage: 'travel' };
  }

  // ---------- painting ----------
  chooseArtKind() {
    const done = this.doneProjects().filter((p) => p.type !== 'path');
    return this.rng.weighted([
      ['landscape', 3], ['sunset', 2], ['night', this.night > 0.5 ? 4 : 1.5], ['sea', 2], ['flowers', 2],
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
    this.mood(3, -3);
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
    const s = this.openSpotNear(h, 5);
    if (!s) return null;
    const dx = h.x - s.x, dz = h.z - s.z;
    const facing = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx) || 1, 0] : [0, Math.sign(dz) || 1];
    return { ...s, facing };
  }

  hangArt(art) {
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
    if (job.kind !== 'build') return;
    b.stats.blocks += job.ops.length;
    this.g.holo?.clear();
    if (job.type === 'path') { b.stats.paths = (b.stats.paths || 0) + 1; return; }
    const project = this.state.projects.find((p) => p.id === job.projectId);
    if (project) { project.done = true; project.completed = when; }
    for (const pr of job.props || []) this.g.props.add({ ...pr });
    for (const gr of job.growables || []) plantGrowable(this.state, gr.x, gr.y, gr.z, gr.kind, gr.tree ? { tree: gr.tree } : {}, when);
    b.stats.builds++;
    if (job.type === 'grove' || job.type === 'sapling') b.stats.trees += project?.extra?.trees || 1;
    if (job.type === 'cottage' && project?.variant === 'home') b.milestones.home = true;
    if (job.type === 'cottage' && project?.variant === 'player') b.milestones.playerHouse = true;
    this.mood(6, 0);
    if (job.requested) this.befriend(0.5);
    const text = job.requested ? `${job.story} (You asked for this one!)` : job.story;
    this.journal('build', text, { projectId: job.projectId, title: job.title, type: job.type }, when);
    if (!this.offline) {
      this.g.ui?.toast(`${b.name} finished ${job.title}`);
      if (this.playerNear(40)) { this.say(line('finishBuild', b.personality, { title: job.title })); this.entity.emote('excited', 2.5); this.entity.jump(4); }
      this.g.audio?.chime();
      const e = this.entity;
      for (let i = 0; i < 14; i++) this.g.fx?.sparkle(job.cx + (Math.random() - 0.5) * 6, job.y + 1 + Math.random() * 5, job.cz + (Math.random() - 0.5) * 6, 0xffe8a0, 1, 0.3);
      if (b.stats.builds % 10 === 0 && this.night > 0.5) b.queue.push({ type: 'fireworks', why: `my ${b.stats.builds}th build` });
      e.setTool(null);
    }
    if (job.type !== 'pier' && job.type !== 'islet') b.queue.push({ type: 'path', projectId: job.projectId });
    if (job.type === 'gallery' || (project?.slots?.length)) {
      for (const art of this.state.artworks.filter((a) => !a.hung)) if (!this.hangArt(art)) break;
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
    this.mood(8, -10);
    return { kind: 'build', type: 'islet', title: project.title, projectId: project.id, ops, i: 0, props: [], stage: 'work', cx: it.x, cz: it.z, y: SEA + 2, story: `Raised a brand new little island out of the sea and built a bridge to it. I'm calling it ${it.name} Isle.` };
  }

  // ---------- instant (used for "while you were away") ----------
  runInstant(job, when) {
    if (!job) return null;
    switch (job.kind) {
      case 'build': {
        for (let i = job.i; i < job.ops.length; i++) { const o = job.ops[i]; this.world.set(o[0], o[1], o[2], o[3]); }
        job.i = job.ops.length;
        this.mood(0, -job.ops.length * 0.012);
        this.complete(job, when);
        return job.type === 'path' ? null : { kind: 'build', title: job.title, type: job.type, projectId: job.projectId, when };
      }
      case 'paint': {
        const art = job.art ? this.state.artworks.find((a) => a.id === job.art) : this.finishPainting(job, when);
        if (art && !art.hung) this.hangArt(art);
        return { kind: 'paint', title: art.title, artId: art.id, when };
      }
      case 'islet': return this.runInstant(this.raiseIslet(job, when), when);
      case 'renovate': this.doRenovate(job, when); return null;
      case 'note': this.placeNote(job, when); return { kind: 'note', title: 'a note for you', text: job.text, when };
      case 'gift': this.placeGift(job, when); return { kind: 'gift', title: 'a present', when };
      case 'fish': {
        const caught = this.buddyFish(when);
        return caught ? { kind: 'fish', title: caught.name, when } : null;
      }
      default: return null;
    }
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

  placeGift(job, when) {
    this.g.props.add({ type: 'gift', x: job.x, y: job.y, z: job.z, item: job.item, created: when, colorIdx: this.rng.int(0, 3) });
    this.b.lastGift = when;
    this.journal('gift', job.toPlayer ? 'Gave you a present! I hope you like it.' : 'Left a present by your house. It has a bow on it. You can\'t miss it.', {}, when);
  }

  buddyFish(when) {
    const f = pickFish({ where: 'sea', night: false, rain: false }, () => this.rng.float());
    if (this.rng.chance(0.3) || f.junk) { this.journal('fish', 'Went fishing. Nothing was biting, but the water was nice.', {}, when); return null; }
    const size = fishSize(f, () => this.rng.float());
    this.b.fishCaught = (this.b.fishCaught || 0) + 1;
    this.journal('fish', `Went fishing and caught a ${size} cm ${f.name}. I let it go again.`, {}, when);
    return f;
  }

  // ---------- requests from the player ----------
  request(type, opts = {}) {
    const b = this.b;
    if (this.mode !== 'auto') this.mode = 'auto';
    if (type) b.requests.push({ type, ...opts });
    if (this.job && this.job.kind === 'sleep') { this.wake(); }
    const busy = this.job && ['build', 'paint', 'islet', 'note', 'gift'].includes(this.job.kind);
    if (busy) {
      if (this.job.kind === 'build' && this.job.i === 0 && this.job.stage === 'travel') this.cancelJob();
      else if (this.job.kind === 'build' && this.job.type === 'path') { this.job = null; this.g.holo?.clear(); }
      else return line('ackLater', b.personality, { current: this.job.kind === 'paint' ? 'this painting' : this.job.kind === 'note' ? 'this note' : this.job.kind === 'gift' ? 'this surprise' : this.job.title });
    } else {
      this.endQuietJob();
      this.job = null;
    }
    this.idleT = 0;
    return null;
  }

  endQuietJob() {
    const e = this.entity;
    if (!e) return;
    e.pose = 'hover'; e.setTool(null); e.mood = 'happy';
    this.g.props?.removeTemp();
  }

  cancelJob() {
    const j = this.job;
    if (!j) return;
    if (j.kind === 'build' && j.projectId && j.i === 0) {
      this.state.projects = this.state.projects.filter((p) => p.id !== j.projectId);
      this.claims.rebuild(this.state.projects);
    }
    this.g.holo?.clear();
    this.job = null;
  }

  interrupt(job) {
    if (this.job && ['build', 'paint', 'islet', 'gift'].includes(this.job.kind) && !this.paused) this.paused = this.job;
    if (this.job && this.job.kind === 'sleep') this.wake(true);
    this.endQuietJob();
    this.job = job;
  }

  wake(silent = false) {
    const e = this.entity;
    if (e) { e.pose = 'hover'; e.mood = 'happy'; }
    if (this.job && this.job.kind === 'sleep') this.job = null;
    if (!silent) this.say(line(this.night > 0.5 ? 'wokenUp' : 'wake', this.b.personality, { player: this.state.playerName || 'friend' }));
  }

  finishJob() {
    const was = this.job;
    this.job = null;
    this.endQuietJob();
    if (this.paused) { this.job = this.paused; this.paused = null; if (this.job.kind === 'build') this.job.stage = 'travel'; return; }
    if (was && ['build', 'paint', 'note', 'islet', 'gift'].includes(was.kind) && !this.b.requests.length) {
      const p = this.pace;
      const tiredMul = this.b.energy < 30 ? 1.8 : 1;
      if (!(was.kind === 'build' && was.type === 'path')) this.job = { kind: 'rest', t: this.rng.range(p.restMin, p.restMax) * tiredMul };
      if (this.b.energy < 25 && this.playerNear(30) && Math.random() < 0.5) this.say(line('tired', this.b.personality));
    }
    this.idleT = 0.5;
  }

  // ---------- reacting to the player ----------
  onPlayerJump() {
    const now = performance.now();
    this.jumpTimes = this.jumpTimes.filter((t) => now - t < 2500);
    this.jumpTimes.push(now);
    if (this.jumpTimes.length >= 3 && this.playerNear(7) && this.job?.kind !== 'sleep') { this.entity.jump(5); this.entity.emote('excited', 1.5); this.jumpTimes = []; }
  }

  pet() {
    const e = this.entity;
    if (this.job && this.job.kind === 'sleep') this.wake();
    e.emote('love', 3);
    e.jump(2.5);
    this.g.fx?.hearts(e.pos.x, e.pos.y + 1.9, e.pos.z, 6);
    const now = Date.now();
    if (now - (this.lastPet || 0) > 15000) { this.mood(5); this.befriend(1); }
    this.lastPet = now;
    this.say(line('pet', this.b.personality));
    this.g.audio?.purr?.();
  }

  highFive() {
    const e = this.entity;
    e.emote('excited', 2);
    e.mood = 'waving';
    setTimeout(() => { if (e.mood === 'waving') e.mood = 'happy'; }, 1200);
    this.g.fx?.sparkle(e.pos.x, e.pos.y + 1.5, e.pos.z, 0xffe27a, 6, 0.5);
    this.mood(3);
    this.befriend(0.4);
    this.say(line('highfive', this.b.personality));
    this.g.audio?.clap?.();
  }

  sitWith(seat) {
    this.mode = 'sit';
    this.sitSpot = seat;
    this.sitT = 0;
    if (this.job && ['build', 'paint', 'islet', 'gift'].includes(this.job.kind) && !this.paused) this.paused = this.job;
    this.job = null;
    this.say(line('sitWith', this.b.personality));
  }

  standUp() {
    if (this.mode === 'sit') {
      this.mode = 'auto';
      this.entity.pose = 'hover';
      if (this.paused && !this.job) { this.job = this.paused; this.paused = null; if (this.job.kind === 'build') this.job.stage = 'travel'; }
    }
  }

  hangOut(on = true) {
    if (on) {
      if (this.job && this.job.kind === 'sleep') this.wake(true);
      if (this.job && ['build', 'paint', 'islet', 'gift'].includes(this.job.kind) && !this.paused) this.paused = this.job;
      this.endQuietJob();
      this.job = null;
      this.mode = 'hang';
    } else {
      this.mode = 'auto';
      if (this.paused && !this.job) { this.job = this.paused; this.paused = null; if (this.job.kind === 'build') this.job.stage = 'travel'; }
    }
  }

  // ---------- live behaviour ----------
  update(dt) {
    const e = this.entity;
    if (!e) return;
    const player = this.g.player;
    const b = this.b;
    this.thoughtT -= dt;
    // eyes follow you when you're close
    const near = this.playerNear(16);
    e.eyeTarget = near ? { x: player.pos.x, y: player.pos.y + 1.6, z: player.pos.z } : (e.lookAt ? { x: e.lookAt.x, y: e.pos.y + 0.6, z: e.lookAt.z } : null);
    e.baseExpr = this.baseExpression();
    // time together makes you closer; happiness drifts back toward normal
    if (near) {
      this.togetherT += dt;
      if (this.togetherT > 60) { this.togetherT = 0; this.befriend(this.mode === 'sit' || this.mode === 'hang' ? 0.6 : 0.25); this.mood(1.5); }
      if (Date.now() - this.lastNear > 150e3 && this.job?.kind !== 'sleep' && this.mode === 'auto' && !this.g.player.riding) {
        e.emote('happy', 2); e.mood = 'waving'; setTimeout(() => { if (e.mood === 'waving') e.mood = 'happy'; }, 1800);
        this.say(line('returnHi', b.personality, { player: this.state.playerName || 'friend' }));
      }
      this.lastNear = Date.now();
    }
    b.happy += (62 - b.happy) * dt * 0.0006;
    this.weatherReact();

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
    if (this.mode === 'hang' && player) {
      const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z, d = Math.hypot(dx, dz);
      if (d > 3.2) { const tx = player.pos.x - (dx / d) * 2.4, tz = player.pos.z - (dz / d) * 2.4; e.target = { x: tx, z: tz, y: Math.max(player.pos.y + 0.6, e.hoverY(tx, tz)) }; e.speed = Math.max(4.2, d * 0.9); }
      else e.target = null;
      e.lookAt = player.pos;
      if (this.thoughtT > 40) this.thoughtT = 40;
      this.ambient(dt);
      b.energy = Math.min(100, b.energy + dt * 0.04);
      return;
    }
    if (this.mode === 'sit' && this.sitSpot) {
      const s = this.sitSpot;
      e.target = { x: s.x, z: s.z };
      e.lookAt = s.look || null;
      if (e.arrived(0.5)) e.pose = 'sit';
      this.sitT += dt;
      if (this.sitT > 35 + Math.random() * 30) { this.sitT = 0; this.say(line('sitIdle', b.personality), { thought: true }); }
      b.energy = Math.min(100, b.energy + dt * 0.08);
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

  weatherReact() {
    const w = this.g.weather;
    if (!w || this.offline || !this.playerNear(30)) return;
    const k = w.rainbow > 0.5 ? 'rainbow' : w.kind === 'rain' && w.rain > 0.6 ? 'rain' : w.kind === 'snow' && w.snow > 0.6 ? 'snow' : null;
    if (k && k !== this.weatherSaid) {
      this.weatherSaid = k;
      const dreamy = this.b.personality === 'dreamy';
      if (k === 'rain') this.mood(dreamy ? 4 : -2);
      if (k === 'rainbow') { this.mood(6); this.entity.emote('excited', 3); }
      this.say(line(k, this.b.personality));
    } else if (!k && this.weatherSaid && w.kind === 'clear') this.weatherSaid = null;
  }

  ambient() {
    if (this.thoughtT > 0) return;
    this.thoughtT = 70 + Math.random() * 80;
    if (!this.playerNear(22)) return;
    const b = this.b;
    if (b.happy < 32 && Math.random() < 0.6) { this.say(line('sad', b.personality)); return; }
    const el = this.g.sky?.elevation ?? 0.5;
    if (el > -0.02 && el < 0.12 && this.g.sky.sunDir.x < 0 && Math.random() < 0.6) { this.say(line('sunset', b.personality)); return; }
    const night = this.night > 0.6;
    const key = night && Math.random() < 0.5 ? 'night' : 'idle';
    this.say(line(key, b.personality), { thought: true });
  }

  step(job, dt) {
    const e = this.entity, b = this.b, player = this.g.player;
    switch (job.kind) {
      case 'build': {
        const holo = this.g.holo;
        if (holo && !job.silent && holo.key !== job.projectId && this.playerNear(110)) holo.show(job.ops.slice(job.i), job.projectId, 0x7fe6ff, 0.4), job.holoBase = job.i;
        if (job.stage === 'travel') {
          e.lookAt = null;
          e.setTool(null);
          e.target = { x: job.cx, z: job.cz, y: job.y + 4 };
          job.tt = (job.tt || 0) + dt;
          if (e.arrived(2.5) || job.tt > 40) {
            job.stage = 'work';
            if (!job.silent && job.i === 0 && this.playerNear(45)) this.say(line('startBuild', b.personality, { title: job.title }));
          }
          return;
        }
        e.setTool('hammer');
        this.placeT -= dt;
        let placed = 0;
        const tiredSlow = b.energy < 20 ? 1.4 : 1;
        const popNear = this.playerNear(70) && this.g.pop;
        while (this.placeT <= 0 && job.i < job.ops.length && placed < 6) {
          const idx = job.i++;
          const o = job.ops[idx];
          if (holo && holo.key === job.projectId) holo.hideOp(idx - (job.holoBase || 0));
          if (this.world.get(o[0], o[1], o[2]) === o[3]) continue;
          const def = BLOCKS[o[3]];
          if (popNear && o[3] !== B.AIR && def.shape === 'cube' && !def.transparent) this.g.pop.add(o[0], o[1], o[2], o[3]);
          else this.world.set(o[0], o[1], o[2], o[3]);
          placed++;
          b.energy = Math.max(0, b.energy - 0.025);
          const delay = (o[3] === B.AIR ? 0.3 : def.shape === 'boxes' ? 0.7 : 1) * this.pace.placeDelay * (job.silent ? 0.6 : 1) * tiredSlow;
          this.placeT += delay;
          const ox = o[0] + 0.5 - job.cx, oz = o[2] + 0.5 - job.cz;
          const ol = Math.hypot(ox, oz) || 1;
          const tx = o[0] + 0.5 + (ox / ol) * 2.2, tz = o[2] + 0.5 + (oz / ol) * 2.2, ty = o[1] + 1.4;
          if (!e.target || Math.hypot(e.target.x - tx, e.target.z - tz) > 2.6 || Math.abs((e.target.y ?? 0) - ty) > 2) e.target = { x: tx, z: tz, y: ty };
          e.lookAt = { x: o[0] + 0.5, z: o[2] + 0.5 };
          e.working = 0.4;
          if (o[3] !== B.AIR) {
            e.beam(o[0], o[1], o[2]);
            this.g.fx?.sparkle(o[0] + 0.5, o[1] + 0.6, o[2] + 0.5, 0xffffff, 1, 0.4);
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
          e.setTool('brush');
          if (Math.random() < dt * 4) {
            const cols = [0xdc4545, 0xf5d43c, 0x5b8fe6, 0x7cc957, 0xec8bbd, b.color];
            const c = cols[Math.floor(Math.random() * cols.length)];
            e.brushTip?.color?.setHex?.(c);
            this.g.fx?.spawn(job.easel.x + 0.5, job.easel.y + 1.1, job.easel.z + 0.5, c, 1, { size: 0.07, life: 0.6, up: 0.6, speed: 0.8 });
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
      case 'gift': {
        if (job.toPlayer && player) { job.x = Math.floor(player.pos.x + Math.sin(player.facing) * 2); job.z = Math.floor(player.pos.z + Math.cos(player.facing) * 2); job.y = this.world.groundY(job.x, job.z) + 1; }
        e.target = { x: job.x + 0.5, z: job.z + 0.5 };
        job.tt = (job.tt || 0) + dt;
        if (e.arrived(1.6) || job.tt > 40) {
          if (this.world.get(job.x, job.y, job.z) !== B.AIR && !BLOCKS[this.world.get(job.x, job.y, job.z)].plant) { const s = this.openSpotNear({ x: job.x, z: job.z }, 3, false); if (s) Object.assign(job, s); }
          this.placeGift(job, Date.now());
          e.beam(job.x, job.y, job.z, 0xff8fb6);
          this.g.fx?.sparkle(job.x + 0.5, job.y + 0.6, job.z + 0.5, 0xffe8a0, 8, 0.6);
          this.say(line(job.toPlayer && this.playerNear(12) ? 'giftGive' : 'giftLeft', b.personality, { player: this.state.playerName || 'friend' }));
          e.emote('excited', 2.5);
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
        if (Math.random() < dt * 20) this.g.fx?.splash(job.islet.x + (Math.random() - 0.5) * job.islet.r * 1.5, WATER_Y, job.islet.z + (Math.random() - 0.5) * job.islet.r * 1.5, 4, 1.5);
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
        if (Math.random() < dt * 25) this.g.fx?.smoke(p.x0 + Math.random() * p.w, p.baseY + 1 + Math.random() * 3, p.z0 + Math.random() * p.d, { color: 0xc2a370, life: 2 });
        if (job.t <= 0) { this.doRenovate(job, Date.now()); this.finishJob(); }
        return;
      }
      case 'fish': {
        if (job.stage === 'travel') {
          e.target = { x: job.spot.x, z: job.spot.z };
          job.tt = (job.tt || 0) + dt;
          if (e.arrived(0.8) || job.tt > 45) { job.stage = 'fish'; if (this.playerNear(35)) this.say(line('fishStart', b.personality)); }
          return;
        }
        e.target = null;
        e.setTool('rod');
        if (job.look) e.lookAt = job.look;
        job.t -= dt;
        if (job.look && Math.random() < dt * 0.6) this.g.fx?.splash(job.look.x + 0.5, WATER_Y, job.look.z + 0.5, 2, 0.3);
        if (job.t <= 0) {
          const f = this.buddyFish(Date.now());
          if (this.playerNear(35)) this.say(f ? line('fishCaught', b.personality, { fish: f.name }) : line('fishNone', b.personality));
          if (f && job.look) this.g.fx?.splash(job.look.x + 0.5, WATER_Y, job.look.z + 0.5, 10, 1);
          this.finishJob();
        }
        return;
      }
      case 'music': {
        if (job.stage === 'travel') {
          e.target = { x: job.spot.x, z: job.spot.z };
          job.tt = (job.tt || 0) + dt;
          if (e.arrived(1) || job.tt > 45) { job.stage = 'play'; if (this.playerNear(40)) this.say(line('music', b.personality)); this.g.audio?.startTune?.(job.spot); }
          return;
        }
        e.target = null;
        e.pose = 'dance';
        job.t -= dt;
        job.nt = (job.nt || 0) - dt;
        if (job.nt <= 0) { job.nt = 0.5; this.g.fx?.notes(e.pos.x, e.pos.y + 1.9, e.pos.z, [0xffd27a, 0x9fd0ff, 0xff9ad5, 0xb8ff9a][Math.floor(Math.random() * 4)]); }
        if (job.t <= 0 || (this.night < 0.3)) { this.g.audio?.stopTune?.(); this.journal('music', `Played music at ${job.title} under the stars.`); this.mood(4, 2); this.finishJob(); }
        return;
      }
      case 'fireworks': {
        if (job.stage === 'travel') {
          e.target = { x: job.spot.x, z: job.spot.z };
          job.tt = (job.tt || 0) + dt;
          if (e.arrived(1.5) || job.tt > 30) { job.stage = 'launch'; job.t = 0; this.say(line('fireworks', b.personality)); }
          return;
        }
        e.target = null;
        e.emote('excited', 1);
        job.t -= dt;
        if (job.t <= 0 && job.n > 0) {
          job.n--;
          job.t = 0.8 + Math.random() * 1.6;
          const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 14;
          const x = job.spot.x + Math.cos(a) * r, z = job.spot.z + Math.sin(a) * r;
          const gy = Math.max(this.world.groundY(x, z) + 1, WATER_Y);
          this.g.fx?.firework(x, gy, z, job.n === 0 ? { kind: 'heart', colors: [0xff6b9a, 0xffb6d0] } : {});
        }
        if (job.n <= 0 && job.t <= -4) {
          b.lastFireworks = Date.now();
          this.journal('fireworks', `Set off fireworks${job.why ? ' to celebrate ' + job.why : ''}! The last one was a heart.`);
          this.mood(8);
          this.finishJob();
        }
        return;
      }
      case 'sleep': {
        if (job.stage === 'travel') {
          e.target = { x: job.spot.x, z: job.spot.z };
          job.tt = (job.tt || 0) + dt;
          if (e.arrived(0.8) || job.tt > 50) { job.stage = 'sleep'; this.journal('sleep', 'Went to bed. Building more tomorrow!'); }
          return;
        }
        e.target = null;
        e.pose = 'sleep';
        b.energy = Math.min(100, b.energy + dt * 0.5);
        if ((this.night < 0.25 && b.energy > 60) || b.energy >= 100) { this.wake(!this.playerNear(25)); this.finishJob(); }
        return;
      }
      case 'dance': {
        e.target = null;
        e.pose = 'dance';
        job.t -= dt;
        job.nt = (job.nt || 0) - dt;
        if (job.nt <= 0) { job.nt = 0.6; this.g.fx?.notes(e.pos.x, e.pos.y + 1.9, e.pos.z, 0xffd27a); }
        if (job.t <= 0) this.finishJob();
        return;
      }
      case 'admire': {
        const p = this.state.projects.find((q) => q.id === job.projectId);
        if (!p) { this.finishJob(); return; }
        if (job.stage === 'travel') {
          e.target = { x: p.entrance.x + 0.5, z: p.entrance.z + 0.5 };
          job.tt = (job.tt || 0) + dt;
          if (e.arrived(1.5) || job.tt > 40) { job.stage = 'look'; if (this.playerNear(25)) this.say(line('admire', b.personality, { title: p.title }), { thought: true }); }
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
        b.energy = Math.min(100, b.energy + dt * 0.05);
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
        e.mood = this.night > 0.8 && !job.spot.player ? 'sleepy' : 'happy';
        this.ambient(dt);
        if (job.t <= 0) { e.mood = 'happy'; this.finishJob(); }
      }
    }
  }

  serialize() {
    this.b.job = this.job ? JSON.parse(JSON.stringify(this.job)) : null;
    this.b.paused = this.paused ? JSON.parse(JSON.stringify(this.paused)) : null;
    if (this.b.job && QUIET_JOBS.includes(this.b.job.kind)) this.b.job = null;
  }
}

export function describeJob(job, buddyName, mode = 'auto') {
  if (mode === 'sit') return `${buddyName} is sitting with you`;
  if (mode === 'hang') return `${buddyName} is hanging out with you`;
  if (mode === 'follow') return `${buddyName} is following you`;
  if (mode === 'stay') return `${buddyName} is waiting where you left them`;
  if (!job) return `${buddyName} is thinking about what to do`;
  switch (job.kind) {
    case 'build':
      if (job.type === 'path') return `${buddyName} is laying a path`;
      if (job.stage === 'travel') return `${buddyName} is heading off to build ${job.title}`;
      return `${buddyName} is building ${job.title}`;
    case 'paint': return job.stage === 'hang' ? `${buddyName} is hanging up a new painting` : job.stage === 'paint' ? `${buddyName} is painting` : `${buddyName} is looking for something to paint`;
    case 'islet': return `${buddyName} is raising a new island`;
    case 'note': return `${buddyName} is writing you a note`;
    case 'gift': return `${buddyName} is up to something (a surprise?)`;
    case 'fish': return `${buddyName} is fishing`;
    case 'music': return `${buddyName} is playing music`;
    case 'fireworks': return `${buddyName} is setting off fireworks`;
    case 'sleep': return job.stage === 'sleep' ? `${buddyName} is asleep` : `${buddyName} is heading to bed`;
    case 'dance': return `${buddyName} is dancing`;
    case 'admire': return `${buddyName} is admiring the view`;
    case 'renovate': return `${buddyName} is clearing away ${job.title} to make room for something new`;
    case 'visit': return `${buddyName} is coming to say hi`;
    default: return `${buddyName} is taking a break`;
  }
}

export function jobProgress(job) {
  if (job && job.kind === 'build' && job.stage === 'work' && job.ops.length) return job.i / job.ops.length;
  return null;
}

export { formatClock };

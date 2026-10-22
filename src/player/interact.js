import * as THREE from 'three';
import { BLOCKS, B } from '../world/blocks.js';
import { SEA, WATER_Y } from '../world/terrain.js';
import { RIDES } from '../world/props.js';
import { pickFish, fishSize } from '../buddy/collect.js';
import { line } from '../buddy/voice.js';

const _v = new THREE.Vector3();

// Works out what you're next to and what pressing E would do.
export class Interact {
  constructor(game) {
    this.g = game;
    this.target = null;
    this.fish = null;
    this.scope = null;
    this.bobber = this._makeBobber();
    game.scene.add(this.bobber);
    const lg = new THREE.BufferGeometry().setFromPoints(new Array(10).fill(0).map(() => new THREE.Vector3()));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xf3efe6, transparent: true, opacity: 0.8 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    game.scene.add(this.line);
  }

  _makeBobber() {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xe0484a }));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    g.add(top, bot);
    g.visible = false;
    return g;
  }

  // ---------- finding the target ----------
  scan() {
    const g = this.g, p = g.player;
    if (g.mode !== 'play' || g.buildMode.active || g.placement?.active) return null;
    if (this.scope) return { kind: 'scope', label: 'Stop looking', key: 'E' };
    if (this.fish) return this.fish.state === 'bite' ? { kind: 'reel', label: 'Reel it in!', key: 'E', urgent: true } : { kind: 'reel', label: 'Reel in', key: 'E' };
    if (p.riding) {
      const r = p.riding;
      if (r.kind === 'balloon') return { kind: 'ride-info', label: g.props.rideDone(r.propId) ? 'Get out' : 'Enjoy the view', key: g.props.rideDone(r.propId) ? 'E' : '' };
      if (r.kind === 'boat') return { kind: 'unride', label: this._shoreNear() ? 'Get out of the boat' : 'Row with W A S D, get out near the shore', key: this._shoreNear() ? 'E' : '' };
      return { kind: 'unride', label: 'Get off', key: 'E' };
    }
    if (p.sitting || p.lying) return { kind: 'stand', label: 'Stand up', key: 'E' };
    const pos = p.pos;
    const fwd = p.forward(); fwd.y = 0; fwd.normalize();
    const cands = [];
    const add = (c, x, y, z, reach) => {
      const dx = x - pos.x, dz = z - pos.z, d = Math.hypot(dx, dz);
      if (d > reach || Math.abs(y - pos.y) > 3) return;
      const dot = d > 0.3 ? (dx * fwd.x + dz * fwd.z) / d : 1;
      if (dot < -0.2 && d > 1.2) return;
      cands.push({ ...c, score: d - dot * 1.2 + (c.bonus || 0) });
    };
    const e = g.buddyEntity.pos;
    add({ kind: 'buddy', label: `Talk to ${g.state.buddy.name}`, bonus: -0.8 }, e.x, e.y, e.z, 3.4);
    const critter = g.life.nearestCritter(pos, 2.6);
    if (critter) add({ kind: 'critter', critter, label: `Pet the ${critter.kind}` }, critter.x, critter.y, critter.z, 2.6);
    for (const it of g.props.interactables()) {
      const pr = g.props.get(it.id);
      if (!pr) continue;
      const o = it.pos;
      if (it.kind === 'gift') add({ kind: 'gift', id: it.id, label: 'Open the present', bonus: -1 }, o.x, o.y, o.z, 2.6);
      else if (it.kind === 'art') add({ kind: 'art', id: it.id, label: 'Look at the painting' }, o.x, o.y - 0.5, o.z, 3.2);
      else if (it.kind === 'sign') add({ kind: 'sign', id: it.id, label: pr.note ? 'Read the note' : 'Read the sign' }, o.x, o.y, o.z, 2.6);
      else if (it.kind === 'telescope') add({ kind: 'telescope', id: it.id, label: 'Look through the telescope' }, o.x, o.y, o.z, 2.6);
      else if (it.kind === 'ferris') add({ kind: 'ride', ride: 'ferris', id: it.id, label: RIDES.ferris }, o.x, o.y, o.z, 6.5);
      else if (it.kind === 'balloon') add({ kind: 'ride', ride: 'balloon', id: it.id, label: RIDES.balloon }, o.x, o.y, o.z, 3);
      else if (it.kind === 'boat') add({ kind: 'ride', ride: 'boat', id: it.id, label: RIDES.boat }, o.x, pos.y, o.z, 3.4);
    }
    // seats and beds around you
    const bx = Math.floor(pos.x), by = Math.floor(pos.y), bz = Math.floor(pos.z);
    for (let dy = -1; dy <= 1; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = bx + dx, y = by + dy, z = bz + dz;
      const id = g.world.get(x, y, z);
      const def = BLOCKS[id];
      if (!def.seat) continue;
      if (BLOCKS[g.world.get(x, y + 1, z)].solid) continue;
      if (def.bed) add({ kind: 'bed', x, y, z, label: g.sky.night > 0.5 ? 'Sleep until morning' : 'Take a nap' }, x + 0.5, y, z + 0.5, 2.3);
      else add({ kind: 'seat', x, y, z, id, label: 'Sit down' }, x + 0.5, y, z + 0.5, 2.1);
    }
    // water in front of you: fishing
    if (!p.inWater) {
      const w = this._waterAhead(fwd);
      if (w) cands.push({ kind: 'fish', label: 'Fish', water: w, score: 2.4 });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.score - b.score);
    return { ...cands[0], key: 'E' };
  }

  _waterAhead(fwd) {
    const p = this.g.player.pos, w = this.g.world;
    for (let d = 1.5; d <= 4.5; d += 0.5) {
      const x = p.x + fwd.x * d, z = p.z + fwd.z * d;
      const fx = Math.floor(x), fz = Math.floor(z);
      const top = w.top(fx, fz);
      const id = w.get(fx, top, fz);
      if (id === B.WATER && top <= p.y + 0.5) return { x, y: top + 0.86, z, where: top > SEA + 1 ? 'pond' : 'sea' };
      // open sea: the whole column is under the water (so not a pier, a boat ramp or a bridge)
      if (top < SEA && w.surfaceY(fx, fz) < WATER_Y - 0.9 && Math.abs(p.y - WATER_Y) < 3) return { x, y: WATER_Y, z, where: 'sea' };
    }
    return null;
  }

  _shoreNear() {
    const p = this.g.player.pos, w = this.g.world;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      for (let d = 1.5; d <= 3.5; d += 0.5) {
        const x = Math.floor(p.x + Math.cos(ang) * d), z = Math.floor(p.z + Math.sin(ang) * d);
        const g = w.groundY(x, z);
        if (g >= SEA && !BLOCKS[w.get(x, g + 1, z)].solid && !BLOCKS[w.get(x, g + 2, z)].solid) return { x: x + 0.5, y: g + 1, z: z + 0.5 };
      }
    }
    return null;
  }

  update(dt) {
    this.target = this.scan();
    this.g.ui.setPrompt(this.target);
    if (this.scope) this.g.camera.position.y = this.scope.camY;
    if (this.fish) this._fishUpdate(dt);
    const p = this.g.player;
    if (p.riding && p.riding.kind === 'balloon' && this.g.props.rideDone(p.riding.propId)) {
      // the tour is over: step out
      const home = this.g.props.obj(p.riding.propId).userData.home;
      this.g.props.resetRide(p.riding.propId);
      this.g.props.riding = null;
      p.dismount({ x: home.x + 1.8, y: home.y, z: home.z });
      this.g.onRideEnd?.('balloon');
    }
  }

  // ---------- pressing E ----------
  press() {
    const t = this.target, g = this.g, p = g.player;
    if (!t || !t.key) return false;
    switch (t.kind) {
      case 'scope': this.stopScope(); break;
      case 'reel': this._reel(); break;
      case 'unride': {
        const r = p.riding;
        if (r.kind === 'boat') {
          const s = this._shoreNear();
          if (!s) return true;
          const pr = g.props.get(r.propId), obj = g.props.obj(r.propId);
          if (pr && obj) { pr.bx = obj.position.x; pr.bz = obj.position.z; pr.byaw = obj.rotation.y; }
          g.props.riding = null;
          p.dismount(s);
        } else if (r.kind === 'ferris') {
          const obj = g.props.obj(r.propId);
          const fx = Math.sin(obj.rotation.y), fz = Math.cos(obj.rotation.y);
          const x = obj.position.x + fx * 4, z = obj.position.z + fz * 4;
          g.props.riding = null;
          p.dismount({ x, y: g.world.groundY(x, z) + 1, z });
        } else if (r.kind === 'balloon') {
          const home = g.props.obj(r.propId).userData.home;
          g.props.resetRide(r.propId);
          g.props.riding = null;
          p.dismount({ x: home.x + 1.8, y: home.y, z: home.z });
        }
        g.onRideEnd?.(r.kind);
        break;
      }
      case 'stand': p.stand(); g.brain.standUp(); break;
      case 'buddy': g.ui.openBuddyMenu(); break;
      case 'critter': g.life.pet(t.critter); g.audio.critter?.(t.critter.kind); g.brain.mood(1); break;
      case 'gift': g.openGift(t.id); break;
      case 'art': { const pr = g.props.get(t.id); if (pr) g.ui.openProp(pr); break; }
      case 'sign': { const pr = g.props.get(t.id); if (pr) g.ui.openProp(pr); break; }
      case 'telescope': this.startScope(t.id); break;
      case 'ride': g.startRide(t.ride, t.id); break;
      case 'seat': this._sit(t); break;
      case 'bed': g.sleepInBed(t); break;
      case 'fish': this._cast(t.water); break;
      default: return false;
    }
    return true;
  }

  _sit(t) {
    const g = this.g, p = g.player;
    const def = BLOCKS[t.id];
    // face away from walls: pick the open side
    let yaw = p.facing + Math.PI;
    let opts = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    if (def.seatAxis === 'x') opts = [[0, 1], [0, -1]];
    if (def.seatAxis === 'z') opts = [[1, 0], [-1, 0]];
    let best = -Infinity;
    for (const [dx, dz] of opts) {
      const open = !BLOCKS[g.world.get(t.x + dx, t.y, t.z + dz)].solid ? 1 : 0;
      const toward = -(dx * Math.sin(p.facing) + dz * Math.cos(p.facing));
      const sc = open * 2 + toward * 0.5;
      if (sc > best) { best = sc; yaw = Math.atan2(dx, dz); }
    }
    const seat = { x: t.x + 0.5, y: t.y + def.seat, z: t.z + 0.5, yaw };
    p.sit(seat);
    p.yaw = yaw + Math.PI; p.pitch = -0.15;
    // the buddy comes and sits next to you
    const side = [Math.cos(yaw), -Math.sin(yaw)];
    let spot = null;
    for (const s of [1, -1]) {
      const x = t.x + 0.5 + side[0] * s * 1.1, z = t.z + 0.5 + side[1] * s * 1.1;
      if (!BLOCKS[g.world.get(Math.floor(x), t.y + 1, Math.floor(z))].solid) { spot = { x, z }; break; }
    }
    if (!spot) spot = { x: t.x + 0.5 + Math.sin(yaw) * 1.4, z: t.z + 0.5 + Math.cos(yaw) * 1.4 };
    spot.look = { x: t.x + 0.5 + Math.sin(yaw) * 10, z: t.z + 0.5 + Math.cos(yaw) * 10 };
    if (g.brain.job?.kind !== 'sleep') g.brain.sitWith(spot);
  }

  // ---------- fishing ----------
  _cast(water) {
    const g = this.g, p = g.player;
    p.rodOut = true;
    p.facing = Math.atan2(water.x - p.pos.x, water.z - p.pos.z);
    this.fish = { state: 'cast', t: 0, water, wait: 3 + Math.random() * 10, start: p.pos.clone() };
    this.bobber.visible = true;
    this.line.visible = true;
    g.audio.cast?.();
  }

  stopFishing() {
    this.fish = null;
    this.bobber.visible = false;
    this.line.visible = false;
    this.g.player.rodOut = false;
  }

  _reel() {
    const f = this.fish, g = this.g;
    if (!f) return;
    if (f.state === 'bite') {
      const st = g.state;
      const species = pickFish({ where: f.water.where, night: g.sky.night > 0.5, rain: (g.weather?.rain || 0) > 0.5 });
      const size = fishSize(species);
      st.fish = st.fish || {};
      const rec = st.fish[species.id] || { count: 0, best: 0, first: Date.now() };
      const isNew = rec.count === 0;
      const record = size > rec.best;
      rec.count++; rec.best = Math.max(rec.best, size);
      st.fish[species.id] = rec;
      g.fx.splash(f.water.x, f.water.y, f.water.z, 14, 1.2);
      g.audio.catch?.();
      g.ui.showCatch(species, size, { isNew, record });
      if (isNew) g.brain.journal('fish', `${st.playerName || 'My friend'} caught their first ${species.name}! ${size} cm.`);
      if (g.brain.playerNear(25)) {
        g.brain.say(species.junk ? 'Ha! A boot! Classic.' : species.rarity >= 4 ? `WOW! A ${species.name}! That's really rare!` : line('fishCaught', st.buddy.personality, { fish: species.name }).replace(/^I caught/, 'You caught'));
        g.buddyEntity.emote(species.rarity >= 4 ? 'excited' : 'happy', 2.5);
      }
      g.brain.befriend(0.2);
    } else {
      g.fx.splash(this.bobber.position.x, WATER_Y, this.bobber.position.z, 3, 0.4);
    }
    this.stopFishing();
  }

  _fishUpdate(dt) {
    const f = this.fish, g = this.g, p = g.player;
    if (p.pos.distanceTo(f.start) > 1.2 || p.inWater || p.riding || p.sitting) { this.stopFishing(); return; }
    f.t += dt;
    const w = f.water;
    p.rod.updateMatrixWorld(true);
    p.rodTip.getWorldPosition(_v);
    const tip = _v.clone();
    if (f.state === 'cast') {
      const k = Math.min(1, f.t / 0.6);
      this.bobber.position.set(tip.x + (w.x - tip.x) * k, tip.y + (w.y - tip.y) * k + Math.sin(k * Math.PI) * 2, tip.z + (w.z - tip.z) * k);
      if (k >= 1) { f.state = 'wait'; f.t = 0; g.fx.splash(w.x, w.y, w.z, 5, 0.5); g.audio.plop?.(); }
    } else if (f.state === 'wait') {
      this.bobber.position.set(w.x, w.y + Math.sin(f.t * 2.4) * 0.03, w.z);
      if (f.t > f.wait - 1.5 && Math.random() < dt * 2) { this.bobber.position.y -= 0.05; g.fx.splash(w.x, w.y, w.z, 1, 0.2); }
      if (f.t >= f.wait) { f.state = 'bite'; f.t = 0; g.audio.bite?.(); g.fx.splash(w.x, w.y, w.z, 8, 0.8); }
    } else if (f.state === 'bite') {
      this.bobber.position.set(w.x, w.y - 0.18 + Math.sin(f.t * 30) * 0.06, w.z);
      if (f.t > 1.15) {
        f.state = 'wait'; f.t = 0; f.wait = 4 + Math.random() * 10;
        g.ui.toast('It got away. Wait for the next bite and press E right away.');
      }
    }
    // the fishing line sags a bit
    const pts = this.line.geometry.attributes.position;
    const b = this.bobber.position;
    for (let i = 0; i < 10; i++) {
      const k = i / 9;
      pts.setXYZ(i, tip.x + (b.x - tip.x) * k, tip.y + (b.y - tip.y) * k - Math.sin(k * Math.PI) * 0.35, tip.z + (b.z - tip.z) * k);
    }
    pts.needsUpdate = true;
  }

  // ---------- telescope ----------
  startScope(id) {
    const g = this.g;
    // look out from just above the dome roof, so the view is the sky and not the ceiling
    const pr = g.props.get(id), pp = g.player.pos;
    const roof = Math.max(g.world.top(Math.floor(pp.x), Math.floor(pp.z)), pr ? g.world.top(pr.x, pr.z) : 0);
    this.scope = { id, fov: g.camera.fov, camDist: g.player.camDist, camY: Math.max(pp.y + 1.6, roof + 1.8) };
    g.player.frozen = true;
    g.camera.fov = 22;
    g.camera.updateProjectionMatrix();
    g.player.pitch = 0.75;
    g.player.camDist = 0;
    g.ui.toast(g.sky.night > 0.5 ? 'Move the mouse to look around the sky. Press E when you are done.' : "It's too bright for stars right now, but the clouds look close. Come back at night.");
    if (g.sky.night > 0.5) {
      g.sky.shootNext = 2;
      const star = (g.state.keepsakes || []).find((k) => k.kind === 'star');
      if (star) setTimeout(() => this.scope && g.ui.toast(`There it is: ${star.title}, shining near the moon.`), 4000);
      if (g.brain.playerNear(15)) g.brain.say(line('telescope', g.state.buddy.personality));
    }
  }

  stopScope() {
    const g = this.g;
    if (!this.scope) return;
    g.camera.fov = this.scope.fov;
    g.camera.updateProjectionMatrix();
    g.player.frozen = false;
    g.player.camDist = this.scope.camDist ?? 7;
    g.player.pitch = -0.2;
    this.scope = null;
  }
}

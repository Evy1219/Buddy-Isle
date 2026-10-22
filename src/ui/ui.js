import { h, timeAgo, formatDate, formatClock } from '../core/util.js';
import * as store from '../core/storage.js';
import { BUILD_PALETTE, BLOCKS, blockSwatch } from '../world/blocks.js';
import { artCanvas, artDataURL, ART_SIZE } from '../buddy/art.js';
import { describeJob, jobProgress, PACES, friendLevel } from '../buddy/brain.js';
import { handleChat } from '../buddy/chat.js';
import { PERSONALITIES, line } from '../buddy/voice.js';
import { fishCanvas, KEEPSAKE_ICONS } from '../buddy/collect.js';
import { WEATHER_NAMES } from '../world/weather.js';
import { Compass, Minimap } from './hud.js';
import * as P from './panels.js';

export const BUDDY_COLORS = [['Honey', 0xffc65a], ['Mint', 0x6fd6a8], ['Sky', 0x6cc3ec], ['Coral', 0xff8a7a], ['Lilac', 0xb59cf0], ['Leaf', 0x8fd14f]];
export const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export class UI {
  constructor(game) {
    this.g = game;
    this.root = document.getElementById('ui');
    this.mapDirty = true;
    this.hotbarPage = 0;
    this.panel = null;
    this.bubbleT = 0;
    this.typeT = 0;
    this.portraitT = 0;
    this._build();
  }

  _build() {
    const r = this.root;
    this.loading = h('div.loading', h('div.loading-inner', h('div.loading-logo', 'Buddy Isle'), h('p.loading-text', 'Loading…'), h('div.meter', h('i')), h('p.loading-tip', '')));
    this.title = h('div.title-screen', { hidden: true });
    this.hud = h('div.hud', { hidden: true });
    this.panelEl = h('aside.panel', { hidden: true, 'aria-live': 'polite' });
    this.modalEl = h('div.modal-backdrop', { hidden: true, onclick: (e) => { if (e.target === this.modalEl) this.closeModal(); } });
    this.toasts = h('div.toasts');
    this.fade = h('div.fade');
    this.flash = h('div.flash');
    this.photoFrame = h('div.photo-frame', { hidden: true },
      h('i.c1'), h('i.c2'), h('i.c3'), h('i.c4'),
      h('div.photo-hint', h('kbd', 'Click'), ' or ', h('kbd', 'C'), ' to take a photo. ', h('kbd', 'Esc'), ' to stop. Your mouse still looks around.'));
    r.append(this.loading, this.title, this.hud, this.panelEl, this.modalEl, this.toasts, this.photoFrame, this.flash, this.fade);
    this._buildHUD();
  }

  // ---------- loading ----------
  showLoading(text, p) {
    this.loading.hidden = false;
    this.loading.querySelector('.loading-text').textContent = text;
    this.loading.querySelector('.meter i').style.width = `${Math.round(p * 100)}%`;
    const tips = ['Tip: press E next to your buddy to pet it, high-five it or ask it to hang out.', 'Tip: press P to choose exactly where your buddy builds something.', 'Tip: saplings grow into trees on the real clock, even while you are away.', 'Tip: sit on a bench with E and your buddy will come sit with you.', 'Tip: press C to take photos. They go in your collection.', 'Tip: you can fish anywhere there is water. Rare fish come out at night.'];
    const tip = this.loading.querySelector('.loading-tip');
    if (!tip.textContent) tip.textContent = tips[Math.floor(Math.random() * tips.length)];
  }
  hideLoading() { this.loading.hidden = true; this.loading.querySelector('.loading-tip').textContent = ''; }
  storageWarning() { this.toast("Saving isn't available in this browser mode (private window?). Your island won't be kept."); }

  // ---------- title screen ----------
  async showTitle() {
    this.hud.hidden = true;
    this.closePanel();
    this.title.hidden = false;
    const worlds = await store.listWorlds().catch(() => []);
    const st = this.g.state;
    const card = h('div.title-card');
    card.append(
      h('h1.logo', h('span.logo-word', 'Buddy'), h('span.logo-word.logo-isle', 'Isle')),
      h('p.tagline', "A little island that keeps growing while you're away, built by an AI best friend who never runs out of ideas."),
    );
    if (st && !st.demo) {
      const lv = friendLevel(st.buddy.friendship);
      card.append(h('button.btn.primary.big.continue', { onclick: () => this.g.playWorld(st.id) },
        h('span.btn-main', 'Continue'),
        h('span.btn-sub', `${st.name}, with ${st.buddy.name} (${lv.name.toLowerCase()})`)));
    } else {
      card.append(h('p.demo-note', 'This island was built by a demo buddy. Make your own world and it starts completely empty.'),
        h('button.btn.primary.big', { onclick: () => this.openNewWorld() }, h('span.btn-main', 'Make my world')));
    }
    if (worlds.length) {
      const list = h('ul.world-list');
      for (const w of worlds) list.append(this._worldRow(w));
      card.append(h('h2.section-title', 'Your worlds'), list);
    }
    const imp = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => this.importFile(e.target.files[0]) });
    card.append(h('div.row-actions',
      st && !st.demo ? h('button.btn', { onclick: () => this.openNewWorld() }, 'New world') : null,
      h('button.btn', { onclick: () => imp.click() }, 'Import a world'), imp,
      h('button.btn.ghost', { onclick: () => this.openTitleSettings() }, 'Settings')));
    card.append(h('footer.title-foot', 'A Zyper Cyber project. Saves stay in this browser.'));
    this.title.replaceChildren(card);
  }

  _worldRow(w) {
    const thumb = w.thumb ? h('img.thumb', { src: w.thumb, alt: '' }) : h('div.thumb.thumb-empty', { style: { background: hex(w.buddyColor || 0xffc65a) } });
    const more = h('details.more',
      h('summary.btn.small.ghost', { 'aria-label': `More options for ${w.name}` }, 'More'),
      h('div.more-menu',
        h('button.btn.small', { onclick: () => this.exportWorld(w.id) }, 'Export to file'),
        h('button.btn.small.danger', { onclick: () => this.confirm(`Delete "${w.name}"?`, `${w.buddyName} and everything they built will be gone for good. Export it first if you want a backup.`, 'Delete world', async () => { await store.deleteWorld(w.id); if (this.g.state?.id === w.id) { await this.g.openDemo(); } else this.showTitle(); }) }, 'Delete')));
    return h('li.world-row',
      thumb,
      h('div.world-info',
        h('div.world-name', w.name),
        h('div.world-meta', `With ${w.buddyName}. ${plural(w.builds || 0, 'build')}, ${plural(w.paintings || 0, 'painting')}.`),
        h('div.world-meta.dim', `Visited ${timeAgo(w.lastSeen)}`)),
      h('div.world-actions', h('button.btn.small.primary', { onclick: () => this.g.playWorld(w.id) }, 'Play'), more));
  }

  async exportWorld(id) {
    await this.g.saveNow();
    const rec = id === this.g.state?.id ? this.g.state : await store.loadWorld(id);
    if (!rec) return;
    const blob = store.exportWorld(rec);
    const a = h('a', { href: URL.createObjectURL(blob), download: `${rec.name.replace(/[^\w-]+/g, '_')}.buddyisle.json` });
    document.body.append(a); a.click(); a.remove();
  }

  async importFile(file) {
    if (!file) return;
    try {
      const rec = store.parseImport(await file.text());
      const existing = await store.loadWorld(rec.id);
      if (existing) rec.id = rec.id + '-' + Date.now().toString(36);
      await store.saveWorld(rec);
      this.toast(`Imported "${rec.name}"`);
      this.showTitle();
    } catch (err) {
      this.toast(err.message || "That file couldn't be read.");
    }
  }

  openNewWorld() {
    let color = BUDDY_COLORS[0][1], personality = 'cheerful', pace = 'normal';
    const name = h('input', { value: 'My Island', maxlength: 40, required: true });
    const player = h('input', { placeholder: 'What should your buddy call you?', maxlength: 24 });
    const bname = h('input', { value: 'Pip', maxlength: 20, required: true });
    const seed = h('input', { placeholder: 'Leave empty for a random island', maxlength: 40 });
    const colors = h('div.swatches', { role: 'radiogroup', 'aria-label': 'Buddy colour' }, BUDDY_COLORS.map(([n, c], i) => {
      const b = h('button.swatch', { type: 'button', role: 'radio', 'aria-checked': String(i === 0), title: n, 'aria-label': n, style: { background: hex(c) }, onclick: () => { color = c; colors.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-checked', 'false')); b.setAttribute('aria-checked', 'true'); } });
      return b;
    }));
    const pers = h('div.choice-grid', Object.entries(PERSONALITIES).map(([k, v], i) => {
      const b = h('button.choice', { type: 'button', 'aria-pressed': String(i === 0), onclick: () => { personality = k; pers.querySelectorAll('.choice').forEach((s) => s.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); } }, h('b', v.label), h('span', v.blurb));
      return b;
    }));
    const paces = h('div.choice-grid.three', Object.entries(PACES).map(([k, v]) => {
      const b = h('button.choice', { type: 'button', 'aria-pressed': String(k === 'normal'), onclick: () => { pace = k; paces.querySelectorAll('.choice').forEach((s) => s.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); } }, h('b', v.label), h('span', v.desc));
      return b;
    }));
    const form = h('form.form', {
      onsubmit: async (e) => {
        e.preventDefault();
        this.closeModal();
        this.title.hidden = true;
        await this.g.createWorld({ name: name.value.trim() || 'My Island', playerName: player.value.trim(), buddyName: bname.value.trim() || 'Pip', buddyColor: color, personality, pace, seed: seed.value.trim() });
      },
    },
    h('h2.modal-title', 'A new island'),
    h('p.modal-lede', 'It starts as empty land. Your buddy will take it from there.'),
    h('label.field', h('span', 'World name'), name),
    h('label.field', h('span', 'Your name'), player),
    h('label.field', h('span', "Your buddy's name"), bname),
    h('div.field', h('span', 'Buddy colour'), colors),
    h('div.field', h('span', 'Personality'), pers),
    h('div.field', h('span', 'How busy should your buddy be?'), paces),
    h('label.field', h('span', 'Island seed (optional)'), seed),
    h('div.modal-actions', h('button.btn.ghost', { type: 'button', onclick: () => this.closeModal() }, 'Cancel'), h('button.btn.primary', { type: 'submit' }, 'Create world')));
    this.openModal(form, 'wide');
    setTimeout(() => player.focus(), 50);
  }

  openTitleSettings() {
    this.openModal(h('div', h('h2.modal-title', 'Settings'), P.globalSettings(this), h('div.modal-actions', h('button.btn.primary', { onclick: () => this.closeModal() }, 'Done'))), 'wide');
  }

  onWorldOpened() {
    this.mapDirty = true;
    this.terrainImg = null;
    this.minimap.tmp = null;
    this._renderChatLog();
    this.setBuildMode(false);
    this._renderHotbar();
    this.compass.markers.forEach((_, id) => this.compass.removeMarker(id));
  }

  // ---------- HUD ----------
  _buildHUD() {
    this.portrait = h('canvas.portrait', { width: 96, height: 60, 'aria-hidden': 'true' });
    this.statusName = h('b.status-name');
    this.statusText = h('span.status-text');
    this.statusBar = h('i');
    this.moodEnergy = h('i'); this.moodHappy = h('i');
    this.hearts = h('span.hearts');
    this.clockTime = h('div.clock-time');
    this.clockSub = h('div.clock-sub');
    const tb = (label, key, fn) => h('button.tool', { onclick: fn, title: `${label} (${key})` }, h('span', label), h('kbd', key));
    this.chatLog = h('div.chat-log', { 'aria-live': 'polite' });
    this.chatInput = h('input.chat-input', { placeholder: 'Say something…', maxlength: 300, 'aria-label': 'Message your buddy' });
    this.typing = h('div.typing', { hidden: true }, h('span'), h('span'), h('span'));
    this.chatForm = h('form.chat-form', {
      onsubmit: (e) => {
        e.preventDefault();
        const v = this.chatInput.value;
        this.chatInput.value = '';
        if (v.trim()) handleChat(this.g, v);
        this.closeChat();
      },
    }, this.chatInput);
    this.chatInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); this.chatInput.value = ''; this.closeChat(); } });
    this.chat = h('div.chat', this.chatLog, this.typing, this.chatForm);
    this.hotbar = h('div.hotbar', { hidden: true });
    this.hint = h('div.hint', { hidden: true });
    this.bubble = h('div.bubble', { hidden: true });
    this.nameTag = h('div.nametag');
    this.crosshair = h('div.crosshair');
    this.prompt = h('div.prompt', { hidden: true }, h('kbd'), h('span'));
    this.placeBar = h('div.place-bar', { hidden: true });
    this.buddyMenu = h('div.buddy-menu', { hidden: true });
    const topRight = h('div.top-right', h('div.clock', this.clockTime, this.clockSub));
    this.minimap = new Minimap(topRight);
    this.hud.append(
      h('div.status-card', { onclick: () => this.togglePanel('buddy'), title: 'Buddy (I)' },
        this.portrait,
        h('div.status-body',
          h('div.status-top', this.statusName, this.hearts),
          this.statusText,
          h('div.bar', this.statusBar),
          h('div.moods', h('span.mood', { title: 'Happiness' }, h('em', 'Happy'), h('b.meter-s.happy', this.moodHappy)), h('span.mood', { title: 'Energy' }, h('em', 'Energy'), h('b.meter-s.energy', this.moodEnergy))))),
      topRight,
      this.crosshair,
      h('nav.toolbar', { 'aria-label': 'Game menu' },
        tb('Talk', 'T', () => this.openChat()),
        tb('Buddy', 'I', () => this.togglePanel('buddy')),
        tb('Plans', 'P', () => this.togglePanel('plans')),
        tb('Journal', 'J', () => this.togglePanel('journal')),
        tb('Collection', 'G', () => this.togglePanel('collection')),
        tb('Map', 'M', () => this.togglePanel('map')),
        this.buildBtn = tb('Build', 'B', () => this.g.buildMode.toggle()),
        tb('Photo', 'C', () => this.g.togglePhotoMode(true)),
        tb('Menu', 'Esc', () => this.togglePanel('settings'))),
      this.chat, this.hotbar, this.hint, this.nameTag, this.bubble, this.prompt, this.placeBar, this.buddyMenu,
    );
    this.compass = new Compass(this.hud);
    this.applyHudSettings();
  }

  applyHudSettings() {
    const s = this.g.settings;
    this.compass.el.hidden = s.compass === false;
    this.minimap.canvas.hidden = s.minimap === false;
  }

  showHUD() {
    this.title.hidden = true;
    this.hud.hidden = false;
    this.chatInput.placeholder = `Say something to ${this.g.state.buddy.name}…`;
    this.statusName.textContent = this.g.state.buddy.name;
    this._renderChatLog();
  }

  showHint(first) {
    const b = this.g.state.buddy.name;
    const touch = document.body.classList.contains('touch');
    this.hint.textContent = touch
      ? `Walk with the stick, drag the screen to look around, and tap Talk to chat with ${b}.`
      : first
        ? `Click the world to look around with your mouse (Esc lets go). Walk with WASD. Press E next to ${b} to say hi, T to talk, H for all controls.`
        : `Press T to talk to ${b}. H shows all controls.`;
    this.hint.hidden = false;
    clearTimeout(this.hintT);
    this.hintT = setTimeout(() => { this.hint.hidden = true; }, 18000);
  }

  update(dt) {
    const g = this.g;
    if (g.mode !== 'play' && g.mode !== 'title') return;
    const st = g.state, b = st.buddy;
    if (g.mode === 'play') {
      const text = describeJob(g.brain.job, b.name, g.brain.mode);
      if (this.statusText.textContent !== text) this.statusText.textContent = text;
      const p = jobProgress(g.brain.job);
      this.statusBar.parentElement.hidden = p == null;
      if (p != null) this.statusBar.style.width = `${Math.round(p * 100)}%`;
      this.moodHappy.style.width = `${Math.round(b.happy)}%`;
      this.moodEnergy.style.width = `${Math.round(b.energy)}%`;
      const lv = friendLevel(b.friendship);
      const hk = `${lv.level}`;
      if (this.hearts.dataset.k !== hk) { this.hearts.dataset.k = hk; this.hearts.title = lv.name; this.hearts.replaceChildren(...Array.from({ length: 6 }, (_, i) => h(`i${i < lv.level ? '.on' : ''}`))); }
      const time = formatClock(st.time.day);
      if (this.clockTime.textContent !== time) this.clockTime.textContent = time;
      const sub = `Day ${Math.floor((Date.now() - st.created) / 864e5) + 1}, ${WEATHER_NAMES[g.weather.kind] || 'clear skies'}${g.weather.rainbow > 0.3 ? ', rainbow!' : ''}`;
      if (this.clockSub.textContent !== sub) this.clockSub.textContent = sub;
      this.crosshair.hidden = !g.input.locked && !g.interact.scope;
      this.portraitT -= dt;
      if (this.portraitT <= 0) { this.portraitT = 0.15; const c = this.portrait.getContext('2d'); g.buddyEntity.face.drawInto(c, 96, 60); }
      if (this.g.settings.minimap !== false && !this.g.photoMode) this.minimap.draw(g, dt);
      if (this.g.settings.compass !== false && !this.g.photoMode) this._updateCompass();
      if (this.panel === 'buddy') { this.panelT = (this.panelT || 0) - dt; if (this.panelT <= 0) { this.panelT = 0.25; P.buddyLive(this); } }
    }
    // bubble + name tag over the buddy
    const cam = g.camera;
    const head = g.buddyEntity.headPos();
    const v = head.clone().project(cam);
    const dist = cam.position.distanceTo(head);
    const onScreen = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 && dist < 60 && g.mode === 'play' && !g.photoMode;
    const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
    if (onScreen) {
      this.nameTag.hidden = false;
      this.nameTag.textContent = b.name;
      this.nameTag.style.transform = `translate(${sx}px, ${sy - 6}px) translate(-50%, -100%)`;
      this.nameTag.style.opacity = dist > 40 ? 0.5 : 1;
    } else this.nameTag.hidden = true;
    if (this.bubbleT > 0) {
      this.bubbleT -= dt;
      if (this.bubbleFull && this.typeT < this.bubbleFull.length) {
        this.typeT += dt * 55;
        this.bubble.textContent = this.bubbleFull.slice(0, Math.ceil(this.typeT));
      }
      this.bubble.hidden = !onScreen;
      // keep the whole bubble on screen (the little tail still points at the buddy)
      const half = (this.bubble.offsetWidth || 200) / 2;
      const bx = Math.min(Math.max(sx, half + 8), innerWidth - half - 8);
      const by = Math.max(sy - 30, (this.bubble.offsetHeight || 40) + 8);
      this.bubble.style.transform = `translate(${bx}px, ${by}px) translate(-50%, -100%)`;
      this.bubble.style.setProperty('--tail', `${Math.min(Math.max(sx - bx + half, 14), half * 2 - 14)}px`);
      if (this.bubbleT <= 0) this.bubble.hidden = true;
    }
    if (this.panel === 'map') {
      this.mapT = (this.mapT || 0) + dt;
      if (this.mapT > 0.5) { this.mapT = 0; P.drawMapPanel(this); }
    }
  }

  _updateCompass() {
    const g = this.g, c = this.compass, st = g.state;
    const bc = hex(st.buddy.color);
    c.setMarker('buddy', { color: bc, label: st.buddy.name, pos: g.buddyEntity.pos, kind: 'buddy' });
    const job = g.brain.job;
    if (job && job.kind === 'build' && job.type !== 'path') c.setMarker('build', { color: '#7fe6ff', label: '', pos: { x: job.cx, z: job.cz }, kind: 'build' });
    else c.removeMarker('build');
    const home = g.brain.playerHouse();
    if (home) c.setMarker('home', { color: '#ffd27a', label: '', pos: home.entrance, kind: 'home' }); else c.removeMarker('home');
    const gifts = st.props.filter((p) => p.type === 'gift');
    for (const id of [...c.markers.keys()]) if (id.startsWith('gift-') && !gifts.some((q) => 'gift-' + q.id === id)) c.removeMarker(id);
    for (const q of gifts) c.setMarker('gift-' + q.id, { color: '#ff8fb6', label: '', pos: { x: q.x + 0.5, z: q.z + 0.5 }, kind: 'gift' });
    c.update(g.player.yaw, g.player.pos);
  }

  buddySay(text, { thought = false } = {}) {
    this.bubbleFull = text;
    this.typeT = 0;
    this.bubble.textContent = '';
    this.bubble.classList.toggle('thought', thought);
    this.bubble.hidden = false;
    this.bubbleT = 3.5 + text.split(' ').length * 0.32;
    this.addChat('buddy', text, { thought });
    const e = this.g.buddyEntity;
    if (!thought && e) e.talking = Math.min(4, 0.8 + text.length / 30);
    const b = this.g.state.buddy;
    this.g.audio.chirp(Math.min(7, 2 + Math.floor(text.length / 18)), b.happy < 35 ? 'sad' : b.happy > 85 ? 'excited' : 'happy');
  }

  addChat(who, text, { thought = false } = {}) {
    const st = this.g.state;
    if (!st) return;
    st.chatLog.push({ who, text, t: Date.now(), thought });
    if (st.chatLog.length > 150) st.chatLog.splice(0, st.chatLog.length - 150);
    this.chatLog.append(this._chatLine({ who, text, thought, t: Date.now() }));
    while (this.chatLog.children.length > 60) this.chatLog.firstChild.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  _chatLine(m) {
    const st = this.g.state;
    const name = m.who === 'player' ? (st.playerName || 'You') : m.who === 'buddy' ? st.buddy.name : '';
    const el = h(`div.msg.${m.who}${m.thought ? '.thought' : ''}`, name ? h('b', name) : null, h('span', m.text));
    if (Date.now() - m.t > 15000) el.classList.add('old');
    else setTimeout(() => el.classList.add('old'), 15000);
    return el;
  }

  _renderChatLog() {
    if (!this.g.state) return;
    this.chatLog.replaceChildren(...this.g.state.chatLog.slice(-40).map((m) => this._chatLine(m)));
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  setTyping(on) { this.typing.hidden = !on; }

  openChat(prefill = '') {
    this.g.input.unlock();
    this.closeBuddyMenu();
    this.chat.classList.add('open');
    this.chatInput.value = prefill;
    this.chatInput.focus();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }
  closeChat() {
    this.chat.classList.remove('open');
    this.chatInput.blur();
  }

  toast(text, action = null) {
    const t = h('div.toast', h('span', text), action ? h('button.btn.small', { onclick: () => { action.fn(); t.remove(); } }, action.label) : null);
    this.toasts.append(t);
    const life = action ? 9000 : 4200;
    setTimeout(() => t.classList.add('out'), life);
    setTimeout(() => t.remove(), life + 600);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
  }

  suggestFaster() {
    this.toast('Things look a bit slow. Faster graphics could help.', { label: 'Switch to Fast', fn: () => { this.g.settings.graphics = 'fast'; this.g.applySettings(); } });
  }

  // ---------- interaction prompt ----------
  setPrompt(t) {
    const key = t ? `${t.key}|${t.label}|${t.urgent ? 1 : 0}` : '';
    if (this.promptKey === key) return;
    this.promptKey = key;
    this.prompt.hidden = !t || this.g.photoMode;
    if (!t) return;
    this.prompt.querySelector('kbd').textContent = t.key || '';
    this.prompt.querySelector('kbd').hidden = !t.key;
    this.prompt.querySelector('span').textContent = t.label;
    this.prompt.classList.toggle('urgent', !!t.urgent);
  }

  // ---------- buddy quick menu ----------
  buddyMenuOpen() { return !this.buddyMenu.hidden; }
  openBuddyMenu() {
    const g = this.g, b = g.state.buddy;
    g.input.unlock();
    const following = g.brain.mode === 'follow';
    const hanging = g.brain.mode === 'hang';
    this.menuActions = [
      ['Chat', () => this.openChat()],
      ['Pet', () => g.brain.pet()],
      ['High five', () => g.brain.highFive()],
      [following ? 'Stop following' : 'Follow me', () => g.toggleFollow()],
      [hanging ? 'Go have fun' : 'Hang out', () => { if (hanging) { g.brain.hangOut(false); g.brain.say(line('release', b.personality)); } else { g.brain.hangOut(true); g.brain.say(line('sitWith', b.personality)); } }],
      ['Dance', () => g.brain.interrupt({ kind: 'dance', t: 7 })],
      ['Plans', () => this.togglePanel('plans')],
    ];
    const n = this.menuActions.length;
    this.buddyMenu.replaceChildren(
      h('div.bm-center', h('b', b.name), h('span', friendLevel(b.friendship).name)),
      ...this.menuActions.map(([label, fn], i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return h('button.bm-item', { style: { left: `calc(50% + ${Math.cos(a) * 150}px)`, top: `calc(50% + ${Math.sin(a) * 132}px)` }, onclick: () => { this.closeBuddyMenu(); fn(); } }, h('kbd', String(i + 1)), h('span', label));
      }));
    this.buddyMenu.hidden = false;
    g.audio.open();
  }
  closeBuddyMenu() { this.buddyMenu.hidden = true; }
  buddyMenuKey(e) {
    if (e.code === 'Escape' || e.code === 'KeyE') { this.closeBuddyMenu(); return true; }
    const m = e.code.match(/^Digit([1-9])$/);
    if (m && this.menuActions[Number(m[1]) - 1]) { this.closeBuddyMenu(); this.menuActions[Number(m[1]) - 1][1](); return true; }
    return false;
  }

  // ---------- build mode ----------
  setBuildMode(on) {
    this.hotbar.hidden = !on;
    this.buildBtn?.classList.toggle('active', on);
    this.hud.classList.toggle('building', on);
    if (on) { this._renderHotbar(); this.toast('Build mode: left click removes a block, right click places one. Q/E or the wheel picks blocks.'); }
  }
  setBuildSlot(i) {
    this.hotbarPage = Math.floor(i / 9);
    this._renderHotbar();
  }
  _renderHotbar() {
    const bm = this.g.buildMode;
    const sel = bm ? bm.slot : 0;
    const page = Math.floor(sel / 9);
    const pages = Math.ceil(BUILD_PALETTE.length / 9);
    const slots = [];
    for (let i = page * 9; i < Math.min(BUILD_PALETTE.length, page * 9 + 9); i++) {
      const id = BUILD_PALETTE[i];
      slots.push(h('button.slot' + (i === sel ? '.sel' : ''), { title: BLOCKS[id].name, 'aria-label': BLOCKS[id].name, onclick: () => bm.select(i) },
        h('span.swatch-cube', { style: { background: blockSwatch(id) } }), h('kbd', String(i - page * 9 + 1))));
    }
    this.hotbar.replaceChildren(
      h('button.page', { 'aria-label': 'Previous blocks', onclick: () => bm.select(((page - 1 + pages) % pages) * 9) }, '‹'),
      ...slots,
      h('button.page', { 'aria-label': 'More blocks', onclick: () => bm.select(((page + 1) % pages) * 9) }, '›'),
      h('div.slot-name', bm ? BLOCKS[bm.blockId].name : ''));
  }

  // ---------- placing a building ----------
  setPlacement(p) {
    this.placeBar.hidden = !p;
    if (!p) return;
    this.closePanel();
    this.placeBar.replaceChildren(
      h('b', `Placing: ${p.label}`),
      h('span', 'Aim at the ground. Green means it fits.'),
      h('span.keys', h('kbd', 'R'), ' turn ', h('kbd', 'Click'), ' build here ', h('kbd', 'Esc'), ' cancel'),
      h('button.btn.small.ghost', { onclick: () => this.g.placement.cancel() }, 'Cancel'));
  }

  // ---------- photo mode ----------
  setPhotoMode(on) {
    this.hud.classList.toggle('photo', on);
    this.photoFrame.hidden = !on;
    this.prompt.hidden = true;
    this.closePanel();
    this.closeBuddyMenu();
    if (on) this.toast('Photo mode');
  }
  photoTaken(photo) {
    this.flash.classList.remove('go'); void this.flash.offsetWidth; this.flash.classList.add('go');
    this.toast('Saved to your photos (G to see them)');
    this.photosCache = null;
  }

  fadeTo(v, ms, done) {
    this.fade.style.transitionDuration = `${ms}ms`;
    this.fade.style.opacity = v;
    this.fade.style.pointerEvents = v > 0 ? 'auto' : 'none';
    if (done) setTimeout(done, ms + 50);
  }

  // ---------- side panels ----------
  panelOpen() { return !this.panelEl.hidden; }
  closePanel() { this.panelEl.hidden = true; this.panel = null; }
  togglePanel(name) {
    if (this.panel === name) { this.closePanel(); return; }
    this.g.input.unlock();
    this.closeBuddyMenu();
    this.panel = name;
    this.panelEl.hidden = false;
    this.panelEl.dataset.panel = name;
    const b = this.g.state.buddy.name;
    const titles = { journal: `${b}'s journal`, collection: 'Collection', map: 'Island map', settings: 'Menu', help: 'Controls', plans: `${b}'s plans`, buddy: b };
    const body = h('div.panel-body');
    this.panelEl.replaceChildren(
      h('header.panel-head', h('h2', titles[name]), h('button.icon-btn', { 'aria-label': 'Close', onclick: () => this.closePanel() }, '×')),
      body);
    this.panelBody = body;
    this.g.audio.open();
    P.render(this, name, body);
  }

  refreshJournal() {
    if (this.panel === 'journal') P.render(this, 'journal', this.panelBody);
    if (this.panel === 'collection' && this.collectionTab === 'paintings') P.render(this, 'collection', this.panelBody);
  }
  refreshPlans() { if (this.panel === 'plans') P.render(this, 'plans', this.panelBody); }

  // ---------- modals ----------
  modalOpen() { return !this.modalEl.hidden; }
  openModal(content, size = '') {
    this.g.input.unlock();
    this.modalEl.hidden = false;
    this.modalEl.replaceChildren(h(`div.modal${size ? '.' + size : ''}`, { role: 'dialog', 'aria-modal': 'true' }, content));
  }
  closeModal() { this.modalEl.hidden = true; this.modalEl.replaceChildren(); }

  confirm(title, text, action, fn) {
    this.openModal(h('div', h('h2.modal-title', title), h('p.modal-lede', text),
      h('div.modal-actions', h('button.btn.ghost', { onclick: () => this.closeModal() }, 'Cancel'), h('button.btn.danger', { onclick: () => { this.closeModal(); fn(); } }, action))));
  }

  showAwayLetter(letter, summary) {
    const st = this.g.state;
    const items = summary.results.filter((r) => r.kind === 'build' || r.kind === 'paint');
    const list = h('ul.away-list', items.map((r) => {
      if (r.kind === 'paint') {
        const art = st.artworks.find((a) => a.id === r.artId);
        return h('li', art ? h('img.mini-art', { src: artDataURL(art), alt: '' }) : null, h('span', `Painted "${r.title}"`), art ? h('button.btn.small', { onclick: () => this.openArt(art) }, 'Look') : null);
      }
      const p = st.projects.find((q) => q.id === r.projectId);
      return h('li', h('span.type-dot', { style: { background: P.typeColorOf(r.type) } }), h('span', `Built ${r.title}`), p ? h('button.btn.small', { onclick: () => { this.closeModal(); this.g.visitProject(p); } }, 'Go there') : null);
    }));
    this.letterParas = h('div.paper', letter.text.map((t, i) => h(i === 0 ? 'p.salute' : 'p', t)), h('p.sign', `— ${letter.sign}`));
    this.openModal(h('div.letter',
      this.letterParas,
      items.length ? list : null,
      h('div.modal-actions', h('button.btn.primary', { onclick: () => this.closeModal() }, "Let's go"))), 'wide');
  }

  openArt(art) {
    const big = document.createElement('canvas');
    big.width = big.height = ART_SIZE * 12;
    const ctx = big.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(artCanvas(art), 0, 0, big.width, big.height);
    big.className = 'art-big';
    const dl = () => { const a = h('a', { href: big.toDataURL('image/png'), download: `${art.title.replace(/[^\w-]+/g, '_')}.png` }); document.body.append(a); a.click(); a.remove(); };
    this.openModal(h('div.art-view', h('div.frame', big),
      h('div.art-meta', h('h2.modal-title', art.title),
        h('p.dim', `Painted by ${this.g.state.buddy.name}, ${formatDate(art.created)}`),
        h('blockquote', art.comment),
        h('p.dim', art.where ? `Hanging in ${art.where}.` : 'Not hanging anywhere yet.'),
        h('div.modal-actions', h('button.btn.ghost', { onclick: dl }, 'Download picture'), h('button.btn.primary', { onclick: () => this.closeModal() }, 'Close')))), 'wide');
  }

  openProp(p) {
    if (p.artId) { const a = this.g.state.artworks.find((x) => x.id === p.artId); if (a) this.openArt(a); return; }
    if (p.type === 'sign') {
      this.openModal(h('div.note', h('p.note-text', p.title || p.text),
        h('p.dim', p.note ? `A note from ${this.g.state.buddy.name}${p.created ? ', ' + formatDate(p.created) : ''}` : 'A sign'),
        h('div.modal-actions', h('button.btn.primary', { onclick: () => this.closeModal() }, 'Close'))));
    }
  }

  showGift(item) {
    const art = item.artId ? this.g.state.artworks.find((a) => a.id === item.artId) : null;
    this.openModal(h('div.gift-reveal',
      h('div.gift-burst', art ? h('img.gift-art', { src: artDataURL(art), alt: '' }) : h('span.gift-icon', KEEPSAKE_ICONS[item.kind] || '🎁')),
      h('p.dim', `A present from ${this.g.state.buddy.name}`),
      h('h2.modal-title', item.title),
      h('p.gift-desc', item.desc),
      h('p.dim', 'Kept in your collection (G).'),
      h('div.modal-actions', h('button.btn.primary', { onclick: () => this.closeModal() }, 'Thank you!'))));
  }

  showCatch(f, size, { isNew, record }) {
    const c = fishCanvas(f, 8);
    c.className = 'fish-big';
    this.openModal(h('div.catch',
      h('div.catch-art', c, isNew ? h('span.badge', 'New!') : record ? h('span.badge.gold', 'Record!') : null),
      h('h2.modal-title', f.junk ? `You fished up an ${f.name}` : `You caught a ${f.name}!`),
      h('p.catch-size', `${size} cm`),
      h('p.dim', isNew ? 'Added to your fish collection (G).' : record ? 'Your biggest one yet.' : `You've caught ${this.g.state.fish[f.id].count} of these.`),
      h('div.modal-actions', h('button.btn.primary', { onclick: () => this.closeModal() }, f.junk ? 'Toss it back' : 'Let it go'))));
    setTimeout(() => { if (this.modalOpen() && this.modalEl.querySelector('.catch')) this.closeModal(); }, 6000);
  }
}

import * as THREE from 'three';
import { h, timeAgo, formatDate, formatClock, formatDuration } from '../core/util.js';
import * as store from '../core/storage.js';
import { BUILD_PALETTE, BLOCKS, blockSwatch } from '../world/blocks.js';
import { artCanvas, artDataURL, ART_SIZE } from '../buddy/art.js';
import { describeJob, jobProgress, PACES } from '../buddy/brain.js';
import { handleChat } from '../buddy/chat.js';
import { PERSONALITIES } from '../buddy/voice.js';
import { aiEnabled, testAI } from '../buddy/llm.js';
import { renderTerrain, drawMap, typeColor } from './map.js';

export const BUDDY_COLORS = [['Honey', 0xffc65a], ['Mint', 0x6fd6a8], ['Sky', 0x6cc3ec], ['Coral', 0xff8a7a], ['Lilac', 0xb59cf0], ['Leaf', 0x8fd14f]];
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const TYPE_LABEL = {
  campfire: 'Campfire', cottage: 'House', tower: 'Tower', garden: 'Garden', grove: 'Trees', pond: 'Pond', well: 'Well', statue: 'Statue',
  gallery: 'Gallery', windmill: 'Windmill', lighthouse: 'Lighthouse', pier: 'Pier', mosaic: 'Mosaic', flowerfield: 'Meadow',
  restspot: 'Bench', greenhouse: 'Greenhouse', arch: 'Arch', treehouse: 'Treehouse', islet: 'Island',
};

export class UI {
  constructor(game) {
    this.g = game;
    this.root = document.getElementById('ui');
    this.mapDirty = true;
    this.hotbarPage = 0;
    this.panel = null;
    this.bubbleT = 0;
    this.typeT = 0;
    this._build();
  }

  _build() {
    const r = this.root;
    this.loading = h('div.loading', h('div.loading-inner', h('div.loading-logo', 'Buddy Isle'), h('p.loading-text', 'Loading…'), h('div.meter', h('i'))));
    this.title = h('div.title-screen', { hidden: true });
    this.hud = h('div.hud', { hidden: true });
    this.panelEl = h('aside.panel', { hidden: true, 'aria-live': 'polite' });
    this.modalEl = h('div.modal-backdrop', { hidden: true, onclick: (e) => { if (e.target === this.modalEl && !this.modalEl.dataset.locked) this.closeModal(); } });
    this.toasts = h('div.toasts');
    r.append(this.loading, this.title, this.hud, this.panelEl, this.modalEl, this.toasts);
    this._buildHUD();
  }

  // ---------- loading ----------
  showLoading(text, p) {
    this.loading.hidden = false;
    this.loading.querySelector('.loading-text').textContent = text;
    this.loading.querySelector('.meter i').style.width = `${Math.round(p * 100)}%`;
  }
  hideLoading() { this.loading.hidden = true; }
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
      h('p.tagline', 'A little island that keeps growing while you\'re away, built by an AI best friend who never runs out of ideas.'),
    );
    if (st && !st.demo) {
      card.append(h('button.btn.primary.big.continue', { onclick: () => this.g.playWorld(st.id) },
        h('span.btn-main', 'Continue'),
        h('span.btn-sub', `${st.name}, with ${st.buddy.name}`)));
    } else {
      card.append(h('p.demo-note', `This island was built by a demo buddy. Make your own world and it starts completely empty.`),
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
    this.openModal(h('div', h('h2.modal-title', 'Settings'), this._globalSettings(), h('div.modal-actions', h('button.btn.primary', { onclick: () => this.closeModal() }, 'Done'))), 'wide');
  }

  onWorldOpened() {
    this.mapDirty = true;
    this.terrainImg = null;
    this._renderChatLog();
    this.setBuildMode(false);
    this._renderHotbar();
  }

  // ---------- HUD ----------
  _buildHUD() {
    this.statusDot = h('span.status-dot');
    this.statusText = h('span.status-text');
    this.statusBar = h('i');
    this.clockEl = h('div.clock');
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
    this.hud.append(
      h('div.status-card', this.statusDot, h('div.status-body', this.statusText, h('div.bar', this.statusBar))),
      this.clockEl,
      this.crosshair,
      h('nav.toolbar', { 'aria-label': 'Game menu' },
        tb('Talk', 'T', () => this.openChat()),
        tb('Journal', 'J', () => this.togglePanel('journal')),
        tb('Gallery', 'G', () => this.togglePanel('gallery')),
        tb('Map', 'M', () => this.togglePanel('map')),
        this.buildBtn = tb('Build', 'B', () => this.g.buildMode.toggle()),
        tb('Menu', 'Esc', () => this.togglePanel('settings'))),
      this.chat, this.hotbar, this.hint, this.nameTag, this.bubble,
    );
  }

  showHUD() {
    this.title.hidden = true;
    this.hud.hidden = false;
    this.statusDot.style.background = hex(this.g.state.buddy.color);
    this.chatInput.placeholder = `Say something to ${this.g.state.buddy.name}…`;
    this._renderChatLog();
  }

  showHint(first) {
    const b = this.g.state.buddy.name;
    const touch = document.body.classList.contains('touch');
    this.hint.textContent = touch
      ? `Walk with the stick, drag the screen to look around, and tap Talk to chat with ${b}.`
      : first
        ? `Click the world to look around with your mouse (Esc lets go). Walk with WASD. Press T to talk to ${b}, H for all controls.`
        : `Press T to talk to ${b}. H shows all controls.`;
    this.hint.hidden = false;
    clearTimeout(this.hintT);
    this.hintT = setTimeout(() => { this.hint.hidden = true; }, 16000);
  }

  update(dt) {
    const g = this.g;
    if (g.mode !== 'play' && g.mode !== 'title') return;
    // status
    const st = g.state;
    if (g.mode === 'play') {
      const b = st.buddy;
      let text = g.brain.mode === 'follow' ? `${b.name} is following you` : g.brain.mode === 'stay' ? `${b.name} is waiting for you` : describeJob(g.brain.job, b.name);
      if (this.statusText.textContent !== text) this.statusText.textContent = text;
      const p = jobProgress(g.brain.job);
      this.statusBar.parentElement.hidden = p == null;
      if (p != null) this.statusBar.style.width = `${Math.round(p * 100)}%`;
      const clock = `Day ${Math.floor((Date.now() - st.created) / 864e5) + 1}, ${formatClock(st.time.day)}`;
      if (this.clockEl.textContent !== clock) this.clockEl.textContent = clock;
      this.crosshair.hidden = !g.input.locked;
    }
    // bubble + name tag over the buddy
    const cam = g.camera;
    const head = g.buddyEntity.headPos();
    const v = head.clone().project(cam);
    const dist = cam.position.distanceTo(head);
    const onScreen = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 && dist < 60 && g.mode === 'play';
    const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
    if (onScreen) {
      this.nameTag.hidden = false;
      this.nameTag.textContent = st.buddy.name;
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
      this.bubble.style.transform = `translate(${sx}px, ${sy - 30}px) translate(-50%, -100%)`;
      if (this.bubbleT <= 0) this.bubble.hidden = true;
    }
    // live map refresh
    if (this.panel === 'map') {
      this.mapT = (this.mapT || 0) + dt;
      if (this.mapT > 0.5) { this.mapT = 0; this._drawMap(); }
    }
  }

  buddySay(text, { thought = false } = {}) {
    this.bubbleFull = text;
    this.typeT = 0;
    this.bubble.textContent = '';
    this.bubble.classList.toggle('thought', thought);
    this.bubble.hidden = false;
    this.bubbleT = 3.5 + text.split(' ').length * 0.32;
    this.addChat('buddy', text, { thought });
    this.g.audio.chirp(Math.min(7, 2 + Math.floor(text.length / 18)));
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
    this.chat.classList.add('open');
    this.chatInput.value = prefill;
    this.chatInput.focus();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }
  closeChat() {
    this.chat.classList.remove('open');
    this.chatInput.blur();
  }

  toast(text) {
    const t = h('div.toast', text);
    this.toasts.append(t);
    setTimeout(() => t.classList.add('out'), 4200);
    setTimeout(() => t.remove(), 4800);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
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

  // ---------- side panels ----------
  panelOpen() { return !this.panelEl.hidden; }
  closePanel() { this.panelEl.hidden = true; this.panel = null; }
  togglePanel(name) {
    if (this.panel === name) { this.closePanel(); return; }
    this.g.input.unlock();
    this.panel = name;
    this.panelEl.hidden = false;
    const titles = { journal: `${this.g.state.buddy.name}'s journal`, gallery: 'Gallery', map: 'Island map', settings: 'Menu', help: 'Controls' };
    const body = h('div.panel-body');
    this.panelEl.replaceChildren(
      h('header.panel-head', h('h2', titles[name]), h('button.icon-btn', { 'aria-label': 'Close', onclick: () => this.closePanel() }, '×')),
      body);
    this.panelBody = body;
    if (name === 'journal') this._journal(body);
    if (name === 'gallery') this._gallery(body);
    if (name === 'map') this._map(body);
    if (name === 'settings') this._settings(body);
    if (name === 'help') this._help(body);
  }

  refreshJournal() {
    if (this.panel === 'journal') this._journal(this.panelBody);
    if (this.panel === 'gallery') this._gallery(this.panelBody);
  }

  _journal(body) {
    const st = this.g.state;
    const filter = this.journalFilter || 'all';
    const kinds = { all: 'Everything', build: 'Builds', paint: 'Paintings', note: 'Notes & chats' };
    const chips = h('div.chips', Object.entries(kinds).map(([k, v]) => h('button.chip', { 'aria-pressed': String(filter === k), onclick: () => { this.journalFilter = k; this._journal(body); } }, v)));
    const entries = st.journal.filter((j) => filter === 'all' || j.kind === filter || (filter === 'note' && ['note', 'chat', 'player', 'removed'].includes(j.kind))).slice().reverse();
    const list = h('div.journal');
    let lastDay = '';
    const today = new Date().toDateString(), yest = new Date(Date.now() - 864e5).toDateString();
    for (const j of entries.slice(0, 200)) {
      const d = new Date(j.t);
      const ds = d.toDateString();
      if (ds !== lastDay) {
        lastDay = ds;
        list.append(h('h3.day', ds === today ? 'Today' : ds === yest ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })));
      }
      const proj = j.projectId ? st.projects.find((p) => p.id === j.projectId) : null;
      const art = j.artId ? st.artworks.find((a) => a.id === j.artId) : null;
      list.append(h(`article.entry.k-${j.kind}`,
        h('time', d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })),
        h('div.entry-body',
          art ? h('img.entry-art', { src: artDataURL(art), alt: art.title, onclick: () => this.openArt(art) }) : null,
          h('p', j.text),
          proj && proj.done ? h('button.btn.small', { onclick: () => this.g.visitProject(proj) }, 'Go there') : null,
          art ? h('button.btn.small', { onclick: () => this.openArt(art) }, 'Look at it') : null)));
    }
    if (!entries.length) list.append(h('p.empty', `Nothing here yet. ${st.buddy.name} writes in this journal every time they finish something.`));
    body.replaceChildren(chips, list);
  }

  _gallery(body) {
    const st = this.g.state;
    const arts = st.artworks.slice().reverse();
    const grid = h('div.gallery-grid', arts.map((a) => h('button.art-tile', { onclick: () => this.openArt(a) },
      h('img', { src: artDataURL(a), alt: '' }), h('span.art-title', a.title), h('span.art-date', formatDate(a.created)))));
    const unhung = st.artworks.filter((a) => !a.hung).length;
    body.replaceChildren(
      h('p.panel-lede', arts.length ? `${arts.length} painting${arts.length === 1 ? '' : 's'} by ${st.buddy.name}.` + (unhung ? ` ${unhung} ${unhung === 1 ? 'is' : 'are'} waiting for a wall, so a gallery is probably coming.` : '') : `${st.buddy.name} hasn't painted anything yet. Ask them to paint something!`),
      grid);
  }

  _map(body) {
    const canvas = h('canvas.map', { width: 448, height: 448, 'aria-label': 'Map of the island' });
    this.mapCanvas = canvas;
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      const S = this.g.world.size;
      const x = (e.clientX - r.left) / r.width * S, z = (e.clientY - r.top) / r.height * S;
      let best = null, bd = 8;
      for (const p of this.g.state.projects) {
        if (!p.done || p.type === 'path') continue;
        const d = Math.hypot(p.x0 + p.w / 2 - x, p.z0 + p.d / 2 - z);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) this.g.visitProject(best);
    });
    const done = this.g.state.projects.filter((p) => p.done && p.type !== 'path').slice().reverse();
    const list = h('ul.build-list', done.map((p) => h('li',
      h('span.type-dot', { style: { background: typeColor(p.type) } }),
      h('div.build-info', h('b', p.title), h('span', `${TYPE_LABEL[p.type] || p.type}, ${timeAgo(p.completed || p.created)}`)),
      h('button.btn.small', { onclick: () => this.g.visitProject(p) }, 'Go'),
      h('button.btn.small.ghost', { 'aria-label': `Remove ${p.title}`, onclick: () => this.confirm(`Take down ${p.title}?`, `${this.g.state.buddy.name} will clear it away and the land goes back to how it was.`, 'Take it down', () => { this.g.removeProject(p); this._map(body); }) }, 'Remove'))));
    body.replaceChildren(canvas, h('p.map-help', 'Click a square on the map to go there. The arrow is you.'), h('h3.section-title', `Things ${this.g.state.buddy.name} built`), done.length ? list : h('p.empty', 'Nothing built yet.'));
    this.mapDirty = true;
    this._drawMap();
  }

  _drawMap() {
    if (!this.mapCanvas) return;
    if (this.mapDirty || !this.terrainImg) { this.terrainImg = renderTerrain(this.g.world); this.mapDirty = false; }
    drawMap(this.mapCanvas, this.g, this.terrainImg);
  }

  _segmented(options, value, onChange) {
    const wrap = h('div.segmented', { role: 'radiogroup' });
    for (const [k, label] of options) {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(k === value), onclick: () => { wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', 'false')); b.setAttribute('aria-checked', 'true'); onChange(k); } }, label);
      wrap.append(b);
    }
    return wrap;
  }

  _globalSettings() {
    const s = this.g.settings;
    const apply = () => this.g.applySettings();
    const slider = (label, key, min, max, step) => h('label.field.inline', h('span', label), h('input', { type: 'range', min, max, step, value: s[key], oninput: (e) => { s[key] = Number(e.target.value); apply(); } }));
    const toggle = (label, key) => h('label.field.inline.check', h('span', label), h('input', { type: 'checkbox', checked: s[key], onchange: (e) => { s[key] = e.target.checked; apply(); } }));
    const ai = s.ai;
    const aiFields = h('div.ai-fields');
    const result = h('p.ai-result', { 'aria-live': 'polite' });
    const renderAI = () => {
      const f = [];
      if (ai.provider === 'anthropic') {
        f.push(h('label.field', h('span', 'Anthropic API key'), h('input', { type: 'password', value: ai.anthropicKey, placeholder: 'sk-ant-…', autocomplete: 'off', oninput: (e) => { ai.anthropicKey = e.target.value.trim(); apply(); } })));
        f.push(h('label.field', h('span', 'Model'), h('input', { value: ai.anthropicModel, oninput: (e) => { ai.anthropicModel = e.target.value.trim(); apply(); } })));
        f.push(h('p.fine', 'Get a key at console.anthropic.com. Chat uses a few cents a day at most with the default model.'));
      } else if (ai.provider === 'openai') {
        f.push(h('label.field', h('span', 'Server URL'), h('input', { value: ai.openaiBase, oninput: (e) => { ai.openaiBase = e.target.value.trim(); apply(); } })));
        f.push(h('label.field', h('span', 'Model'), h('input', { value: ai.openaiModel, oninput: (e) => { ai.openaiModel = e.target.value.trim(); apply(); } })));
        f.push(h('label.field', h('span', 'API key (if your server needs one)'), h('input', { type: 'password', value: ai.openaiKey, autocomplete: 'off', oninput: (e) => { ai.openaiKey = e.target.value.trim(); apply(); } })));
        f.push(h('p.fine', 'Works with Ollama, LM Studio, OpenRouter and other OpenAI-style servers. For Ollama on your computer, start it with OLLAMA_ORIGINS="*" so the browser is allowed to talk to it.'));
      }
      if (ai.provider !== 'off') f.push(h('button.btn.small', { type: 'button', onclick: async () => { result.textContent = 'Asking…'; try { result.textContent = `It answered: "${await testAI(ai)}"`; } catch (err) { result.textContent = `That didn't work: ${err.message}`; } } }, 'Test it'), result);
      f.push(h('p.fine', 'Your key is stored only in this browser and only sent to the service you pick.'));
      aiFields.replaceChildren(...f);
    };
    renderAI();
    return h('div.settings',
      h('h3.section-title', 'Sound and view'),
      slider('Music', 'music', 0, 1, 0.05),
      slider('Sounds', 'sfx', 0, 1, 0.05),
      slider('Mouse speed', 'sensitivity', 0.3, 2.5, 0.1),
      toggle('Invert mouse up/down', 'invertY'),
      toggle('Shadows', 'shadows'),
      h('div.field.inline', h('span', 'Graphics'), this._segmented([['auto', 'Sharp'], ['low', 'Faster']], s.quality, (v) => { s.quality = v; apply(); })),
      h('h3.section-title', 'AI brain (optional)'),
      h('p.fine', "Without this, your buddy uses its built-in brain: it still builds, paints and understands simple requests. Connect an AI model and you can talk about anything."),
      h('div.field', this._segmented([['off', 'Built-in'], ['anthropic', 'Claude'], ['openai', 'Other / local']], ai.provider, (v) => { ai.provider = v; apply(); renderAI(); })),
      aiFields);
  }

  _settings(body) {
    const st = this.g.state, b = st.buddy;
    const nameIn = h('input', { value: b.name, maxlength: 20, onchange: (e) => { b.name = e.target.value.trim() || b.name; this.showHUD(); } });
    const playerIn = h('input', { value: st.playerName, maxlength: 24, onchange: (e) => { st.playerName = e.target.value.trim(); } });
    const colors = h('div.swatches', BUDDY_COLORS.map(([n, c]) => h('button.swatch', { type: 'button', title: n, 'aria-label': n, 'aria-checked': String(c === b.color), style: { background: hex(c) }, onclick: (e) => { b.color = c; this.g.buddyEntity.setColor(c); colors.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-checked', 'false')); e.currentTarget.setAttribute('aria-checked', 'true'); this.showHUD(); } })));
    body.replaceChildren(
      h('div.settings',
        h('h3.section-title', 'This world'),
        h('div.field', h('span', `How busy ${b.name} is`), this._segmented(Object.entries(PACES).map(([k, v]) => [k, v.label]), st.settings.pace, (v) => { st.settings.pace = v; })),
        h('div.field', h('span', 'Day and night'), this._segmented([['game', '24-minute days'], ['real', 'Match my clock']], st.settings.clock, (v) => { st.settings.clock = v; this.g.advanceClock(0); })),
        h('label.field', h('span', "Buddy's name"), nameIn),
        h('div.field', h('span', 'Buddy colour'), colors),
        h('label.field', h('span', 'Your name'), playerIn),
        h('div.row-actions',
          h('button.btn', { onclick: () => this.exportWorld(st.id) }, 'Export world'),
          h('button.btn', { onclick: () => this.togglePanel('help') }, 'Controls'),
          h('button.btn.primary', { onclick: () => this.g.quitToTitle() }, 'Save and leave'))),
      this._globalSettings());
  }

  _help(body) {
    const b = this.g.state.buddy.name;
    const rows = [
      ['W A S D', 'Walk'], ['Space', 'Jump (and swim up)'], ['Shift', 'Run'], ['Mouse', 'Look around. Click the world to capture the mouse, Esc to let go. You can also drag.'],
      ['Wheel', 'Zoom the camera'], ['V', 'First person view'], ['T or Enter', `Talk to ${b}`], ['F', `${b} follows you (press again to let them go)`],
      ['B', 'Build mode. Left click removes, right click places, Q/E/wheel/1-9 picks blocks'], ['J', 'Journal'], ['G', 'Gallery'], ['M', 'Map'], ['Esc', 'Menu'],
    ];
    const says = ['build a tower near me', 'plant some trees', 'paint a sunset', 'paint me', 'follow me', 'stay here', 'show me the windmill', 'what did you do while I was gone?', 'I like pumpkins', 'tell me a joke'];
    body.replaceChildren(
      h('dl.keys', rows.flatMap(([k, v]) => [h('dt', h('kbd', k)), h('dd', v)])),
      h('h3.section-title', `Things to say to ${b}`),
      h('div.chips', says.map((s) => h('button.chip', { onclick: () => { this.closePanel(); handleChat(this.g, s); } }, s))));
  }

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
      return h('li', h('span.type-dot', { style: { background: typeColor(r.type) } }), h('span', `Built ${r.title}`), p ? h('button.btn.small', { onclick: () => { this.closeModal(); this.g.visitProject(p); } }, 'Go there') : null);
    }));
    this.openModal(h('div.letter',
      h('div.paper', letter.text.map((t, i) => h(i === 0 ? 'p.salute' : 'p', t)), h('p.sign', `— ${letter.sign}`)),
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
}

export { formatDuration };

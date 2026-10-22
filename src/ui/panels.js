import { h, timeAgo, formatDate } from '../core/util.js';
import * as store from '../core/storage.js';
import { artDataURL } from '../buddy/art.js';
import { PACES, friendLevel, FRIEND_LEVELS, describeJob } from '../buddy/brain.js';
import { handleChat } from '../buddy/chat.js';
import { PERSONALITIES } from '../buddy/voice.js';
import { CATALOG, BLUEPRINTS } from '../buddy/blueprints.js';
import { FISH, fishCanvas, KEEPSAKE_ICONS } from '../buddy/collect.js';
import { testAI } from '../buddy/llm.js';
import { PRESETS } from '../render/post.js';
import { renderTerrain, drawMap, typeColor } from './map.js';
import { thumbLater } from './thumbs.js';
import { BUDDY_COLORS, hex } from './ui.js';

export const typeColorOf = typeColor;
const LABEL = (t) => CATALOG[t]?.label || (t === 'islet' ? 'Island' : t);

export function render(ui, name, body) {
  const fn = { journal, collection, map, settings, help, plans, buddy }[name];
  if (fn) fn(ui, body);
}

// ---------- journal ----------
function journal(ui, body) {
  const st = ui.g.state;
  const filter = ui.journalFilter || 'all';
  const kinds = { all: 'Everything', build: 'Builds', paint: 'Paintings', life: 'Life' };
  const chips = h('div.chips', Object.entries(kinds).map(([k, v]) => h('button.chip', { 'aria-pressed': String(filter === k), onclick: () => { ui.journalFilter = k; journal(ui, body); } }, v)));
  const entries = st.journal.filter((j) => filter === 'all' || j.kind === filter || (filter === 'life' && !['build', 'paint'].includes(j.kind))).slice().reverse();
  const list = h('div.journal');
  let lastDay = '';
  const today = new Date().toDateString(), yest = new Date(Date.now() - 864e5).toDateString();
  for (const j of entries.slice(0, 220)) {
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
        art ? h('img.entry-art', { src: artDataURL(art), alt: art.title, onclick: () => ui.openArt(art) }) : null,
        h('p', j.text),
        proj && proj.done ? h('button.btn.small', { onclick: () => ui.g.visitProject(proj) }, 'Go there') : null,
        art ? h('button.btn.small', { onclick: () => ui.openArt(art) }, 'Look at it') : null)));
  }
  if (!entries.length) list.append(h('p.empty', `Nothing here yet. ${st.buddy.name} writes in this journal every time something happens.`));
  body.replaceChildren(chips, list);
}

// ---------- collection ----------
function collection(ui, body) {
  const tab = ui.collectionTab || 'paintings';
  const st = ui.g.state;
  const caught = Object.keys(st.fish || {}).length;
  const tabs = { paintings: `Paintings (${st.artworks.length})`, photos: 'Photos', fish: `Fish (${caught}/${FISH.length})`, keepsakes: `Keepsakes (${(st.keepsakes || []).length})` };
  const chips = h('div.chips', Object.entries(tabs).map(([k, v]) => h('button.chip', { 'aria-pressed': String(tab === k), onclick: () => { ui.collectionTab = k; collection(ui, body); } }, v)));
  const content = h('div');
  body.replaceChildren(chips, content);
  if (tab === 'paintings') {
    const arts = st.artworks.slice().reverse();
    const unhung = st.artworks.filter((a) => !a.hung).length;
    content.append(
      h('p.panel-lede', arts.length ? `${arts.length} painting${arts.length === 1 ? '' : 's'} by ${st.buddy.name}.` + (unhung ? ` ${unhung} ${unhung === 1 ? 'is' : 'are'} waiting for a wall, so a gallery is probably coming.` : '') : `${st.buddy.name} hasn't painted anything yet. Ask them to paint something!`),
      h('div.gallery-grid', arts.map((a) => h('button.art-tile', { onclick: () => ui.openArt(a) },
        h('img', { src: artDataURL(a), alt: '' }), h('span.art-title', a.title), h('span.art-date', formatDate(a.created))))));
  } else if (tab === 'photos') {
    content.append(h('p.panel-lede', 'Press C to take a photo. Photos stay in this browser.'));
    const grid = h('div.photo-grid');
    content.append(grid);
    store.listPhotos(st.id).then((photos) => {
      if (!photos.length) { grid.replaceWith(h('p.empty', 'No photos yet.')); return; }
      grid.replaceChildren(...photos.map((p) => h('button.photo-tile', { onclick: () => openPhoto(ui, p, () => collection(ui, body)) }, h('img', { src: p.thumb, alt: '' }), h('span.art-date', formatDate(p.t)))));
    }).catch(() => grid.replaceWith(h('p.empty', "Photos aren't available in this browser mode.")));
  } else if (tab === 'fish') {
    content.append(h('p.panel-lede', 'Press E facing water to fish. Some fish only come out at night, in the rain, or in ponds.'));
    content.append(h('div.fish-grid', FISH.map((f) => {
      const rec = st.fish?.[f.id];
      if (!rec) {
        const hint = `${f.where === 'pond' ? 'In ponds' : f.where === 'sea' ? 'In the sea' : 'Anywhere'}${f.when === 'night' ? ', at night' : f.when === 'day' ? ', by day' : ''}${f.rain ? ', when it rains' : ''}`;
        return h('div.fish-tile.unknown', h('div.fish-sil', '?'), h('b', '???'), h('span', hint));
      }
      const c = fishCanvas(f, 3);
      return h('div.fish-tile', c, h('b', f.name), h('span', `Best ${rec.best} cm, caught ${rec.count}`));
    })));
  } else {
    const ks = (st.keepsakes || []).slice().reverse();
    if (!ks.length) content.append(h('p.empty', `Nothing yet. When you and ${st.buddy.name} are pals, presents start showing up.`));
    content.append(h('div.keepsakes', ks.map((k) => {
      const art = k.artId ? st.artworks.find((a) => a.id === k.artId) : null;
      return h('article.keepsake', art ? h('img.ks-art', { src: artDataURL(art), alt: '' }) : h('span.ks-icon', KEEPSAKE_ICONS[k.kind] || '🎁'),
        h('div', h('b', k.title), h('p', k.desc), h('span.art-date', `From ${k.from || st.buddy.name}, ${formatDate(k.t)}`)));
    })));
  }
}

function openPhoto(ui, p, after) {
  const dl = () => { const a = h('a', { href: p.data, download: `buddy-isle-${new Date(p.t).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.jpg` }); document.body.append(a); a.click(); a.remove(); };
  ui.openModal(h('div.photo-view', h('img.photo-big', { src: p.data, alt: 'Your photo' }),
    h('div.modal-actions',
      h('span.dim', formatDate(p.t)),
      h('button.btn.danger', { onclick: async () => { await store.deletePhoto(p.id); ui.closeModal(); after(); } }, 'Delete'),
      h('button.btn.ghost', { onclick: dl }, 'Download'),
      h('button.btn.primary', { onclick: () => ui.closeModal() }, 'Close'))), 'xwide');
}

// ---------- map ----------
function map(ui, body) {
  const g = ui.g;
  const canvas = h('canvas.map', { width: 512, height: 512, 'aria-label': 'Map of the island' });
  ui.mapCanvas = canvas;
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const S = g.world.size;
    const x = (e.clientX - r.left) / r.width * S, z = (e.clientY - r.top) / r.height * S;
    let best = null, bd = 8;
    for (const p of g.state.projects) {
      if (!p.done || p.type === 'path') continue;
      const d = Math.hypot(p.x0 + p.w / 2 - x, p.z0 + p.d / 2 - z);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) g.visitProject(best);
  });
  const done = g.state.projects.filter((p) => p.done && p.type !== 'path').slice().reverse();
  const list = h('ul.build-list', done.map((p) => h('li',
    h('span.type-dot', { style: { background: typeColor(p.type) } }),
    h('div.build-info', h('b', p.title), h('span', `${LABEL(p.type)}, ${timeAgo(p.completed || p.created)}`)),
    h('button.btn.small', { onclick: () => g.visitProject(p) }, 'Go'),
    h('button.btn.small.ghost', { 'aria-label': `Remove ${p.title}`, onclick: () => ui.confirm(`Take down ${p.title}?`, `${g.state.buddy.name} will clear it away and the land goes back to how it was.`, 'Take it down', () => { g.removeProject(p); map(ui, body); }) }, 'Remove'))));
  body.replaceChildren(canvas, h('p.map-help', 'Click a square on the map to go there. The arrow is you, the round dot is your buddy, pink dots are presents.'),
    h('h3.section-title', `Things ${g.state.buddy.name} built (${done.length})`), done.length ? list : h('p.empty', 'Nothing built yet.'));
  ui.terrainImg = renderTerrain(g.world);
  drawMapPanel(ui);
}

export function drawMapPanel(ui) {
  if (!ui.mapCanvas || !ui.terrainImg) return;
  drawMap(ui.mapCanvas, ui.g, ui.terrainImg);
  const c = ui.mapCanvas.getContext('2d'), s = ui.mapCanvas.width / ui.g.world.size;
  for (const p of ui.g.state.props) if (p.type === 'gift') { c.fillStyle = '#ff8fb6'; c.strokeStyle = '#0b2235'; c.lineWidth = 2; c.beginPath(); c.arc((p.x + 0.5) * s, (p.z + 0.5) * s, 5, 0, Math.PI * 2); c.fill(); c.stroke(); }
}

// ---------- plans: the buddy's ideas, and asking for things ----------
function plans(ui, body) {
  const g = ui.g, b = g.state.buddy;
  g.brain.refillIdeas();
  const thumb = (type) => {
    const img = h('img.plan-thumb.loading', { alt: '' });
    thumbLater(g.renderer, type, (u) => { if (u) { img.src = u; img.classList.remove('loading'); } else img.replaceWith(h('div.plan-thumb.special', LABEL(type)[0])); });
    return img;
  };
  const ideas = h('div.ideas', b.ideas.map((idea, i) => h('article.idea',
    thumb(idea.type),
    h('div.idea-body',
      h('b', `${i === 0 ? 'Next up: ' : ''}${LABEL(idea.type)}`),
      h('p', idea.reason),
      h('div.idea-actions',
        i > 0 ? h('button.btn.small.primary', { onclick: () => { const r = g.brain.promoteIdea(idea.id); if (r) g.brain.say(r); plans(ui, body); } }, 'Build this next') : h('button.btn.small.primary', { onclick: () => { const r = g.brain.promoteIdea(idea.id); if (r) g.brain.say(r); plans(ui, body); } }, 'Start it now'),
        h('button.btn.small.ghost', { onclick: () => { const r = g.brain.vetoIdea(idea.id); if (r) g.brain.say(r); plans(ui, body); } }, 'Not this one'))))));
  const reqs = b.requests.filter((r) => r.type !== 'path');
  const job = g.brain.job;
  const queue = h('div.queue',
    h('p.now', describeJob(job, b.name, g.brain.mode) + '.'),
    reqs.length ? h('ul.req-list', reqs.map((r, i) => h('li', h('span', `${LABEL(r.type)}${r.site ? ' (at the spot you picked)' : ''}`), h('button.btn.small.ghost', { onclick: () => { b.requests.splice(b.requests.indexOf(r), 1); plans(ui, body); } }, 'Cancel')))) : null);
  const types = Object.keys(CATALOG).filter((t) => t !== 'campfire' || !g.state.projects.some((p) => p.type === 'campfire'));
  const catalog = h('div.catalog', types.map((t) => {
    const info = CATALOG[t];
    return h('button.cat-item', {
      onclick: () => {
        if (info.auto || BLUEPRINTS[t]?.special || t === 'islet') {
          const r = g.brain.request(t, { requested: true });
          g.brain.say(r || `Okay! I'll find a good spot for the ${info.label.toLowerCase()}.`);
          ui.toast(`${b.name} will pick the spot for the ${info.label.toLowerCase()}`);
          plans(ui, body);
        } else g.placement.start(t);
      },
    }, BLUEPRINTS[t] && !BLUEPRINTS[t].special ? thumb(t) : h('div.plan-thumb.special', info.label[0]), h('b', info.label), h('span', info.blurb), h('em', info.auto ? `${b.name} picks the spot` : 'You pick the spot'));
  }));
  body.replaceChildren(
    h('h3.section-title', 'What I want to build next'),
    h('p.panel-lede', `${b.name} comes up with these ideas. Push one to the front, or say no and ${b.name} will remember you didn't like it.`),
    ideas,
    h('h3.section-title', 'Right now'),
    queue,
    h('h3.section-title', 'Ask for something'),
    h('p.panel-lede', 'Pick something, then aim at the ground where it should go. R turns it, click to confirm.'),
    catalog);
}

// ---------- the buddy ----------
function buddy(ui, body) {
  const g = ui.g, st = g.state, b = st.buddy;
  const portrait = h('canvas.big-portrait', { width: 320, height: 200 });
  ui.bigPortrait = portrait;
  const lv = friendLevel(b.friendship);
  const pers = PERSONALITIES[b.personality] || PERSONALITIES.cheerful;
  const bar = (label, cls) => h('div.stat-bar', h('span', label), h(`b.meter-l.${cls}`, h('i')));
  ui.buddyBars = { happy: null, energy: null, friend: null, doing: null };
  const happy = bar('Happiness', 'happy'), energy = bar('Energy', 'energy');
  const friend = h('div.friend',
    h('div.friend-top', h('b', lv.name), h('span.hearts.big', Array.from({ length: 6 }, (_, i) => h(`i${i < lv.level ? '.on' : ''}`)))),
    h('b.meter-l.friend', h('i', { style: { width: `${Math.round(lv.progress * 100)}%` } })),
    h('p.dim', lv.next ? `Spend time together, chat, pet and open presents to become ${lv.next.toLowerCase()}.` : 'You two are as close as it gets.'));
  const doing = h('p.now');
  ui.buddyBars = { happy: happy.querySelector('i'), energy: energy.querySelector('i'), doing };
  const traits = b.traits;
  const traitBars = h('div.traits', [['Cozy', traits.cozy], ['Grand', traits.grand], ['Nature', traits.nature], ['Artsy', traits.artsy]].map(([n, v]) => h('div.stat-bar', h('span', n), h('b.meter-l.trait', h('i', { style: { width: `${Math.round(v * 100)}%` } })))));
  const facts = (b.facts || []).slice().reverse();
  const memories = h('ul.memories', facts.map((f) => h('li', h('span', f.text), h('button.btn.small.ghost', { onclick: () => { b.facts.splice(b.facts.indexOf(f), 1); buddy(ui, body); } }, 'Forget'))));
  const s = b.stats;
  const fishTotal = Object.values(st.fish || {}).reduce((a, r) => a + r.count, 0);
  const statGrid = h('dl.stats', [
    ['Things built', s.builds], ['Blocks placed', (s.blocks || 0).toLocaleString()], ['Paintings', s.paintings], ['Trees planted', s.trees],
    ['Days together', Math.floor((Date.now() - st.created) / 864e5) + 1], ['Presents given', (st.keepsakes || []).length], ['Fish you caught', fishTotal], ['Chats', s.chats || 0],
  ].flatMap(([k, v]) => [h('dt', k), h('dd', String(v))]));
  body.replaceChildren(
    h('div.buddy-hero', portrait, h('div', h('h3.buddy-name', b.name), h('p.dim', `${pers.label}: ${pers.blurb.toLowerCase()}.`), doing)),
    friend, happy, energy,
    h('h3.section-title', 'Personality'),
    h('p.panel-lede', 'These grow with what you ask for and what you tell them you like.'),
    traitBars,
    h('h3.section-title', `What ${b.name} remembers about you`),
    facts.length ? memories : h('p.empty', 'Nothing yet. Tell them things like "I like pumpkins" or "my favourite colour is blue".'),
    h('h3.section-title', 'Together so far'),
    statGrid);
  buddyLive(ui);
}

export function buddyLive(ui) {
  const g = ui.g, b = g.state.buddy;
  if (!ui.buddyBars || !ui.buddyBars.happy) return;
  ui.buddyBars.happy.style.width = `${Math.round(b.happy)}%`;
  ui.buddyBars.energy.style.width = `${Math.round(b.energy)}%`;
  ui.buddyBars.doing.textContent = describeJob(g.brain.job, b.name, g.brain.mode) + '.';
  if (ui.bigPortrait) g.buddyEntity.face.drawInto(ui.bigPortrait.getContext('2d'), 320, 200);
}

// ---------- settings ----------
function segmented(options, value, onChange) {
  const wrap = h('div.segmented', { role: 'radiogroup' });
  for (const [k, label] of options) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(k === value), onclick: () => { wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', 'false')); b.setAttribute('aria-checked', 'true'); onChange(k); } }, label);
    wrap.append(b);
  }
  return wrap;
}

export function globalSettings(ui) {
  const g = ui.g, s = g.settings;
  const apply = () => g.applySettings();
  const slider = (label, key, min, max, step) => h('label.field.inline', h('span', label), h('input', { type: 'range', min, max, step, value: s[key], oninput: (e) => { s[key] = Number(e.target.value); apply(); } }));
  const toggle = (label, key) => h('label.field.inline.check', h('span', label), h('input', { type: 'checkbox', checked: s[key] !== false, onchange: (e) => { s[key] = e.target.checked; apply(); } }));
  const ai = s.ai;
  const aiFields = h('div.ai-fields');
  const result = h('p.ai-result', { 'aria-live': 'polite' });
  const renderAI = () => {
    const f = [];
    if (ai.provider === 'anthropic') {
      f.push(h('label.field', h('span', 'Anthropic API key'), h('input', { type: 'password', value: ai.anthropicKey, placeholder: 'sk-ant-…', autocomplete: 'off', oninput: (e) => { ai.anthropicKey = e.target.value.trim(); apply(); } })));
      f.push(h('label.field', h('span', 'Model'), h('input', { value: ai.anthropicModel, oninput: (e) => { ai.anthropicModel = e.target.value.trim(); apply(); } })));
      f.push(h('p.fine', 'Get a key at console.anthropic.com. With the default model, chatting costs a few cents a day at most.'));
    } else if (ai.provider === 'openai') {
      f.push(h('label.field', h('span', 'Server URL'), h('input', { value: ai.openaiBase, oninput: (e) => { ai.openaiBase = e.target.value.trim(); apply(); } })));
      f.push(h('label.field', h('span', 'Model'), h('input', { value: ai.openaiModel, oninput: (e) => { ai.openaiModel = e.target.value.trim(); apply(); } })));
      f.push(h('label.field', h('span', 'API key (if your server needs one)'), h('input', { type: 'password', value: ai.openaiKey, autocomplete: 'off', oninput: (e) => { ai.openaiKey = e.target.value.trim(); apply(); } })));
      f.push(h('p.fine', 'Works with Ollama, LM Studio, OpenRouter and other OpenAI-style servers. For Ollama on your computer, start it with OLLAMA_ORIGINS="*" so the browser is allowed to talk to it.'));
    }
    if (ai.provider !== 'off') {
      f.push(toggle('Let the AI also write journal entries and ideas', 'aiExtras'));
      f.push(h('button.btn.small', { type: 'button', onclick: async () => { result.textContent = 'Asking…'; try { result.textContent = `It answered: "${await testAI(ai)}"`; } catch (err) { result.textContent = `That didn't work: ${err.message}`; } } }, 'Test it'), result);
    }
    f.push(h('p.fine', 'Your key is stored only in this browser and only sent to the service you pick.'));
    aiFields.replaceChildren(...f);
  };
  renderAI();
  return h('div.settings',
    h('h3.section-title', 'Graphics'),
    h('div.field', segmented(Object.entries(PRESETS).map(([k, v]) => [k, v.label]), s.graphics, (v) => { s.graphics = v; apply(); })),
    h('p.fine', 'Fancy adds glow, sharper shadows and more animals. Fast turns off glow and shadows for older computers.'),
    toggle('Mini map', 'minimap'),
    toggle('Compass', 'compass'),
    h('h3.section-title', 'Sound'),
    slider('Music', 'music', 0, 1, 0.05),
    slider('Nature sounds', 'ambience', 0, 1, 0.05),
    slider('Effects', 'sfx', 0, 1, 0.05),
    h('h3.section-title', 'Controls'),
    slider('Mouse speed', 'sensitivity', 0.3, 2.5, 0.1),
    toggle('Invert mouse up/down', 'invertY'),
    h('h3.section-title', 'AI brain (optional)'),
    h('p.fine', 'Without this, your buddy uses its built-in brain: it still builds, paints and understands lots of requests. Connect an AI model and you can talk about anything.'),
    h('div.field', segmented([['off', 'Built-in'], ['anthropic', 'Claude'], ['openai', 'Other / local']], ai.provider, (v) => { ai.provider = v; apply(); renderAI(); })),
    aiFields);
}

function settings(ui, body) {
  const g = ui.g, st = g.state, b = st.buddy;
  const nameIn = h('input', { value: b.name, maxlength: 20, onchange: (e) => { b.name = e.target.value.trim() || b.name; ui.showHUD(); } });
  const playerIn = h('input', { value: st.playerName, maxlength: 24, onchange: (e) => { st.playerName = e.target.value.trim(); } });
  const colors = h('div.swatches', BUDDY_COLORS.map(([n, c]) => h('button.swatch', { type: 'button', title: n, 'aria-label': n, 'aria-checked': String(c === b.color), style: { background: hex(c) }, onclick: (e) => { b.color = c; g.buddyEntity.setColor(c); colors.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-checked', 'false')); e.currentTarget.setAttribute('aria-checked', 'true'); } })));
  const season = h('select', { onchange: (e) => { st.settings.season = e.target.value; g.updateEnvironment(0, true); } },
    [['calendar', 'Follow the calendar'], ['spring', 'Always spring'], ['summer', 'Always summer'], ['autumn', 'Always autumn'], ['winter', 'Always winter']].map(([k, l]) => h('option', { value: k, selected: st.settings.season === k }, l)));
  body.replaceChildren(
    h('div.settings',
      h('h3.section-title', 'This world'),
      h('div.field', h('span', `How busy ${b.name} is`), segmented(Object.entries(PACES).map(([k, v]) => [k, v.label]), st.settings.pace, (v) => { st.settings.pace = v; })),
      h('div.field', h('span', 'Day and night'), segmented([['game', '24-minute days'], ['real', 'Match my clock']], st.settings.clock, (v) => { st.settings.clock = v; g.advanceClock(0); })),
      h('label.field.inline.check', h('span', 'Weather (rain, snow, mist)'), h('input', { type: 'checkbox', checked: st.settings.weather !== false, onchange: (e) => { st.settings.weather = e.target.checked; g.updateEnvironment(0, true); } })),
      h('label.field', h('span', 'Seasons'), season),
      h('label.field', h('span', "Buddy's name"), nameIn),
      h('div.field', h('span', 'Buddy colour'), colors),
      h('label.field', h('span', 'Your name'), playerIn),
      h('div.row-actions',
        h('button.btn', { onclick: () => ui.exportWorld(st.id) }, 'Export world'),
        h('button.btn', { onclick: () => ui.togglePanel('help') }, 'Controls'),
        h('button.btn.primary', { onclick: () => g.quitToTitle() }, 'Save and leave'))),
    globalSettings(ui));
}

function help(ui, body) {
  const b = ui.g.state.buddy.name;
  const rows = [
    ['W A S D', 'Walk'], ['Space', 'Jump (and swim up)'], ['Shift', 'Run'], ['Mouse', 'Look around. Click the world to capture the mouse, Esc to let go. You can also drag.'],
    ['Wheel', 'Zoom the camera'], ['V', 'First person view'], ['E', `Use things: talk to ${b}, pet animals, sit, sleep, fish, open presents, ride`],
    ['T or Enter', `Chat with ${b}`], ['F', `${b} follows you (press again to let them go)`], ['P', `${b}'s plans, and pick where to build things`], ['I', `About ${b}`],
    ['B', 'Build mode. Left click removes, right click places, Q/E/wheel/1-9 picks blocks'], ['C', 'Photo mode'], ['J', 'Journal'], ['G', 'Collection: paintings, photos, fish, keepsakes'], ['M', 'Map'], ['Esc', 'Menu'],
  ];
  const says = ['build a ferris wheel', 'plant some trees near me', 'paint a sunset', 'dance', 'fireworks', 'go fishing', 'what are your plans?', 'how do you feel?', 'follow me', 'hang out', 'what did you do while I was gone?', 'I like pumpkins', 'tell me a joke'];
  body.replaceChildren(
    h('dl.keys', rows.flatMap(([k, v]) => [h('dt', h('kbd', k)), h('dd', v)])),
    h('h3.section-title', `Things to say to ${b}`),
    h('div.chips', says.map((s) => h('button.chip', { onclick: () => { ui.closePanel(); handleChat(ui.g, s); } }, s))));
}

export { FRIEND_LEVELS };

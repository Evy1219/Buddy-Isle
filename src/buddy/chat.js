import { line } from './voice.js';
import { describeJob } from './brain.js';
import { aiEnabled, askAI } from './llm.js';
import { PAINT_COLORS } from '../world/blocks.js';

// Talking to the buddy. With an AI key set, replies come from the AI.
// Without one, this built-in brain understands the common requests.

const BUILD_WORDS = [
  [/tree ?house/, 'treehouse'], [/light ?house/, 'lighthouse'], [/green ?house/, 'greenhouse'],
  [/wind ?mill|\bmill\b/, 'windmill'], [/\b(new island|island|islet)\b/, 'islet'], [/\b(pier|dock|jetty|boardwalk)\b/, 'pier'],
  [/\b(mosaic|mural|ground art|floor art|tiles)\b/, 'mosaic'], [/\b(gallery|museum|art house)\b/, 'gallery'],
  [/\b(statue|sculpture)\b/, 'statue'], [/\b(arch|gate|monument)\b/, 'arch'],
  [/\b(tower|castle|lookout|spire)\b/, 'tower'], [/\b(pond|lake|pool)\b/, 'pond'], [/\b(a|wishing|the) well\b/, 'well'],
  [/\b(garden|farm|crops?|pumpkins?|vegetables?|veggies?|wheat)\b/, 'garden'],
  [/\b(flowers?|meadow|field)\b/, 'flowerfield'], [/\b(trees?|forest|grove|woods|orchard)\b/, 'grove'],
  [/\b(bench|seat|rest ?spot|resting spot)\b/, 'restspot'], [/\b(campfire|fire ?pit|bonfire)\b/, 'campfire'],
  [/\b(house|home|cottage|cabin|hut|shack)\b/, 'cottage'],
];
const FRIENDLY = {
  treehouse: 'a treehouse', lighthouse: 'a lighthouse', greenhouse: 'a greenhouse', windmill: 'a windmill', islet: 'a new island',
  pier: 'a pier', mosaic: 'a ground mosaic', gallery: 'a gallery', statue: 'a statue', arch: 'an arch', tower: 'a tower', pond: 'a pond',
  well: 'a wishing well', garden: 'a garden', flowerfield: 'a flower meadow', grove: 'some trees', restspot: 'a bench', campfire: 'a campfire', cottage: 'a cottage',
};
const ART_WORDS = [
  [/sunset|sunrise|dusk/, 'sunset'], [/night|stars?|moon/, 'night'], [/\b(sea|ocean|beach|boat|waves?)\b/, 'sea'],
  [/flowers?|bouquet|vase/, 'flowers'], [/\b(me|my portrait|portrait of me|my face)\b/, 'portrait'],
  [/\b(yourself|you|self)\b/, 'selfportrait'], [/abstract|weird|random|anything|shapes/, 'abstract'],
  [/pattern|tiles|checker/, 'pattern'], [/landscape|hills?|view|island|mountain/, 'landscape'],
];
const JOKES = [
  'Why did the block go to therapy? It had too many issues stacking up.',
  "I tried to build a ladder to the moon. It didn't work, but I got really high scores.",
  "What's a robot's favourite snack? Micro-chips.",
  'I told a joke about a pier once. It went right over the water.',
];

export function detectBuild(s) {
  for (const [re, t] of BUILD_WORDS) if (re.test(s)) return t;
  return null;
}

export async function handleChat(game, text) {
  const t = text.trim();
  if (!t) return;
  game.ui.addChat('player', t);
  game.state.buddy.stats.chats = (game.state.buddy.stats.chats || 0) + 1;
  game.state.buddy.lastChat = Date.now();
  if (aiEnabled(game.settings.ai)) {
    game.ui.setTyping(true);
    try {
      const res = await askAI(game, t);
      game.ui.setTyping(false);
      applyAI(game, res);
      return;
    } catch (err) {
      game.ui.setTyping(false);
      game.ui.addChat('system', `The AI brain didn't answer (${err.message}). Using the built-in brain instead.`);
    }
  }
  const reply = builtInReply(game, t);
  if (reply) game.brain.say(reply);
}

function applyAI(game, res) {
  const brain = game.brain;
  const near = { x: game.player.pos.x, z: game.player.pos.z };
  for (const a of res.actions || []) {
    try {
      if (a.do === 'build' && a.what) brain.request(a.what, { near: a.near_player ? near : null });
      else if (a.do === 'paint') brain.request('paint', { artKind: a.subject });
      else if (a.do === 'follow') brain.mode = 'follow';
      else if (a.do === 'stay') brain.mode = 'stay';
      else if (a.do === 'free') brain.mode = 'auto';
      else if (a.do === 'remember' && a.fact) rememberFact(game, a.fact);
      else if (a.do === 'show' && a.project) {
        const p = findProject(game, a.project.toLowerCase());
        if (p) game.visitProject(p);
      }
    } catch (e) { console.warn('action failed', a, e); }
  }
  if (res.say) brain.say(res.say);
}

function rememberFact(game, fact) {
  const b = game.state.buddy;
  b.facts = b.facts || [];
  const clean = fact.replace(/[.!]+$/, '').trim();
  if (!clean || b.facts.some((f) => f.text.toLowerCase() === clean.toLowerCase())) return;
  b.facts.push({ text: clean, t: Date.now() });
  if (b.facts.length > 60) b.facts.shift();
  const type = detectBuild(clean.toLowerCase());
  b.likes = b.likes || {};
  if (type) b.likes[type] = (b.likes[type] || 0) + 1;
  if (/paint|art|draw/.test(clean.toLowerCase())) b.likes.paint = (b.likes.paint || 0) + 1;
  game.brain.journal('chat', `${game.state.playerName || 'My friend'} told me: ${clean}.`);
  return type;
}

function findProject(game, s) {
  const done = game.state.projects.filter((p) => p.done && p.type !== 'path');
  let best = null, score = 0;
  for (const p of done) {
    const words = p.title.toLowerCase().replace(/^the /, '').split(/\W+/).filter((w) => w.length > 2);
    let sc = words.filter((w) => s.includes(w)).length;
    if (s.includes(p.type)) sc += 1;
    if (sc > score) { score = sc; best = p; }
  }
  if (!best) {
    const type = detectBuild(s);
    if (type) best = done.filter((p) => p.type === type).pop() || null;
  }
  return best;
}

export function builtInReply(game, text) {
  const s = text.toLowerCase();
  const brain = game.brain, b = game.state.buddy, P = b.personality;
  const player = game.state.playerName || 'friend';
  const vars = { player, buddy: b.name };
  const nearMe = /\b(here|near me|next to me|by me|around me|close to me|over here|right here)\b/.test(s);
  const near = nearMe ? { x: game.player.pos.x, z: game.player.pos.z } : null;
  const buildType = detectBuild(s);
  const asks = /\b(build|make|create|construct|put|plant|dig|raise|add|can you|could you|would you|will you|i want|i'd like|let'?s|how about|place|need|give me)\b/.test(s);

  let m = text.match(/\b(?:my name is|call me|i'?m called)\s+([A-Za-z][\w-]{0,20})/i);
  if (m) {
    game.state.playerName = m[1][0].toUpperCase() + m[1].slice(1);
    return `Nice to meet you, ${game.state.playerName}! I'll remember that.`;
  }

  if (/\b(follow me|come with me|come along|follow)\b/.test(s)) { brain.mode = 'follow'; return line('follow', P, vars); }
  if (/\b(come here|come over|over here|come to me|where are you|come back)\b/.test(s) && !(asks && buildType)) {
    brain.mode = 'auto';
    brain.interrupt({ kind: 'visit', text: 'Here I am!', stage: 'travel', t: 25 });
    return 'Coming!';
  }
  if (/\b(stay|wait here|stop following|stop|wait)\b/.test(s) && !(asks && buildType)) { brain.mode = 'stay'; return line('stay', P, vars); }
  if (/\b(go (build|play|have fun|do your thing|ahead)|you can go|carry on|keep building|back to work|do your own thing|be free)\b/.test(s)) { brain.mode = 'auto'; return line('release', P, vars); }

  m = text.match(/\b(?:i (?:really |also )?(?:like|love|enjoy|adore)|my fav(?:ou?rite)? [\w ]{1,20}? (?:is|are)|remember(?: that)?)\s+(.{2,80})/i);
  if (m && !/\b(it|this|that one)\b$/i.test(m[1].trim())) {
    const fact = m[0].replace(/^remember(?: that)?\s+/i, '')
      .replace(/^i (?:really |also )?(like|love|enjoy|adore)/i, (_, v) => `${player} ${v.toLowerCase()}s`)
      .replace(/^my /i, `${player}'s `)
      .replace(/\bmy\b/gi, 'their').replace(/\bi'?m\b/gi, 'they are').replace(/\bi\b/gi, 'they');
    const type = rememberFact(game, fact);
    return line('remember', P, vars) + (type ? ` Maybe I'll build more ${FRIENDLY[type].replace(/^an? |^some /, '')}${type === 'grove' ? '' : 's'}!` : '');
  }

  if (/\b(paint|draw|sketch|painting|picture)\b/.test(s) && !/mosaic|on the ground|mural/.test(s)) {
    let artKind;
    for (const [re, k] of ART_WORDS) if (re.test(s)) { artKind = k; break; }
    let subjectProjectId;
    const proj = findProject(game, s);
    if (proj && /\b(the|your)\b/.test(s) && !artKind) { artKind = 'memory'; subjectProjectId = proj.id; }
    const r = brain.request('paint', { artKind, subjectProjectId, near });
    return r || (artKind ? `Ooh, ${artKind === 'portrait' ? 'a portrait of you' : artKind === 'selfportrait' ? 'a self-portrait' : artKind === 'memory' ? 'a painting of that' : 'a ' + artKind + ' painting'}! Let me grab my brushes.` : 'Painting time! Let me find something pretty.');
  }

  if (buildType && asks) {
    const r = brain.request(buildType, { near });
    return r || line('ackRequest', P, { ...vars, title: FRIENDLY[buildType] }) + (nearMe ? ' Right near you!' : '');
  }

  if (/\b(show me|take me|tour|go to|teleport|where is|where's)\b/.test(s)) {
    const p = findProject(game, s) || game.state.projects.filter((q) => q.done && q.type !== 'path').pop();
    if (p) { game.visitProject(p); return `Here's ${p.title}!`; }
    return "I haven't built anything to show you yet. Soon!";
  }

  if (/what (are|r) (you|u) (doing|up to|working on|building|making)|whatcha|what('?s| is) (up|next)/.test(s)) {
    const d = describeJob(brain.job, 'I').replace(/^I is/, "I'm");
    return brain.mode === 'follow' ? "I'm following you around! Where are we going?" : d + '.';
  }

  if (/what did you|while i was|what('?s| is) new|news|what happened|what have you|catch me up/.test(s)) {
    const recent = game.state.journal.filter((j) => j.kind === 'build' || j.kind === 'paint').slice(-4);
    if (!recent.length) return "Not much yet! I'm just getting started.";
    return 'Lately: ' + recent.map((j) => j.kind === 'paint' ? `I painted "${j.title}"` : `I built ${j.title}`).join(', ') + '.';
  }

  if (/how many|stats|statistics/.test(s)) {
    const st = b.stats;
    return `So far I've built ${st.builds} things, painted ${st.paintings} pictures, planted ${st.trees} trees and placed ${st.blocks.toLocaleString()} blocks.`;
  }

  if (/how are you|how're you|how r u|you (ok|good|alright)|how do you feel|how('?s| is) it going/.test(s)) return line('howAreYou', P, vars);
  if (/\b(joke|funny|make me laugh)\b/.test(s)) return JOKES[Math.floor(Math.random() * JOKES.length)];
  if (/\b(love you|best friend|bff)\b|\byou('?re| are) (the best|awesome|great|cool|amazing|so nice|sweet)\b/.test(s)) {
    b.friendship = (b.friendship || 0) + 2;
    game.fx?.spawn(game.buddyEntity.pos.x, game.buddyEntity.pos.y + 1.8, game.buddyEntity.pos.z, 0xec8bbd, 8, { up: 2 });
    return P === 'chill' ? 'same. you\'re my favourite person.' : `You're my best friend too, ${player}. That's why I build all this.`;
  }
  if (/\b(thank|thanks|thx|ty|nice job|good job|amazing|awesome|cool|beautiful|great|love it|pretty|wow)\b/.test(s)) {
    b.friendship = (b.friendship || 0) + 1;
    game.fx?.spawn(game.buddyEntity.pos.x, game.buddyEntity.pos.y + 1.8, game.buddyEntity.pos.z, 0xec8bbd, 5, { up: 2 });
    return line('thanks', P, vars);
  }
  if (/\b(bye|good ?night|see (you|ya)|gtg|got to go|logging off|goodbye|later)\b/.test(s)) return line('bye', P, vars);
  if (/\b(your name|who are you|what are you)\b/.test(s)) return `I'm ${b.name}! I'm a little builder robot, and your best friend. I build stuff on this island, even while you're gone.`;
  if (/favou?rite/.test(s)) {
    const cname = PAINT_COLORS.find((p) => p.id === brain.colorBlock())?.name || 'gold';
    const done = game.state.projects.filter((p) => p.done && p.type !== 'path');
    const fav = done.length ? done[Math.floor(Math.random() * done.length)].title : 'whatever I build next';
    return `My favourite colour is ${cname}. My favourite thing I've built is ${fav}. My favourite person is you.`;
  }
  if (/\b(help|what can you do|commands|how do i|how does)\b/.test(s)) {
    return 'You can ask me to build things ("build a tower near me", "plant trees", "make a pond"), paint ("paint a sunset", "paint me"), "follow me", "stay", "show me the windmill", or tell me things you like and I\'ll remember!';
  }
  if (/^(hi|hello|hey|yo|sup|hiya|howdy|heya|good (morning|evening|afternoon))\b/.test(s)) return line('greet', P, vars);
  if (buildType) return `Want me to build ${FRIENDLY[buildType]}? Just say "build ${FRIENDLY[buildType]}"!`;
  return line('unknown', P, vars);
}

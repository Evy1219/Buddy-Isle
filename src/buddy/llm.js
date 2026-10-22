// Optional: give the buddy a real AI brain for conversation.
// Works with Claude (Anthropic API key) or any OpenAI-compatible endpoint
// (Ollama, LM Studio, OpenRouter...). The key stays in this browser's storage
// and is only ever sent to the provider you pick.
import { BUILD_TYPES, describeJob, friendLevel } from './brain.js';
import { PERSONALITIES } from './voice.js';
import { CATALOG } from './blueprints.js';
import { WEATHER_NAMES } from '../world/weather.js';
import { formatClock } from '../core/util.js';

export const AI_DEFAULTS = {
  provider: 'off',
  anthropicKey: '',
  anthropicModel: 'claude-haiku-5-5',
  openaiBase: 'http://localhost:11434/v1',
  openaiKey: '',
  openaiModel: 'llama3.2',
};

export function aiEnabled(ai) {
  if (!ai || ai.provider === 'off') return false;
  if (ai.provider === 'anthropic') return !!ai.anthropicKey;
  if (ai.provider === 'openai') return !!ai.openaiBase && !!ai.openaiModel;
  return false;
}

const ART = ['landscape', 'sunset', 'night', 'sea', 'flowers', 'abstract', 'portrait', 'selfportrait', 'memory', 'pattern'];

function situation(game) {
  const s = game.state, b = s.buddy;
  const lv = friendLevel(b.friendship);
  const w = game.weather || {};
  const builds = s.projects.filter((p) => p.done && p.type !== 'path').map((p) => p.title);
  const arts = s.artworks.slice(-10).map((a) => `"${a.title}"`);
  const fishKinds = Object.keys(s.fish || {}).length;
  const ideas = (b.ideas || []).map((i) => `${CATALOG[i.type]?.label || i.type} (${i.reason})`).join('; ');
  return `Right now: it's ${formatClock(s.time.day)} on the island, ${game.season || 'summer'}, weather: ${WEATHER_NAMES[w.kind] || 'clear skies'}${w.rainbow > 0.3 ? ', with a rainbow' : ''}.
You are ${describeJob(game.brain.job, 'You', game.brain.mode).replace(/^You is/, 'You are')}.
Your energy is ${Math.round(b.energy)}/100 and your happiness is ${Math.round(b.happy)}/100. You and ${s.playerName || 'your friend'} are "${lv.name}".
Things you have built: ${builds.length ? builds.join(', ') : 'nothing yet'}.
Recent paintings: ${arts.length ? arts.join(', ') : 'none yet'}.
Your next ideas: ${ideas || 'none yet'}.
${s.playerName || 'Your friend'} has caught ${fishKinds} kinds of fish and has ${(s.keepsakes || []).length} keepsakes from you.`;
}

function systemPrompt(game) {
  const s = game.state, b = s.buddy;
  const facts = (b.facts || []).slice(-15).map((f) => `- ${f.text}`).join('\n') || '- (nothing yet)';
  const journal = s.journal.slice(-8).map((j) => `- ${j.text}`).join('\n') || '- (empty)';
  const p = PERSONALITIES[b.personality] || PERSONALITIES.cheerful;
  const player = s.playerName || 'friend';
  const buildable = BUILD_TYPES.filter((t) => t !== 'path').concat(['islet']);
  return `You are ${b.name}, a small hovering robot with a screen for a face who lives on an island in a cozy block world called "${s.name}". You are ${player}'s AI best friend.
Personality: ${p.label} — ${p.blurb}.
You build things on the island by yourself, paint pictures, fish, play music at night, set off fireworks, leave notes and presents, and keep a journal. You keep working even while ${player} is away.

${situation(game)}
Things ${player} has told you:
${facts}
Your recent journal:
${journal}

Reply with ONLY a JSON object, no other text:
{"say": "...", "actions": []}
"say": what you say back. 1-3 short sentences, casual, warm, in character. No markdown.
"actions": usually empty. Only add one when ${player} asks for something or clearly wants it:
  {"do":"build","what":"<one of: ${buildable.join(', ')}>","near_player":true}
  {"do":"paint","subject":"<one of: ${ART.join(', ')}>"}
  {"do":"follow"}  {"do":"stay"}  {"do":"hang_out"}  {"do":"free"}   (hang_out = stop working and keep ${player} company; free = go back to building on your own)
  {"do":"dance"}  {"do":"fireworks"}  {"do":"gift"}  {"do":"fish"}  {"do":"music"}
  {"do":"remember","fact":"<short fact about ${player}>"}
  {"do":"show","project":"<exact title of something you built>"}   (takes ${player} there)
Never claim you built something that isn't in your list. If asked to build something you don't know how to make, offer the closest thing you can build.`;
}

function history(game, text) {
  const msgs = [];
  for (const m of game.state.chatLog.slice(-16)) {
    if (m.who === 'system' || m.thought) continue;
    const role = m.who === 'player' ? 'user' : 'assistant';
    const content = role === 'assistant' ? JSON.stringify({ say: m.text, actions: [] }) : m.text;
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += '\n' + content;
    else msgs.push({ role, content });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') msgs.push({ role: 'user', content: text });
  return msgs;
}

async function call(ai, sys, msgs, maxTokens = 2000) {
  if (ai.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ai.anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: ai.anthropicModel || AI_DEFAULTS.anthropicModel, max_tokens: maxTokens, system: sys, messages: msgs }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  }
  const base = ai.openaiBase.replace(/\/+$/, '');
  const headers = { 'content-type': 'application/json' };
  if (ai.openaiKey) headers.authorization = `Bearer ${ai.openaiKey}`;
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST', headers,
    body: JSON.stringify({ model: ai.openaiModel, messages: [{ role: 'system', content: sys }, ...msgs], temperature: 0.8, max_tokens: Math.min(maxTokens, 700) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data.choices?.[0]?.message?.content || '';
}

export async function askAI(game, text) {
  const raw = await call(game.settings.ai, systemPrompt(game), history(game, text));
  return parseReply(raw);
}

export function parseReply(raw) {
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      const obj = JSON.parse(raw.slice(a, b + 1));
      return { say: String(obj.say || '').trim(), actions: Array.isArray(obj.actions) ? obj.actions : [] };
    } catch (_) { /* fall through */ }
  }
  return { say: raw.trim().slice(0, 400), actions: [] };
}

// Background extras are rate-limited so they never cost much.
let lastExtra = 0;
function canExtra() {
  const now = Date.now();
  if (now - lastExtra < 25000) return false;
  lastExtra = now;
  return true;
}

function voice(game) {
  const b = game.state.buddy;
  const p = PERSONALITIES[b.personality] || PERSONALITIES.cheerful;
  return `You are ${b.name}, a small builder robot on an island, best friends with ${game.state.playerName || 'the player'}. Personality: ${p.label} — ${p.blurb}. Write in first person, warm and casual, no markdown, no emoji.`;
}

export async function aiRewriteJournal(game, entry) {
  if (!canExtra()) return null;
  const sys = voice(game) + '\nYou are writing one entry in your own journal.';
  const msg = `${situation(game)}\n\nRewrite this journal entry in your own words, 1-2 short sentences, keeping every fact (names, titles, numbers) the same:\n"${entry.text}"\nReply with only the entry.`;
  const raw = await call(game.settings.ai, sys, [{ role: 'user', content: msg }], 400);
  const t = raw.trim().replace(/^"|"$/g, '');
  return t.length > 8 && t.length < 400 ? t : null;
}

export async function aiIdeaReason(game, idea) {
  if (!canExtra()) return null;
  const sys = voice(game);
  const msg = `${situation(game)}\n\nYou want to build ${CATALOG[idea.type]?.label || idea.type} next (${CATALOG[idea.type]?.blurb || ''}). In one short sentence, say why, to your friend. Reply with only that sentence.`;
  const raw = await call(game.settings.ai, sys, [{ role: 'user', content: msg }], 200);
  const t = raw.trim().replace(/^"|"$/g, '');
  return t.length > 6 && t.length < 220 ? t : null;
}

export async function testAI(settingsAI) {
  const raw = await call(settingsAI, 'You are a friendly robot. Reply with JSON {"say": "..."}', [{ role: 'user', content: 'Say hi in five words.' }], 200);
  return parseReply(raw).say;
}

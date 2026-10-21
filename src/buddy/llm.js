// Optional: give the buddy a real AI brain for conversation.
// Works with Claude (Anthropic API key) or any OpenAI-compatible endpoint
// (Ollama, LM Studio, OpenRouter...). The key stays in this browser's storage
// and is only ever sent to the provider you pick.
import { BUILD_TYPES, describeJob } from './brain.js';
import { PERSONALITIES } from './voice.js';
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

function systemPrompt(game) {
  const s = game.state, b = s.buddy;
  const builds = s.projects.filter((p) => p.done && p.type !== 'path').map((p) => p.title);
  const arts = s.artworks.slice(-12).map((a) => `"${a.title}"`);
  const facts = (b.facts || []).slice(-15).map((f) => `- ${f.text}`).join('\n') || '- (nothing yet)';
  const journal = s.journal.slice(-8).map((j) => `- ${j.text}`).join('\n') || '- (empty)';
  const p = PERSONALITIES[b.personality] || PERSONALITIES.cheerful;
  const player = s.playerName || 'friend';
  return `You are ${b.name}, a small hovering robot who lives on an island in a cozy block world called "${s.name}". You are ${player}'s AI best friend.
Personality: ${p.label} — ${p.blurb}.
You build things on the island by yourself, paint pictures, leave notes, and keep a journal. You keep working even while ${player} is away.

Right now: it's ${formatClock(s.time.day)} on day ${Math.floor((Date.now() - s.created) / 864e5) + 1} of the island. ${describeJob(game.brain.job, 'You').replace(/^You is/, 'You are')}.
Things you have built (oldest first): ${builds.length ? builds.join(', ') : 'nothing yet'}.
Recent paintings: ${arts.length ? arts.join(', ') : 'none yet'}.
Things ${player} has told you:
${facts}
Your recent journal:
${journal}

Reply with ONLY a JSON object, no other text:
{"say": "...", "actions": []}
"say": what you say back. 1-3 short sentences, casual, warm, in character. No markdown, no emoji spam.
"actions": usually empty. Only add one when ${player} asks for something or clearly wants it:
  {"do":"build","what":"<one of: ${BUILD_TYPES.filter((t) => t !== 'pier').concat(['pier', 'islet']).join(', ')}>","near_player":true}
  {"do":"paint","subject":"<one of: ${ART.join(', ')}>"}
  {"do":"follow"}  {"do":"stay"}  {"do":"free"}   (free = go back to building on your own)
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
  // the latest player message is already in the log; make sure it's last
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') msgs.push({ role: 'user', content: text });
  return msgs;
}

export async function askAI(game, text) {
  const ai = game.settings.ai;
  const sys = systemPrompt(game);
  const msgs = history(game, text);
  let raw = '';
  if (ai.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ai.anthropicKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: ai.anthropicModel || AI_DEFAULTS.anthropicModel, max_tokens: 2000, system: sys, messages: msgs }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    raw = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  } else {
    const base = ai.openaiBase.replace(/\/+$/, '');
    const headers = { 'content-type': 'application/json' };
    if (ai.openaiKey) headers.authorization = `Bearer ${ai.openaiKey}`;
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST', headers,
      body: JSON.stringify({ model: ai.openaiModel, messages: [{ role: 'system', content: sys }, ...msgs], temperature: 0.8, max_tokens: 600 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    raw = data.choices?.[0]?.message?.content || '';
  }
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

export async function testAI(settingsAI) {
  const fake = {
    settings: { ai: settingsAI },
    state: { name: 'Test', playerName: 'friend', buddy: { name: 'Buddy', personality: 'cheerful', facts: [] }, projects: [], artworks: [], journal: [], chatLog: [], time: { day: 0.5, dayCount: 0 } },
    brain: { job: null },
  };
  const r = await askAI(fake, 'Say hi in five words.');
  return r.say;
}

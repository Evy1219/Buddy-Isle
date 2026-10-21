import { PACES } from './brain.js';
import { formatDuration } from '../core/util.js';

// The browser can't run anything while the tab is closed, so when you come back
// the buddy "catches up": it works through the time you were away, one activity
// per stretch of time, and stamps each one with when it would have happened.
export function catchUp(game, awayMs) {
  const brain = game.brain, state = game.state;
  const pace = PACES[state.settings.pace] || PACES.normal;
  if (awayMs < 90 * 1000) return null;
  const start = state.lastSeen;
  const results = [];
  brain.offline = true;
  try {
    let when = start + Math.min(awayMs * 0.05, 5 * 60e3);
    for (const j of [brain.paused, brain.job]) {
      if (!j) continue;
      const r = brain.runInstant(j, when);
      if (r) results.push(r);
    }
    brain.paused = null;
    brain.job = null;
    flushQueue(brain, when);

    const n = Math.min(pace.offlineMax, Math.floor(awayMs / pace.offlineEvery));
    for (let i = 0; i < n; i++) {
      when = start + (awayMs * (i + 1)) / (n + 1);
      const job = brain.planNext();
      if (!job || ['rest', 'admire', 'visit'].includes(job.kind)) continue;
      const r = brain.runInstant(job, when);
      if (r) results.push(r);
      flushQueue(brain, when + 60e3);
    }
  } catch (err) {
    console.error('catch-up failed', err);
  } finally {
    brain.offline = false;
  }
  return { awayMs, results };
}

function flushQueue(brain, when) {
  let guard = 0;
  const q = brain.state.buddy.queue;
  while (q.length && guard++ < 6) {
    const item = q.shift();
    const job = brain.makeJob(item.type, item);
    if (job) brain.runInstant(job, when);
  }
}

const listJoin = (arr) => arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];

export function awayLetter(game, summary) {
  const b = game.state.buddy;
  const player = game.state.playerName || 'friend';
  const builds = summary.results.filter((r) => r.kind === 'build');
  const paints = summary.results.filter((r) => r.kind === 'paint');
  const notes = summary.results.filter((r) => r.kind === 'note');
  const parts = [];
  parts.push(`Dear ${player},`);
  parts.push(`You were gone ${formatDuration(summary.awayMs)}.`);
  if (!summary.results.length) {
    parts.push(b.personality === 'chill' ? 'i mostly floated around and thought about stuff.' : 'I spent the time planning my next project. Big things are coming!');
  } else {
    if (builds.length > 6) parts.push(`While you were away I built ${builds.length} things, like ${listJoin(builds.slice(-4).map((r) => r.title))}.`);
    else if (builds.length) parts.push(`While you were away I built ${listJoin(builds.map((r) => r.title))}.`);
    if (paints.length) parts.push(`I also painted ${paints.length === 1 ? 'a picture' : paints.length + ' pictures'}: ${listJoin(paints.map((r) => `"${r.title}"`))}.`);
    if (notes.length) parts.push(`Oh, and I left you ${notes.length === 1 ? 'a note' : 'some notes'} near your house.`);
  }
  const outro = {
    cheerful: 'Come find me! I want to show you everything!',
    chill: 'come say hi when you can.',
    dreamy: 'Walk around slowly. Some of it is meant to be found.',
    goofy: 'Please clap. (Then come find me.)',
  }[b.personality] || 'Come find me!';
  parts.push(outro);
  return { text: parts, sign: b.name };
}

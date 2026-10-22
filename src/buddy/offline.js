import { PACES, friendLevel } from './brain.js';
import { formatDuration } from '../core/util.js';
import { updateGrowth } from '../world/growth.js';
import { weatherBetween, seasonFor, WEATHER_NAMES } from '../world/weather.js';

// The browser can't run anything while the tab is closed, so when you come back
// the buddy "catches up": it works through the time you were away, one activity
// per stretch of time, and stamps each one with when it would have happened.
// Plants keep growing and the weather keeps changing on the real clock too.
export function catchUp(game, awayMs) {
  const brain = game.brain, state = game.state;
  const pace = PACES[state.settings.pace] || PACES.normal;
  if (awayMs < 90 * 1000) { updateGrowth(game, Date.now(), false); return null; }
  const start = state.lastSeen;
  const results = [];
  brain.offline = true;
  const b = state.buddy;
  const friendBefore = friendLevel(b.friendship || 0).level;
  try {
    let when = start + Math.min(awayMs * 0.05, 5 * 60e3);
    for (const j of [brain.paused, brain.job]) {
      if (!j) continue;
      const r = brain.runInstant(j, when);
      if (r) results.push(r);
    }
    brain.paused = null;
    brain.job = null;
    flushQueue(brain, when, results);

    const n = Math.min(pace.offlineMax, Math.floor(awayMs / pace.offlineEvery));
    for (let i = 0; i < n; i++) {
      when = start + (awayMs * (i + 1)) / (n + 1);
      // plants that were due by now grow first, so new builds don't land on top of them
      updateGrowth(game, when, false);
      const job = brain.planNext();
      if (!job || ['rest', 'admire', 'visit', 'sleep', 'music', 'fireworks', 'dance'].includes(job.kind)) continue;
      const r = brain.runInstant(job, when);
      if (r) results.push(r);
      flushQueue(brain, when + 60e3, results);
    }
    updateGrowth(game, Date.now(), false);
    // rested, and a little lonely if you were gone a long time
    b.energy = Math.min(100, (b.energy ?? 70) + awayMs / 60000 * 1.5);
    if (awayMs > 2 * 864e5) b.happy = Math.max(35, (b.happy ?? 70) - 10);
    else b.happy = Math.min(100, (b.happy ?? 70) + 4);
  } catch (err) {
    console.error('catch-up failed', err);
  } finally {
    brain.offline = false;
  }
  const season = seasonFor(state.settings.season);
  const weather = state.settings.weather === false ? {} : weatherBetween(state.seed, state.created, start, start + awayMs, season);
  return { awayMs, results, weather, friendBefore };
}

function flushQueue(brain, when, results) {
  let guard = 0;
  const q = brain.state.buddy.queue;
  while (q.length && guard++ < 6) {
    const item = q.shift();
    if (['fireworks', 'music', 'dance'].includes(item.type)) continue;
    const job = brain.makeJob(item.type, item);
    if (job) { const r = brain.runInstant(job, when); if (r && r.kind !== 'build') results.push(r); else if (r) results.push(r); }
  }
}

const listJoin = (arr) => arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];

export function awayLetter(game, summary) {
  const b = game.state.buddy;
  const player = game.state.playerName || 'friend';
  const builds = summary.results.filter((r) => r.kind === 'build');
  const paints = summary.results.filter((r) => r.kind === 'paint');
  const notes = summary.results.filter((r) => r.kind === 'note');
  const gifts = summary.results.filter((r) => r.kind === 'gift');
  const fish = summary.results.filter((r) => r.kind === 'fish');
  const parts = [];
  parts.push(`Dear ${player},`);
  parts.push(`You were gone ${formatDuration(summary.awayMs)}.`);
  const w = summary.weather || {};
  const total = Object.values(w).reduce((a, c) => a + c, 0);
  if (total >= 2) {
    const top = Object.entries(w).sort((a, c) => c[1] - a[1]);
    if (w.rain >= 1) parts.push(w.rain >= total / 2 ? 'It rained a lot. The garden loved it.' : 'It rained for a while, then cleared up.');
    else if (w.snow >= 1) parts.push('It snowed! Everything looks soft now.');
    else if (w.mist >= 1) parts.push('There was a thick mist for a while. Very mysterious.');
    else if (top[0][0] === 'clear') parts.push('The weather was lovely the whole time.');
    else parts.push(`It was mostly ${WEATHER_NAMES[top[0][0]]}.`);
  }
  if (!summary.results.length) {
    parts.push(b.personality === 'chill' ? 'i mostly floated around and thought about stuff.' : 'I spent the time planning my next project. Big things are coming!');
  } else {
    if (builds.length > 6) parts.push(`While you were away I built ${builds.length} things, like ${listJoin(builds.slice(-4).map((r) => r.title))}.`);
    else if (builds.length) parts.push(`While you were away I built ${listJoin(builds.map((r) => r.title))}.`);
    if (paints.length) parts.push(`I also painted ${paints.length === 1 ? 'a picture' : paints.length + ' pictures'}: ${listJoin(paints.map((r) => `"${r.title}"`))}.`);
    if (fish.length) parts.push(`I went fishing and caught ${listJoin(fish.map((r) => `a ${r.title}`))} (I let ${fish.length === 1 ? 'it' : 'them'} go).`);
    if (notes.length) parts.push(`I left you ${notes.length === 1 ? 'a note' : 'some notes'} near your house.`);
    if (gifts.length) parts.push(`And there's ${gifts.length === 1 ? 'a present' : gifts.length + ' presents'} waiting for you. Go look!`);
  }
  if ((game.state.growables || []).length) parts.push('Some of the saplings are still growing. Check on them later.');
  if (summary.awayMs > 2 * 864e5) parts.push('I missed you, by the way.');
  const outro = {
    cheerful: 'Come find me! I want to show you everything!',
    chill: 'come say hi when you can.',
    dreamy: 'Walk around slowly. Some of it is meant to be found.',
    goofy: 'Please clap. (Then come find me.)',
  }[b.personality] || 'Come find me!';
  parts.push(outro);
  return { text: parts, sign: b.name };
}

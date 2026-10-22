// World saves live in IndexedDB (in this browser, on this device).
// Export/Import turns a world into a .json file you can back up or move.
import { bytesToBase64, base64ToBytes } from './util.js';

const DB = 'buddy-isle';
const VERSION = 2;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('worlds')) db.createObjectStore('worlds', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('photos')) {
        const ps = db.createObjectStore('photos', { keyPath: 'id' });
        ps.createIndex('world', 'worldId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((r) => { out = r; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export function metaOf(w) {
  return {
    id: w.id, name: w.name, buddyName: w.buddy.name, buddyColor: w.buddy.color, playerName: w.playerName,
    created: w.created, lastSeen: w.lastSeen, thumb: w.thumb || null,
    builds: w.buddy.stats.builds, paintings: w.buddy.stats.paintings,
  };
}

export async function listWorlds() {
  const all = await tx('meta', 'readonly', (s) => req2p(s.getAll()));
  return (all || []).sort((a, b) => b.lastSeen - a.lastSeen);
}

export async function loadWorld(id) {
  return tx('worlds', 'readonly', (s) => req2p(s.get(id)));
}

export async function saveWorld(record) {
  await tx('worlds', 'readwrite', (s) => req2p(s.put(record)));
  await tx('meta', 'readwrite', (s) => req2p(s.put(metaOf(record))));
}

export async function deleteWorld(id) {
  await tx('worlds', 'readwrite', (s) => req2p(s.delete(id)));
  await tx('meta', 'readwrite', (s) => req2p(s.delete(id)));
  const photos = await listPhotos(id).catch(() => []);
  for (const p of photos) await deletePhoto(p.id).catch(() => {});
}

// Photos you take are kept separately so saving the world stays quick
export async function savePhoto(photo) { await tx('photos', 'readwrite', (s) => req2p(s.put(photo))); }
export async function deletePhoto(id) { await tx('photos', 'readwrite', (s) => req2p(s.delete(id))); }
export async function listPhotos(worldId) {
  const all = await tx('photos', 'readonly', (s) => req2p(s.index('world').getAll(worldId)));
  return (all || []).sort((a, b) => b.t - a.t);
}

export function exportWorld(record) {
  const copy = { ...record, edits: bytesToBase64(record.edits || new Uint8Array()), format: 'buddy-isle-world', formatVersion: 1 };
  return new Blob([JSON.stringify(copy)], { type: 'application/json' });
}

export function parseImport(text) {
  const obj = JSON.parse(text);
  if (obj.format !== 'buddy-isle-world') throw new Error("That file isn't a Buddy Isle world.");
  obj.edits = base64ToBytes(obj.edits || '');
  delete obj.format; delete obj.formatVersion;
  return obj;
}

// Settings that aren't tied to one world
const SETTINGS_KEY = 'buddy-isle-settings';
export function loadSettings(defaults) {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { ...defaults, ...s, ai: { ...defaults.ai, ...(s.ai || {}) } };
  } catch (_) { return { ...defaults }; }
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (_) { /* private mode */ }
}

// A synchronous "last seen" backup, because IndexedDB writes may not finish when a tab closes
export function markSeen(id) { try { localStorage.setItem(`buddy-isle-seen-${id}`, String(Date.now())); } catch (_) {} }
export function lastSeenBackup(id) { try { return Number(localStorage.getItem(`buddy-isle-seen-${id}`)) || 0; } catch (_) { return 0; } }

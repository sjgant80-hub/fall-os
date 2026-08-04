// recollapse.mjs — RE-COLLAPSE. A practice made permanent. The event is fixed; its stored MEANING is live and
// yours to re-choose. You name the fixed event, rise above the scene, walk its readings each 137.5° over (spiral,
// not orbit), collapse the one that opens the most future, and seal a new past to carry. Every seal is saved,
// content-addressed by the event — so re-collapsing the same thing later DEEPENS it, never duplicates.
//
// The honest mechanism (not mysticism): memories are reconstructed each time you recall them (reconsolidation),
// and the emotional charge of the stored version can change while the event itself stays fixed. This is a
// REFRAMING / meaning practice — re-choosing which reading of a fixed past you carry.
//
// GUARDRAIL (load-bearing): it works on MEANING, not on events, and it is NOT a substitute for real care where a
// real situation needs a person, a professional, or action in the present. The event stands; only the stored
// meaning is yours to re-choose. Keep it as what it is.
//
// Pure kernel, zero-dep, offline. Node + browser.

export const GUARDRAIL = "This works on the MEANING you carry, not on what happened — the event stands. It is a reframing practice, not a substitute for real care. If something needs a person, a professional, or action in the present, that comes first. Some pasts need more than a re-reading; be kind to yourself about which is which.";

// ── SHA-256 — the content-address of an event (same event → same id, forever) ──
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export function sha256(msg) {
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const bytes = new TextEncoder().encode(String(msg)), l = bytes.length;
  const pad = new Uint8Array((((l + 8) >> 6) + 1) << 6);
  pad.set(bytes); pad[l] = 0x80;
  const dv = new DataView(pad.buffer), bitLen = l * 8;
  dv.setUint32(pad.length - 4, bitLen >>> 0, false);
  dv.setUint32(pad.length - 8, Math.floor(bitLen / 4294967296), false);
  const w = new Uint32Array(64);
  for (let i = 0; i < pad.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) { const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3); const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10); w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0; }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K256[t] + w[t]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  const hex = x => ('00000000' + (x >>> 0).toString(16)).slice(-8);
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7);
}
export const eventId = event => sha256(String(event == null ? '' : event).trim().toLowerCase().replace(/\s+/g, ' '));

// ── THE BRANCHES — the readings you walk. Each sits at a golden-angle (137.5°) offset so you SPIRAL through
//    genuinely different meanings instead of ORBITING one wound. The first is Simon's own: "it's all good, dude." ──
export const GOLDEN = 137.50776405;
export const LENSES = [
  { key: 'peer', label: "It's all good — you made it here", prompt: "Speak to your past self, peer to peer, from a now where it worked out. What do you tell them?" },
  { key: 'taught', label: 'What did this specifically teach you', prompt: "Name the one thing you know now, only because this happened." },
  { key: 'door', label: 'What door closed that opened another', prompt: "What became reachable only because this closed something off?" },
  { key: 'orbit', label: "Whose orbit was this — was it even about you", prompt: "Some scenes are someone else's weather. Was this yours to carry, or theirs?" },
  { key: 'neutral', label: "It's neutral data — a thing that happened", prompt: "Strip the verdict. Just an event, no charge. Say it flat." },
  { key: 'friend', label: 'What would you tell a friend who lived this', prompt: "You'd be kinder to them than to yourself. Borrow that voice and use it here." },
  { key: 'protected', label: 'What did it protect or make possible', prompt: "Sometimes the hard thing was a fence around something worse. What did it guard?" },
];
export const lens = key => LENSES.find(l => l.key === key) || null;
// each lens placed on the golden spiral — angle + a normalized radius, for the UI and to prove the spread.
export function branches() { return LENSES.map((l, i) => ({ ...l, i, angle: (i * GOLDEN) % 360, r: Math.sqrt(i + 0.5) })); }

// ── THE SESSION — the five-step loop as a state machine ──
export function newSession(event) {
  const ev = String(event == null ? '' : event).trim();
  return { step: 1, event: ev, id: ev ? eventId(ev) : null, risen: false, walked: {}, chosen: null };
}
export const named = s => !!(s && s.event);                                   // step 1
export function rise(s) { if (!named(s)) return { ok: false, why: 'name the event first' }; s.risen = true; s.step = Math.max(s.step, 2); return { ok: true }; }   // step 2
export function walk(s, key, reading) {                                        // step 3
  if (!s.risen) return { ok: false, why: 'rise above the scene first' };
  if (!lens(key)) return { ok: false, why: 'no such reading' };
  const r = String(reading == null ? '' : reading).trim();
  if (!r) { delete s.walked[key]; return { ok: true, walked: false }; }
  s.walked[key] = r; s.step = Math.max(s.step, 3); return { ok: true, walked: true };
}
export const depth = s => Object.keys(s.walked || {}).length;                 // how many branches held open
export const shape = s => depth(s) >= 3 ? 'spiral' : depth(s) === 0 ? 'unwalked' : 'orbit';   // spiral (walked the tree) vs orbit (one reading)
export function collapse(s, key) {                                            // step 4 — the choice is ALWAYS the user's
  if (!(key in (s.walked || {}))) return { ok: false, why: 'you can only collapse a reading you actually walked' };
  s.chosen = key; s.step = Math.max(s.step, 4); return { ok: true };
}
export const readyToSeal = s => !!(s && s.chosen && s.walked[s.chosen]);

// ── THE STORE — every seal, content-addressed by the event. Re-sealing the SAME event DEEPENS it (appends to its
//    history, updates the carried reading), never duplicates. The journal is newest-first: the pasts you've re-chosen. ──
export function newStore() { return { seals: {}, order: [] }; }
export function seal(store, s, ts = 0) {                                       // step 5
  if (!readyToSeal(s)) return { ok: false, why: 'walk, then collapse a reading first' };
  const reading = s.walked[s.chosen], lensKey = s.chosen, id = s.id;
  const entry = { reading, lens: lensKey, ts: n(ts), walked: Object.keys(s.walked), shape: shape(s) };
  let seal;
  if (store.seals[id]) { seal = store.seals[id]; seal.readings.push(entry); seal.reading = reading; seal.lens = lensKey; seal.lastSealed = n(ts); seal.recollapses++; }
  else { seal = store.seals[id] = { id, event: s.event, reading, lens: lensKey, readings: [entry], recollapses: 1, firstSealed: n(ts), lastSealed: n(ts) }; }
  store.order = [id, ...store.order.filter(x => x !== id)];                    // move to the top of the journal
  return { ok: true, seal, deepened: seal.recollapses > 1 };
}
const n = x => Number.isFinite(+x) ? +x : 0;
export const journal = store => store.order.map(id => store.seals[id]).filter(Boolean);   // newest-first
export const history = (store, id) => (store.seals[id] ? store.seals[id].readings.slice() : []);   // how a wound's reading changed over time
export const recall = (store, event) => store.seals[eventId(event)] || null;               // have I re-collapsed this before?
export const stats = store => ({ events: store.order.length, recollapses: journal(store).reduce((a, s) => a + s.recollapses, 0), deepened: journal(store).filter(s => s.recollapses > 1).length });

// ── SOVEREIGN BACKUP ──
export function exportStore(store) { return JSON.stringify({ v: 1, seals: store.seals, order: store.order }); }
export function importStore(json) { try { const o = typeof json === 'string' ? JSON.parse(json) : json; if (!o || typeof o.seals !== 'object' || !Array.isArray(o.order)) return null; return { seals: o.seals, order: o.order }; } catch { return null; } }

export default { GUARDRAIL, sha256, eventId, GOLDEN, LENSES, lens, branches, newSession, named, rise, walk, depth, shape, collapse, readyToSeal, newStore, seal, journal, history, recall, stats, exportStore, importStore };

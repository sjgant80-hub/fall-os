// persist-ledger.mjs — FALL-OS persistence, wired onto the KESTREL-LEDGER shadow fold (ρ).
//
// fall-os used to persist the save file as one localStorage JSON blob. This kernel replaces that with the sovereign
// pattern: every real state change in the game (hatch, level-up, a skin chosen, a memory seeded) EXHALES a signed
// 6-byte Primorial-Fold packet into IndexedDB *before* the UI repaints; on boot the game INHALES — reads the Didy's
// immutable DNA (genome_core) + its keypair (crypto_wallet), replays the binary ledger (state_mutations) through
// SENTINEL's verify-before-parse Ed25519 gate, and reconstructs the EXACT save it closed in. No cloud ping.
//
// REUSE, NOT RE-INVENT: the codec, the κ-witness fold, the gate and the state machine are the vendored, pinned,
// mutation-gated KESTREL-LEDGER kernel (vendor/kestrel/*, sha256-pinned to its sealed measure commit 4e6e506 —
// see vendor/kestrel/VENDOR.md). This file is the thin fall-os LAYER on top: it maps fall-os's own events onto the
// 6-byte packet, reduces the gated survivor stream back into a fall-os `save`, and pins what "byte-identical" means
// for a fall-os session. Pure and total: crypto is INJECTED (ctx.verify), there is no I/O here, and every reader
// returns a value or a no-op on garbage, never throws — so a poisoned ledger can never corrupt the Didy.
//
// The primorial-fold codec is Thomas Frumkin's Konomi / LIGHT architecture (used with permission); the gate +
// bounded replay store are SENTINEL's. See [[kestrel-ledger]], [[konomi-provenance]], [[gary-floyd-papers]].

import { pack, unpack, fingerprint, WIRE, PAYLOAD } from './vendor/kestrel/kestrelledger.mjs';

// ── the Didy is node 0 ─────────────────────────────────────────────────────────────────────────────────────────
// SENTINEL's gate requires the 4-bit `source` inside the packet to equal the 1-byte sourceId on the wire, so the
// self-sovereign Didy signs every one of its own events as node 0. (The gate's job here is to reject FORGERIES and
// REPLAYS injected into the local store, not to limit the Didy's authorship of its own ledger.)
export const DIDY_SOURCE = 0;

// fall-os event opcodes carried in the packet's opcode byte. GRANT (3) is SENTINEL's own GRANT, so the kestrel
// canonicalState digest also records it; SKIN (8) and SEED (9) are above SENTINEL's 0–7 range, so the kernel treats
// them as no-ops for its own state machine while THIS layer's reducer gives them fall-os meaning. pack() accepts an
// opcode of 0–255, so all three travel and fold identically.
export const OP = Object.freeze({ GRANT: 3, SKIN: 8, SEED: 9 });
const FACTS_MAX = 65535; // the budget field is uint16 — a seed's fact count is clamped to it (documented in VENDOR.md)

const int = (v) => (Number.isInteger(v) ? v : 0);

// ── the exhale encoders: a fall-os event → a 6-byte command → packed bytes ─────────────────────────────────────
// Ed25519 is deterministic (one signature per (key, message)), so two identical commands would sign to identical
// frames and the SECOND would be dropped as a replay on inhale. A legitimately repeated event (e.g. re-seeding twice,
// each a real +100 xp) must survive, so every exhale embeds a monotonic `seq` — the ledger length at exhale time —
// making every legit frame unique. A true injected replay (a verbatim copy of an existing frame) still collides on
// its nonce and is still caught.
export function encodeGrant(zoneIndex, seq) {
  return { opcode: OP.GRANT, source: DIDY_SOURCE, target: int(zoneIndex) & 0xF, resources: 0, budget: int(seq) & 0xFFFF };
}
export function encodeSkin(skinIndex, seq) {
  return { opcode: OP.SKIN, source: DIDY_SOURCE, target: int(skinIndex) & 0xF, resources: 0, budget: int(seq) & 0xFFFF };
}
export function encodeSeed(facts, seq) {
  // facts (the headline HUD count) rides in the 16-bit budget; the low byte of seq rides in resources for uniqueness.
  return { opcode: OP.SEED, source: DIDY_SOURCE, target: 0, resources: int(seq) & 0xFF, budget: Math.max(0, Math.min(FACTS_MAX, int(facts))) };
}
// pack a command to its 6 bytes (null on an out-of-range command, exactly as SENTINEL's pack).
export function packEvent(cmd) { return pack(cmd); }

// ── the inhale gate: verify-before-parse, async (WebCrypto Ed25519 verify is async) ────────────────────────────
// A faithful re-expression of SENTINEL's synchronous `check` in the order that IS the defence: length → known source
// → signature (BEFORE the payload is ever unpacked) → unseen (no replay) → κ → source-match → budget → resources.
// Only a frame that clears every step contributes its 6-byte payload to the reconstruction. ctx =
// { keys:{0:publicKey}, lattice:{0:{maxBudget,resources}}, seen:<replayStore|Set>, verify:(key,msg,sig)=>Promise<bool> }.
export async function gatedSurvivors(frames, ctx) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const keys = c.keys && typeof c.keys === 'object' ? c.keys : {};
  const lattice = c.lattice && typeof c.lattice === 'object' ? c.lattice : {};
  const seen = c.seen && typeof c.seen.has === 'function' && typeof c.seen.add === 'function' ? c.seen : null;
  const verify = typeof c.verify === 'function' ? c.verify : null;
  const list = Array.isArray(frames) ? frames : [];
  const survivors = [];
  const rejected = {};
  const bump = (r) => { rejected[r] = int(rejected[r]) + 1; };
  for (const raw of list) {
    if (!(raw instanceof Uint8Array) || raw.length !== WIRE) { bump('bad-length'); continue; }
    const sourceId = raw[0];
    if (!Object.prototype.hasOwnProperty.call(keys, sourceId)) { bump('unknown-source'); continue; }
    const msg = raw.subarray(0, 7), sig = raw.subarray(7);
    let good = false;
    try { good = verify ? (await verify(keys[sourceId], msg, sig)) === true : false; } catch { good = false; }
    if (!good) { bump('forged'); continue; }                 // ⟵ the payload has NOT been parsed yet
    const nonce = fingerprint(raw);
    if (seen && seen.has(nonce)) { bump('replay'); continue; }
    const u = unpack(raw.subarray(1, 7));                     // ⟵ only a verified frame reaches here
    if (!u.ok) { bump(u.reason); continue; }                  // off-κ / bad-length
    const cmd = u.command;
    if (cmd.source !== sourceId) { bump('source-mismatch'); continue; }
    const cap = lattice[sourceId];
    if (!cap || typeof cap !== 'object') { bump('no-capability'); continue; }
    if (cmd.budget > (int(cap.maxBudget))) { bump('budget-exceeded'); continue; }
    if ((cmd.resources & ~int(cap.resources) & 0xFF) !== 0) { bump('resource-denied'); continue; }
    if (seen) seen.add(nonce);
    survivors.push(raw.subarray(1, 1 + PAYLOAD));
  }
  return { survivors, rejected, rejectedTotal: Object.values(rejected).reduce((a, b) => a + b, 0) };
}

// ── the reducer: a gated survivor stream of 6-byte payloads → the fall-os progress save ────────────────────────
// Replays the ledger with fall-os's own semantics (which SENTINEL's kernel does not carry): a GRANT names a zone →
// earn its cap, mark it done, raise the level, +100 xp; a SKIN names the chosen look (last wins); a SEED carries the
// fact count. `zoneTable` is [{ id, cap, lvl }] indexed exactly as the game's ZONES; `skinNames` is the skin order.
// This is the exact arithmetic game.mjs applies live, so replaying the ledger reproduces the same save.
export function reduceProgress(payloads, zoneTable, skinNames) {
  const zones = Array.isArray(zoneTable) ? zoneTable : [];
  const skins = Array.isArray(skinNames) ? skinNames : [];
  const s = { level: -1, xp: 0, caps: [], done: {}, skin: skins[0] || 'aurora', facts: null };
  const list = Array.isArray(payloads) ? payloads : [];
  for (const p of list) {
    const u = unpack(p instanceof Uint8Array ? p : new Uint8Array(0));
    if (!u.ok) continue;
    const c = u.command;
    if (c.opcode === OP.GRANT) {
      const z = zones[c.target];
      if (!z || typeof z !== 'object' || typeof z.cap !== 'string' || typeof z.id !== 'string') continue;
      if (!s.caps.includes(z.cap)) s.caps.push(z.cap);
      s.done[z.id] = true;
      s.level = Math.max(s.level, int(z.lvl));
      s.xp += 100;
    } else if (c.opcode === OP.SKIN) {
      const nm = skins[c.target];
      if (typeof nm === 'string' && nm) s.skin = nm;
    } else if (c.opcode === OP.SEED) {
      s.facts = int(c.budget);
    }
  }
  return s;
}

// ── canonicalSave: the bytes the "survives close→reload byte-identical" claim compares ─────────────────────────
// A stable, key-ordered projection of a fall-os save onto its DURABLE state: identity, level, xp, earned caps (in
// earn order), the set of completed zones, the chosen skin, the seed's headline fact count, and the signed kard. Two
// saves are byte-identical iff this string is equal. The in-session five-solid MEMORY and its per-kind breakdown are
// deliberately NOT in here: fall-os never writes your memory off your device — you re-drop your export to reload it —
// so the durable coordinate carries the fact COUNT (what the HUD shows), not the facts themselves.
export function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v !== null && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  const j = JSON.stringify(v);                 // string/number/boolean/null → JSON; undefined/function → undefined → 'null'
  return j === undefined ? 'null' : j;
}
export function canonicalSave(sv) {
  const o = sv !== null && typeof sv === 'object' ? sv : {};
  const caps = Array.isArray(o.caps) ? o.caps.slice() : [];
  const done = o.done && typeof o.done === 'object' ? Object.keys(o.done).filter((k) => o.done[k]).sort() : [];
  const facts = o.seededStats && typeof o.seededStats === 'object'
    ? int(o.seededStats.facts)
    : (o.facts != null ? int(o.facts) : 0);
  return stable({
    id: typeof o.id === 'string' ? o.id : null,
    level: int(o.level),
    xp: int(o.xp),
    caps,
    done,
    skin: typeof o.skin === 'string' && o.skin ? o.skin : 'aurora',
    facts,
    kard: o.kard && typeof o.kard === 'object' ? stable(o.kard) : null,
  });
}

export default {
  DIDY_SOURCE, OP, FACTS_MAX,
  encodeGrant, encodeSkin, encodeSeed, packEvent,
  gatedSurvivors, reduceProgress, canonicalSave, stable,
};

// estate.mjs — THE GENERATIVE ESTATE. Everything's there till it's built. The estate stops being a warehouse of
// built code and becomes a FIELD OF POTENTIAL that renders on demand: you DEFINE possibility (a spec — cheap,
// near-infinite) and COLLAPSE to actual (the wisp generates the code, then verifies it) only when a real demand
// arrives. 99% stays un-collapsed possibility, 1% collapses to actual — the atom's ratio, as a build system.
//
// It's lazy evaluation at estate scale — but deferring CREATION, not just execution: the "thunk" is an
// AI-generatable possibility, not a pre-written computation. The spec is looser than code; the wisp GENERATES the
// collapse. So the possibility space is enormous and cheap.
//
// THE LOAD-BEARING HONESTY (§5): the collapse must be VERIFIED or the field renders garbage. The κ-gate is NOT
// optional — a collapse that fails proof-of-play is DISCARDED, the spec stays un-collapsed, and the caller gets a
// failure, never unverified code. Verify-on-collapse is the whole difference between a generative estate and a
// garbage generator. The generator (the model) is INJECTED, so this kernel stays pure, deterministic, gate-able.
//
// Third of the set: ORACLE holds the FUTURE open · RE-COLLAPSE holds the PAST open · this holds the whole
// BUILD-SPACE open. Same move (hold possibility open → collapse what holds), shared κ-gate + content-addressing.

export const KAPPA = 0.618033988749895;   // the collapse-gate (1/φ): a build STANDS only if it holds at/above κ

// ── SHA-256 — the content-address of a spec (same spec → same address → build ONCE) ──
const K256 = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export function sha256(msg) {
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const bytes = new TextEncoder().encode(String(msg)), l = bytes.length, pad = new Uint8Array((((l + 8) >> 6) + 1) << 6);
  pad.set(bytes); pad[l] = 0x80; const dv = new DataView(pad.buffer), bl = l * 8; dv.setUint32(pad.length - 4, bl >>> 0, false); dv.setUint32(pad.length - 8, Math.floor(bl / 4294967296), false);
  const w = new Uint32Array(64);
  for (let i = 0; i < pad.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) { const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3), s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10); w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0; }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) { const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K256[t] + w[t]) | 0, S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + maj) | 0; h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0; }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  const hex = x => ('00000000' + (x >>> 0).toString(16)).slice(-8);
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7);
}
export function canonical(o) { if (o === null || typeof o !== 'object') return JSON.stringify(o); if (Array.isArray(o)) return '[' + o.map(canonical).join(',') + ']'; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}'; }
// a spec's identity is the content of its CONTRACT (name + shape + verify) — not its description. change the
// contract → new address → rebuild. same contract → same address → the cache holds.
export const specId = spec => sha256(canonical({ name: spec.name, inputs: spec.inputs || [], template: spec.template || null, verify: spec.verify || [], threshold: spec.threshold ?? null }));

// ── THE POSSIBILITY REPO — specs held un-collapsed. A spec is tiny; hold a million, it costs almost nothing. ──
export function newField() { return { specs: {}, cache: {}, log: [] }; }
export function define(field, spec) {
  if (!spec || !spec.name) return { ok: false, why: 'a spec needs a name' };
  const id = specId(spec), s = { id, name: spec.name, description: String(spec.description || ''), inputs: spec.inputs || [], template: spec.template || null, verify: spec.verify || [], threshold: spec.threshold ?? KAPPA };
  field.specs[id] = s;   // idempotent: same contract overwrites the same entry, never duplicates
  return { ok: true, id, spec: s, built: !!field.cache[id] };
}
export const isBuilt = (field, id) => !!field.cache[id];
export const possibilities = field => Object.values(field.specs);
export const built = field => Object.values(field.cache);

// ── VERIFY — the κ-gate (proof-of-play). Run the collapsed code against the spec's verify-tests. holds ⇔ score ≥ κ.
export function verify(spec, code) {
  const tests = spec.verify || [];
  let fn = null;
  try { fn = new Function(`"use strict"; ${code}; return (typeof ${spec.name} === 'function') ? ${spec.name} : null;`)(); } catch (e) { return { holds: false, score: 0, detail: 'does not parse: ' + e.message, passed: 0, total: tests.length }; }
  if (typeof fn !== 'function') return { holds: false, score: 0, detail: `no function "${spec.name}"`, passed: 0, total: tests.length };
  if (!tests.length) return { holds: false, score: 0, detail: 'no verify-condition — cannot let it stand', passed: 0, total: 0 };
  let passed = 0; for (const t of tests) { try { const got = fn(...(t.in || []).map(clone)); if (canonical(got) === canonical(t.out)) passed++; } catch { /* a throw is a fail */ } }
  const score = passed / tests.length;
  return { holds: score >= (spec.threshold ?? KAPPA), score, detail: `${passed}/${tests.length} checks`, passed, total: tests.length };
}
const clone = x => (typeof x === 'object' && x !== null) ? JSON.parse(JSON.stringify(x)) : x;

// ── COLLAPSE — on real demand, the wisp GENERATES the code from the spec, then verifies it. Only a verified
//    collapse STANDS (and is cached, content-addressed). A collapse that clashes is DISCARDED — the spec stays
//    possibility, the caller gets a failure, NEVER unverified code. `generate` is injected (the model / a template). ──
export function collapse(field, id, generate, { ts = 0, force = false } = {}) {
  const spec = field.specs[id]; if (!spec) return { ok: false, why: 'no such possibility' };
  if (!force && field.cache[id]) { const c = field.cache[id]; field.log.unshift({ id, ev: 'cache-hit', ts }); return { ok: true, cached: true, artifact: c.artifact, verify: c.verify, spec }; }   // built once — run(S)==S
  let code; try { code = String(generate(spec)); } catch (e) { field.log.unshift({ id, ev: 'gen-error', ts }); return { ok: false, why: 'the wisp could not generate: ' + e.message, spec }; }
  const v = verify(spec, code);
  if (!v.holds) { field.log.unshift({ id, ev: 'discarded', score: v.score, ts }); return { ok: false, why: `collapse did not verify (${v.detail}) — discarded, the spec stays possibility`, verify: v, code, spec }; }
  field.cache[id] = { id, artifact: code, verify: v, builtAt: ts, name: spec.name };   // stands, cached, content-addressed
  field.log.unshift({ id, ev: 'collapsed', score: v.score, ts });
  return { ok: true, cached: false, artifact: code, verify: v, spec };
}

// the ratio — mostly un-collapsed potential, a thin actual core (the atom's shape).
export function ratio(field) { const p = Object.keys(field.specs).length, a = Object.keys(field.cache).length; return { possibilities: p, built: a, potential: p - a, actualFraction: p ? a / p : 0 }; }

// ── SOVEREIGN BACKUP ──
export function exportField(field) { return JSON.stringify({ v: 1, specs: field.specs, cache: field.cache, log: field.log.slice(0, 200) }); }
export function importField(json) { try { const o = typeof json === 'string' ? JSON.parse(json) : json; if (!o || typeof o.specs !== 'object') return null; return { specs: o.specs, cache: o.cache && typeof o.cache === 'object' ? o.cache : {}, log: Array.isArray(o.log) ? o.log : [] }; } catch { return null; } }

export const GUARDRAIL = "The collapse must be VERIFIED or the field renders garbage. The κ-gate is not optional here — it is the whole safety. A collapse that fails proof-of-play is discarded and the spec stays possibility; a caller never receives unverified code. That is the difference between a generative estate and a garbage generator.";
export default { KAPPA, sha256, canonical, specId, newField, define, isBuilt, possibilities, built, verify, collapse, ratio, exportField, importField, GUARDRAIL };

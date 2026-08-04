// oracle.mjs — THE ORACLE · si-didy's FUTURE organ. Not a predictor (prediction collapses the future prematurely —
// picks one branch, asserts it, brittle and usually wrong). A BRANCH-HOLDER: given a decision or a build it HOLDS
// the future open — forks N genuinely divergent futures, keeps them un-collapsed side by side (the dream), walks
// each forward, resolves which ones HOLD at the κ-gate, and surfaces the branch that opens the most future PLUS the
// roads not taken (kept, never deleted). It NEVER collapses for you — the collapse is authored, never reflexive.
//
// Completes si-didy as the three-tense fold: REMEMBER (fall-remember) holds the past, VERIFY (the κ-gate) holds and
// collapses the present, THE ORACLE holds the future open — and si-didy is the fold watching all three at once.
//
// THE CORE UPGRADE: each forked future is offset by the GOLDEN ANGLE (137.5°) so the branches are maximally far
// apart — they SPREAD across the possibility space (spiral) instead of clustering near the obvious approach (orbit).
// Naive forking gives you five variations of idea #1; golden forking explores the non-obvious better branch.
//
// GUARDRAIL (load-bearing): the Oracle holds possibility and shows what resolves. It does NOT decide. An Oracle that
// auto-collapses is just a predictor again. The whole value is keeping the future open until a DELIBERATE collapse
// (by si-didy's VERIFY, or by a human). Hold, don't decide. Pure kernel, injected scorer, zero-dep, offline.

export const KAPPA = 0.618033988749895;   // the resolve-gate (1/φ): score ≥ κ HOLDS, score < κ CLASHES
export const GOLDEN = 137.50776405003785; // the golden angle — the offset between divergent futures

export function h16(s) { s = String(s); let a = 0x811c9dc5 >>> 0, b = 0x9e3779b9 >>> 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = Math.imul((b ^ c) >>> 0, 0x85ebca6b) >>> 0; b = ((b << 13) | (b >>> 19)) >>> 0; } return (b >>> 0).toString(16).padStart(8, '0') + (a >>> 0).toString(16).padStart(8, '0'); }
const unit = h => (parseInt(h.slice(0, 8), 16) >>> 0) / 4294967296;   // a hash → [0,1)

// an approach's shape in 5 decorrelated dimensions, read off its angle — golden-spread angles → spread shapes.
export function profile(angle) {
  const a = angle * Math.PI / 180;
  return {
    novelty: 0.5 + 0.5 * Math.cos(a),
    risk: 0.5 + 0.5 * Math.cos(a - 2.399),
    cost: 0.5 + 0.5 * Math.cos(a - 4.799),
    horizon: 0.5 + 0.5 * Math.sin(a * 1.0 + 1.2),
    reversibility: 0.5 + 0.5 * Math.sin(a + 3.6),
  };
}
const DIMS = ['novelty', 'risk', 'cost', 'horizon', 'reversibility'];
export function profileDistance(p, q) { let s = 0; for (const d of DIMS) { const e = p[d] - q[d]; s += e * e; } return Math.sqrt(s); }
// how divergent a set of branches is: the SMALLEST distance between any two profiles (higher = more spread).
export function coverage(branches) { let m = Infinity; for (let i = 0; i < branches.length; i++) for (let j = i + 1; j < branches.length; j++) m = Math.min(m, profileDistance(branches[i].profile, branches[j].profile)); return branches.length < 2 ? 0 : m; }

// twelve stances around the wheel — a branch's angle names its temperament (readable label for the UI).
export const STANCES = [
  'the proven path', 'the bold bet', 'the minimal cut', 'the weird angle', 'the reversible move', 'the slow compound',
  'the opposite tack', 'borrow from elsewhere', 'the patient hold', 'the aggressive push', 'the small experiment', 'the whole rebuild'];
export const stanceAt = angle => STANCES[Math.floor(((angle % 360 + 360) % 360) / 360 * STANCES.length) % STANCES.length];

// ── 1 · FORK — generate N genuinely DIVERGENT futures, each golden-offset from the last ──
export function fork(decision, N = 5, { offset0 = 0 } = {}) {
  const dec = String(decision == null ? '' : decision).trim();
  const out = [];
  for (let i = 0; i < N; i++) {
    const angle = (offset0 + i * GOLDEN) % 360, stance = stanceAt(angle);
    out.push({ i, id: h16(dec + '|' + i + '|' + angle.toFixed(2)), decision: dec, angle, stance, profile: profile(angle), approach: `${stance} — ${dec || 'this'}`, score: null, holds: null });
  }
  return out;   // all N, un-collapsed, side by side (the dream)
}
// the anti-pattern, for contrast: naive forking clusters near the obvious approach (small jitter around 0°).
export function naiveFork(decision, N = 5, seed = 1) {
  const dec = String(decision || '').trim(), out = []; let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < N; i++) { const angle = (rnd() - 0.5) * 40; out.push({ i, angle, stance: stanceAt(angle), profile: profile(angle), approach: `${stanceAt(angle)} — ${dec}` }); }
  return out;
}

// ── 3 · WALK + 4 · RESOLVE — score each branch, then the κ-gate: ≥ κ HOLDS, < κ CLASHES. scorer is INJECTED
//    (a model / si-didy / you walk each branch forward and score how it resolves). ──
export function defaultScorer(branch) { // a deterministic stand-in so the tool runs standalone; real use injects a model
  const base = unit(h16(branch.approach + '#' + branch.angle.toFixed(1)));
  const p = branch.profile; const shaped = 0.55 * base + 0.28 * p.reversibility + 0.17 * (1 - Math.abs(p.risk - 0.5) * 2);
  return Math.max(0, Math.min(1, shaped));
}
export function resolve(branches, scorer = defaultScorer) {
  const scored = branches.map(b => { const score = Math.max(0, Math.min(1, +scorer(b) || 0)); return { ...b, score, holds: score >= KAPPA }; });
  return scored.sort((a, b) => b.score - a.score);
}

// ── 5 · SURFACE — the branch that opens the most future + ALL the roads not taken (kept). NEVER auto-collapses. ──
export function surface(resolved) {
  const holds = resolved.filter(b => b.holds), clashes = resolved.filter(b => !b.holds);
  return { best: holds[0] || null, holds, roadsNotTaken: clashes, anyHold: holds.length > 0, authored: false };   // authored:false — the Oracle has NOT chosen
}

// ── THE COLLAPSE is a separate, DELIBERATE act — and it requires an author. This is the guardrail in code. ──
export function author(surfaced, branchId, by) {
  const who = String(by == null ? '' : by).trim();
  if (!who) return { ok: false, why: 'a collapse must be authored — say who is choosing (VERIFY, or a person). the Oracle never decides for you.' };
  const all = [...surfaced.holds, ...surfaced.roadsNotTaken];
  const chosen = all.find(b => b.id === branchId);
  if (!chosen) return { ok: false, why: 'no such branch' };
  const notTaken = all.filter(b => b.id !== branchId);   // the roads not taken are KEPT, to be remembered
  return { ok: true, chosen, authoredBy: who, notTaken, authored: true };
}

// ── three-tense wiring: a collapsed choice becomes a REMEMBER write — the taken branch + the roads-not-taken as
//    typed edges, so a future decision can revisit a branch that didn't resolve this time but might later. ──
export function toRemember(decision, collapsed) {
  const dec = String(decision || '').trim();
  const edges = [{ from: dec, type: 'taken', to: collapsed.chosen.approach, id: collapsed.chosen.id, score: collapsed.chosen.score }];
  for (const b of collapsed.notTaken) edges.push({ from: dec, type: 'not-taken', to: b.approach, id: b.id, score: b.score });
  return edges;
}

export const GUARDRAIL = "The Oracle holds possibility and shows what resolves — it does NOT decide. The collapse is always authored (by si-didy's VERIFY for builds, or by you for real choices), never reflexive. An Oracle that auto-collapses is just a predictor again. Hold, don't decide; keep the roads not taken.";

export default { KAPPA, GOLDEN, STANCES, h16, profile, profileDistance, coverage, stanceAt, fork, naiveFork, defaultScorer, resolve, surface, author, toRemember, GUARDRAIL };

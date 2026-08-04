// wire.mjs — wire the THREE REAL organs to cast their roads-not-taken into ONE shared shadow-index.
//
// The shadow-index (shadow.mjs) catches roads-not-taken from any collapse. Here we connect the actual
// tense-organs (vendored verbatim in ./organs/) so their REAL un-collapsed branches feed it:
//   · the Oracle       — forks N futures, authors one → every other STANCE is a road-not-taken
//   · re-collapse      — walks readings, seals one   → every other LENS walked is a road-not-taken
//   · generative estate— defines specs, builds some  → every un-built SPEC is a road-not-taken
// We cast the reusable VOCABULARY (stance / lens / spec-name), not the decision-specific text, so a
// direction the estate keeps forking toward but never committing to RECURS across decisions — and the
// recurrence detector surfaces it as the next-build signal. A collector on outputs the organs already
// produce and discard; it invents nothing.
import { cast } from './shadow.mjs';
import * as oracle from './organs/oracle.mjs';
import * as recollapse from './organs/recollapse.mjs';
import * as estate from './organs/estate.mjs';

// ── ORACLE → shadow. Fork a decision, resolve, author one branch; cast the STANCE of every road-not-taken.
export function castOracle(idx, decision, { N = 5, scorer, chosenId = null } = {}) {
  const surfaced = oracle.surface(oracle.resolve(oracle.fork(decision, N), scorer));
  const all = [...surfaced.holds, ...surfaced.roadsNotTaken];
  const chosen = chosenId ? all.find(b => b.id === chosenId) : surfaced.best;   // author a HELD branch; below κ, author nothing
  const roads = chosen ? all.filter(b => b.id !== chosen.id) : all;             // if nothing holds, EVERY branch is a road-not-taken
  const ctx = 'oracle:' + String(decision == null ? '' : decision).trim();
  roads.forEach(b => cast(idx, b.stance, ctx));
  return { organ: 'oracle', decision: String(decision == null ? '' : decision).trim(), chosen: chosen ? chosen.stance : null, roads: roads.map(b => b.stance) };
}

// ── RE-COLLAPSE → shadow. After walking readings and collapsing one, cast the LENS of every reading NOT sealed.
export function castRecollapse(idx, session) {
  const walked = Object.keys((session && session.walked) || {});
  const roads = walked.filter(k => k !== (session && session.chosen));
  const ctx = 'recollapse:' + String((session && session.event) || '').trim();
  const labels = roads.map(k => { const l = recollapse.lens(k); return l ? l.label : k; });
  labels.forEach(l => cast(idx, l, ctx));
  return { organ: 'recollapse', event: String((session && session.event) || '').trim(), chosen: session && session.chosen, roads: labels };
}

// ── GENERATIVE ESTATE → shadow. Every possibility DEFINED but not BUILT is a road-not-taken; cast its NAME.
export function castEstate(idx, field, decision) {
  const roads = estate.possibilities(field || { specs: {}, cache: {} }).filter(s => !estate.isBuilt(field, s.id));
  const ctx = 'estate:' + String(decision == null ? '' : decision).trim();
  roads.forEach(s => cast(idx, s.name, ctx));
  return { organ: 'estate', decision: String(decision == null ? '' : decision).trim(), roads: roads.map(s => s.name) };
}

// ── the whole wire: run all three organs into ONE index. Each casts its real roads; the shared index
//    then holds the estate's un-collapsed complement across every tense, recurrence-rankable together. ──
export function castAll(idx, { oracleDecisions = [], recollapseSessions = [], estateFields = [] } = {}) {
  const out = [];
  for (const d of oracleDecisions) out.push(castOracle(idx, d));
  for (const s of recollapseSessions) out.push(castRecollapse(idx, s));
  for (const f of estateFields) out.push(castEstate(idx, f.field, f.decision));
  return out;
}

export default { castOracle, castRecollapse, castEstate, castAll };

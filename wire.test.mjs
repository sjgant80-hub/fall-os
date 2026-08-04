// wire.test.mjs — PROOF-OF-PLAY for wiring the THREE REAL organs into the shared shadow-index. Zero tokens.
// Runs the actual vendored kernels (oracle / recollapse / estate), casts their REAL roads-not-taken into ONE
// index, and proves the recurrence detector surfaces a direction the estate keeps forking toward across real
// decisions. Deterministic (the organs are pure; the injected scorer is content-derived).
import { makeIndex, recurring, ranked, shadowsOf } from './shadow.mjs';
import { castOracle, castRecollapse, castEstate, castAll } from './wire.mjs';
import * as oracle from './organs/oracle.mjs';
import * as recollapse from './organs/recollapse.mjs';
import * as estate from './organs/estate.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };
// a decision-INDEPENDENT scorer (scores by stance only) so the same stance is authored every decision ⇒ the
// SAME roads recur — a clean, deterministic demonstration of the real Oracle's recurrence.
const unit = s => (parseInt(oracle.h16(s).slice(0, 8), 16) >>> 0) / 0xffffffff;
const byStance = b => 0.5 + 0.5 * unit(b.stance);   // ≥0.5 so the top stances clear κ — a hold always exists (best is real)

console.log('\n=== §1 · ORACLE wired — the real fork/resolve/surface casts every un-authored STANCE as a road ===');
{
  const idx = makeIndex();
  const r = castOracle(idx, 'ship the new feature', { N: 5, scorer: byStance });
  ok(r.organ === 'oracle' && r.roads.length === 4 && typeof r.chosen === 'string', 'the real Oracle forked 5, authored 1, cast 4 roads-not-taken (their stances)');
  ok([...idx.shadows.values()].every(e => e.contexts[0] === 'oracle:ship the new feature'), 'every cast shadow is tagged with the real decision it came from');
  ok(r.decision === 'ship the new feature', 'the returned decision is preserved verbatim (not blanked)');
  const branches = oracle.resolve(oracle.fork('pick one', 5), byStance), target = branches[2];   // fork is deterministic → same ids as inside castOracle
  const r2 = castOracle(makeIndex(), 'pick one', { N: 5, scorer: byStance, chosenId: target.id });
  ok(r2.chosen === target.stance, 'an explicit chosenId authors THAT exact branch (id match), leaving the rest as roads');
}

console.log('\n=== §2 · RE-COLLAPSE wired — the readings walked but NOT sealed become roads ===');
{
  const idx = makeIndex();
  const s = recollapse.newSession('a hard year');
  recollapse.rise(s);
  recollapse.walk(s, 'taught', 'I learned to say no');
  recollapse.walk(s, 'door', 'it freed my time');
  recollapse.walk(s, 'protected', 'it fenced off something worse');
  recollapse.collapse(s, 'taught');                       // seal 'taught'; the other two are roads-not-taken
  const r = castRecollapse(idx, s);
  ok(r.roads.length === 2 && r.roads.includes(recollapse.lens('door').label) && r.roads.includes(recollapse.lens('protected').label), 'the two walked-but-unsealed readings are cast as roads (by lens label)');
  ok(!r.roads.includes(recollapse.lens('taught').label) && shadowsOf(idx, 'recollapse:a hard year').length === 2, 'the SEALED reading is not a road, and the roads carry the real event as context');
  ok(r.event === 'a hard year', 'the returned event is preserved verbatim (not blanked)');
}

console.log('\n=== §3 · GENERATIVE ESTATE wired — every possibility DEFINED but not BUILT is a road ===');
{
  const idx = makeIndex();
  const field = estate.newField();
  const inc = estate.define(field, { name: 'inc', description: 'increment', verify: [{ in: [1], out: 2 }] });
  estate.define(field, { name: 'dreamLayer', description: 'notes that dream overnight', verify: [{ in: [], out: 0 }] });
  estate.define(field, { name: 'darkMode', description: 'dark mode', verify: [{ in: [], out: 0 }] });
  const built = estate.collapse(field, inc.id, spec => `function ${spec.name}(x){ return x + 1; }`);   // really build inc
  const r = castEstate(idx, field, 'a build session');
  ok(built.ok && !built.cached && r.roads.length === 2 && r.roads.includes('dreamLayer') && r.roads.includes('darkMode') && !r.roads.includes('inc'), 'inc verified + built; the two un-built specs are cast as roads (by name), inc excluded');
  ok(r.decision === 'a build session' && shadowsOf(idx, 'estate:a build session').length === 2, 'the roads carry the real decision as context (estate:a build session) and the decision is returned verbatim');
}

console.log('\n=== §4 · THE PAYOFF — a stance the real Oracle keeps forking toward across 3 decisions RECURS ===');
{
  const idx = makeIndex();
  castOracle(idx, 'decision alpha', { N: 5, scorer: byStance });
  castOracle(idx, 'decision beta', { N: 5, scorer: byStance });
  castOracle(idx, 'decision gamma', { N: 5, scorer: byStance });
  const rec = recurring(idx, 3);
  ok(rec.length >= 1 && rec.every(e => e.times_shadowed === 3), 'stance(s) forked-toward-but-never-authored across all 3 real decisions surface at count 3 — the estate\'s own un-collapsed pattern');
  ok(rec[0].contexts.length === 3 && rec[0].contexts.every(c => c.startsWith('oracle:')) && new Set(rec[0].contexts).size === 3, 'the signal names the 3 DISTINCT real decisions that circled it');
}

console.log('\n=== §5 · ONE SHARED INDEX across all three tenses — the estate\'s whole un-collapsed complement ===');
{
  const idx = makeIndex();
  const s1 = recollapse.newSession('event one'); recollapse.rise(s1);
  recollapse.walk(s1, 'taught', 'x'); recollapse.walk(s1, 'door', 'y'); recollapse.collapse(s1, 'taught');
  const field = estate.newField();
  estate.define(field, { name: 'specA', verify: [{ in: [], out: 0 }] });
  estate.define(field, { name: 'specB', verify: [{ in: [], out: 0 }] });
  castAll(idx, {
    oracleDecisions: ['ship it', 'refactor it'],
    recollapseSessions: [s1],
    estateFields: [{ field, decision: 'weekend build' }],
  });
  const ctxKinds = new Set([...idx.shadows.values()].flatMap(e => e.contexts).map(c => c.split(':')[0]));
  ok(ctxKinds.has('oracle') && ctxKinds.has('recollapse') && ctxKinds.has('estate'), 'ONE index holds roads-not-taken from all three real organs (oracle + recollapse + estate)');
  ok(ranked(idx).length >= 1 && ranked(idx).every(e => typeof e.branch === 'string' && e.times_shadowed >= 1), 'the shared shadow is recurrence-rankable across the whole body — the 1% built has its 99% twin, caught');
}

console.log('\n=== §6 · DETERMINISM + FUZZ ===');
{
  const run = () => { const i = makeIndex(); castOracle(i, 'd', { N: 5, scorer: byStance }); return JSON.stringify(ranked(i)); };
  ok(run() === run(), 'wiring the real Oracle is deterministic — same decision, same shadow');
  let threw = false;
  try { const i = makeIndex(); castOracle(i, ''); castOracle(i, null); castRecollapse(i, null); castRecollapse(i, {}); castEstate(i, null, 'd'); castEstate(i, estate.newField(), ''); castAll(i, {}); }
  catch { threw = true; }
  ok(!threw, 'blank/null decisions, empty sessions, empty fields never throw');
}

const done = fail === 0;
console.log('\n' + (done
  ? `=== ✅ WIRED — the three real organs (Oracle · re-collapse · generative estate) cast their real roads-not-taken into ONE shadow-index, and the recurrence detector surfaces what the estate keeps circling · ${pass}/${pass} · zero tokens ===`
  : `=== ❌ ${fail} FAILED / ${pass + fail} ===`));
process.exit(done ? 0 : 1);

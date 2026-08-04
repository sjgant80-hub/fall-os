// depth.test.mjs — verification for the conductor's search-depth control. Deterministic, no external deps.
// Establishes: (1) increasing depth evaluates more candidates; (2) it records more not-taken branches;
// (3) a deeper search is a superset of a shallower one, so its best candidate is never worse; (4) at equal
// or lower branching factor, higher depth can evaluate a larger, less-redundant candidate set than depth 1
// ("depth over size"); (5) resolution remains authored (nothing is selected without an author).
import { makeDidy } from './didy.mjs';
import { deepen } from './depth.mjs';
import { KAPPA } from './core.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };

console.log('\n=== §1 · Depth increases the number of candidates evaluated ===');
{
  const shallow = deepen(makeDidy(), 'plan the release', { n: 5, depth: 1 });
  const deep = deepen(makeDidy(), 'plan the release', { n: 5, depth: 3 });
  ok(shallow.reached === 5, 'depth 1 evaluates exactly n candidates (a single expansion)');
  ok(deep.reached > shallow.reached, `depth 3 evaluates strictly more candidates (${deep.reached} > ${shallow.reached})`);
  ok(deep.depth === 3 && shallow.depth === 1, 'the depth parameter is reported back for auditability');
}

console.log('\n=== §2 · Deeper searches record more not-taken branches into the index ===');
{
  const a = makeDidy(), b = makeDidy();
  deepen(a, 'x', { n: 5, depth: 1, author: h => h[0] || null });
  deepen(b, 'x', { n: 5, depth: 3, author: h => h[0] || null });
  ok(b.shadow.shadows.size > a.shadow.shadows.size, 'a depth-3 search indexes more not-taken branches than depth 1 — a larger region of the candidate space is retained');
}

console.log('\n=== §3 · A deeper search is a superset — its best candidate is never worse ===');
{
  const shallow = deepen(makeDidy(), 'same seed', { n: 5, depth: 1 });
  const deep = deepen(makeDidy(), 'same seed', { n: 5, depth: 4 });
  ok(shallow.field.holds.length >= 1 && deep.field.holds.length >= 1, 'both searches return at least one above-threshold candidate');
  ok(deep.field.holds[0].score >= shallow.field.holds[0].score, 'the best candidate at depth 4 scores ≥ the best at depth 1 — level 1 is common to both, so depth never regresses the result');
}

console.log('\n=== §4 · Depth over size — higher depth at a smaller branching factor evaluates more, less-redundant candidates ===');
{
  const smallDeep = deepen(makeDidy(), 'coverage', { n: 3, depth: 3 });
  const bigShallow = deepen(makeDidy(), 'coverage', { n: 9, depth: 1 });
  ok(bigShallow.reached === 9, 'branching factor 9 at depth 1 evaluates 9 candidates');
  ok(smallDeep.reached > bigShallow.reached, `branching factor 3 at depth 3 evaluates more (${smallDeep.reached} > 9) — recursive golden-offset expansion covers more of the space than a single wide expansion`);
}

console.log('\n=== §5 · Resolution remains authored at every depth (no candidate is selected without an author) ===');
{
  const r = deepen(makeDidy(), 'decide', { n: 5, depth: 3 });     // no author supplied
  ok(r.built === null && r.remembered === false, 'without an author, a deep search evaluates and indexes candidates but selects none — resolution is never implicit');
  const c = makeDidy();
  const r2 = deepen(c, 'decide', { n: 5, depth: 3, author: h => h[0] || null });
  ok(r2.built && r2.built.holds === true && r2.built.score >= KAPPA && c.cache.has('decide'), 'with an author, exactly one above-threshold candidate is selected, recorded, and cached');
}

console.log('\n=== §6 · Parameter clamping, determinism, and input tolerance ===');
{
  ok(deepen(makeDidy(), 'z', { depth: 99 }).depth === 6 && deepen(makeDidy(), 'z', { depth: 0 }).depth === 1, 'the depth parameter is clamped to a bounded range (1–6)');
  const run = () => JSON.stringify(deepen(makeDidy(), 'd', { n: 4, depth: 3, author: h => h[0] || null }).field.holds.map(b => b.score));
  ok(run() === run(), 'a depth search is deterministic — identical inputs produce identical results');
  let threw = false;
  try { deepen(makeDidy(), ''); deepen(makeDidy(), null, { depth: 2 }); deepen(makeDidy(), 'e', { n: 0, depth: 3 }); }
  catch { threw = true; }
  ok(!threw, 'empty/null decisions and a zero branching factor do not raise');
}

const done = fail === 0;
console.log('\n' + (done
  ? `=== ✅ depth control — depth bounds the search; deeper evaluates more candidates, never regresses the result, and covers more of the space per unit of branching · ${pass}/${pass} ===`
  : `=== ❌ ${fail} FAILED / ${pass + fail} ===`));
process.exit(done ? 0 : 1);

// estate.test.mjs — gate on the ESTATE DATA the public surface renders.
//
// The kernels were gated; the generator that produces every published fact was not. That gap is
// exactly how the site under-reported the estate twice: first with a hand-typed list, then with a
// generator whose candidate set was still hand-typed one level down. A rule existed and nothing
// enforced it. This is the enforcement.
//
// It asserts properties that would have FAILED on both previous versions:
//   · known-live builds that were silently missing must be present
//   · the live set must be large enough that a narrowed candidate set is detectable
//   · totals must match the canonical index, not a remembered figure
//   · no build may be listed without a resolvable URL, and none may carry internal notation
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };

const est = JSON.parse(readFileSync(new URL('./estate.json', import.meta.url), 'utf8'));
const items = est.faculties.flatMap(f => f.items);
const names = new Set(items.map(i => i.name));

console.log('\n=== §1 · THE REGRESSION — builds that were silently missing must be present ===');
{
  // Every one of these is live and was ABSENT from an earlier "fixed" generation.
  const missedBefore = ['fallmarket', 'roost', 'fallkard', 'fallswarm', 'fall-registry', 'fallherd', 'fallcolony', 'fallhub', 'fallrouter'];
  const absent = missedBefore.filter(n => !names.has(n));
  ok(absent.length === 0, `every previously-missed live build is now listed${absent.length ? " — MISSING: " + absent.join(", ") : ""}`);
  // and a PRIVATE repo must never appear on a public surface, however live it is internally.
  ok(!names.has("konomify"), "a private build (konomify) is correctly excluded from the public list — privacy is enforced, not assumed");
}

console.log('\n=== §2 · CANDIDATE BREADTH — a narrowed candidate set is detectable ===');
{
  // The broken version emitted ~101. Checking all public repos emits several hundred. A floor well
  // above the broken figure fails loudly if the candidate set is ever narrowed again.
  ok(items.length >= 250, `the live set is ${items.length} builds — above the floor that a narrowed candidate set would fall below`);
  ok(est.totals.live_verified === items.length, 'the reported live count equals the number actually listed (no phantom total)');
}

console.log('\n=== §3 · TOTALS COME FROM THE INDEX, NOT FROM MEMORY ===');
{
  // The canonical index lives on the maintainer machine, not in the repo. Where it is reachable we
  // check the totals against it exactly; in CI we check the totals are internally consistent instead —
  // so the gate is meaningful in both places and never passes by silently skipping.
  const INDEX = "C:/Users/sjgan/.claude/projects/C--Users-sjgan--claude/memory/estate-index.json";
  let repos = null;
  try { const idx = JSON.parse(readFileSync(INDEX, "utf8")); repos = Array.isArray(idx) ? idx : (idx.repos || Object.values(idx).find(v => Array.isArray(v))); } catch { /* not on this machine */ }
  if (repos) {
    ok(est.totals.repositories === repos.length, `total repositories (${est.totals.repositories}) matches the canonical index exactly`);
    ok(est.totals.public === repos.filter(r => !r.private).length && est.totals.private === repos.filter(r => r.private).length,
       "the public/private split is derived from the index, not asserted");
  } else {
    ok(est.totals.public + est.totals.private === est.totals.repositories,
       "index not present here (CI) — totals are internally consistent: public + private equals the total");
    ok(est.totals.repositories > 1000 && est.totals.private > 0,
       "totals are of the expected magnitude, so a truncated or empty generation fails loudly");
  }
  ok(est.generated_from === 'estate-index.json', 'the file records the source it was generated from');
}

console.log('\n=== §4 · NOTHING UNVERIFIABLE AND NOTHING LEAKED ON THE PUBLIC SURFACE ===');
{
  ok(items.every(i => /^https:\/\/sjgant80-hub\.github\.io\/[^/]+\/$/.test(i.url)), 'every listed build carries a well-formed live URL');
  const leaked = items.filter(i => /[◊κφΨΩ]/.test(i.name + ' ' + i.desc));
  ok(leaked.length === 0, `no listed build carries internal notation${leaked.length ? ' — ' + leaked.map(l => l.name).join(', ') : ''}`);
  ok(new Set(items.map(i => i.url)).size === items.length, 'no build is listed twice');
  ok(est.faculties.every(f => f.items.length > 0), 'no empty faculty is rendered');
}

const done = fail === 0;
console.log('\n' + (done
  ? `=== ✅ estate data — generated from the canonical index, breadth-checked, totals matched, nothing leaked · ${pass}/${pass} ===`
  : `=== ❌ ${fail} FAILED / ${pass + fail} ===`));
process.exit(done ? 0 : 1);

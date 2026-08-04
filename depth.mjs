// depth.mjs — search-depth control for the conductor (a parameter, not a component).
//
// Controls how many levels of expansion the conductor performs before it resolves. At depth 1 the
// search is a single expansion followed by resolution (equivalent to a plain conduct call). Increasing
// the depth expands the search: each additional level re-expands from the sub-threshold ("not-taken")
// branches of the previous level, covering a larger region of the candidate space before a single
// authored resolution. Deeper searches therefore evaluate more candidates and record more not-taken
// branches into the index. Because expansion uses the golden-angle offset (near-uniform, low-overlap
// coverage), a small branching factor at higher depth can evaluate a larger, less-redundant candidate
// set than a large branching factor at depth 1 — this is verified in the test suite.
//
// This is a dial rather than a component: it changes how the shared core is invoked, not which organs
// are registered. The implementation is deterministic; no probabilistic search is performed.
import { fork, hold, collapse } from './core.mjs';
import { cast } from './shadow.mjs';

const FANOUT = 2;   // sub-threshold branches re-expanded per level (bounds total candidates to O(n·FANOUT^depth))

// Run a depth-bounded search on conductor `c` for `decision`. Returns { reached, field, built, remembered, depth }.
export function deepen(c, decision, { n = 5, depth = 1, author = null, generate, score } = {}) {
  const dec = String(decision == null ? '' : decision).trim();
  const gen = generate || ((i, theta) => ({ label: dec + ' · ' + i, theta }));
  const scr = score || (v => ((v && v.theta || 0) % 360) / 360);
  const d = Math.max(1, Math.min(6, Math.floor(depth)));   // clamp the depth parameter
  const explored = [];                                     // every candidate evaluated, across every level

  // Depth-first expansion: expand n candidates at the current level; recurse from the FANOUT lowest-scoring
  // ("not-taken") candidates, offsetting each child expansion by the parent's angle so children remain
  // near-uniformly distributed. Level 1 is identical to a depth-1 search, so deeper searches are supersets.
  const walk = (seedAngle, level) => {
    const branches = fork(n, (i, theta) => gen(i, (seedAngle + theta) % 360), {});
    const held = hold(branches, scr);
    for (const b of held) explored.push(b);
    if (level < d) {
      const roads = held.filter(b => !b.holds);
      for (const r of roads.slice(0, FANOUT)) walk(r.theta, level + 1);
    }
  };
  walk(0, 1);

  // ONE authored collapse across the WHOLE deepened exploration (deeper never finds worse — level 1 is
  // always in the set — and can find a branch shallow never reached).
  const field = collapse(explored, author);
  const built = field.decided ? field.chosen : null;
  for (const b of explored) if (b !== built) cast(c.shadow, b, 'deepen:' + dec);   // remember every road-not-taken → shadow
  if (built) { c.cache.once(dec, () => built); c.memory.push({ decision: dec, built: built.value, score: built.score, depth: d }); }
  return { decision: dec, depth: d, reached: explored.length, field, built, remembered: !!built };
}

export default { deepen };

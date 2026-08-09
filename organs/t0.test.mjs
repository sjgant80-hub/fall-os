// t0.test.mjs — PROOF-OF-PLAY for TIER 0, the conductor's no-model brain.
//
// The claim under test is narrow and must stay narrow: this organ does NOT understand a sentence, it
// finds named signals and scores a fixed taxonomy against them. So the tests check the things that
// claim actually implies — that every score is traceable to a cue the visitor can see, that a cue is
// matched as a WORD and not as a substring, that the fork walks the taxonomy instead of reading it in
// order, and that when the text says nothing the organ SAYS so rather than implying a reading.
import { SIGNALS, STANCES, evidence, scoreStance, t0Organ, summarise } from './t0.mjs';
import { KAPPA, fork, hold, collapse } from '../core.mjs';
import { makeDidy, register, conduct } from '../didy.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };

console.log('\n=== §1 · EVIDENCE — what it found, and the cue that fired ===');
{
  const e = evidence('Should we migrate the whole production database this Friday?');
  ok(e.found, 'a sentence with real cues reports found');
  ok(e.ids.includes('irreversible'), '"migrate" is read as hard-to-undo');
  ok(e.ids.includes('scale'), '"whole" is read as affecting many things');
  ok(e.ids.includes('deadline'), '"friday" is read as time pressure');
  ok(e.ids.includes('existing'), '"production" is read as something already running');
  const irr = e.signals.find(s => s.id === 'irreversible');
  ok(irr.cues.includes('migrate'), 'the cue word that fired is REPORTED, so the score can be audited against the text');
  ok(e.signals.every(s => s.label && s.cues.length > 0), 'every reported signal carries a human label and at least one cue');
}

console.log('\n=== §2 · it does not invent a reading it cannot support ===');
{
  const e = evidence('xyzzy plugh frotz');
  ok(!e.found && e.signals.length === 0, 'text with no cues reports found:false — no signals invented');
  ok(evidence('').found === false, 'empty text finds nothing');
  ok(evidence(null).found === false && evidence(undefined).found === false, 'null/undefined are handled, not thrown on');
  ok(evidence('xyzzy plugh').words === 2, 'it reports how many words it actually looked at');
}

console.log('\n=== §3 · a cue is a WORD, not a substring (the classic false positive) ===');
{
  // "commitment" contains "commit"; "trying" contains "try". A substring match would fire on both and
  // silently mis-score the field, which is exactly the kind of error a visitor could never spot.
  const e = evidence('commitment and trials of allocation');
  ok(!e.ids.includes('irreversible'), '"commitment" does not fire the "commit" cue');
  ok(!e.ids.includes('scale'), '"allocation" does not fire the "all" cue');
  ok(evidence('commit').ids.includes('irreversible'), 'but the bare word "commit" does fire it');
  ok(evidence('trial').ids.includes('reversible'), 'and "trial" is listed in its own right');
}

console.log('\n=== §4 · a question mark is genuine evidence of uncertainty ===');
{
  ok(evidence('do we rebuild it?').ids.includes('unknown'), 'a question mark counts toward uncertainty');
  ok(!evidence('we rebuild it').ids.includes('unknown'), 'the same sentence stated flat does not');
  const e = evidence('maybe?');
  ok(e.signals.find(s => s.id === 'unknown').cues.length === 2, 'a word cue and the question mark are both reported, not merged');
  ok(evidence('unsure?').signals.find(s => s.id === 'unknown').cues.filter(c => c === '?').length === 1, 'the question mark is never double-counted');
}

console.log('\n=== §5 · SCORING — traceable up and down, and bounded ===');
{
  const ship = STANCES.find(s => s.name.startsWith('Ship the smallest'));
  const hi = scoreStance(ship, ['reversible', 'unknown', 'speed']);
  const lo = scoreStance(ship, ['irreversible']);
  ok(hi.score > lo.score, 'signals it wants raise it; a signal it avoids lowers it');
  ok(hi.up.length === 3 && hi.down.length === 0, 'the signals that raised it are named');
  ok(lo.down.includes('irreversible'), 'the signal that lowered it is named too');
  ok(scoreStance(ship, []).score === ship.prior, 'with no signals a stance scores exactly its stated prior — nothing hidden');
  ok(hi.score <= 1 && lo.score >= 0, 'scores stay inside [0,1]');
  const noAvoid = STANCES.find(s => s.avoids.length === 0);
  ok(scoreStance(noAvoid, ['risk']).score >= noAvoid.prior, 'a stance with no avoids is never pushed down');
  ok(scoreStance({ prior: 0.5, wants: [], avoids: [] }, ['risk']).score === 0.5, 'a stance wanting nothing is unmoved by evidence');
}

console.log('\n=== §6 · the priors are a stated default, and they are NOT uniform ===');
{
  ok(STANCES.every(s => s.prior >= 0 && s.prior <= 1), 'every prior is a probability-shaped number');
  ok(new Set(STANCES.map(s => s.prior)).size > 1, 'the priors differ — this is a stated opinion, not a uniform shrug');
  const held = STANCES.filter(s => s.prior >= KAPPA);
  ok(held.length >= 2 && held.length < STANCES.length, 'with zero signals SOME stances clear the gate and some do not — a blank input still gives a usable field');
  ok(STANCES.every(s => s.move && s.move !== s.name), 'every stance carries an actionable move, not just a title');
  ok(new Set(STANCES.map(s => s.name)).size === STANCES.length, 'no duplicate stances');
  ok(SIGNALS.every(s => s.cues.length > 0 && s.label), 'every signal has cues and a label');
  ok(new Set(SIGNALS.map(s => s.id)).size === SIGNALS.length, 'no duplicate signal ids');
}

console.log('\n=== §7 · THE FORK walks the taxonomy — it does not read it in list order ===');
{
  const org = t0Organ('should we migrate?');
  const branches = fork(4, org.generate, {});
  const names = branches.map(b => b.value.label);
  ok(new Set(names).size === 4, 'four branches are four DIFFERENT stances — no repeats');
  const firstFour = STANCES.slice(0, 4).map(s => s.name);
  ok(JSON.stringify(names) !== JSON.stringify(firstFour), 'they are not simply the first four in the file — the golden offset spreads them');
  const org2 = t0Organ('should we migrate?');
  const again = fork(4, org2.generate, {}).map(b => b.value.label);
  ok(JSON.stringify(names) === JSON.stringify(again), 'the same input gives the same field — deterministic, no randomness');
  // The SAME organ, forked twice. Found by clicking commit in the live page and watching it build a
  // stance that was never on screen: the conductor re-runs the loop to apply the visitor's authorship,
  // so an organ that answers differently the second time silently builds the wrong thing.
  const twice = fork(4, org.generate, {}).map(b => b.value.label);
  ok(JSON.stringify(names) === JSON.stringify(twice), 'RE-FORKING THE SAME ORGAN gives the same field — no state leaks between runs');
  const wide = fork(STANCES.length, org.generate, {}).map(b => b.value.label);
  ok(new Set(wide).size === STANCES.length, 'and a re-forked organ still returns a full permutation, not the leftovers');
}

console.log('\n=== §8 · asking for the whole taxonomy returns the whole taxonomy (nothing dropped) ===');
{
  const org = t0Organ('migrate everything urgently');
  const all = fork(STANCES.length, org.generate, {}).map(b => b.value.label);
  ok(new Set(all).size === STANCES.length, 'n = taxonomy size yields every stance exactly once — a permutation, not a sample');
  const org2 = t0Organ('x');
  const over = fork(STANCES.length + 3, org2.generate, {});
  ok(over.length === STANCES.length + 3, 'asking for more than exist still returns that many branches rather than throwing');
  // Once the taxonomy is exhausted the skip-loop can no longer find an unseen stance, so it gives back
  // the stance the golden step actually landed on. Pinning that exactly, because an off-by-one in the
  // guard silently shifts EVERY repeat by one stance — a wrong answer that still looks well-formed.
  const raw = (b) => STANCES[Math.round((b.theta / 360) * STANCES.length) % STANCES.length].name;
  const tail = over.slice(STANCES.length);
  ok(tail.every(b => b.value.label === raw(b)), 'past the end it returns the stance the golden step lands on — not that stance plus one');
}

console.log('\n=== §9 · the score the core sees is the score that was computed ===');
{
  const org = t0Organ('migrate the whole live system, risky, deadline friday');
  const b = fork(6, org.generate, {});
  const h = hold(b, org.score);
  ok(h.every(x => x.score === x.value.precomputed), 'hold() reads back exactly the traceable score attached to the branch');
  ok(h.every(x => x.holds === (x.score >= KAPPA)), 'holding is decided by the shared κ-gate, not by this organ');
  ok(org.score({}) === 0 && org.score(null) === 0, 'a branch with no computed score is worth 0, not NaN');
  ok(org.score({ precomputed: 5 }) === 1 && org.score({ precomputed: -5 }) === 0, 'a nonsense score is clamped rather than trusted');
  ok(b.every(x => Array.isArray(x.value.up) && Array.isArray(x.value.down)), 'every branch carries its own why, so the UI can show it');
}

console.log('\n=== §10 · the evidence changes the ranking (it is not decoration) ===');
{
  const a = t0Organ('quick reversible experiment, easy to undo');
  const bText = t0Organ('permanent migration, legal risk, affects every customer');
  const rank = (o) => collapse(hold(fork(STANCES.length, o.generate, {}), o.score), null).holds.map(h => h.value.label);
  const ra = rank(a), rb = rank(bText);
  ok(ra[0] !== rb[0], 'a reversible experiment and an irreversible migration do NOT get the same top stance');
  ok(rb.includes('Verify before you commit'), 'the irreversible, risky, wide decision surfaces "verify before you commit"');
  ok(rank(t0Organ('')).length >= 2, 'even an empty decision yields a usable field from the priors alone');
}

console.log('\n=== §11 · SUMMARISE — it says out loud when it found nothing ===');
{
  const org = t0Organ('xyzzy plugh');
  const field = collapse(hold(fork(5, org.generate, {}), org.score), null);
  const s = summarise(field, org.evidence);
  ok(/no signals found/i.test(s), 'with no signals it says so plainly instead of implying a reading');
  const org2 = t0Organ('migrate the whole system by friday');
  const f2 = collapse(hold(fork(5, org2.generate, {}), org2.score), null);
  const s2 = summarise(f2, org2.evidence);
  ok(/signal/i.test(s2) && /time pressure/.test(s2), 'with signals it names them in plain English');
  ok(/roads-not-taken/.test(s) && /roads-not-taken/.test(s2), 'both paths report what was KEPT, not just what held');
  // BOTH counts on that sentence are pluralised independently, and both need pinning: they sit on one
  // line, so a test that only reads one of them leaves the other free to say "1 stances".
  const one = summarise({ holds: [1], roads: [2] }, { found: true, signals: [{ label: 'x' }] });
  ok(/\b1 signal\b/.test(one) && !/\b1 signals\b/.test(one), 'one signal is reported in the singular');
  ok(/\b1 stance\b/.test(one) && !/\b1 stances\b/.test(one), 'one stance is reported in the singular too');
  const many = summarise({ holds: [1, 2], roads: [] }, { found: true, signals: [{ label: 'x' }, { label: 'y' }] });
  ok(/\b2 signals\b/.test(many) && /\b2 stances\b/.test(many), 'two of each are reported in the plural');
  ok(summarise(null, null).length > 0, 'a missing field does not throw');
}

console.log('\n=== §12 · IT IS THE REAL LOOP — conduct() runs on the visitor text ===');
{
  const c = makeDidy('fall');
  const org = t0Organ('should we rewrite the whole billing system before the deadline?');
  register(c, 't0', org);
  const r = conduct(c, 'should we rewrite the whole billing system before the deadline?', { n: 6 });
  ok(r.field.holds.length + r.field.roads.length === 6, 'the conductor explored six branches through the SHARED core');
  ok(r.built === null && r.remembered === false, 'nothing is built without an author — the collapse stays open');
  ok(c.shadow.shadows.size > 0, 'the roads-not-taken were remembered into the shadow-index');
  const author = (holds) => holds[0] || null;
  const c2 = makeDidy('fall');
  register(c2, 't0', t0Organ('migrate everything now'));
  const r2 = conduct(c2, 'migrate everything now', { n: 6, author });
  ok(r2.built !== null && r2.remembered === true, 'when the visitor authors a branch, it BUILDS and is remembered');
  ok(typeof r2.built.value.move === 'string', 'the built thing carries the actionable move, not just a label');
  ok(c2.memory.length === 1, 'the authored decision landed in memory exactly once');
}

console.log(`\n${fail === 0 ? '✓ T0 GATE CLEAN' : '✗ T0 GATE FAILED'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

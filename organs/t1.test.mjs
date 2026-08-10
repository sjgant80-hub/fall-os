// t1.test.mjs — PROOF-OF-PLAY for TIER 1, the in-tab model.
//
// The claim this file exists to defend is the one the page makes out loud: turning the model ON
// changes the WORDING and nothing else. So most of these tests are adversarial — the model is
// treated as hostile, because a small model behaves like a hostile one by accident: it reorders,
// invents, repeats, preambles, stops early, and cheerfully asserts scores nobody asked it for.
import { SYSTEM, buildPrompt, parseReply, attach, phrase, unmoved, deEcho } from './t1.mjs';
import { t0Organ } from './t0.mjs';
import { fork, hold, collapse } from '../core.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };

// A real tier-0 field to work against, so the tests run on the shape the page actually produces.
const DECISION = 'Should we migrate the whole production database this Friday? Legal risk if it fails.';
const organ = t0Organ(DECISION);
const field = collapse(hold(fork(6, organ.generate, {}), organ.score), null);
const HOLDS = field.holds;

console.log('\n=== §1 · THE PROMPT — carries the decision, the stances and the evidence ===');
{
  const p = buildPrompt(DECISION, HOLDS, organ.evidence);
  ok(p.includes('production database'), 'the decision itself is in the prompt');
  ok(HOLDS.every(h => p.includes(h.value.label)), 'every held stance is listed');
  ok(HOLDS.every(h => p.includes(h.value.move)), 'and so is its built-in move, so the model rewrites rather than invents');
  ok(/hard to undo/.test(p) && /migrate/.test(p), 'the signals found are passed with their cue words — that is what makes it specific');
  ok(/1\./.test(p) && /2\./.test(p), 'the approaches are NUMBERED so the reply maps back by position, not by name');
  ok(buildPrompt('', [], { found: false }).includes('none detected'), 'no evidence is stated as none detected, not omitted');
  ok(buildPrompt(null, null, null).length > 0, 'a null decision does not throw');
  ok(SYSTEM.includes('never') && /rank|choose/.test(SYSTEM), 'the system prompt forbids choosing and ranking');
}

console.log('\n=== §2 · PARSING — a small model is messy, and nothing is dropped in silence ===');
{
  const r = parseReply('Here are the rewrites:\n1) Do the dry run first.\n2. Write the abort rule.\n- some bullet\n3: Ask legal.', 3);
  ok(r.parsed === 3, 'numbered lines are read whichever punctuation follows the number');
  ok(r.byIndex.get(1) === 'Do the dry run first.', 'the sentence is captured without its number');
  ok(r.ignored.length === 2, 'the preamble and the stray bullet are KEPT as ignored, not discarded quietly');
  ok(r.ignored.some(l => /Here are/.test(l)), 'and the ignored lines are reported verbatim so they can be shown');
  ok(parseReply('', 3).parsed === 0 && parseReply(null, 3).parsed === 0, 'an empty or null reply parses to nothing rather than throwing');
  ok(parseReply('1) x', 0).parsed === 0, 'with no stances expected, nothing is accepted');
  ok(parseReply('**1) bolded**', 1).byIndex.get(1) === 'bolded', 'markdown emphasis is stripped rather than shown raw');
  ok(parseReply('1)   \n2) real', 2).parsed === 1, 'a numbered line with an empty body is ignored, not stored blank');
}

console.log('\n=== §3 · the model cannot answer a stance that does not exist ===');
{
  const r = parseReply('1) fine\n7) a stance that is not on the list\n0) nor this one', 3);
  ok(r.parsed === 1, 'out-of-range numbers are refused');
  ok(r.ignored.length === 2, 'and reported');
  const dup = parseReply('1) first answer\n1) second answer for the same one', 2);
  ok(dup.parsed === 1 && dup.byIndex.get(1) === 'first answer', 'a repeated number keeps the first and reports the rest — no silent overwrite');
  ok(dup.ignored.length === 1, 'the duplicate is in ignored');
}

console.log('\n=== §4 · ⚑ THE FIELD CANNOT MOVE — the load-bearing claim, attacked ===');
{
  const hostile = [
    '3) I have decided this one wins, score 99%.',
    '1) Actually you should do something else entirely.',
    '2) Ship it now.',
    '4) A brand new stance I invented: rewrite everything.',
    'The best option is clearly number 3 with a score of 1.00.',
  ].join('\n');
  const parsed = parseReply(hostile, HOLDS.length);
  const rows = attach(HOLDS, parsed);
  ok(unmoved(HOLDS, rows), 'a reply that reorders, rescores and invents a stance leaves the field identical');
  ok(rows.every((r, n) => r.score === HOLDS[n].score), 'every score is the tier-0 score, copied — none came from the model');
  ok(rows.every((r, n) => r.label === HOLDS[n].value.label), 'every label is the tier-0 label — the model cannot rename a stance');
  ok(rows.every((r, n) => r.i === HOLDS[n].i), 'every branch index is preserved, so the shadow-index still matches');
  ok(rows.length === HOLDS.length, 'the invented fourth stance did not lengthen the field');
  // The first version of this test demanded that "99%" appear nowhere in the output at all. That was
  // the wrong requirement: the model's SENTENCE is shown to the visitor, and a sentence is allowed to
  // contain a number ("cut spend by 20%") — banning percent signs from prose would mangle legitimate
  // phrasing. What actually matters is that no number the model emits is ever READ AS a score, so
  // that is what is asserted. The page renders `phrased` as the model's wording, beside the real
  // score, never in place of it.
  ok(rows.every(r => typeof r.score === 'number' && Number.isFinite(r.score)), 'every score is still a real number from tier 0');
  ok(!rows.some(r => String(r.score).includes('99')), 'the number the model asserted did not become anybody\'s score');
  ok(rows.every(r => r.phrased === null || typeof r.phrased === 'string'), 'the model contributes a string or nothing — it has no other field to write to');
  ok(Object.keys(rows[0]).sort().join(',') === 'echoed,i,label,move,phrased,score', 'a row has exactly these fields — the model cannot add one');
  ok(rows.every(r => typeof r.echoed === 'boolean'), 'echoed is a verdict this kernel reaches, not text the model supplied');
  // the phrasing DID land where it legitimately could
  ok(typeof rows[0].phrased === 'string', 'the model still gets to phrase the stances that exist');
}

console.log('\n=== §5 · a missing line keeps the built-in wording rather than inventing one ===');
{
  const parsed = parseReply('1) only the first one got an answer', HOLDS.length);
  const rows = attach(HOLDS, parsed);
  ok(rows[0].phrased !== null, 'the answered one is phrased');
  ok(rows.slice(1).every(r => r.phrased === null), 'the unanswered ones are explicitly null — never a guess, never blank text');
  ok(rows.every(r => typeof r.move === 'string' && r.move.length > 0), 'and every row still carries its deterministic move, so nothing renders empty');
}

console.log('\n=== §6 · phrase() — the whole tier, with the model injected ===');
{
  const good = async () => HOLDS.map((h, n) => `${n + 1}) Concrete step for ${h.value.label}.`).join('\n');
  const r = await phrase(DECISION, HOLDS, organ.evidence, good);
  ok(r.covered === HOLDS.length, 'a cooperative model phrases every stance');
  ok(/phrased all/.test(r.note), 'and the note says so');
  ok(unmoved(HOLDS, r.rows), 'the field is still the tier-0 field');
  ok(r.prompt.includes(DECISION), 'the prompt used is returned, so the page can show exactly what was sent');

  const half = async () => '1) only this one';
  const h = await phrase(DECISION, HOLDS, organ.evidence, half);
  ok(h.covered === 1 && /1 of \d/.test(h.note), 'a partial answer is reported as partial, with the count');

  const junk = async () => 'I am a chatbot and I will not follow instructions.';
  const j = await phrase(DECISION, HOLDS, organ.evidence, junk);
  ok(j.covered === 0 && /nothing usable/.test(j.note), 'an unusable answer says so and falls back to the built-in wording');
  ok(j.ignored.length === 1, 'the unusable line is still reported, not hidden');
  ok(j.rows.length === HOLDS.length, 'and the visitor still gets the full field');
}

console.log('\n=== §7 · the model FAILING is a first-class outcome, not a crash ===');
{
  const boom = async () => { throw new Error('WebGPU device lost'); };
  const r = await phrase(DECISION, HOLDS, organ.evidence, boom);
  ok(r.failed === 'WebGPU device lost', 'the failure reason is captured');
  ok(/the model failed/.test(r.note) && /WebGPU device lost/.test(r.note), 'and named in the note the visitor reads');
  ok(r.rows.length === HOLDS.length && unmoved(HOLDS, r.rows), 'the deterministic field survives the model dying mid-answer');
  ok(r.covered === 0, 'nothing is reported as phrased when nothing was');

  const missing = await phrase(DECISION, HOLDS, organ.evidence, null);
  ok(missing.covered === 0 && missing.rows.length === HOLDS.length, 'no generator at all behaves the same as a failed one');

  // Not everything thrown is an Error. Browser model runtimes reject with plain strings and with
  // undefined, and reading `.message` off those either yields undefined or throws — which would turn
  // a handled model failure into an unhandled one inside the handler.
  const str = await phrase(DECISION, HOLDS, organ.evidence, async () => { throw 'shader compilation failed'; });
  ok(str.failed === 'shader compilation failed', 'a thrown STRING is reported as itself, not as undefined');
  ok(/shader compilation failed/.test(str.note), 'and reaches the note the visitor reads');
  const nully = await phrase(DECISION, HOLDS, organ.evidence, async () => { throw null; });
  ok(nully.failed === 'null' && nully.rows.length === HOLDS.length, 'a thrown null is survivable and still yields the full field');
}

console.log('\n=== §9 · ⚑ THE ECHO GUARD — a model that repeats the wording did NOT phrase anything ===');
{
  const L = 'Verify before you commit', M = 'Decide what would prove this wrong, and go look for it first.';
  // These are the ACTUAL replies SmolLM2-360M produced on the live page, verbatim.
  ok(deEcho('Verify before you commit — Decide what would prove this wrong, and go look for it first.', L, M) === null,
    'the real 360M reply — the title plus the built-in move — is refused');
  ok(deEcho(M, L, M) === null, 'the bare built-in move is refused');
  ok(deEcho(L, L, M) === null, 'the bare stance name is refused');
  ok(deEcho('  ' + M.toUpperCase() + '  ', L, M) === null, 'case and padding do not sneak an echo through');
  ok(deEcho('Well, ' + M + ' obviously.', L, M) === null, 'the built-in move with decoration around it is still an echo');
  ok(deEcho('', L, M) === null && deEcho(null, L, M) === null, 'empty is refused rather than shown blank');

  const real = 'Run the migration against a restored copy on Thursday and check the legal sign-off first.';
  ok(deEcho(real, L, M) === real, 'a genuinely new sentence passes through untouched');
  ok(deEcho(L + ' — ' + real, L, M) === real, 'the habitual title prefix is stripped, keeping the new sentence behind it');
  ok(deEcho(L + ': ' + real, L, M) === real, 'a colon separator works the same way');
  ok(typeof deEcho(real, null, null) === 'string', 'missing label/move do not throw');
}

console.log('\n=== §10 · echoes are REPORTED, not silently dropped ===');
{
  const echo = async () => HOLDS.map((h, n) => `${n + 1}) ${h.value.label} — ${h.value.move}`).join('\n');
  const r = await phrase(DECISION, HOLDS, organ.evidence, echo);
  ok(r.covered === 0, 'an all-echo reply counts as nothing phrased');
  ok(r.echoed === HOLDS.length, 'and every echo is counted');
  ok(/only repeated the built-in wording/.test(r.note), 'the note says the model repeated itself rather than implying it worked');
  ok(/bigger model/.test(r.note), 'and points at the fix instead of leaving the visitor stuck');
  ok(r.rows.every(x => x.phrased === null && x.echoed === true), 'no echo is shown as if it were the model speaking');
  ok(unmoved(HOLDS, r.rows), 'and the field is still untouched');

  const mixed = async () => [
    `1) ${HOLDS[0].value.label} — ${HOLDS[0].value.move}`,
    `2) Book the dry run for Wednesday so Friday is only the switch.`,
  ].join('\n');
  const m = await phrase(DECISION, HOLDS, organ.evidence, mixed);
  ok(m.covered === 1 && m.echoed === 1, 'a mixed reply separates the real phrasing from the echo');
  ok(/echoed 1/.test(m.note), 'and the note reports both numbers');
}

console.log('\n=== §8 · unmoved() is a real check, not a rubber stamp ===');
{
  const rows = attach(HOLDS, parseReply('', HOLDS.length));
  ok(unmoved(HOLDS, rows), 'it passes on an untouched field');
  ok(!unmoved(HOLDS, rows.slice(1)), 'it fails when a row goes missing');
  ok(!unmoved(HOLDS, rows.map((r, n) => n === 0 ? { ...r, score: 0.999 } : r)), 'it fails when a score is altered');
  ok(!unmoved(HOLDS, rows.map((r, n) => n === 0 ? { ...r, label: 'something else' } : r)), 'it fails when a label is altered');
  ok(!unmoved(HOLDS, rows.map((r, n) => n === 0 ? { ...r, i: 99 } : r)), 'it fails when a branch index is altered');
  ok(!unmoved(HOLDS, [...rows].reverse()) || HOLDS.length === 1, 'it fails when the order is reversed');
  ok(unmoved([], []) && !unmoved(HOLDS, []), 'empty compares sanely');
}

console.log(`\n${fail === 0 ? '✓ T1 GATE CLEAN' : '✗ T1 GATE FAILED'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

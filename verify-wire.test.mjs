// verify-wire.test.mjs — PROOF-OF-PLAY for the handshake as it must be over a real wire.
//
// ⚑ THIS SUITE EXISTS BECAUSE A GATED KERNEL WAS WRONG. `handshake.mjs` passed the two functions
// around as objects and was witness-clean doing it — because a same-process channel hands things over
// by reference, and every test used one. The first real WebRTC link produced a face with empty
// offers, a handshake that could not run, and `unverified` trust with nothing having misbehaved.
//
// So the FIRST test here is the regression guard: a channel that SERIALISES, proving a function does
// not survive it. Everything after that is the networked protocol — results travel, implementations
// stay home — which is what makes two agreeing answers mean anything at all.
import { offering, wireMatch, serveVerify, askVerify } from './verify-wire.mjs';
import { face, signFace, makeNode, join } from './r7.mjs';
import { nodeCrypto } from './organs/crypto-node.mjs';

const crypto = nodeCrypto();
// Every Didy in this suite is signed, because an unsigned face has no id and that is a different
// case — covered in §10 rather than smuggled into every other test.
const signed = async (prefix, opts, offers) => makeNode(offering((await signFace(face(prefix, opts), crypto)).face, offers));
import { manifest, handshake } from './handshake.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };
const sum = (v) => Object.values(v).reduce((s, x) => s + Number(x || 0), 0);

/**
 * A channel that behaves like a wire: everything is serialised on the way through. This is the ONLY
 * honest way to test a networked protocol in one process — a channel that passes objects by reference
 * is the thing that hid the original bug.
 */
function wire() {
  const ls = new Set();
  return {
    kind: 'serialising',
    send(msg) {
      const onTheWire = JSON.parse(JSON.stringify(msg));   // exactly what a DataChannel does
      for (const fn of [...ls]) fn(onTheWire);
    },
    on(fn) { ls.add(fn); return () => ls.delete(fn); },
  };
}

console.log('\n=== §1 · ⚑ THE REGRESSION GUARD — a function does NOT survive a wire ===');
{
  const m = manifest('a', { reach: 3 }, { total: sum });
  ok(typeof m.offers.total === 'function', 'in one process the manifest carries a real function');
  const crossed = JSON.parse(JSON.stringify(m));
  ok(Object.keys(crossed.offers).length === 0, '⚑ after serialising, the offers are EMPTY — the function is gone');

  // and therefore the local handshake, given a face that has crossed a wire, cannot run at all
  const b = manifest('b', { reach: 5 }, { total: sum });
  const h = handshake(crossed, b, 'total');
  ok(h.ran === false, 'the LOCAL handshake cannot run against a face that crossed a wire');
  ok(/did not offer a function/.test(h.why), 'and says so, rather than quietly returning unverified');
  // This is exactly the shape of the original failure, now pinned so it cannot come back silently.
}

console.log('\n=== §2 · offering() — names and pointers, which DO survive ===');
{
  const f = offering(face('gerald', { shares: { reach: 5 } }), { total: true, 'harvest-calc': 'https://example.org/hc' });
  const crossed = JSON.parse(JSON.stringify(f));
  ok(Object.keys(crossed.offers).length === 2, 'names survive the wire');
  ok(crossed.offers['harvest-calc'] === 'https://example.org/hc', 'and so does the pointer');
  ok(crossed.offers.total === true, 'an offer with no pointer is simply "I have this"');
  ok(offering(face('x'), { '': 'nope' }).offers[''] === undefined, 'an unnamed offer is dropped rather than carried as ""');
  ok(Object.keys(offering(face('x')).offers).length === 0, 'offering nothing offers nothing');
}

console.log('\n=== §3 · ⚑ TWO INDEPENDENT IMPLEMENTATIONS AGREEING — the actual trustless check ===');
{
  const chan = wire();
  const me = await signed('me', { shares: { reach: 3, cost: 2 } }, { total: true });
  const them = await signed('them', { shares: { reach: 5, cost: 1 } }, { total: true });
  join(me, chan).announce(); join(them, chan).announce();

  // Each side implements the AGREED NAME itself. The code never crosses.
  serveVerify(them, chan, { total: sum });
  const v = await askVerify(me, chan, them.face.id, 'total', { total: sum });

  ok(v.ok && v.trust === 'verified', 'two independent implementations of the same name agree, and the link verifies');
  ok(v.shared.join() === 'cost,reach', 'only the names both hold were used');
  ok(v.agree.length === 2, 'compared over BOTH sides’ values, not just one');
  ok(v.disagree.length === 0 && v.errors.length === 0, 'nothing disagreed and nothing errored');
  ok(/both implementations agree/.test(v.finding), 'and the finding says implementations, not functions');
  ok(me.peers.get(them.face.id).trust === 'verified', 'the trust state is recorded on the peer');
}

console.log('\n=== §4 · a dishonest implementation is caught, and still not labelled ===');
{
  const chan = wire();
  const me = await signed('me', { shares: { reach: 3, cost: 2 } }, { total: true });
  const liar = await signed('liar', { shares: { reach: 5, cost: 1 } }, { total: true });
  join(me, chan).announce(); join(liar, chan).announce();

  serveVerify(liar, chan, { total: (v) => sum(v) + 99 });
  const v = await askVerify(me, chan, liar.face.id, 'total', { total: sum });

  ok(v.trust === 'suspect', 'a peer whose answers do not match earns suspect');
  ok(v.disagree.length === 2, 'and disagrees over both sides’ values');
  ok(v.disagree[0].ours !== v.disagree[0].theirs, 'both numbers are recorded side by side');
  ok(/this node decides what that means/.test(v.finding), 'the protocol reports and refuses to adjudicate');
  ok(!/hostile|malicious|banned/i.test(v.finding), 'and never labels the peer');
}

console.log('\n=== §5 · asymmetric misbehaviour — agreeing on one side is not agreeing ===');
{
  const chan = wire();
  const me = await signed('me', { shares: { reach: 1 } }, { total: true });
  const fussy = await signed('fussy', { shares: { reach: 9 } }, { total: true });
  join(me, chan).announce(); join(fussy, chan).announce();

  // Only misbehaves on large values — so it agrees over our data and not over its own.
  serveVerify(fussy, chan, { total: (v) => sum(v) + (Number(v.reach) > 3 ? 1 : 0) });
  const v = await askVerify(me, chan, fussy.face.id, 'total', { total: sum });

  ok(v.agree.length === 1 && v.disagree.length === 1, 'it agrees over one side’s values and not the other’s');
  ok(v.disagree[0].over === 'their values', 'and the report names WHOSE values they fell out over');
  ok(v.trust === 'suspect', 'which is still suspect — half agreement is not agreement');
  ok(/^1 disagreement /.test(v.finding), 'one disagreement reads as singular');
}

console.log('\n=== §6 · ⚑ NO IMPLEMENTATION IS NOT AGREEMENT ===');
{
  const chan = wire();
  const me = await signed('me', { shares: { reach: 3 } }, { total: true });
  const mute = await signed('mute', { shares: { reach: 5 } }, { total: true });
  join(me, chan).announce(); join(mute, chan).announce();

  serveVerify(mute, chan, {});                    // it serves, but has no such judgement
  const v = await askVerify(me, chan, mute.face.id, 'total', { total: sum });
  ok(v.trust === 'unverified', 'a peer with no implementation is UNVERIFIED — not verified by default');
  ok(/nothing was cross-run/.test(v.finding), 'and the finding says nothing was cross-run');

  // and the same in the other direction: we cannot check what we cannot compute
  const none = await askVerify(me, chan, mute.face.id, 'total', {});
  ok(none.trust === 'unverified' && /no implementation of/.test(none.why), 'nor can this Didy verify a name it does not implement itself');
}

console.log('\n=== §7 · silence is not a disagreement, and it is not trust ===');
{
  const chan = wire();
  const me = await signed('me', { shares: { reach: 3 } }, { total: true });
  const gone = await signed('gone', { shares: { reach: 5 } }, { total: true });
  join(me, chan).announce(); join(gone, chan).announce();
  // nobody serves — the peer simply never answers
  const v = await askVerify(me, chan, gone.face.id, 'total', { total: sum }, { timeoutMs: 300 });
  ok(v.ok === false && v.trust === 'unverified', 'a peer that never answers is unverified');
  ok(/silence is not a disagreement, and it is not trust/.test(v.why), 'and it is said in those words');
  ok((await askVerify(me, chan, 'nobody', 'total', { total: sum })).ok === false, 'verifying an undiscovered peer is a stated non-start');
}

console.log('\n=== §8 · wireMatch — pointers, never code ===');
{
  const chan = wire();
  const me = await signed('me', { shares: { reach: 1 }, wants: ['harvest-calc', 'nobody-has-this'] }, { total: true });
  const ger = await signed('ger', { shares: { reach: 5 }, wants: [] }, { total: true, 'harvest-calc': 'https://example.org/hc' });
  join(me, chan).announce(); join(ger, chan).announce();

  const m = wireMatch(me, ger.face.id);
  ok(m.theyHaveWhatIWant.join() === 'harvest-calc', 'a gap that meets an offer is found across the wire');
  ok(m.pointers['harvest-calc'] === 'https://example.org/hc', 'with the pointer to where it lives');
  ok(!m.theyHaveWhatIWant.includes('nobody-has-this'), 'and a gap nobody offers is not invented');
  ok(/POINTERS, not code/.test(m.note), '⚑ the note says every time that these are pointers, not code');
  ok(/run it through your own gate/.test(m.note), 'and that the receiver must gate it themselves');

  const noPointer = await signed('np', { shares: { reach: 1 } }, { 'harvest-calc': true });
  join(me, chan); chan.send({ kind: 'announce', face: noPointer.face });
  ok(wireMatch(me, noPointer.face.id).pointers['harvest-calc'] === null, 'an offer with no pointer reports null rather than a made-up URL');
  ok(wireMatch(me, 'nobody').theyHaveWhatIWant.length === 0, 'matching an unknown peer is empty, not an error');
}

console.log('\n=== §9 · nothing executable ever crosses ===');
{
  const chan = wire();
  const seen = [];
  chan.on((m) => seen.push(m));
  const me = await signed('me', { shares: { reach: 3, cost: 2 } }, { total: true });
  const them = await signed('them', { shares: { reach: 5, cost: 1 } }, { total: true });
  join(me, chan).announce(); join(them, chan).announce();
  serveVerify(them, chan, { total: sum });
  await askVerify(me, chan, them.face.id, 'total', { total: sum });

  const onTheWire = JSON.stringify(seen);
  ok(seen.length > 0, 'traffic was captured');
  ok(!/function|=>|eval\(|new Function/.test(onTheWire), '⚑ no function, arrow, eval or constructor appears anywhere in what crossed');
  ok(/verify-req/.test(onTheWire) && /verify-res/.test(onTheWire), 'only the request and the results did');
  ok(seen.every(m => typeof m === 'object'), 'and every message is plain data');
}

console.log('\n=== §10 · ⚑ AN UNSIGNED FACE HAS NO ID — and a node must still not discover itself ===');
{
  // Found while writing this suite. The self-check compared IDS while the peer table was keyed by
  // `id || prefix`. An unsigned face has id null, so the guard never fired and a node cheerfully
  // added ITSELF as a peer — then tried to cross-verify with itself, which would have "agreed"
  // perfectly and meant nothing at all. Two rules for one identity is how that happens.
  const chan = wire();
  const solo = makeNode(offering(face('solo', { shares: { reach: 1 } }), { total: true }));
  ok(solo.face.id === null, 'an unsigned face genuinely has no id');
  join(solo, chan).announce();
  ok(solo.peers.size === 0, '⚑ and it does NOT discover itself — the guard falls back to the prefix, exactly as the keying does');

  // a genuinely different unsigned peer is still found
  const other = makeNode(offering(face('other', { shares: { reach: 2 } }), { total: true }));
  join(other, chan).announce();
  ok(solo.peers.size === 1 && solo.peers.has('other'), 'a different unsigned Didy IS discovered, filed under its prefix');
  ok(other.peers.has('solo'), 'and the discovery is mutual');

  // and an unsigned peer can still be cross-verified — signing proves WHO, cross-running proves WHAT
  serveVerify(other, chan, { total: sum });
  const v = await askVerify(solo, chan, 'other', 'total', { total: sum });
  ok(v.trust === 'verified', 'an unsigned peer can still verify by cross-running — a signature answers a different question');
}

console.log('\n=== §11 · ⚑ THE WIRE IS HOSTILE — junk and misaddressed traffic changes nothing ===');
{
  // Everything above assumed well-formed messages. A peer authors every byte it sends, so the guards
  // that drop rubbish are load-bearing and must be tested with rubbish.
  const chan = wire();
  const me = await signed('me', { shares: { reach: 3, cost: 2 } }, { total: true });
  const them = await signed('them', { shares: { reach: 5, cost: 1 } }, { total: true });
  join(me, chan).announce(); join(them, chan).announce();
  serveVerify(them, chan, { total: sum });

  const replies = [];
  chan.on((m) => { if (m && m.kind === 'verify-res') replies.push(m); });

  // none of these should produce a reply
  chan.send(null);
  chan.send({ kind: 'verify-req' });                                        // no recipient
  chan.send({ kind: 'verify-req', to: 'someone-else', from: 'x', judge: 'total' });
  chan.send({ kind: 'gossip', to: them.face.id, from: 'x', judge: 'total' });
  chan.send({ to: them.face.id, from: 'x', judge: 'total' });               // no kind
  await new Promise(r => setTimeout(r, 50));
  ok(replies.length === 0, 'a null, unaddressed, misaddressed or mis-kinded request is answered by nobody');

  // a well-formed one IS answered
  chan.send({ kind: 'verify-req', to: them.face.id, from: me.face.id, judge: 'total', names: ['reach'], values: { reach: 3 } });
  await new Promise(r => setTimeout(r, 50));
  ok(replies.length === 1, 'and a properly addressed one is');
  ok(replies[0].to === me.face.id && replies[0].from === them.face.id, 'the reply is addressed back correctly');

  // a response aimed at somebody else must not satisfy our pending verification
  const chan2 = wire();
  const a = await signed('a', { shares: { reach: 1 } }, { total: true });
  const b = await signed('b', { shares: { reach: 2 } }, { total: true });
  join(a, chan2).announce(); join(b, chan2).announce();
  const pending = askVerify(a, chan2, b.face.id, 'total', { total: sum }, { timeoutMs: 400 });
  chan2.send({ kind: 'verify-res', to: 'somebody-else', from: b.face.id, have: true, shared: [], ourValues: {}, onYours: { ok: true, value: 0 }, onMine: { ok: true, value: 0 } });
  chan2.send({ kind: 'verify-res', to: a.face.id, from: 'an-impostor', have: true, shared: [], ourValues: {}, onYours: { ok: true, value: 0 }, onMine: { ok: true, value: 0 } });
  const r = await pending;
  ok(r.ok === false && r.trust === 'unverified', '⚑ a reply addressed elsewhere, or from an impostor, does NOT complete the verification');
  ok(/silence is not/.test(r.why), 'it times out as silence, which is the honest reading');

  // And one that is addressed perfectly but is the WRONG KIND. Every part of the guard has to hold
  // on its own: a well-addressed message carrying plausible results must still not be mistaken for
  // an answer to a question nobody asked it.
  const chan3 = wire();
  const c = await signed('c', { shares: { reach: 1 } }, { total: true });
  const d = await signed('d', { shares: { reach: 2 } }, { total: true });
  join(c, chan3).announce(); join(d, chan3).announce();
  const pending3 = askVerify(c, chan3, d.face.id, 'total', { total: sum }, { timeoutMs: 400 });
  chan3.send({ kind: 'gossip', to: c.face.id, from: d.face.id, have: true, shared: ['reach'],
               ourValues: { reach: 2 }, onYours: { ok: true, value: 1 }, onMine: { ok: true, value: 2 } });
  const r3 = await pending3;
  ok(r3.ok === false && r3.trust === 'unverified', 'a correctly-addressed message of the WRONG KIND does not complete a verification');
}

console.log('\n=== §12 · an errored side is not a disagreement, and the counts read correctly ===');
{
  const chan = wire();
  const me = await signed('me', { shares: { reach: 3, cost: 2 } }, { total: true });
  const brittle = await signed('brittle', { shares: { reach: 5, cost: 1 } }, { total: true });
  join(me, chan).announce(); join(brittle, chan).announce();

  // Throws only on its own (larger) values, so one side computes and the other does not.
  serveVerify(brittle, chan, { total: (v) => { if (Number(v.reach) > 3) throw new Error('too big'); return sum(v); } });
  const v = await askVerify(me, chan, brittle.face.id, 'total', { total: sum });
  ok(v.errors.length === 1, 'the side that failed is recorded as an ERROR');
  ok(v.errors[0].side === 'them', 'attributed to whoever failed');
  ok(v.disagree.length === 0, '⚑ and NOT counted as a disagreement — a crash is not dishonesty');
  ok(v.trust === 'suspect', 'though it is still not verified');
  ok(/1 error\b/.test(v.finding) && !/1 errors/.test(v.finding), 'one error reads as singular');

  // our own side failing is attributed to us
  const mine = await askVerify(me, chan, brittle.face.id, 'total', { total: () => { throw new Error('ours broke'); } });
  ok(mine.errors.some(e => e.side === 'us'), 'when OUR implementation throws, the error is attributed to us');
  ok(mine.errors.some(e => /ours broke/.test(e.why)), 'with the reason kept');
}

console.log('\n=== §13 · keyOf and the empty edges ===');
{
  const chan = wire();
  const me = await signed('me', { shares: {} }, { total: true });
  const them = await signed('them', { shares: {} }, { total: true });
  join(me, chan).announce(); join(them, chan).announce();
  serveVerify(them, chan, { total: sum });
  const v = await askVerify(me, chan, them.face.id, 'total', { total: sum });
  ok(v.trust === 'verified', 'two Didys sharing NO named values still verify — they agree about nothing, honestly');
  ok(v.shared.length === 0, 'with an empty shared set');
  ok(/all 0 shared values/.test(v.finding), 'and the finding says zero rather than omitting the number');
}

console.log('\n=== §14 · the identity key, and what throws that is not an Error ===');
{
  const chan = wire();
  // A face with neither id nor prefix has no identity at all — it must resolve to null rather than
  // to `undefined` or an empty string, either of which would quietly match another nameless face.
  const nameless = makeNode({ id: null, prefix: '', names: [], shares: {}, offers: {}, wants: [] });
  join(nameless, chan).announce();
  ok(nameless.peers.size === 0, 'a face with neither id nor prefix is filed nowhere and discovers nobody');

  const byPrefix = makeNode(offering(face('only-prefix', { shares: { reach: 1 } }), { total: true }));
  const other = await signed('other', { shares: { reach: 2 } }, { total: true });
  join(byPrefix, chan).announce(); join(other, chan).announce();
  serveVerify(other, chan, { total: sum });
  const v = await askVerify(byPrefix, chan, other.face.id, 'total', { total: sum });
  ok(v.trust === 'verified', 'a Didy identified only by prefix can still address and be addressed');

  // Not everything thrown is an Error — a judgement that rejects with a string must be reported as
  // itself rather than as "undefined".
  const chan2 = wire();
  const me2 = await signed('me2', { shares: { reach: 1 } }, { total: true });
  const rude = await signed('rude', { shares: { reach: 2 } }, { total: true });
  join(me2, chan2).announce(); join(rude, chan2).announce();
  serveVerify(rude, chan2, { total: () => { throw 'a bare string'; } });
  const r = await askVerify(me2, chan2, rude.face.id, 'total', { total: sum });
  ok(r.errors.some(e => e.why === 'a bare string'), 'a thrown string is reported as itself');
  const r2 = await askVerify(me2, chan2, rude.face.id, 'total', { total: () => { throw null; } });
  ok(r2.errors.some(e => e.why === 'null'), 'and a thrown null survives as "null" rather than crashing the comparison');
}

console.log(`\n${fail === 0 ? '✓ VERIFY-WIRE GATE CLEAN' : '✗ VERIFY-WIRE GATE FAILED'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

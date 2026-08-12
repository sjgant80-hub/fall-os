// r7.test.mjs — PROOF-OF-PLAY for the ring that reaches sideways. PHASE 0: two Didys, one machine.
//
// The rule is loopback-first, so this is the whole of Phase 0 proven before any network exists: two
// local Didys announce, discover each other, cross-verify, and complete one real exchange — with the
// private substrate never leaving either of them, and a received organ refused until it holds at the
// receiver's own gate.
import { face, signFace, verifyFace, makeNode, loopback, join, trustCheck, match, request, adopt, commonWants } from './r7.mjs';
import { nodeCrypto } from './organs/crypto-node.mjs';

const crypto = nodeCrypto();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };

const sum = (v) => Object.values(v).reduce((s, x) => s + Number(x || 0), 0);
const overnight = (memories) => memories.slice().sort();          // the organ B offers

// A wants an organ it does not have. B offers it. Both hold something the other must never see.
const mkA = () => face('si-didy', { reach: 3, cost: 2 }, { total: sum }, );
const A_FACE = face('si-didy', { shares: { reach: 3, cost: 2 }, offers: { total: sum }, wants: ['overnight-memory', 'unbuilt-thing'] });
const B_FACE = face('k-didy', { shares: { reach: 5, cost: 1 }, offers: { total: sum, 'overnight-memory': overnight }, wants: ['unbuilt-thing'] });

console.log('\n=== §1 · MANIFEST — the private substrate is never in the face ===');
{
  ok(A_FACE.prefix === 'si-didy' && A_FACE.wants.length === 2, 'a face carries its prefix, its shares, its offers and its wants');
  ok(!('private_key' in A_FACE) && !('estate' in A_FACE), 'and nothing else — there is no private field to leak');
  ok(JSON.stringify(A_FACE.shares) === '{"cost":2,"reach":3}', 'only the declared shares are present, in a stable order');
  ok(A_FACE.address !== B_FACE.address, 'two different faces address differently');
  ok(face('x', { shares: { a: 1 }, wants: ['q'] }).address === face('x', { shares: { a: 1 }, wants: ['q'] }).address,
    'and an identical face addresses identically, so a repeat is recognisable');
  ok(face('x', { shares: { a: 1 }, wants: ['q'] }).address === face('x', { shares: { a: 999 }, wants: ['q'] }).address,
    '⚑ the address is over NAMES, never VALUES — recognising a peer discloses nothing about what it holds');
  ok(face().prefix === 'didy' && face().wants.length === 0, 'an unnamed, empty face is still a valid face');
}

console.log('\n=== §2 · a signed face, and one that has been tampered with ===');
{
  const { face: signed } = await signFace(A_FACE, crypto);
  ok(typeof signed.id === 'string' && signed.id.length > 20, 'signing gives the Didy a real Ed25519 identity');
  ok((await verifyFace(signed, crypto)).ok, 'and the face verifies');
  ok(!(await verifyFace({ ...signed, prefix: 'someone-else' }, crypto)).ok, 'renaming the Didy breaks the signature');
  ok(!(await verifyFace({ ...signed, wants: ['something-new'] }, crypto)).ok, 'so does editing what it claims to want');
  ok(!(await verifyFace({ ...signed, sig: null }, crypto)).ok, 'an unsigned face does not pass');
  ok(!(await verifyFace(null, crypto)).ok, 'and neither does nothing at all');
}

console.log('\n=== §3 · DISCOVERY — announce, listen, and trust NOTHING yet ===');
{
  const { face: fa, sk: ska } = await signFace(A_FACE, crypto);
  const { face: fb } = await signFace(B_FACE, crypto);
  const A = makeNode(fa, ska), B = makeNode(fb);
  const chan = loopback();
  const la = join(A, chan), lb = join(B, chan);
  la.announce(); lb.announce();

  ok(A.peers.size === 1 && B.peers.size === 1, 'each Didy discovered exactly one other');
  ok(A.peers.get(fb.id).face.prefix === 'k-didy', 'and it is the right one');
  ok(!A.peers.has(fa.id), 'a Didy does not discover itself');
  ok(A.peers.get(fb.id).trust === 'unverified', '⚑ a discovered peer starts UNVERIFIED — a manifest is a claim, and discovery has checked nothing');
  la.announce();
  ok(A.peers.size === 1, 'announcing twice does not duplicate the peer');
  ok(B.peers.get(fa.id).lastSeen === 2, 'but it is noted as seen again');
}

console.log('\n=== §4 · HANDSHAKE over the link — and privates never crossed it ===');
{
  const { face: fa, sk: ska } = await signFace(A_FACE, crypto);
  const { face: fb } = await signFace(B_FACE, crypto);
  const A = makeNode(fa, ska), B = makeNode(fb);
  const chan = loopback();
  join(A, chan).announce(); join(B, chan).announce();

  const r = trustCheck(A, fb.id, 'total');
  ok(r.ok && r.trust === 'verified', 'two honest Didys cross-verify to a verified link');
  ok(A.peers.get(fb.id).trust === 'verified', 'and the trust state is recorded on the peer');
  ok(r.handshake.shared.join() === 'cost,reach', 'only the names both hold were used');
  ok(A.log.some(l => l.what === 'trust-check'), 'the check is logged');

  const liar = face('mallory', { shares: { reach: 5, cost: 1 }, offers: { total: (v) => sum(v) + 99 } });
  const { face: fl } = await signFace(liar, crypto);
  const C = makeNode(fa, ska);
  join(C, chan);
  chan.send({ kind: 'announce', face: fl });
  const bad = trustCheck(C, fl.id, 'total');
  ok(bad.trust === 'suspect', 'a Didy whose function disagrees earns "suspect" — locally, by this node');
  ok(!/hostile|banned|rejected/i.test(bad.why), 'and the protocol still refuses to label it — this node decided, the protocol did not');
  ok(trustCheck(C, 'nobody', 'total').ok === false, 'trust-checking an undiscovered peer is a stated non-start');
}

console.log('\n=== §5 · EXCHANGE — the gap meets the offer ===');
{
  const { face: fa, sk: ska } = await signFace(A_FACE, crypto);
  const { face: fb } = await signFace(B_FACE, crypto);
  const A = makeNode(fa, ska), B = makeNode(fb);
  const chan = loopback();
  join(A, chan).announce(); join(B, chan).announce();

  const m = match(A, fb.id);
  ok(m.theyHaveWhatIWant.join() === 'overnight-memory', "A's gap meets B's offer");
  ok(m.iHaveWhatTheyWant.length === 0, 'and A has nothing B asked for — the pair is one-way here, which is fine');

  // ⚑ over an UNVERIFIED link, nothing moves.
  const early = request(A, fb.id, 'overnight-memory');
  ok(!early.ok && /unverified/.test(early.why), 'requesting before verifying is REFUSED, not warned about');

  trustCheck(A, fb.id, 'total');
  const got = request(A, fb.id, 'overnight-memory');
  ok(got.ok && typeof got.organ.fn === 'function', 'over a verified link the organ is handed over');
  ok(got.organ.from === 'k-didy', 'and it carries where it came from');
  ok(!request(A, fb.id, 'total').ok, 'an organ this Didy never wanted is not taken — a mesh is not a landfill');
  ok(!request(A, fb.id, 'nonexistent').ok, 'and one the peer does not offer is a stated no');
}

console.log('\n=== §6 · ⚑ RECEIVED IS NOT TRUSTED — the local gate decides ===');
{
  const { face: fa, sk: ska } = await signFace(A_FACE, crypto);
  const { face: fb } = await signFace(B_FACE, crypto);
  const A = makeNode(fa, ska);
  const chan = loopback();
  join(A, chan); chan.send({ kind: 'announce', face: fb });
  trustCheck(A, fb.id, 'total');
  const organ = request(A, fb.id, 'overnight-memory').organ;

  // A gate that says no. The link was verified; the code still does not get in.
  const refused = adopt(A, organ, () => false);
  ok(!refused.adopted, 'an organ that fails the local gate is NOT adopted, even over a verified link');
  ok(!('overnight-memory' in A.organs), 'it does not appear among this Didy\'s organs');
  ok(A.face.wants.includes('overnight-memory'), 'and the gap stays open');
  ok(A.log.some(l => l.what === 'refused-organ'), 'the refusal is logged, not silently dropped');

  const thrown = adopt(A, organ, () => { throw new Error('gate exploded'); });
  ok(!thrown.adopted && /gate threw/.test(thrown.why), 'a gate that throws is a refusal, not an adoption');
  ok(!adopt(A, organ, null).adopted, 'no gate at all means nothing is adopted — there is no unverified path');
  ok(!adopt(A, null, () => true).adopted, 'and there is nothing to adopt without an organ');

  // Now a real gate: run it and check it holds.
  const held = adopt(A, organ, (fn) => JSON.stringify(fn(['b', 'a'])) === '["a","b"]');
  ok(held.adopted, 'an organ that holds at the local gate IS adopted');
  ok(typeof A.organs['overnight-memory'] === 'function', 'it is registered as one of this Didy\'s organs');
  ok(!A.face.wants.includes('overnight-memory'), 'and the gap it filled is closed');
  ok(A.log.some(l => l.what === 'adopted' && l.from === 'k-didy'), 'the exchange is remembered, with where it came from');
}

console.log('\n=== §7 · ⚑ THE TRANSPORT IS NOT THE LOGIC — same result over a different channel ===');
{
  // The claim behind loopback-first is that swapping the transport changes nothing. Here it is
  // checked rather than asserted: a second, differently-implemented channel (queued and flushed
  // rather than synchronous) must produce an identical outcome.
  const queued = () => {
    const ls = new Set(); const q = [];
    return {
      kind: 'queued',
      send(m) { q.push(m); },
      flush() { while (q.length) { const m = q.shift(); for (const fn of [...ls]) fn(m); } },
      on(fn) { ls.add(fn); return () => ls.delete(fn); },
    };
  };
  const runOver = async (chan, flush) => {
    const { face: fa, sk } = await signFace(A_FACE, crypto);
    const { face: fb } = await signFace(B_FACE, crypto);
    const A = makeNode(fa, sk), B = makeNode(fb);
    join(A, chan).announce(); join(B, chan).announce();
    if (flush) chan.flush();
    const t = trustCheck(A, fb.id, 'total');
    const g = request(A, fb.id, 'overnight-memory');
    const a = adopt(A, g.organ, (fn) => JSON.stringify(fn(['b', 'a'])) === '["a","b"]');
    return { peers: A.peers.size, trust: t.trust, got: g.ok, adopted: a.adopted, organs: Object.keys(A.organs).join() };
  };
  const q = queued();
  const overLoop = await runOver(loopback(), false);
  const overQueue = await runOver(q, true);
  ok(JSON.stringify(overLoop) === JSON.stringify(overQueue),
    'the whole exchange gives an identical result over two different transports — so swapping in a network changes the transport, not the logic');
  ok(overLoop.trust === 'verified' && overLoop.adopted === true, 'and it worked in both');
}

console.log('\n=== §8 · what the mesh keeps asking for, and nobody has built ===');
{
  const { face: fa, sk } = await signFace(A_FACE, crypto);
  const A = makeNode(fa, sk);
  const chan = loopback(); join(A, chan);
  const { face: fb } = await signFace(B_FACE, crypto);
  const { face: fc } = await signFace(face('c-didy', { wants: ['unbuilt-thing'] }), crypto);
  chan.send({ kind: 'announce', face: fb });
  chan.send({ kind: 'announce', face: fc });

  const common = commonWants(A, 2);
  ok(common[0].want === 'unbuilt-thing', 'the thing everyone is circling and nobody has made surfaces first');
  ok(common[0].askedBy === 3, 'counted by how many DISTINCT Didys asked for it');
  ok(!common.some(c => c.want === 'overnight-memory'), 'something only one Didy wants is not yet a mesh signal');
  ok(commonWants(A, 99).length === 0, 'a higher threshold surfaces nothing rather than inventing a signal');

  // one node repeating itself must not manufacture demand
  chan.send({ kind: 'announce', face: fc });
  chan.send({ kind: 'announce', face: fc });
  ok(commonWants(A, 2)[0].askedBy === 3, 'a loud Didy announcing repeatedly does not raise the count — distinct peers only');
}

console.log('\n=== §9 · ⚑ NOTHING ADJUDICATES — two nodes may read the same findings differently ===');
{
  // The first version of this section scanned the SOURCE for words like "arbiter" and failed, because
  // the file says "there is no arbiter" in a comment. A test that reads prose tests the prose. So this
  // tests the property instead: given the very same handshake findings, one node concludes one thing
  // and another node is free to conclude the opposite. That is what "no central authority" MEANS —
  // there is no answer for a third party to hold, because the answer is per-node.
  const { face: fa, sk } = await signFace(A_FACE, crypto);
  const liar = face('mallory', { shares: { reach: 5, cost: 1 }, offers: { total: (v) => sum(v) + 99 } });
  const { face: fl } = await signFace(liar, crypto);

  const chan = loopback();
  const strict = makeNode(fa, sk), lenient = makeNode(fa, sk);
  join(strict, chan); join(lenient, chan);
  chan.send({ kind: 'announce', face: fl });

  const s = trustCheck(strict, fl.id, 'total');
  const l = trustCheck(lenient, fl.id, 'total');
  ok(JSON.stringify(s.handshake.disagree) === JSON.stringify(l.handshake.disagree),
    'both nodes computed the IDENTICAL findings — the verification is deterministic');

  // Now each owner acts on those findings its own way. The protocol handed them the same facts and
  // no instruction about what to do with them.
  lenient.peers.set(fl.id, { ...lenient.peers.get(fl.id), trust: 'verified' });
  ok(strict.peers.get(fl.id).trust === 'suspect' && lenient.peers.get(fl.id).trust === 'verified',
    'and the two nodes hold OPPOSITE trust states about the same peer, from the same evidence');
  ok(!request(strict, fl.id, 'total').ok, 'so the strict one will not exchange with it');
  ok(s.handshake.finding === l.handshake.finding, 'while the protocol itself said exactly one thing to both, and judged neither');

  // And the API offers nowhere to put an authority.
  const r7 = await import('./r7.mjs');
  ok(!Object.keys(r7.default).some(k => /arbiter|authority|resolve|adjudicat|consensus/i.test(k)),
    'no exported function is an arbiter, resolver or consensus mechanism');
  ok(trustCheck.length === 3, 'trustCheck takes (node, peer, judge) — there is no fourth argument where an authority could be passed');
}

console.log('\n=== §10 · ⚑ A HOSTILE PEER CONTROLS WHAT IT ANNOUNCES ===');
{
  // Everything above assumed a well-formed peer. Nothing on a mesh guarantees that: the announcement
  // is the one thing an attacker fully controls, so a Didy must survive a face with pieces missing,
  // pieces of the wrong type, and pieces designed to be believed.
  const { face: fa, sk } = await signFace(A_FACE, crypto);
  const A = makeNode(fa, sk);
  const chan = loopback();
  join(A, chan);

  const before = A.peers.size;
  for (const junk of [null, undefined, 'a string', 42, {}, { kind: 'announce' }, { kind: 'gossip', face: fa }, { face: fa }]) {
    chan.send(junk);
  }
  ok(A.peers.size === before, 'malformed or mis-typed announcements are ignored entirely — none of them became a peer');

  // A face with the optional halves simply absent.
  const bare = { id: 'BARE-ID', prefix: 'bare', names: [], shares: {}, offers: undefined, wants: undefined };
  chan.send({ kind: 'announce', face: bare });
  ok(A.peers.has('BARE-ID'), 'a minimal face is still discoverable');
  const m = match(A, 'BARE-ID');
  ok(m.theyHaveWhatIWant.length === 0 && m.iHaveWhatTheyWant.length === 0, 'matching against a face with no offers and no wants yields nothing, rather than throwing');
  ok(commonWants(A, 1).length > 0, 'and a face with no wants does not break the mesh tally');

  // An unsigned face is not verifiable, whatever else it claims.
  ok(!(await verifyFace(bare, crypto)).ok, 'a face with an id but no signature does not verify');
  ok(!(await verifyFace({ ...bare, id: null, sig: 'x' }, crypto)).ok, 'nor one with a signature but no id');

  // Requesting from it is refused on the trust rule before anything else is even considered.
  ok(!request(A, 'BARE-ID', 'anything').ok, 'and an unverified minimal peer hands over nothing');

  // A node whose OWN offers are missing must still match without throwing.
  const hollow = makeNode({ ...fa, offers: undefined, wants: ['x'] }, sk);
  join(hollow, chan);
  chan.send({ kind: 'announce', face: { id: 'P2', prefix: 'p2', names: [], shares: {}, offers: { x: () => 1 }, wants: ['x'] } });
  ok(match(hollow, 'P2').theyHaveWhatIWant.join() === 'x', 'a Didy with no offers of its own can still see what it wants');
  ok(match(hollow, 'P2').iHaveWhatTheyWant.length === 0, 'and correctly offers nothing back');
  ok(match(hollow, 'nobody').theyHaveWhatIWant.length === 0, 'matching an unknown peer is empty, not an error');
}

console.log('\n=== §11 · the counts, the ordering, and the reasons are exact ===');
{
  const { face: fa, sk } = await signFace(A_FACE, crypto);
  const A = makeNode(fa, sk);
  const chan = loopback(); join(A, chan);
  // Two peers want 'shared-gap'; one wants 'lonely'. A itself wants two things.
  chan.send({ kind: 'announce', face: { id: 'p1', prefix: 'p1', names: [], shares: {}, offers: {}, wants: ['shared-gap', 'lonely'] } });
  chan.send({ kind: 'announce', face: { id: 'p2', prefix: 'p2', names: [], shares: {}, offers: {}, wants: ['shared-gap'] } });

  const at2 = commonWants(A, 2);
  ok(at2.some(c => c.want === 'shared-gap' && c.askedBy === 2), 'a want asked by exactly two peers appears at threshold 2 — the boundary is inclusive');
  ok(!at2.some(c => c.want === 'lonely'), 'and one asked by a single peer does not');
  ok(commonWants(A, 1).some(c => c.want === 'lonely'), 'at threshold 1 it does');
  const sorted = commonWants(A, 1);
  ok(sorted[0].askedBy >= sorted[sorted.length - 1].askedBy, 'the most-asked-for comes first');
  const ties = sorted.filter(c => c.askedBy === 1).map(c => c.want);
  ok(JSON.stringify(ties) === JSON.stringify([...ties].sort()), 'and ties break alphabetically, so the order is stable rather than incidental');

  // A peer with no id at all is tallied under its prefix rather than being lost.
  chan.send({ kind: 'announce', face: { id: undefined, prefix: 'anon', names: [], shares: {}, offers: {}, wants: ['shared-gap'] } });
  ok(commonWants(A, 1).find(c => c.want === 'shared-gap').askedBy >= 2, 'a peer announcing without an id still counts, under its prefix');
}

console.log('\n=== §12 · the refusal reasons say which thing went wrong ===');
{
  const { face: fa, sk } = await signFace(A_FACE, crypto);
  const { face: fb } = await signFace(B_FACE, crypto);
  const A = makeNode(fa, sk);
  const chan = loopback(); join(A, chan);
  chan.send({ kind: 'announce', face: fb });
  trustCheck(A, fb.id, 'total');
  const organ = request(A, fb.id, 'overnight-memory').organ;

  const plain = adopt(A, organ, () => false);
  ok(/did not hold at this Didy's own gate/.test(plain.why), 'a gate that simply says no gives the plain reason');
  ok(A.log.find(l => l.what === 'refused-organ').why === 'it did not hold at the local gate', 'and the log records that, not an empty field');

  const threw = adopt(A, organ, () => { throw new Error('specific failure'); });
  ok(/gate threw: specific failure/.test(threw.why), 'a gate that throws reports WHAT it threw, not just that it threw');
  ok(A.log.filter(l => l.what === 'refused-organ')[1].why === 'the gate threw: specific failure', 'and the log keeps that reason too');
  ok(adopt(A, organ, () => { throw 'a bare string'; }).why === 'the gate threw: a bare string', 'a thrown string is reported as itself');

  const t = trustCheck(A, fb.id, 'total');
  ok(t.why === t.handshake.finding, "a handshake that RAN reports the handshake's own finding");
  const none = trustCheck(A, fb.id, 'no-such-function');
  ok(/did not offer a function/.test(none.why), 'one that could not run reports why it could not, rather than a blank');
  // The LOG must carry the same reason as the return. A log that records "undefined" for the failures
  // is the one place you would go looking after something went wrong.
  const logged = A.log.filter(l => l.what === 'trust-check').pop();
  ok(/did not offer a function/.test(logged.why), 'and the LOG carries that reason too, not an empty field');
}

console.log('\n=== §13 · a re-announcement does not wipe what was already learned ===');
{
  // A peer announces repeatedly — that is normal, and it must not erase the verification already
  // done. Losing the findings on every announce would quietly re-open every link a mesh had checked.
  const { face: fa, sk } = await signFace(A_FACE, crypto);
  const { face: fb } = await signFace(B_FACE, crypto);
  const A = makeNode(fa, sk);
  const chan = loopback(); const link = join(A, chan);
  chan.send({ kind: 'announce', face: fb });
  trustCheck(A, fb.id, 'total');
  ok(A.peers.get(fb.id).findings !== null, 'after a trust-check the peer carries its findings');

  chan.send({ kind: 'announce', face: fb });                    // it announces again
  ok(A.peers.get(fb.id).findings !== null, '⚑ and a re-announcement PRESERVES them — the link is not silently re-opened');
  ok(A.peers.get(fb.id).trust === 'verified', 'the trust state survives too');
  ok(A.peers.get(fb.id).lastSeen === 2, 'while the seen count still advances');
  // a peer seen for the first time genuinely has none
  chan.send({ kind: 'announce', face: { id: 'fresh', prefix: 'fresh', names: [], shares: {}, offers: {}, wants: [] } });
  ok(A.peers.get('fresh').findings === null, 'a peer never checked carries no findings, rather than an empty object pretending to be one');
}

console.log('\n=== §14 · anonymous peers are counted as separate voices ===');
{
  // Given the same shares and offer as B, so the trust-check below can actually cross-run.
  const { face: fa, sk } = await signFace(face('me', { shares: { reach: 3, cost: 2 }, offers: { total: sum }, wants: [] }), crypto);
  const A = makeNode(fa, sk);
  const chan = loopback(); join(A, chan);
  // Two DIFFERENT peers, neither announcing an id. If they were tallied under a shared fallback they
  // would collapse into one voice and the mesh signal would under-report.
  chan.send({ kind: 'announce', face: { id: undefined, prefix: 'anon-one', names: [], shares: {}, offers: {}, wants: ['gap'] } });
  chan.send({ kind: 'announce', face: { id: undefined, prefix: 'anon-two', names: [], shares: {}, offers: {}, wants: ['gap'] } });
  ok(A.peers.size === 2, '⚑ two id-less peers are TWO entries — neither evicted the other');
  ok(A.peers.has('anon-one') && A.peers.has('anon-two'), 'each is filed under its prefix');
  ok(!A.peers.has(undefined), 'and nothing is filed under a bare undefined key');
  const c = commonWants(A, 2);
  ok(c.length === 1 && c[0].want === 'gap', 'the shared want surfaces');
  ok(c[0].askedBy === 2, 'and they count as TWO distinct voices');

  // The reason this matters: the announcement is the one thing an attacker fully authors, so an
  // id-less announce must not be able to displace a peer that was already verified.
  const { face: fv } = await signFace(B_FACE, crypto);
  chan.send({ kind: 'announce', face: fv });
  trustCheck(A, fv.id, 'total');
  ok(A.peers.get(fv.id).trust === 'verified', 'a verified peer is in the table');
  chan.send({ kind: 'announce', face: { id: undefined, prefix: 'anon-three', names: [], shares: {}, offers: {}, wants: [] } });
  ok(A.peers.get(fv.id).trust === 'verified', 'and an anonymous announcement cannot unseat it');
  ok(A.peers.size === 4, 'it simply becomes another entry');

  // A face with neither id nor prefix has nothing to be filed under, and is dropped.
  const was = A.peers.size;
  chan.send({ kind: 'announce', face: { names: [], shares: {}, offers: {}, wants: ['gap'] } });
  ok(A.peers.size === was, 'a face with no id AND no prefix is not filed at all');
}

console.log(`\n${fail === 0 ? '✓ R7 GATE CLEAN' : '✗ R7 GATE FAILED'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

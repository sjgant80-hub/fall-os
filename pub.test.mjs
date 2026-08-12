// pub.test.mjs — PROOF-OF-PLAY for the pub. PHASE 0: three Didys, one machine, one room.
//
// The claim being tested is narrow and measurable: three sovereign Didys meet, cross-verify, fill
// each other's gaps from offered organs, and each leaves with more than it arrived with — while no
// raw substrate ever crosses the room and nothing central decides anything.
import { openPub, enter, room, rounds, gaps, assemble, worthIt, close } from './pub.mjs';
import { face, signFace, makeNode, loopback } from './r7.mjs';
import { nodeCrypto } from './organs/crypto-node.mjs';

const crypto = nodeCrypto();
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };

const sum = (v) => Object.values(v).reduce((s, x) => s + Number(x || 0), 0);

// Three Didys with complementary strengths and complementary gaps. Each also holds a private
// substrate that must never appear anywhere in the room.
const PRIVATE = { estate: 'EVERY-REPO-I-OWN', training: 'MY-TRAINING-DATA' };
const shares = { reach: 3, cost: 2 };

const sortOrgan = (xs) => xs.slice().sort();
const countOrgan = (xs) => xs.length;
const sumOrgan = (xs) => xs.reduce((s, x) => s + Number(x || 0), 0);

const build = async () => {
  const si = await signFace(face('si-didy', {
    shares, offers: { total: sum, 'shadow-index': sortOrgan }, wants: ['harvest-calc', 'tag-scan'],
  }), crypto);
  const ger = await signFace(face('gerald-didy', {
    shares, offers: { total: sum, 'harvest-calc': countOrgan }, wants: ['shadow-index'],
  }), crypto);
  const kel = await signFace(face('kel-didy', {
    shares, offers: { total: sum, 'tag-scan': sumOrgan }, wants: ['shadow-index', 'harvest-calc'],
  }), crypto);
  const nodes = [makeNode(si.face, si.sk), makeNode(ger.face, ger.sk), makeNode(kel.face, kel.sk)];
  for (const n of nodes) n.substrate = PRIVATE;       // held on the node, never in the face
  const pub = openPub(loopback(), 'the pub');
  for (const n of nodes) enter(pub, n);
  return { pub, nodes, si: nodes[0], ger: nodes[1], kel: nodes[2] };
};

// A gate that actually runs the organ: the receiver checks it holds before adopting.
const realGate = (fn) => {
  try { const r = fn(['b', 'a']); return r !== undefined && r !== null; }
  catch { return false; }
};

console.log('\n=== §1 · ARRIVE — manifests come in, substrate does not ===');
{
  const { pub, nodes } = await build();
  ok(room(pub).length === 3, 'three Didys are in the room');
  ok(room(pub).map(r => r.prefix).sort().join() === 'gerald-didy,kel-didy,si-didy', 'and the room can say who');
  ok(nodes.every(n => n.peers.size === 2), 'each one discovered the other two');

  // ⚑ the whole premise: scan everything that crossed the channel and everything the pub holds.
  const everything = JSON.stringify({ roster: [...pub.roster], links: pub.links, faces: nodes.map(n => n.face), peers: nodes.map(n => [...n.peers]) });
  ok(!everything.includes('EVERY-REPO-I-OWN'), "no Didy's estate appears anywhere in the room");
  ok(!everything.includes('MY-TRAINING-DATA'), 'nor any training substrate');
  ok(nodes.every(n => n.substrate === PRIVATE), 'while each node still holds its own on its own machine');
  ok(!('substrate' in nodes[0].face), 'the face has no substrate field at all — there is nowhere for it to travel');
}

console.log('\n=== §2 · HANDSHAKE — a lying Didy is excluded by the rule, not by a bouncer ===');
{
  const { pub, nodes, si } = await build();
  const checks = rounds(pub, nodes, 'total');
  ok(checks.length === 6, 'every pair checked, both ways');
  ok(checks.every(c => c.trust === 'verified'), 'three honest Didys all verify');

  // A fourth turns up whose function inflates its answers.
  const liar = await signFace(face('mallory-didy', { shares, offers: { total: (v) => sum(v) + 99, 'harvest-calc': countOrgan } }), crypto);
  const L = makeNode(liar.face, liar.sk);
  enter(pub, L);
  const after = rounds(pub, [si], 'total');
  const onLiar = after.find(c => c.peer === liar.face.id);
  ok(onLiar.trust === 'suspect', 'the one that disagrees earns suspect');
  ok(si.peers.get(liar.face.id).trust === 'suspect', 'and si-didy records that for itself');

  // It offers something si-didy genuinely wants — and still gets nothing, because the link failed.
  const a = assemble(si, realGate);
  ok(!a.gained.some(g => g.from === 'mallory-didy'), '⚑ si-didy takes NOTHING from it, though it offered a wanted organ');
  ok(a.gained.every(g => g.from !== 'mallory-didy'), 'exclusion falls out of the verified-link rule — nobody had to decide to bar it');
}

console.log('\n=== §3 · GAP-MATCH — your gap is their build ===');
{
  const { pub, nodes, si, ger } = await build();
  rounds(pub, nodes, 'total');
  const g = gaps(nodes);
  ok(g.some(x => x.wanting === 'si-didy' && x.want === 'harvest-calc' && x.offeredBy === 'gerald-didy'), "si-didy's gap meets gerald's build");
  ok(g.some(x => x.wanting === 'gerald-didy' && x.want === 'shadow-index' && x.offeredBy === 'si-didy'), "and gerald's gap meets si-didy's");
  ok(g.some(x => x.wanting === 'kel-didy' && x.want === 'tag-scan') === false, 'kel-didy does not want what it already offers');
  ok(g.every(x => x.trust === 'verified'), 'every match here is over a link that was checked');
}

console.log('\n=== §4 · ⚑ BUILD — every organ κ-verified by the receiver before adoption ===');
{
  const { pub, nodes, si } = await build();
  rounds(pub, nodes, 'total');

  const strict = assemble(si, () => false);          // a gate that refuses everything
  ok(strict.gained.length === 0, 'a Didy whose own gate says no adopts nothing, however verified the peers');
  ok(strict.refused.length === 2, 'and both offers are recorded as refused');
  ok(Object.keys(si.organs).length === 0, 'nothing entered its organs');
  ok(si.face.wants.length === 2, 'and its gaps stay open');

  const { nodes: n2, si: si2 } = await build();
  rounds(openPub(loopback()), n2, 'total');
  const got = assemble(si2, realGate);
  ok(got.gained.length === 2, 'with a real gate it adopts both');
  ok(got.gained.map(x => x.organ).sort().join() === 'harvest-calc,tag-scan', 'exactly the two it was missing');
  ok(si2.face.wants.length === 0, 'and its gaps are closed');
  ok(typeof si2.organs['harvest-calc'] === 'function', 'the organ is real and callable');
  ok(si2.organs['harvest-calc'](['a', 'b', 'c']) === 3, 'and it actually works');
}

console.log('\n=== §5 · ⚑ TOGETHER BEATS THE BEST INDIVIDUAL — measured, and bounded ===');
{
  const { pub, nodes } = await build();
  rounds(pub, nodes, 'total');
  const before = worthIt(nodes);
  ok(before.best === 2, 'the best individual arrived offering 2 organs');

  for (const n of nodes) assemble(n, realGate);
  const after = worthIt(nodes);
  ok(after.together > after.best, 'between them the room holds more than any one of them could');
  ok(after.together === 4, 'four distinct organs across the room');
  ok(after.better === true, 'and that is reported as an improvement');
  ok(/not a mind that emerged/.test(after.finding), '⚑ with the honest bound stated in the finding itself');
  ok(!/emergen|superintel|conscious/i.test(after.finding), 'and no claim of emergence anywhere in it');

  // Every organ any node now holds came through its own gate.
  ok(nodes.every(n => Object.keys(n.organs).every(k => typeof n.organs[k] === 'function')), 'every adopted organ is a real function');
  ok(nodes.some(n => Object.keys(n.organs).length > 0), 'and at least one Didy genuinely gained');
}

console.log('\n=== §6 · a room where nobody helps says so, rather than inventing a win ===');
{
  const a = await signFace(face('a', { shares, offers: { total: sum }, wants: ['nobody-has-this'] }), crypto);
  const b = await signFace(face('b', { shares, offers: { total: sum }, wants: ['nor-this'] }), crypto);
  const nodes = [makeNode(a.face, a.sk), makeNode(b.face, b.sk)];
  const pub = openPub(loopback());
  for (const n of nodes) enter(pub, n);
  rounds(pub, nodes, 'total');
  const r = assemble(nodes[0], realGate);
  ok(r.gained.length === 0 && r.unreachable.length === 1, 'a gap nobody can fill is reported as unreachable, not silently dropped');
  ok(/nobody verified here offers it/.test(r.unreachable[0].why), 'with the reason said plainly');
  ok(/1 gap nobody here could fill/.test(r.finding), 'and the summary counts it');
  const w = worthIt(nodes);
  ok(w.better === false && /did not help here/.test(w.finding), 'and the room admits that meeting did not help');
}

console.log('\n=== §7 · ⚑ A PUB, NOT A LANDLORD — closing it costs nobody anything ===');
{
  const { pub, nodes, si } = await build();
  rounds(pub, nodes, 'total');
  assemble(si, realGate);
  const gainedBefore = Object.keys(si.organs).length;
  ok(gainedBefore === 2, 'si-didy gained two organs in the room');

  const shut = close(pub);
  ok(shut.closed && pub.roster.size === 0, 'the pub closes and drops its roster');
  ok(Object.keys(si.organs).length === gainedBefore, '⚑ and every gain is still on the node — nothing was being held for it');
  ok(typeof si.organs['harvest-calc'] === 'function', 'the organ still works after the room is gone');
  ok(si.peers.size === 2, 'and the node keeps its own peer table — the trust was never the pub\'s to hold');
  ok(/nothing/.test(shut.kept), 'the pub says plainly that it kept nothing');
  ok(!enter(pub, nodes[1]).ok, 'a closed pub takes no more arrivals');
}

console.log('\n=== §8 · ⚑ THE PUB ADJUDICATES NOTHING ===');
{
  // Two Didys in the same room, with different gates, legitimately end up with different builds.
  // If the pub computed "the best build" there would be one answer here, and there is not.
  const { pub, nodes, si, kel } = await build();
  rounds(pub, nodes, 'total');
  assemble(si, realGate);                                  // takes everything that holds
  assemble(kel, (fn) => { try { return fn(['a']) === 1; } catch { return false; } });   // a fussier gate

  ok(Object.keys(si.organs).length !== Object.keys(kel.organs).length,
    'two Didys in the same room, with different gates, end up with DIFFERENT builds');
  ok(!('bestBuild' in pub) && !('winner' in pub) && !('consensus' in pub), 'the pub holds no verdict about which is right');

  const api = await import('./pub.mjs');
  ok(!Object.keys(api.default).some(k => /arbiter|authority|consensus|adjudicat|rank|best(?!.*Individual)/i.test(k)),
    'and exports nothing that would rank or decide between them');
  ok(pub.links.length > 0 && pub.links.every(l => 'by' in l), 'its only memory is who checked whom — introductions, not judgements');
}

console.log('\n=== §9 · the roster and the summaries are exact ===');
{
  // A Didy that arrives without an id is still listed, under its prefix — the same rule the peer
  // table uses. Filing it under a bare `undefined` would let one anonymous arrival displace another.
  const pub = openPub(loopback());
  const anon = makeNode(face('anon-didy', { shares: { reach: 1 }, offers: { total: sum } }));
  enter(pub, anon);
  ok(room(pub).some(r => r.id === 'anon-didy'), 'a Didy with no signed id is rostered under its prefix');
  const anon2 = makeNode(face('other-anon', { shares: { reach: 1 }, offers: { total: sum } }));
  enter(pub, anon2);
  ok(room(pub).length === 2, 'and two id-less arrivals are two entries, not one overwriting the other');

  // One adopted organ reads singular; two read plural; none says so without pretending otherwise.
  const one = await signFace(face('one', { shares: { reach: 1 }, offers: { total: sum }, wants: ['x'] }), crypto);
  const giver = await signFace(face('giver', { shares: { reach: 1 }, offers: { total: sum, x: (v) => v.length } }), crypto);
  const nodes = [makeNode(one.face, one.sk), makeNode(giver.face, giver.sk)];
  const p2 = openPub(loopback());
  for (const n of nodes) enter(p2, n);
  rounds(p2, nodes, 'total');
  const r1 = assemble(nodes[0], realGate);
  ok(/1 adopted organ\b/.test(r1.finding) && !/1 adopted organs/.test(r1.finding), 'one adopted organ reads as singular');

  const r0 = assemble(nodes[1], realGate);
  ok(/0 adopted organs\b/.test(r0.finding), 'none reads as plural zero, rather than being omitted');
  ok(/arrived offering 2\b/.test(r0.finding), 'and what it arrived offering is counted honestly');
}

console.log(`\n${fail === 0 ? '✓ PUB GATE CLEAN' : '✗ PUB GATE FAILED'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

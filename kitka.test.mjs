// kitka.test.mjs — PROOF-OF-PLAY for the two parts derived cold.
//
// Both kernels came from a plain-English derivation that used no borrowed vocabulary, so the tests
// are written the same way: they check the PROPERTIES a person would name, not the implementation.
// The three that matter for the handshake are sovereignty, trustlessness and peer-not-up; the two
// that matter for the walk are one signed axis and never going below nothing.
import { manifest, intersect, disclose, evaluate, handshake } from './handshake.mjs';
import { node, net, affordable, routes, walk, step } from './walk.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };

// Two nodes. Each holds something the other must never see.
const sum = (v) => Object.values(v).reduce((s, x) => s + Number(x || 0), 0);
const A = manifest('alice', { reach: 3, cost: 2, private_key: 'KEY-A-NEVER-SHARE' }, { total: sum });
const B = manifest('bob', { reach: 5, cost: 1, secret_sauce: 'SAUCE-B-NEVER-SHARE' }, { total: sum });

console.log('\n=== §1 · SOVEREIGNTY — what was never named is never sent ===');
{
  const i = intersect(A, B);
  ok(i.shared.join(',') === 'cost,reach', 'only the names BOTH sides hold are shared');
  ok(!i.shared.includes('private_key') && !i.shared.includes('secret_sauce'), 'neither private appears in the shared set');
  ok(i.withheldByA.includes('private_key'), "and A can SEE what it withheld — sovereignty you cannot observe is indistinguishable from an empty manifest");
  ok(i.withheldByB.includes('secret_sauce'), 'so can B');

  const out = disclose(A, i.shared);
  ok(!('private_key' in out), 'the disclosed object does not contain the private, at all');
  // Sorted, not in declaration order — so two nodes disclosing the same names produce byte-identical
  // objects and a repeated handshake can be recognised without anything extra being sent.
  ok(JSON.stringify(out) === '{"cost":2,"reach":3}', 'it contains exactly the shared names, in a stable order, and nothing more');
  ok(Object.keys(out).length === i.shared.length, 'one disclosed value per shared name — no extras, no gaps');

  const h = handshake(A, B, 'total');
  const wire = JSON.stringify(h);
  ok(!wire.includes('KEY-A-NEVER-SHARE'), "A's private never appears anywhere in the exchange");
  ok(!wire.includes('SAUCE-B-NEVER-SHARE'), "nor does B's");
}

console.log('\n=== §2 · TRUSTLESSNESS — both run BOTH functions, nobody is believed ===');
{
  const h = handshake(A, B, 'total');
  ok(h.ran, 'the handshake ran');
  ok(h.results.aFnOnA.ok && h.results.aFnOnB.ok && h.results.bFnOnA.ok && h.results.bFnOnB.ok,
    'FOUR results: each function over each side\'s disclosed values');
  ok(h.results.aFnOnA.value === 5 && h.results.bFnOnA.value === 5, "both functions computed A's values, and got the same answer");
  ok(h.disagree.length === 0 && h.agree.length === 2, 'agreement is established by computing, not by asserting');
  ok(/both functions agree/.test(h.finding), 'and the finding says so');
}

console.log('\n=== §3 · a DISHONEST function is caught by cross-running ===');
{
  // B offers a function that flatters itself: it inflates whatever it is given. The protocol does not
  // need to know that in advance — running both and comparing is what surfaces it.
  const liar = manifest('mallory', { reach: 5, cost: 1 }, { total: (v) => sum(v) + 1000 });
  const h = handshake(A, liar, 'total');
  ok(h.disagree.length === 2, "the two functions disagree over BOTH sides' values");
  ok(h.disagree[0].byA !== h.disagree[0].byB, 'and the two answers are recorded side by side');
  ok(/each node decides for itself/.test(h.finding), 'the protocol REPORTS the disagreement and refuses to adjudicate it');
  ok(!/hostile|malicious|reject|distrust/i.test(h.finding), 'it never labels the peer — that judgement is the node owner\'s');
}

console.log('\n=== §4 · PEER, NOT UP — symmetric, and no third party anywhere ===');
{
  const ab = handshake(A, B, 'total'), ba = handshake(B, A, 'total');
  ok(ab.shared.join() === ba.shared.join(), 'the shared set is the same whichever side initiates');
  ok(ab.agree.length === ba.agree.length && ab.disagree.length === ba.disagree.length, 'and so is the outcome — neither side is privileged');
  ok(handshake(A, B, 'total').finding === handshake(A, B, 'total').finding, 'the handshake is deterministic');
  ok(A.address !== B.address && manifest('alice', { reach: 3, cost: 2, private_key: 'x' }, { total: sum }).address === A.address,
    'the manifest address is over NAMES and function names — never the values, so recognising a repeat discloses nothing');
}

console.log('\n=== §5 · an untrusted function that throws cannot break the handshake ===');
{
  const bomb = manifest('boom', { reach: 1, cost: 1 }, { total: () => { throw new Error('nope'); } });
  const h = handshake(A, bomb, 'total');
  ok(h.ran, 'the handshake still completes');
  ok(h.errors.length === 2, "the peer's function failed on both value sets, and both failures are recorded");
  ok(h.errors[0].why === 'nope', 'with the reason kept');
  ok(evaluate(() => { throw 'a string'; }, {}).why === 'a string', 'a thrown string is reported as itself');
  const none = handshake(A, manifest('mute', { reach: 1 }, {}), 'total');
  ok(none.ran === false && /did not offer a function/.test(none.why), 'a peer offering no such function is a stated non-start, not a crash');
}

console.log('\n=== §6 · ⚑ ONE SIGNED AXIS — worth may be negative, price never is ===');
{
  ok(net(node('a', 10, 3)) === 7, 'net is worth minus price, one number');
  ok(net(node('bad', -5, 1)) === -6, 'a node can be worth LESS than nothing — that is the same axis, not a second field');
  ok(node('x', 1, -9).price === 0, 'a negative price is refused — a road that pays you is a worth, not a price');
  ok(node('y', 'nonsense', 'nonsense').worth === 0, 'unreadable numbers fall back to zero rather than NaN');
  ok(Object.keys(node('z', 1, 2)).sort().join() === 'name,price,worth', 'a node has exactly these three fields — there is no reward/penalty pair to double-count');
}

console.log('\n=== §7 · ⚑ NEVER GO NEGATIVE — and the price is paid FIRST ===');
{
  const cheap = node('cheap', 1, 1), prize = node('prize', 100, 10);
  // The whole point: the total is wonderful, and you cannot begin it.
  const can = affordable(5, [cheap, prize]);
  ok(!can.ok, 'a route whose TOTAL is high is still refused when it cannot be afforded on the way');
  ok(can.at === 'prize', 'and the exact node where it becomes unaffordable is named');
  ok(/paid before its worth is collected/.test(can.why), 'the reason states the ordering that makes it so');
  ok(affordable(20, [cheap, prize]).ok, 'with a bigger purse the same route is fine — it was the purse, not the plan');
  ok(affordable(0, []).ok, 'an empty route is trivially affordable');
  ok(!affordable('lots', [cheap]).ok, 'a purse that is not a number is refused rather than guessed at');

  // dipping below zero mid-route, even though every step is individually cheap
  const drain = node('drain', -10, 0);
  ok(!affordable(5, [drain]).ok, 'a node whose worth takes the purse under is refused too');
  ok(/below nothing/.test(affordable(5, [drain]).why), 'and says which way it failed');
}

console.log('\n=== §8 · LOOKING DEEPER changes the answer ===');
{
  // One step out, `near` looks best. Two steps out, the cheap door leads somewhere far better — the
  // exact case a greedy conductor gets wrong.
  const graph = {
    nodes: {
      start: node('start', 0, 0),
      near: node('near', 6, 1),
      door: node('door', 0, 1),
      far: node('far', 20, 1),
    },
    edges: { start: ['near', 'door'], door: ['far'], near: [], far: [] },
  };
  const shallow = walk(graph, 'start', { purse: 10, depth: 1 });
  ok(shallow.best.path.join() === 'near', 'looking one step out, the obvious neighbour wins');
  const deep = walk(graph, 'start', { purse: 10, depth: 2 });
  ok(deep.best.path.join() === 'door,far', 'looking two steps out, the cheap door leads somewhere better');
  ok(deep.best.total === 18, 'and the total is computed over the whole route');
  ok(deep.notTaken.length > 0, 'the roads not taken are kept, not discarded');
  ok(routes(graph, 'start', 2).every(r => new Set(r.map(n => n.name)).size === r.length), 'no route revisits a node — a loop is not a plan');
}

console.log('\n=== §9 · "chose against it" and "could not begin it" are kept apart ===');
{
  const graph = {
    nodes: { start: node('start', 0, 0), ok1: node('ok1', 5, 1), lux: node('lux', 500, 400) },
    edges: { start: ['ok1', 'lux'], ok1: [], lux: [] },
  };
  const r = walk(graph, 'start', { purse: 3, depth: 1 });
  ok(r.best.path.join() === 'ok1', 'the affordable one is chosen');
  ok(r.couldNotAfford.length === 1 && r.couldNotAfford[0].path.join() === 'lux', 'the unaffordable one is in its OWN list');
  ok(r.notTaken.length === 0, 'and is NOT filed as merely worse — those are different facts about a decision');
  const broke = walk(graph, 'start', { purse: 0, depth: 1 });
  ok(!broke.best && /every one of them out of reach/.test(broke.finding), 'with nothing in the purse it says so, rather than returning a route it cannot walk');
  ok(/nowhere to go/.test(walk({ nodes: {}, edges: {} }, 'start', {}).finding), 'a dead end says that instead');
}

console.log('\n=== §10 · nothing is committed without an author ===');
{
  const graph = { nodes: { start: node('start', 0, 0), a: node('a', 5, 1), b: node('b', 3, 1) }, edges: { start: ['a', 'b'], a: [], b: [] } };
  const open = step(graph, 'start', { purse: 9, depth: 1 });
  ok(open.committed === null && /without an author/.test(open.why), 'with no author the field stays open');
  const done = step(graph, 'start', { purse: 9, depth: 1, author: (best) => best });
  ok(done.committed.path.join() === 'a' && /authored/.test(done.why), 'an author commits the route they picked');
  const other = step(graph, 'start', { purse: 9, depth: 1, author: (b, rest) => rest[0] });
  ok(other.committed.path.join() === 'b', 'and may pick something other than the best');
  const cheat = step(graph, 'start', { purse: 9, depth: 1, author: () => ({ path: ['somewhere-else'] }) });
  ok(cheat.committed === null && /was not on offer/.test(cheat.why), 'an author cannot commit a route that was never offered or affordable');
}

console.log('\n=== §11 · ⚑ SPENDING EXACTLY WHAT YOU HAVE IS AFFORDABLE ===');
{
  // The boundary is the whole rule. "Never go negative" must mean exactly that — landing on nothing is
  // allowed, and an off-by-one here would refuse every plan that used its budget properly.
  ok(affordable(1, [node('x', 0, 1)]).ok, 'a purse of exactly the price is enough — zero left is not negative');
  ok(affordable(1, [node('x', 0, 1)]).held === 0, 'and it leaves precisely nothing');
  ok(!affordable(0.99, [node('x', 0, 1)]).ok, 'a penny short is refused');
  ok(affordable(5, [node('drain', -5, 0)]).ok, 'a worth that takes the purse exactly to nothing is allowed');
  ok(!affordable(5, [node('drain', -6, 0)]).ok, 'one more and it is not');
}

console.log('\n=== §12 · the counts read in the right grammar ===');
{
  const g2 = { nodes: { s: node('s', 0, 0), a: node('a', 5, 1), b: node('b', 3, 1) }, edges: { s: ['a', 'b'], a: [], b: [] } };
  ok(/chosen over 1 other,|chosen over 1 other$| 1 other\b/.test(walk(g2, 's', { purse: 9, depth: 1 }).finding), 'one alternative reads as "1 other"');
  const g3 = { nodes: { s: node('s', 0, 0), a: node('a', 5, 1), b: node('b', 3, 1), c: node('c', 2, 1) }, edges: { s: ['a', 'b', 'c'], a: [], b: [], c: [] } };
  ok(/2 others/.test(walk(g3, 's', { purse: 9, depth: 1 }).finding), 'two alternatives read as "2 others"');
  const g1 = { nodes: { s: node('s', 0, 0), a: node('a', 5, 1) }, edges: { s: ['a'], a: [] } };
  ok(/over 0 others/.test(walk(g1, 's', { purse: 9, depth: 1 }).finding), 'no alternatives reads as "0 others"');

  const gU = { nodes: { s: node('s', 0, 0), a: node('a', 5, 1), lux: node('lux', 9, 99) }, edges: { s: ['a', 'lux'], a: [], lux: [] } };
  ok(/\(1 unaffordable\)/.test(walk(gU, 's', { purse: 3, depth: 1 }).finding), 'one unaffordable route is counted singly');
  ok(/1 route considered, every one/.test(walk({ nodes: { s: node('s'), lux: node('lux', 9, 99) }, edges: { s: ['lux'], lux: [] } }, 's', { purse: 0 }).finding),
    'and with nothing affordable the singular reads correctly too');
}

console.log('\n=== §13 · the handshake states its own counts honestly ===');
{
  const one = manifest('one', { reach: 1 }, { total: sum });
  const two = manifest('two', { reach: 2 }, { total: sum });
  ok(/1 shared value\b/.test(handshake(one, two, 'total').finding), 'a single shared value reads as singular');
  ok(/2 shared values\b/.test(handshake(A, B, 'total').finding), 'two read as plural');

  // A function that only misbehaves on LARGE values agrees over the small side's data and disagrees
  // over the large side's — which is why the handshake compares twice rather than once. Agreeing on
  // one side and not the other is a real and different finding from disagreeing on both.
  const small = manifest('small', { reach: 1 }, { total: sum });
  const fussy = manifest('fussy', { reach: 5 }, { total: (v) => sum(v) + (Number(v.reach) > 3 ? 1 : 0) });
  const h = handshake(small, fussy, 'total');
  ok(h.agree.length === 1 && h.disagree.length === 1, 'the two functions agree over one side\'s values and not the other\'s');
  ok(/^1 disagreement /.test(h.finding), 'and one disagreement reads as singular');
  ok(h.disagree[0].over === "fussy's values", 'the report names WHOSE values they fell out over');

  const liar2 = manifest('l2', { reach: 5, cost: 1 }, { total: (v) => sum(v) + 1 });
  ok(/^2 disagreements /.test(handshake(A, liar2, 'total').finding), 'disagreeing on both sides reads as plural');

  const brittle = manifest('brittle', { reach: 5 }, { total: (v) => { if (Number(v.reach) > 3) throw new Error('too big'); return sum(v); } });
  const hb = handshake(small, brittle, 'total');
  ok(/1 error\b/.test(hb.finding), 'a function that fails on only one side is one error, not two');
  // A run that ERRORED has no answer, and comparing "no answer" against a real one would manufacture
  // a disagreement out of a crash — the peer would look dishonest when it had merely fallen over.
  ok(hb.disagree.length === 0, 'a failed run is NOT compared against the other side — an error is not a disagreement');
  ok(hb.agree.length === 1, 'while the side that did complete is still compared normally');
}

console.log('\n=== §14 · a manifest keeps only what it can actually name ===');
{
  ok(manifest().name === 'didy', 'an unnamed Didy is called didy, not "undefined"');
  ok(manifest('').name === 'didy', 'and so is an empty-named one');
  ok(manifest('bob').name === 'bob', 'a named one keeps its name');
  const m = manifest('m', { good: 1, '': 2 }, { fine: () => 1, notAFn: 'nope' });
  ok(m.names.join() === 'good', 'a value with no usable name is dropped rather than carried as ""');
  ok(!('notAFn' in m.offers), 'and something that is not a function is not offered as one');
  ok(Object.keys(m.offers).join() === 'fine', 'only real functions survive into offers');
}

console.log(`\n${fail === 0 ? '✓ KITKA GATE CLEAN' : '✗ KITKA GATE FAILED'} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

// isa.test.mjs — the gate on the Konomi standards kernel.
//
// Two kinds of test in here. The mechanics, and the FINDINGS — including one about the upstream data
// itself, because a kernel that reads someone else's ontology and never notices its gaps is not
// reading it, it is reciting it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load, classify, conform, translate, ringOf, profile, tensions, census, segments } from './isa.mjs';
import { boundaries } from './boundaries.mjs';

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.error(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); } };

const DATA = JSON.parse(readFileSync(new URL('./standards.json', import.meta.url), 'utf8'));
const K = load(DATA);

// ════ THE DATA IT INHERITED ═════════════════════════════════════════════════════════════════════

t('the crosswalk loads whole — eight standards, forty-four UDTs, the primorial signature', () => {
  const c = census(K);
  assert.equal(c.standards, 8);
  assert.equal(c.udts, 44);
  assert.equal(c.signature, 510510, 'the primorial 2·3·5·7·11·13·17 — Thomas signs the manifest with it');
  assert.equal(c.rings, 8);
  assert.ok(c.crosswalks >= 16);
});

t('both mapping notations are read — `A=B` and `A→B`', () => {
  assert.ok(K.edges.some(e => e.raw.includes('=')), 'ISA-95 to ISA-88 uses equals');
  assert.ok(K.edges.some(e => e.raw.includes('→')), 'ISA-95 to OPC-UA uses an arrow');
  const eq = K.edges.find(e => e.raw === 'WorkCenter=ProcessCell');
  assert.equal(eq.from, 'WorkCenter');
  assert.equal(eq.to, 'ProcessCell');
  const ar = K.edges.find(e => e.raw === 'Property→Variable');
  assert.equal(ar.from, 'Property');
  assert.equal(ar.to, 'Variable');
});

t('FINDING · the upstream crosswalk points at PackML, which is not one of its own standards', () => {
  // ISA-88 → PackML is declared and its three state mappings are correct domain knowledge. But
  // PackML is not among the eight standards defined, so nothing here can resolve what an EXECUTE
  // actually is. Not an error in the mapping — a hole in the set, and the kernel surfaces it rather
  // than rendering it as though it resolved.
  const dangling = tensions(K).filter(x => x.dangling);
  assert.ok(dangling.length > 0, 'the kernel must notice a mapping that lands nowhere');
  const packml = dangling.find(d => d.to === 'PackML');
  assert.ok(packml, `expected the PackML gap, got ${JSON.stringify(dangling.slice(0, 3))}`);
  assert.equal(packml.kind, 'missing', 'PackML is not in the set at all');
  assert.ok(!K.byId.has('PackML'));
});

t('FINDING · and a SECOND, different problem — the crosswalk and the UDT lists disagree on naming', () => {
  // `Property→Variable` points into OPC-UA, which IS loaded — but OPC-UA lists its UDTs as
  // `OPC_Variable`, not `Variable`. The mapping is correct domain knowledge; the two halves of the
  // document simply do not share a convention. Reporting that as "OPC-UA is missing" would be a
  // false claim about someone else's work, so the two are separated by name.
  const naming = tensions(K).filter(x => x.kind === 'naming');
  assert.ok(naming.length > 0, 'the naming mismatch must be reported as its own kind');
  assert.ok(naming.every(n => K.byId.has(n.to)), 'every one of these points at a standard that IS loaded');
  assert.ok(naming.some(n => n.term === 'Variable'), `expected the Variable/OPC_Variable mismatch, got ${JSON.stringify(naming.map(n => n.term))}`);
  assert.ok(tensions(K).filter(x => x.kind === 'missing').every(m => !K.byId.has(m.to)),
    'and every MISSING one points at a standard that genuinely is not there');
});

t('no UDT is claimed by two standards — the eight are disjoint as written', () => {
  assert.deepEqual(K.collisions, [], 'if this ever fires it is a real overlap, not a bug');
});

// ════ CLASSIFY ══════════════════════════════════════════════════════════════════════════════════

t('an exact name is an EXACT match and says so', () => {
  const r = classify(K, 'AlarmPriority');
  assert.equal(r.matched, true);
  assert.equal(r.strength, 'exact');
  assert.equal(r.standard, 'ISA-18.2');
  assert.equal(r.udt, 'AlarmPriority');
});

t('a real plant tag matches on its SEGMENTS, and is marked weaker for it', () => {
  const r = classify(K, 'Line3_ProcessCell_Temp');
  assert.equal(r.matched, true);
  assert.equal(r.udt, 'ProcessCell');
  assert.equal(r.standard, 'ISA-88');
  assert.notEqual(r.strength, 'exact', 'a guess about a naming convention must never be reported as exact');
});

t('the same UDT is found however the plant spelled it', () => {
  for (const name of ['Line3_ProcessCell_Temp', 'PROCESS_CELL_3', 'processCell', 'plant.processcell.a']) {
    assert.equal(classify(K, name).udt, 'ProcessCell', `${name} should be a ProcessCell`);
  }
});

t('FINDING · a three-letter UDT is real and must not be dropped', () => {
  // A blanket minimum length on substring matching looked like a sensible guard and silently threw
  // away OEE — one of the most-used numbers on a plant floor. Segment matching removes the need for
  // the guard entirely.
  const r = classify(K, 'OEE_LineA');
  assert.equal(r.matched, true);
  assert.equal(r.udt, 'OEE');
  assert.equal(r.standard, 'KPI');
});

t('a tag that conforms to nothing STAYS unmatched', () => {
  for (const junk of ['WidgetCounter', 'FOO_BAR_99', 'zzz']) {
    const r = classify(K, junk);
    assert.equal(r.matched, false, `${junk} must not be forced onto a standard`);
    assert.match(r.why, /no UDT/);
  }
});

t('the longest UDT wins when several could match', () => {
  const r = classify(K, 'LINE3_PRODUCTION_SCHEDULE_A');
  assert.equal(r.udt, 'ProductionSchedule', 'ProductionSchedule must beat any shorter fragment');
});

t('classify reads an object as well as a string', () => {
  assert.equal(classify(K, { name: 'MTTR' }).udt, 'MTTR');
  assert.equal(classify(K, { udt: 'Batch' }).udt, 'Batch');
  assert.equal(classify(K, { id: 'Recipe' }).udt, 'Recipe');
  assert.equal(classify(K, {}).matched, false);
});

t('segments splits the way plants actually name things', () => {
  const s = segments('Line3_ProcessCell_Temp');
  assert.ok(s.has('line3') && s.has('process') && s.has('cell') && s.has('temp'));
  assert.ok(s.has('processcell'), 'adjacent parts must join, or PROCESS_CELL never finds ProcessCell');
  assert.ok(segments('plant.unit.reactor').has('unit'), 'dots are separators too');
  assert.ok(segments('alarmPriority').has('alarm'), 'and so is a camelCase boundary');
  assert.equal(segments(null).size, 0);
});

// ════ CONFORMANCE · the gap list is the product ═════════════════════════════════════════════════

const PLANT = ['Line3_ProcessCell_Temp', 'AlarmPriority', 'OEE_LineA', 'WidgetCounter', 'FOO_BAR_99', 'MTTR'];

t('the report leads with what does NOT map', () => {
  const c = conform(K, PLANT);
  assert.equal(c.total, 6);
  assert.equal(c.gaps, 2);
  assert.deepEqual(c.unmapped, ['WidgetCounter', 'FOO_BAR_99'], 'named, not counted — you cannot act on a number');
});

t('exact and guessed are counted SEPARATELY and always add up', () => {
  const c = conform(K, PLANT);
  assert.equal(c.exact + c.weak, c.matched, 'every match is one or the other');
  assert.ok(c.exact > 0 && c.weak > 0, 'the fixture must exercise both or this proves nothing');
  assert.equal(c.matched + c.gaps, c.total);
});

t('coverage is a fraction of what was actually handed in', () => {
  assert.equal(conform(K, PLANT).coverage, 4 / 6);
  assert.equal(conform(K, []).coverage, 0, 'nothing in, nothing claimed');
  assert.equal(conform(K, []).total, 0);
});

t('it counts per standard, so you can see which part of the stack you are missing', () => {
  const c = conform(K, PLANT);
  assert.equal(c.byStandard['KPI'], 2);
  assert.equal(c.byStandard['ISA-18.2'], 1);
  assert.equal(c.byStandard['Modbus'], undefined, 'a standard with no matching tags is absent, not zero-padded');
});

// ════ CROSSWALK ═════════════════════════════════════════════════════════════════════════════════

t('translate walks the declared mappings and RETURNS THE PATH', () => {
  const hops = translate(K, 'Variable');
  assert.ok(hops.length > 0);
  const metric = hops.find(h => h.term === 'Metric');
  assert.ok(metric, `expected Variable to reach Metric, got ${JSON.stringify(hops.map(h => h.term))}`);
  assert.equal(metric.standard, 'Sparkplug');
  assert.ok(metric.path.length >= 1, 'the route must be shown, not just the destination');
});

t('translate reads mappings in both directions', () => {
  // Property→Variable is declared one way; asking from either end must find the other.
  assert.ok(translate(K, 'Property').some(h => h.term === 'Variable'));
  assert.ok(translate(K, 'Variable').some(h => h.term === 'Property'));
});

t('`to` narrows to one standard', () => {
  const only = translate(K, 'Variable', { to: 'Sparkplug' });
  assert.ok(only.length > 0);
  assert.ok(only.every(h => h.standard === 'Sparkplug'));
});

t('nearer hops come first, and nothing is visited twice', () => {
  const hops = translate(K, 'WorkCenter', { maxHops: 3 });
  for (let i = 1; i < hops.length; i++) assert.ok(hops[i].hops >= hops[i - 1].hops);
  assert.equal(new Set(hops.map(h => h.term)).size, hops.length, 'a cycle must not produce duplicates');
});

t('an unknown term translates to nothing rather than to something', () => {
  assert.deepEqual(translate(K, 'ZZZ_NOT_A_TERM'), []);
  assert.deepEqual(translate(K, ''), []);
  assert.deepEqual(translate(K, null), []);
});

// ════ THE RING BRIDGE ═══════════════════════════════════════════════════════════════════════════

t('every standard lands on a ring', () => {
  for (const id of K.byId.keys()) {
    const r = ringOf(K, id);
    assert.ok(r, `${id} must sit somewhere on the ladder`);
    assert.match(r.id, /^R\d$/);
  }
  assert.equal(ringOf(K, 'NOT-A-STANDARD'), null);
});

t('the ring ladder is the prime spine, and R7 sits outside the primorial', () => {
  const primes = [...K.rings.values()].map(r => r.prime);
  assert.deepEqual(primes, [2, 3, 5, 7, 11, 13, 17, 19]);
  const primorial = primes.slice(0, 7).reduce((a, b) => a * b, 1);
  assert.equal(primorial, 510510, 'R0–R6 multiply to the signature');
  assert.equal(K.signature, primorial, 'and the manifest signs with exactly that');
  assert.ok(!primes.slice(0, 7).includes(19), 'R7 — the network ring — is deliberately not in the product');
});

t('a plant lands on the ladder, and the reading says what that means', () => {
  const p = profile(K, PLANT);
  assert.ok(p.ringsHeld > 0);
  assert.ok(p.highest);
  assert.match(p.reading, /R\d/);
  const bare = profile(K, ['WidgetCounter', 'FOO_BAR_99']);
  assert.equal(bare.ringsHeld, 0);
  assert.match(bare.reading, /nothing on the ladder/);
});

t('a plant with only low rings is told it has instrumentation without interpretation', () => {
  const p = profile(K, ['Modbus_Register_40001', 'Modbus_Map']);
  assert.ok(p.ringsHeld <= 2);
  assert.match(p.reading, /instrumentation without interpretation/);
});

// ════ FUZZ ══════════════════════════════════════════════════════════════════════════════════════

t('bad data is refused at the door, with a reason', () => {
  assert.throws(() => load(null), /standards/);
  assert.throws(() => load({}), /standards/);
  assert.throws(() => load({ standards: 'nope' }), /standards/);
});

t('a thin but valid dataset loads rather than crashing', () => {
  const k = load({ standards: [{ id: 'X', name: 'x', udts: ['Thing'] }] });
  assert.equal(census(k).standards, 1);
  assert.equal(census(k).crosswalks, 0);
  assert.equal(census(k).rings, 0);
  assert.equal(classify(k, 'Thing').standard, 'X');
  assert.deepEqual(profile(k, ['Thing']).rings, {});
});

t('junk tags do not crash anything', () => {
  for (const junk of [null, undefined, 0, '', [], {}, { name: null }]) {
    assert.doesNotThrow(() => classify(K, junk));
    assert.equal(classify(K, junk).matched, false);
  }
  assert.doesNotThrow(() => conform(K, null));
  assert.doesNotThrow(() => conform(K, [null, undefined, 5]));
  assert.doesNotThrow(() => profile(K, null));
  assert.doesNotThrow(() => tensions(load({ standards: [] })));
});

boundaries(t, K);

console.log(`\n${fail === 0 ? '✓' : '✗'} konomi-isa  ${pass}/${pass + fail}${fail ? `  (${fail} failing)` : ''}`);
process.exit(fail === 0 ? 0 : 1);

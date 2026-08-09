// boundaries.mjs — the edges of the standards kernel, each pinned to a case sitting on it.
//
// A conformance tool is thresholds: how much of a name has to match, how far a crosswalk may walk,
// how many rings count as "reaching". Every one of those numbers decides whether a plant is told it
// conforms, so an off-by-one here is a wrong answer with a signature on it.
import assert from 'node:assert/strict';
import { load, classify, conform, translate, ringOf, profile, tensions, census, segments } from './isa.mjs';

export function boundaries(t, K) {
  // ── NAME MATCHING ─────────────────────────────────────────────────────────────────────────────
  t('ADJACENT parts reassemble a UDT; non-adjacent ones do not', () => {
    const k = load({ standards: [{ id: 'A', name: 'a', udts: ['Batch'] }] });
    assert.equal(classify(k, 'X_BAT_CH_Y').udt, 'Batch', 'BAT + CH are neighbours, so they join');
    assert.equal(classify(k, 'BAT_X_CH').matched, false,
      'BAT and CH separated by something else are two different things, and joining them would invent a match');
  });

  t('the LONGEST match wins on both paths, and a tie does not flip it', () => {
    const k = load({ standards: [{ id: 'A', name: 'a', udts: ['Production', 'ProductionSchedule'] }] });
    assert.equal(classify(k, 'LINE_PRODUCTION_SCHEDULE').udt, 'ProductionSchedule');
    assert.equal(classify(k, 'LINE_PRODUCTION').udt, 'Production', 'and the short one still wins when it is all there is');
  });

  t('segments joins ADJACENT parts only, in order', () => {
    const s = segments('a_b_c');
    assert.ok(s.has('ab') && s.has('bc'), 'neighbours join');
    assert.ok(!s.has('ac'), 'but non-adjacent parts must not — that would invent names');
    assert.ok(s.has('abc'), 'and a run of three joins too');
    assert.ok(!segments('a_b').has('abc'), 'a pair cannot produce a triple');
    for (const seg of segments('a_b')) assert.ok(!seg.includes('undefined'), `ran off the end: "${seg}"`);
    for (const seg of segments('a_b_c_d')) assert.ok(!seg.includes('undefined'), `ran off the end: "${seg}"`);
    assert.deepEqual([...segments('one')], ['one'], 'a single part joins with nothing');
  });

  // ── CONFORMANCE ───────────────────────────────────────────────────────────────────────────────
  t('EXACT and weak are counted by what they are, not by how many there are', () => {
    const k = load({ standards: [{ id: 'A', name: 'a', udts: ['Batch', 'Recipe'] }] });
    // two exact and one weak, deliberately UNEVEN — equal counts would pass even if the two were
    // being tallied into each other's buckets
    const c = conform(k, ['Batch', 'Recipe', 'LINE_RECIPE_7', 'nothing']);
    assert.equal(c.exact, 2, 'only a verbatim name is exact');
    assert.equal(c.weak, 1);
    assert.equal(c.gaps, 1);
    assert.equal(c.matched, 3);
    assert.deepEqual(c.unmapped, ['nothing']);
  });

  // ── THE CROSSWALK ─────────────────────────────────────────────────────────────────────────────
  t('maxHops is exact — one hop means one', () => {
    const one = translate(K, 'Variable', { maxHops: 1 });
    assert.ok(one.length > 0);
    assert.ok(one.every(h => h.hops === 1), `every result must be a single hop, got ${JSON.stringify(one.map(h => h.hops))}`);
    assert.deepEqual(translate(K, 'Variable', { maxHops: 0 }), [], 'zero hops is zero results, not all of them');
  });

  t('a PARTIAL term still walks — plants do not type the full UDT name', () => {
    // `Work` must reach `WorkCenter=ProcessCell`. Requiring the term and the mapping to contain each
    // other BOTH ways is effectively demanding equality, and nothing real is ever spelled that way.
    const hops = translate(K, 'Work');
    assert.ok(hops.some(h => h.term === 'ProcessCell'), `Work should reach ProcessCell, got ${JSON.stringify(hops.map(h => h.term))}`);
    const back = translate(K, 'ProcessCel');
    assert.ok(back.length > 0, 'and a partial on the far side walks back the other way');
  });

  t('a direct mapping is hop ONE, not hop zero', () => {
    const [first] = translate(K, 'Property', { maxHops: 1 });
    assert.ok(first);
    assert.equal(first.hops, 1, 'the first step away from the term is the first hop');
    assert.equal(first.path.length, 1);
  });

  t('a malformed mapping is dropped rather than half-loaded', () => {
    const k = load({
      standards: [{ id: 'A', name: 'a', udts: ['Thing'] }],
      crosswalks: [{ from: 'A', to: 'B', maps: ['Good=Fine', 'Half=', '→Alone', 'nonsense with no operator', '', null] }],
    });
    assert.equal(census(k).crosswalks, 1, 'a mapping needs BOTH ends — a half-written one is dropped, not stored with a blank side');
    assert.equal(k.edges[0].from, 'Good');
  });

  // ── THE RING LADDER ───────────────────────────────────────────────────────────────────────────
  t('a standard is placed by ALL its tokens, not any one of them', () => {
    // "Sparkplug/MQTT" is MQTT-Sparkplug written the human way; both tokens must be present, or a
    // ring that merely mentions MQTT would claim a standard it does not carry.
    assert.equal(ringOf(K, 'MQTT-Sparkplug').id, 'R5');
    const k = load({
      standards: [{ id: 'MQTT-Sparkplug', name: 'x', udts: ['T'], levels: 'L9' }],
      rings: [{ id: 'R1', name: 'ONE', prime: 3, focus: 'MQTT only', level: 'L1' },
              { id: 'R2', name: 'TWO', prime: 5, focus: 'Sparkplug and MQTT', level: 'L2' }],
    });
    assert.equal(ringOf(k, 'MQTT-Sparkplug').id, 'R2', 'the ring holding BOTH tokens wins');
  });

  t('when no ring names the standard, the ISA-95 LEVEL places it', () => {
    const k = load({
      standards: [{ id: 'Z', name: 'z', udts: ['T'], levels: 'L3 — MOM' }],
      rings: [{ id: 'R0', name: 'A', prime: 2, focus: 'nothing relevant', level: 'L0 — Process' },
              { id: 'R4', name: 'B', prime: 11, focus: 'nothing relevant', level: 'L3 — MOM' }],
    });
    assert.equal(ringOf(k, 'Z').id, 'R4', 'matched on the level both declare');
    const noLevel = load({
      standards: [{ id: 'Z', name: 'z', udts: ['T'] }],
      rings: [{ id: 'R0', name: 'A', prime: 2, focus: 'nothing', level: 'L0' }],
    });
    assert.equal(ringOf(noLevel, 'Z'), null, 'and with neither name nor level, it is honestly nowhere');
  });

  t('the reading turns at exactly TWO rings', () => {
    const k = load({
      standards: [
        { id: 'S0', name: 's0', udts: ['Aaa'] }, { id: 'S1', name: 's1', udts: ['Bbb'] },
        { id: 'S2', name: 's2', udts: ['Ccc'] },
      ],
      rings: [
        { id: 'R0', name: 'A', prime: 2, focus: 'S0', level: 'L0' },
        { id: 'R1', name: 'B', prime: 3, focus: 'S1', level: 'L1' },
        { id: 'R2', name: 'C', prime: 5, focus: 'S2', level: 'L2' },
      ],
    });
    assert.match(profile(k, ['Aaa', 'Bbb']).reading, /instrumentation without interpretation/,
      'two rings is still instrumentation');
    assert.match(profile(k, ['Aaa', 'Bbb', 'Ccc']).reading, /reaching/, 'three is reaching');
    assert.match(profile(k, ['Aaa']).reading, /instrumentation without interpretation/);
  });

  t('rings with no matching tags stay at zero, and repeats COUNT UP', () => {
    const p = profile(K, ['MTTR']);
    assert.equal(Object.keys(p.rings).length, 8, 'every ring is reported, including the empty ones');
    assert.ok(Object.values(p.rings).some(n => n === 0));
    assert.equal(p.ringsHeld, 1);
    // three tags on one ring must read three, not one — a counter that resets on every hit reports
    // a plant as evenly instrumented when it is all in one place
    const many = profile(K, ['MTTR', 'OEE', 'MTBF']);
    assert.equal(many.rings.R5, 3, `three KPI tags is three on R5, got ${many.rings.R5}`);
  });

  // ── TENSIONS ──────────────────────────────────────────────────────────────────────────────────
  t('a mapping that lands on a DEFINED udt is not dangling', () => {
    const k = load({
      standards: [{ id: 'A', name: 'a', udts: ['Alpha'] }, { id: 'B', name: 'b', udts: ['Beta'] }],
      crosswalks: [{ from: 'A', to: 'B', maps: ['Alpha=Beta'] }],
    });
    assert.deepEqual(tensions(k), [], 'both ends are defined, so there is nothing to report');
    const k2 = load({
      standards: [{ id: 'A', name: 'a', udts: ['Alpha'] }],
      crosswalks: [{ from: 'A', to: 'Ghost', maps: ['Alpha=Nowhere'] }],
    });
    assert.equal(tensions(k2).length, 1, 'a mapping into a standard that does not exist must surface');
  });

  t('a standard with no id is skipped rather than loaded as undefined', () => {
    const k = load({ standards: [{ name: 'nameless', udts: ['X'] }, { id: 'A', name: 'a', udts: ['Y'] }] });
    assert.equal(census(k).standards, 1);
    assert.equal(classify(k, 'X').matched, false, 'its UDTs must not be indexed either');
    assert.equal(classify(k, 'Y').standard, 'A');
  });

  t('census reports the source when there is one, and null when there is not', () => {
    assert.match(String(census(K).source), /teslasolar\/JEDI/, 'attribution travels with the data');
    assert.equal(census(load({ standards: [] })).source, null);
  });
}

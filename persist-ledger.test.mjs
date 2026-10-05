// persist-ledger.test.mjs — proof that a fall-os session survives close→reload through the KESTREL ledger.
//
// The "live" side here replays fall-os's OWN save arithmetic (copied verbatim from game.mjs's grant/applySkin/reseed)
// and exhales a signed packet per transition into a mock IndexedDB through the real vendored adapter. Then RAM is
// dropped and the node is woken ONLY from the ledger: gated inhale → reduce → re-mint the kard → compare. Two
// independent code paths (the live arithmetic and persist-ledger's reducer) must agree byte-for-byte.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from 'node:crypto';

import { createMockIndexedDB } from './vendor/kestrel/idb-mock.mjs';
import { openKestrelDB, putGenome, putWallet, exhale, getLedger } from './vendor/kestrel/kestrel-db.mjs';
import { genome, replayStore, pack, WIRE, PAYLOAD, SIG } from './vendor/kestrel/kestrelledger.mjs';
import { mintKard, attachSignature, kardSignable } from './kard.mjs';
import { ZONE_LEDGER, SKIN_ORDER, zoneIndexById, skinIndex } from './zone-ledger-map.mjs';
import {
  encodeGrant, encodeSkin, encodeSeed, packEvent, gatedSurvivors, reduceProgress, canonicalSave, stable, DIDY_SOURCE,
} from './persist-ledger.mjs';

// ── a fixed-seed Ed25519 keypair (one Didy), so the whole proof re-derives identically ─────────────────────────
function keypairFromSeed(seed32) {
  const header = Buffer.from('302e020100300506032b657004220420', 'hex');
  const privateKey = createPrivateKey({ key: Buffer.concat([header, Buffer.from(seed32)]), format: 'der', type: 'pkcs8' });
  return { privateKey, publicKey: createPublicKey(privateKey) };
}
const SEED = new Uint8Array(32); for (let i = 0; i < 32; i++) SEED[i] = (i * 7 + 3) & 0xFF;
const { privateKey, publicKey } = keypairFromSeed(SEED);
const ID = Buffer.from(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)).toString('hex'); // 64 hex
const verify = (key, msg, sig) => edVerify(null, Buffer.from(msg), key, Buffer.from(sig));

// sign an arbitrary 6-byte payload under a given sourceId byte (for crafting off-κ / source-mismatch frames)
const signRaw = (payload, srcByte = DIDY_SOURCE) => {
  const m = new Uint8Array(1 + PAYLOAD); m[0] = srcByte; m.set(payload, 1);
  const sig = new Uint8Array(edSign(null, Buffer.from(m), privateKey));
  const raw = new Uint8Array(WIRE); raw[0] = srcByte; raw.set(payload, 1); raw.set(sig, 1 + PAYLOAD);
  return raw;
};
const signFrame = (cmd) => signRaw(packEvent(cmd));
const BUDGET_CAP = 100;
const ctxOf = (seen) => ({ keys: { [DIDY_SOURCE]: publicKey }, lattice: { [DIDY_SOURCE]: { maxBudget: 65535, resources: 0xFF } }, seen: seen || replayStore(8192), verify });

// the kard the game would mint for (id, caps, skin) — deterministic, signed by the Didy's own key
function remint(id, caps, skin) {
  const m = mintKard({ owner: id, skinRef: skin || 'aurora', structureRef: 'fallos-didy-v1', capabilities: caps.slice(), budgetCap: BUDGET_CAP, createdAt: '2026-01-01T00:00:00Z', label: 'my didy' });
  assert.ok(m.ok, m.why);
  const s = kardSignable(m.kard); assert.ok(s.ok, s.why);
  const sig = Buffer.from(edSign(null, Buffer.from(new TextEncoder().encode(s.payload)), privateKey)).toString('hex');
  const a = attachSignature(m.kard, id, sig); assert.ok(a.ok, a.why);
  return a.kard;
}

// ── the LIVE game arithmetic (verbatim from game.mjs), independent of persist-ledger's reducer ─────────────────
function liveGrant(save, zone) {
  if (!save.caps.includes(zone.cap)) save.caps.push(zone.cap);
  save.done[zone.id] = true;
  save.level = Math.max(save.level, zone.lvl);
  save.xp += 100;
}
const zoneTable = ZONE_LEDGER.map((z) => ({ id: z.id, cap: z.cap, lvl: z.lvl }));

// play a scripted session: mutate the live save AND exhale the matching packet, exactly as the wired game does.
async function playAndExhale(db, events) {
  const save = { id: ID, kard: null, level: -1, xp: 0, caps: ['identity'], skin: 'aurora', seededStats: null, done: {}, _scopeOk: false };
  // hatch: identity set directly; grant('hatch') is the first exhaled event (see the game)
  let seq = 0;
  for (const ev of events) {
    if (ev.grant) {
      const zi = zoneIndexById(ev.grant);
      liveGrant(save, zoneTable[zi]);
      save.kard = remint(save.id, save.caps, save.skin);
      await exhale(db, signFrame(encodeGrant(zi, seq++)));
    } else if (ev.skin) {
      save.skin = ev.skin;
      save.kard = remint(save.id, save.caps, save.skin);
      await exhale(db, signFrame(encodeSkin(skinIndex(ev.skin), seq++)));
    } else if (ev.seed != null) {
      save.seededStats = { conversations: ev.conversations || 1, turns: ev.turns || 1, facts: ev.seed, byKind: ev.byKind || {} };
      await exhale(db, signFrame(encodeSeed(ev.seed, seq++)));
    }
  }
  return save;
}

// wake the node from the ledger alone (RAM dropped): gated inhale → reduce → re-mint kard → a reconstructed save.
async function wakeFromLedger(db, extraFrames) {
  const frames = await getLedger(db);
  const all = extraFrames ? frames.concat(extraFrames) : frames;
  const { survivors, rejected, rejectedTotal } = await gatedSurvivors(all, ctxOf());
  const prog = reduceProgress(survivors, zoneTable, SKIN_ORDER);
  const save = {
    id: ID, level: prog.level, xp: prog.xp, caps: prog.caps.slice(), skin: prog.skin,
    done: prog.done, seededStats: prog.facts != null ? { facts: prog.facts } : null, kard: null, _scopeOk: false,
  };
  save.kard = remint(save.id, save.caps, save.skin);
  return { save, survivors, rejected, rejectedTotal };
}

test('a full play session survives close→reload BYTE-IDENTICAL via the ledger', async () => {
  const idb = createMockIndexedDB();
  const db = await openKestrelDB(idb, 'FALLOS_TEST_A');
  await putGenome(db, { ...genome(), id: ID });
  await putWallet(db, { pubHex: ID });
  const live = await playAndExhale(db, [
    { grant: 'hatch' }, { seed: 9, conversations: 2, turns: 4 }, { grant: 'memory' }, { grant: 'recall' },
    { skin: 'ember' }, { grant: 'skin' }, { grant: 'forge' }, { grant: 'foundry' },
  ]);
  // ABRUPT CLOSE: the live object is dropped. Only the IndexedDB ledger survived.
  const { save: recon, rejectedTotal } = await wakeFromLedger(db);
  assert.equal(rejectedTotal, 0, 'a clean ledger drops nothing');
  assert.equal(canonicalSave(recon), canonicalSave(live), 'reconstructed save is byte-identical to the closed surface');
  // spot-check the durable fields came back
  assert.equal(recon.level, 3); assert.equal(recon.xp, 600); assert.equal(recon.skin, 'ember');
  assert.equal(recon.seededStats.facts, 9);
  assert.deepEqual(recon.caps, ['identity', 'memory', 'recall', 'skin', 'build', 'tool']);
  assert.ok(recon.kard && recon.kard.signature, 'the signed kard reconstructs');
});

test('two re-seeds both count (+100 xp each): deterministic Ed25519 does NOT false-drop a repeated event', async () => {
  const idb = createMockIndexedDB();
  const db = await openKestrelDB(idb, 'FALLOS_TEST_B');
  await putGenome(db, { ...genome(), id: ID });
  const live = await playAndExhale(db, [
    { grant: 'hatch' }, { grant: 'memory' }, { grant: 'memory' },
  ]);
  const { save: recon, rejectedTotal } = await wakeFromLedger(db);
  assert.equal(rejectedTotal, 0, 'the two identical memory grants are distinct frames (seq), neither is a false replay');
  assert.equal(live.xp, 300); assert.equal(recon.xp, 300);
  assert.equal(canonicalSave(recon), canonicalSave(live));
});

test('a poisoned ledger (forged + tampered + replay) reconstructs to the SAME state as the clean ledger', async () => {
  const idb = createMockIndexedDB();
  const db = await openKestrelDB(idb, 'FALLOS_TEST_C');
  await putGenome(db, { ...genome(), id: ID });
  const live = await playAndExhale(db, [{ grant: 'hatch' }, { grant: 'memory' }, { skin: 'forest' }, { grant: 'skin' }]);
  const clean = await wakeFromLedger(db);
  assert.equal(clean.rejectedTotal, 0);

  const realFrames = await getLedger(db);
  // forged: a valid-looking frame with a random (wrong) signature
  const forged = (() => { const r = new Uint8Array(WIRE); const p = packEvent(encodeGrant(zoneIndexById('treasury'), 999)); r[0] = DIDY_SOURCE; r.set(p, 1); for (let i = 0; i < SIG; i++) r[1 + PAYLOAD + i] = (i * 13 + 1) & 0xFF; return r; })();
  // tampered: a real frame with a payload byte flipped after signing (sig no longer matches → dropped as forged)
  const tampered = realFrames[1].slice(); tampered[3] = (tampered[3] + 1) & 0xFF;
  // replay: a verbatim copy of a real frame (same nonce → caught by the replay store)
  const replayed = realFrames[0].slice();

  const poisoned = await wakeFromLedger(db, [forged, tampered, replayed]);
  assert.ok(poisoned.rejectedTotal >= 3, 'all three poison frames are rejected on inhale');
  assert.ok((poisoned.rejected.forged || 0) >= 2, 'the forged + tampered frames fail verify-before-parse');
  assert.ok((poisoned.rejected.replay || 0) >= 1, 'the verbatim copy is caught as a replay');
  assert.equal(canonicalSave(poisoned.save), canonicalSave(clean.save), 'a corrupt shadow fold cannot corrupt the Didy');
  assert.equal(canonicalSave(poisoned.save), canonicalSave(live));
});

test('the gate enforces budget and unknown sources', async () => {
  // over-budget: a tight lattice rejects a seed whose fact count exceeds maxBudget
  const over = signFrame(encodeSeed(500, 0));
  const tight = { keys: { [DIDY_SOURCE]: publicKey }, lattice: { [DIDY_SOURCE]: { maxBudget: 100, resources: 0xFF } }, seen: replayStore(16), verify };
  const r1 = await gatedSurvivors([over], tight);
  assert.equal(r1.survivors.length, 0); assert.equal(r1.rejected['budget-exceeded'], 1);
  // unknown source: a frame signed under a sourceId the ctx holds no key for
  const r2 = await gatedSurvivors([signFrame(encodeGrant(1, 0))], { keys: {}, lattice: {}, seen: replayStore(16), verify });
  assert.equal(r2.survivors.length, 0); assert.equal(r2.rejected['unknown-source'], 1);
});

test('skin is last-wins across the ledger', async () => {
  const idb = createMockIndexedDB();
  const db = await openKestrelDB(idb, 'FALLOS_TEST_D');
  await putGenome(db, { ...genome(), id: ID });
  const live = await playAndExhale(db, [{ grant: 'hatch' }, { skin: 'ember' }, { skin: 'gold' }, { skin: 'slate' }, { grant: 'skin' }]);
  const { save: recon } = await wakeFromLedger(db);
  assert.equal(live.skin, 'slate'); assert.equal(recon.skin, 'slate');
  assert.equal(canonicalSave(recon), canonicalSave(live));
});

test('canonicalSave and the readers are total on garbage (never throw)', () => {
  assert.equal(typeof canonicalSave(null), 'string');
  assert.equal(typeof canonicalSave(undefined), 'string');
  assert.equal(typeof canonicalSave({ caps: 'nope', done: 7, level: 'x' }), 'string');
  assert.deepEqual(reduceProgress(null, null, null).caps, []);
  assert.deepEqual(reduceProgress([new Uint8Array(3), 'junk', null], zoneTable, SKIN_ORDER).caps, []);
});

// ── exact-output assertions: the byte-identical test alone can't catch a mutation that hits both sides equally ────
const DEFAULT_SAVE = '{"caps":[],"done":[],"facts":0,"id":null,"kard":null,"level":0,"skin":"aurora","xp":0}';
test('canonicalSave projects each field exactly (kills the save-guard mutants)', () => {
  assert.equal(canonicalSave(null), DEFAULT_SAVE);
  assert.equal(canonicalSave(undefined), DEFAULT_SAVE);
  assert.equal(canonicalSave(5), DEFAULT_SAVE);                               // non-object → defaults
  assert.equal(canonicalSave({ id: 123 }), DEFAULT_SAVE);                     // non-string id → null
  assert.equal(canonicalSave({ done: 'ab' }), DEFAULT_SAVE);                  // non-object done → []
  assert.equal(canonicalSave({ kard: 'str' }), DEFAULT_SAVE);                 // non-object kard → null
  assert.equal(canonicalSave({ id: 'x', skin: '' }), '{"caps":[],"done":[],"facts":0,"id":"x","kard":null,"level":0,"skin":"aurora","xp":0}'); // empty skin → aurora
  assert.equal(canonicalSave({ facts: 7 }), '{"caps":[],"done":[],"facts":7,"id":null,"kard":null,"level":0,"skin":"aurora","xp":0}'); // facts fallback
  assert.equal(
    canonicalSave({ id: 'abc', level: 3, xp: 600, caps: ['identity', 'memory'], done: { hatch: true, memory: true }, skin: 'ember', seededStats: { facts: 9 }, kard: { z: 1, a: 'x' } }),
    '{"caps":["identity","memory"],"done":["hatch","memory"],"facts":9,"id":"abc","kard":"{\\"a\\":\\"x\\",\\"z\\":1}","level":3,"skin":"ember","xp":600}',
  );
  // seededStats present overrides the facts fallback
  assert.equal(canonicalSave({ seededStats: { facts: 9 }, facts: 3 }), '{"caps":[],"done":[],"facts":9,"id":null,"kard":null,"level":0,"skin":"aurora","xp":0}');
});

test('stable serializes every type exactly, with sorted object keys (kills the stable mutants)', () => {
  assert.equal(stable(null), 'null');
  assert.equal(stable(undefined), 'null');
  assert.equal(stable(5), '5');
  assert.equal(stable(true), 'true');
  assert.equal(stable(false), 'false');
  assert.equal(stable('x'), '"x"');
  assert.equal(stable([1, 'a']), '[1,"a"]');
  assert.equal(stable({ b: 2, a: 1 }), '{"a":1,"b":2}');       // sorted, not insertion order
  assert.equal(stable({ n: null, s: 'y' }), '{"n":null,"s":"y"}');
});

test('reduceProgress: defaults, out-of-range targets, bad zone entries, skin bounds, level is max', () => {
  // empty skin table → skin defaults to aurora (kills skins[0] || 'aurora')
  assert.equal(reduceProgress([], zoneTable, []).skin, 'aurora');
  // a GRANT to a target with no zone is ignored (no xp, no cap)
  const g15 = packEvent(encodeGrant(15, 0));
  assert.equal(reduceProgress([g15], zoneTable, SKIN_ORDER).xp, 0);
  // a malformed zone entry (missing cap) is skipped
  assert.equal(reduceProgress([packEvent(encodeGrant(0, 0))], [{ id: 'x' }], SKIN_ORDER).xp, 0);
  assert.deepEqual(reduceProgress([packEvent(encodeGrant(0, 0))], [{ id: 'x', cap: 'c', lvl: 0 }], SKIN_ORDER).caps, ['c']);
  // a SKIN to an out-of-range index leaves the skin unchanged; a valid one sets it
  assert.equal(reduceProgress([packEvent(encodeSkin(10, 0))], zoneTable, SKIN_ORDER).skin, 'aurora');
  assert.equal(reduceProgress([packEvent(encodeSkin(1, 0))], zoneTable, SKIN_ORDER).skin, 'ember');
  // level is the MAX of granted zone lvls — a later lower-lvl grant does not lower it
  const hi = packEvent(encodeGrant(zoneIndexById('treasury'), 0)); // lvl 7
  const lo = packEvent(encodeGrant(zoneIndexById('memory'), 1));   // lvl 1
  assert.equal(reduceProgress([hi, lo], zoneTable, SKIN_ORDER).level, 7);
});

test('the gate rejects every malformed frame with the right reason (every check step is live)', async () => {
  const ctx = () => ctxOf();
  // bad-length: a Uint8Array of the wrong length (not WIRE) — must be bad-length, not forged
  const r1 = await gatedSurvivors([new Uint8Array(10)], ctx());
  assert.equal(r1.rejected['bad-length'], 1); assert.equal(r1.survivors.length, 0);
  // non-Uint8Array garbage
  const r1b = await gatedSurvivors(['nope', null, 42], ctx());
  assert.equal(r1b.rejected['bad-length'], 3);
  // off-κ: a valid signature over a payload whose κ-witness byte is wrong → verify passes, unpack rejects
  const badK = packEvent(encodeGrant(1, 0)).slice(); badK[5] = (badK[5] + 1) & 0xFF;
  const r2 = await gatedSurvivors([signRaw(badK)], ctx());
  assert.equal(r2.rejected['off-kappa'], 1);
  // source-mismatch: the packet's inner source (2) differs from the wire sourceId (0)
  const mism = pack({ opcode: 3, source: 2, target: 1, resources: 0, budget: 0 });
  const r3 = await gatedSurvivors([signRaw(mism, DIDY_SOURCE)], ctx());
  assert.equal(r3.rejected['source-mismatch'], 1);
  // no-capability: the lattice entry for the source is a non-object (truthy) → distinguishes || from &&
  const r4 = await gatedSurvivors([signFrame(encodeGrant(1, 1))], { keys: { [DIDY_SOURCE]: publicKey }, lattice: { [DIDY_SOURCE]: 5 }, seen: replayStore(16), verify });
  assert.equal(r4.rejected['no-capability'], 1);
  // resource-denied: a resources bit the lattice does not grant
  const seedWithRes = signFrame(encodeSeed(10, 1)); // resources = seq&0xFF = 1
  const r5 = await gatedSurvivors([seedWithRes], { keys: { [DIDY_SOURCE]: publicKey }, lattice: { [DIDY_SOURCE]: { maxBudget: 65535, resources: 0x00 } }, seen: replayStore(16), verify });
  assert.equal(r5.rejected['resource-denied'], 1);
  // budget boundary: budget EXACTLY equal to maxBudget passes (kills > → >=)
  const atCap = signFrame(encodeSeed(100, 0)); // budget 100
  const r6 = await gatedSurvivors([atCap], { keys: { [DIDY_SOURCE]: publicKey }, lattice: { [DIDY_SOURCE]: { maxBudget: 100, resources: 0xFF } }, seen: replayStore(16), verify });
  assert.equal(r6.survivors.length, 1); assert.equal(r6.rejectedTotal, 0);
  // and one over the cap is rejected
  const overCap = signFrame(encodeSeed(101, 0));
  const r7 = await gatedSurvivors([overCap], { keys: { [DIDY_SOURCE]: publicKey }, lattice: { [DIDY_SOURCE]: { maxBudget: 100, resources: 0xFF } }, seen: replayStore(16), verify });
  assert.equal(r7.rejected['budget-exceeded'], 1);
  // a missing verify function drops everything as forged (never parses)
  const r8 = await gatedSurvivors([signFrame(encodeGrant(1, 0))], { keys: { [DIDY_SOURCE]: publicKey }, lattice: { [DIDY_SOURCE]: { maxBudget: 65535, resources: 0xFF } }, seen: replayStore(16) });
  assert.equal(r8.rejected['forged'], 1);
});

test('the ctx/keys/lattice/seen normalizers reject anything that is not a proper object', async () => {
  const good = signFrame(encodeGrant(1, 0));
  // ctx that is truthy but NOT a plain object (a function carrying the real fields) must be ignored → nothing passes
  const fnCtx = Object.assign(() => {}, ctxOf());
  assert.equal((await gatedSurvivors([good], fnCtx)).survivors.length, 0, 'a function ctx is not an object → no keys → nothing verifies');
  // keys that is a function carrying [0]=pub must be ignored → unknown-source
  const kf = Object.assign(() => {}, { [DIDY_SOURCE]: publicKey });
  assert.equal((await gatedSurvivors([good], { keys: kf, lattice: { [DIDY_SOURCE]: { maxBudget: 65535, resources: 0xFF } }, seen: replayStore(8), verify })).rejected['unknown-source'], 1);
  // lattice that is a function carrying [0]=cap must be ignored → no-capability
  const lf = Object.assign(() => {}, { [DIDY_SOURCE]: { maxBudget: 65535, resources: 0xFF } });
  assert.equal((await gatedSurvivors([good], { keys: { [DIDY_SOURCE]: publicKey }, lattice: lf, seen: replayStore(8), verify })).rejected['no-capability'], 1);
  // a "seen" that lacks has/add is treated as null (no replay store), so the frame still passes and nothing throws
  const s1 = await gatedSurvivors([good], { keys: { [DIDY_SOURCE]: publicKey }, lattice: { [DIDY_SOURCE]: { maxBudget: 65535, resources: 0xFF } }, seen: {}, verify });
  assert.equal(s1.survivors.length, 1);
  const s2 = await gatedSurvivors([good], { keys: { [DIDY_SOURCE]: publicKey }, lattice: { [DIDY_SOURCE]: { maxBudget: 65535, resources: 0xFF } }, seen: { has: () => false }, verify });
  assert.equal(s2.survivors.length, 1);
});

test('reduceProgress guards: a null zone entry is skipped, an empty-string skin name is ignored', () => {
  // a zoneTable with null at the granted index must be skipped, not throw
  assert.equal(reduceProgress([packEvent(encodeGrant(0, 0))], [null], SKIN_ORDER).xp, 0);
  // an empty-string skin name must NOT be adopted (the skin stays the default)
  assert.equal(reduceProgress([packEvent(encodeSkin(0, 0))], zoneTable, ['']).skin, 'aurora');
});

test('zone-ledger-map stays aligned with its invariants', () => {
  assert.equal(ZONE_LEDGER.length, 11);
  assert.equal(zoneIndexById('hatch'), 0);
  assert.equal(zoneIndexById('mesh'), 10);
  assert.equal(zoneIndexById('nope'), -1);
  assert.equal(SKIN_ORDER[0], 'aurora');
  assert.equal(skinIndex('gold'), 4);
  assert.equal(skinIndex('unknown'), 0);
});

test('ZONE_LEDGER order is identical to game.mjs ZONES (the ledger indices cannot drift from the game)', () => {
  const src = readFileSync(new URL('./game.mjs', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('const ZONES = ['), src.indexOf('];', src.indexOf('const ZONES = [')));
  const gameIds = [...block.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(gameIds, ZONE_LEDGER.map((z) => z.id), 'game.mjs ZONES order must match zone-ledger-map.ZONE_LEDGER');
  // the skins the game offers must match SKIN_ORDER in order (the ledger stores skin by index)
  const skinBlock = src.slice(src.indexOf('const SKINS = {'), src.indexOf('};', src.indexOf('const SKINS = {')));
  const gameSkins = [...skinBlock.matchAll(/([a-z]+):\s*\[/g)].map((m) => m[1]);
  assert.deepEqual(gameSkins, SKIN_ORDER.slice(), 'game.mjs SKINS order must match SKIN_ORDER');
});

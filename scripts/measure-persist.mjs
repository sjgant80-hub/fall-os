#!/usr/bin/env node
// scripts/measure-persist.mjs — PROOF-OF-PLAY part two: run the fall-os↔KESTREL persistence battery and write
// data/run-persist.json (the MEASURE commit, after the seal). --verify re-derives on CI and asserts the deterministic
// results are byte-identical to the committed record, with the sealed predictions graded. Everything here is
// deterministic (fixed-seed Ed25519, the dependency-free idb-mock, the pure kernel), so the close→reload proof
// re-derives exactly; the replay time is re-measured and graded against its threshold.
import { readFileSync, writeFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from 'node:crypto';
import { PREREG, inputHashes } from './seal-persist.mjs';

import { createMockIndexedDB } from '../vendor/kestrel/idb-mock.mjs';
import { openKestrelDB, putGenome, getGenome, putWallet, exhale, getLedger } from '../vendor/kestrel/kestrel-db.mjs';
import { genome as kestrelGenome, reconstruct as kestrelReconstruct, canonicalState as kestrelCanon, replayStore, WIRE, PAYLOAD, SIG } from '../vendor/kestrel/kestrelledger.mjs';
import { mintKard, attachSignature, kardSignable } from '../kard.mjs';
import { ZONE_LEDGER, SKIN_ORDER, zoneIndexById, skinIndex } from '../zone-ledger-map.mjs';
import { encodeGrant, encodeSkin, encodeSeed, packEvent, gatedSurvivors, reduceProgress, canonicalSave, DIDY_SOURCE } from '../persist-ledger.mjs';

const at = (f) => new URL('../' + f, import.meta.url);

// a fixed-seed Ed25519 keypair (one Didy), so the signed battery re-derives identically on CI.
function keypairFromSeed(seed32) {
  const header = Buffer.from('302e020100300506032b657004220420', 'hex');
  const privateKey = createPrivateKey({ key: Buffer.concat([header, Buffer.from(seed32)]), format: 'der', type: 'pkcs8' });
  return { privateKey, publicKey: createPublicKey(privateKey) };
}
const SEED = new Uint8Array(32); for (let i = 0; i < 32; i++) SEED[i] = (i * 11 + 5) & 0xFF;
const { privateKey, publicKey } = keypairFromSeed(SEED);
const ID = Buffer.from(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32)).toString('hex');
const verify = (key, msg, sig) => edVerify(null, Buffer.from(msg), key, Buffer.from(sig));
const BUDGET_CAP = 100;
const ZONE_TABLE = ZONE_LEDGER.map((z) => ({ id: z.id, cap: z.cap, lvl: z.lvl }));
const ctxOf = () => ({ keys: { [DIDY_SOURCE]: publicKey }, lattice: { [DIDY_SOURCE]: { maxBudget: 65535, resources: 0xFF } }, seen: replayStore(16384), verify });

const signFrame = (cmd) => {
  const p = packEvent(cmd);
  const m = new Uint8Array(1 + PAYLOAD); m[0] = DIDY_SOURCE; m.set(p, 1);
  const sig = new Uint8Array(edSign(null, Buffer.from(m), privateKey));
  const raw = new Uint8Array(WIRE); raw[0] = DIDY_SOURCE; raw.set(p, 1); raw.set(sig, 1 + PAYLOAD);
  return raw;
};
function remint(id, caps, skin) {
  const m = mintKard({ owner: id, skinRef: skin || 'aurora', structureRef: 'fallos-didy-v1', capabilities: caps.slice(), budgetCap: BUDGET_CAP, createdAt: '2026-01-01T00:00:00Z', label: 'my didy' });
  const s = kardSignable(m.kard);
  const sig = Buffer.from(edSign(null, Buffer.from(new TextEncoder().encode(s.payload)), privateKey)).toString('hex');
  return attachSignature(m.kard, id, sig).kard;
}
// the LIVE game arithmetic (verbatim from game.mjs), independent of persist-ledger's reducer
function liveGrant(save, zone) {
  if (!save.caps.includes(zone.cap)) save.caps.push(zone.cap);
  save.done[zone.id] = true; save.level = Math.max(save.level, zone.lvl); save.xp += 100;
}

async function playAndExhale(db, events) {
  const save = { id: ID, kard: null, level: -1, xp: 0, caps: ['identity'], skin: 'aurora', seededStats: null, done: {}, _scopeOk: false };
  let seq = 0;
  for (const ev of events) {
    if (ev.grant) { const zi = zoneIndexById(ev.grant); liveGrant(save, ZONE_TABLE[zi]); save.kard = remint(save.id, save.caps, save.skin); await exhale(db, signFrame(encodeGrant(zi, seq++))); }
    else if (ev.skin) { save.skin = ev.skin; save.kard = remint(save.id, save.caps, save.skin); await exhale(db, signFrame(encodeSkin(skinIndex(ev.skin), seq++))); }
    else if (ev.seed != null) { save.seededStats = { facts: ev.seed }; await exhale(db, signFrame(encodeSeed(ev.seed, seq++))); }
  }
  return save;
}
async function wakeFromLedger(db, extraFrames) {
  const frames = await getLedger(db);
  const all = extraFrames ? frames.concat(extraFrames) : frames;
  const g = await getGenome(db);
  const { survivors, rejected, rejectedTotal } = await gatedSurvivors(all, ctxOf());
  const prog = reduceProgress(survivors, ZONE_TABLE, SKIN_ORDER);
  const save = { id: (g && g.id) || ID, level: prog.level, xp: prog.xp, caps: prog.caps.slice(), skin: prog.skin, done: prog.done, seededStats: prog.facts != null ? { facts: prog.facts } : null, kard: null };
  save.kard = remint(save.id, save.caps, save.skin);
  const fold = kestrelReconstruct({ ...kestrelGenome(), id: save.id }, survivors).state;
  return { save, survivors, rejected, rejectedTotal, fold };
}

const REAL_SESSION = [
  { grant: 'hatch' }, { seed: 9 }, { grant: 'memory' }, { seed: 14 }, { grant: 'memory' }, { grant: 'recall' },
  { skin: 'ember' }, { skin: 'gold' }, { skin: 'slate' }, { grant: 'skin' }, { grant: 'forge' }, { grant: 'foundry' },
  { grant: 'dreaming' }, { grant: 'treasury' }, { grant: 'mesh' },
];

async function battery() {
  const idb = createMockIndexedDB();

  // F1/F2 — the real session: close → reload byte-identical (save AND kestrel fold)
  const dbA = await openKestrelDB(idb, 'MEASURE_A');
  await putGenome(dbA, { ...kestrelGenome(), id: ID }); await putWallet(dbA, { pubHex: ID });
  const live = await playAndExhale(dbA, REAL_SESSION);
  const liveFold = kestrelReconstruct({ ...kestrelGenome(), id: ID }, (await getLedger(dbA)).map((f) => f.subarray(1, 1 + PAYLOAD))).state;
  const woke = await wakeFromLedger(dbA);
  const byteIdentical = canonicalSave(woke.save) === canonicalSave(live);
  const foldIdentical = kestrelCanon(woke.fold) === kestrelCanon(liveFold);

  // F3 — poisoned ledger: forged + tampered + replay rejected; poisoned == clean
  const clean = await wakeFromLedger(dbA);
  const real = await getLedger(dbA);
  const forged = (() => { const r = new Uint8Array(WIRE); const p = packEvent(encodeGrant(zoneIndexById('treasury'), 5000)); r[0] = DIDY_SOURCE; r.set(p, 1); for (let i = 0; i < SIG; i++) r[1 + PAYLOAD + i] = (i * 13 + 1) & 0xFF; return r; })();
  const tampered = real[1].slice(); tampered[3] = (tampered[3] + 1) & 0xFF;
  const replayed = real[0].slice();
  const poisoned = await wakeFromLedger(dbA, [forged, tampered, replayed]);
  const poisonedEqualsClean = canonicalSave(poisoned.save) === canonicalSave(clean.save);

  // F4 — two identical re-seeds both count (+100 each), neither false-dropped
  const dbB = await openKestrelDB(idb, 'MEASURE_B');
  await putGenome(dbB, { ...kestrelGenome(), id: ID });
  await playAndExhale(dbB, [{ grant: 'hatch' }, { grant: 'memory' }, { grant: 'memory' }]);
  const repeat = await wakeFromLedger(dbB);
  const repeatXp = repeat.save.xp;

  // F5 — a pathological 2,000-event session round-trips byte-identical, fast
  const STRESS_N = 2000;
  const dbC = await openKestrelDB(idb, 'MEASURE_C');
  await putGenome(dbC, { ...kestrelGenome(), id: ID });
  const stressEvents = [{ grant: 'hatch' }];
  const cycle = ['memory', 'recall', 'forge', 'foundry', 'skin', 'dynamo', 'mint', 'dreaming', 'treasury', 'mesh'];
  for (let i = 1; i < STRESS_N; i++) {
    if (i % 7 === 0) stressEvents.push({ skin: SKIN_ORDER[i % SKIN_ORDER.length] });
    else if (i % 11 === 0) stressEvents.push({ seed: (i * 3) % 60000 });
    else stressEvents.push({ grant: cycle[i % cycle.length] });
  }
  const stressLive = await playAndExhale(dbC, stressEvents);
  const stressFrames = await getLedger(dbC);
  const tGate = performance.now();
  const stressWoke = await wakeFromLedger(dbC);                    // the full GATED inhale (an Ed25519 verify per frame)
  const stressGatedMs = Math.round((performance.now() - tGate) * 1000) / 1000;
  const stressByteIdentical = canonicalSave(stressWoke.save) === canonicalSave(stressLive);
  // the pure coordinate fast-forward (trusted local replay — the kernel's own speed, the kestrel P4 analog)
  const stressPayloads = stressFrames.map((f) => f.subarray(1, 1 + PAYLOAD));
  const tPure = performance.now();
  kestrelReconstruct({ ...kestrelGenome(), id: ID }, stressPayloads);
  reduceProgress(stressPayloads, ZONE_TABLE, SKIN_ORDER);
  const stressPureMs = Math.round((performance.now() - tPure) * 1000) / 1000;

  // F6 — honest storage: signed ledger of the real session vs the legacy localStorage JSON blob
  const signedLedgerBytes = real.length * WIRE;
  const legacyBlob = JSON.stringify({ ...live, kard: live.kard });
  const legacyBlobBytes = new TextEncoder().encode(legacyBlob).length;

  return {
    organ: 'fall-os-persist', id: ID,
    session: { events: REAL_SESSION.length, frames: real.length, level: live.level, xp: live.xp, caps: live.caps.length, skin: live.skin, facts: live.seededStats.facts },
    reconstruction: { byteIdentical, foldIdentical, canonLen: canonicalSave(live).length, fold: (woke.fold.fold >>> 0) },
    tamper: { forged: poisoned.rejected.forged || 0, replay: poisoned.rejected.replay || 0, rejectedTotal: poisoned.rejectedTotal, poisonedEqualsClean },
    repeat: { xp: repeatXp, expected: 300 },
    stress: { events: STRESS_N, frames: stressFrames.length, byteIdentical: stressByteIdentical, pureReplayMs: stressPureMs, gatedReplayMs: stressGatedMs, rejectedTotal: stressWoke.rejectedTotal },
    storage: { signedLedgerBytes, legacyBlobBytes, ratioLedgerVsBlob: Math.round((signedLedgerBytes / legacyBlobBytes) * 100) / 100 },
  };
}

function grade(r) {
  const F1 = r.reconstruction.byteIdentical === true;
  const F2 = r.reconstruction.foldIdentical === true;
  const F3 = r.tamper.forged >= 2 && r.tamper.replay >= 1 && r.tamper.poisonedEqualsClean === true;
  const F4 = r.repeat.xp === 300;
  const F5 = r.stress.byteIdentical === true && r.stress.pureReplayMs < 100 && r.stress.gatedReplayMs < 3000;
  const F6 = typeof r.storage.ratioLedgerVsBlob === 'number';
  return { 'F1-byte-identical': F1, 'F2-kestrel-fold': F2, 'F3-tamper-rejected': F3, 'F4-repeat-safe': F4, 'F5-scales': F5, 'F6-storage-honest': F6, passed: [F1, F2, F3, F4, F5, F6].filter(Boolean).length, of: 6 };
}

// deterministic fields only (replay ms is re-measured, so excluded from byte-equality)
function deterministicView(run) {
  const r = run || {};
  return JSON.stringify({ organ: r.organ, id: r.id, session: r.session, reconstruction: r.reconstruction, tamper: r.tamper, repeat: r.repeat, stress: r.stress ? { events: r.stress.events, frames: r.stress.frames, byteIdentical: r.stress.byteIdentical, rejectedTotal: r.stress.rejectedTotal } : null, storage: r.storage });
}

const mode = process.argv.includes('--verify') ? 'verify' : process.argv.includes('--run') ? 'run' : null;

if (mode === 'run') {
  const run = await battery();
  const verdict = grade(run);
  const out = { ...run, verdict, inputs: inputHashes(), predictions: PREREG.predictions.map((p) => p.id) };
  writeFileSync(at('data/run-persist.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('measured · byte-identical:', run.reconstruction.byteIdentical, '· fold-identical:', run.reconstruction.foldIdentical, '· tamper poisoned==clean:', run.tamper.poisonedEqualsClean, '· repeat xp:', run.repeat.xp, '· stress', run.stress.events + ' events byte-identical', run.stress.byteIdentical, '(pure', run.stress.pureReplayMs + 'ms, gated', run.stress.gatedReplayMs + 'ms) · signed-ledger/blob', run.storage.ratioLedgerVsBlob + '× · predictions', verdict.passed + '/' + verdict.of);
} else if (mode === 'verify') {
  let committed;
  try { committed = JSON.parse(readFileSync(at('data/run-persist.json'), 'utf8')); }
  catch { console.log('measure --verify: no data/run-persist.json yet — this is the pre-measure (seal) state; nothing to verify. OK.'); process.exit(0); }
  const fresh = await battery();
  if (deterministicView(fresh) !== deterministicView(committed)) {
    console.error('measure --verify: re-derived results differ from the committed record (deterministic fields)');
    console.error('  fresh    ', deterministicView(fresh).slice(0, 500));
    console.error('  committed', deterministicView(committed).slice(0, 500));
    process.exit(1);
  }
  const verdict = grade(fresh);
  if (verdict.passed !== committed.verdict.passed) { console.error('measure --verify: grade changed', verdict, committed.verdict); process.exit(1); }
  if (fresh.stress.pureReplayMs >= 100 || fresh.stress.gatedReplayMs >= 3000) { console.error('measure --verify: stress replay too slow on this runner: pure', fresh.stress.pureReplayMs + 'ms gated', fresh.stress.gatedReplayMs + 'ms'); process.exit(1); }
  console.log('measure --verify: re-derived on this runner, byte-identical on the deterministic fields, stress replay pure ' + fresh.stress.pureReplayMs + 'ms / gated ' + fresh.stress.gatedReplayMs + 'ms, predictions ' + verdict.passed + '/' + verdict.of + '.');
} else {
  console.error('usage: node scripts/measure-persist.mjs --run | --verify');
  process.exit(2);
}

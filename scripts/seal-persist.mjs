#!/usr/bin/env node
// scripts/seal-persist.mjs — PROOF-OF-PLAY part one for the fall-os↔KESTREL wiring: pin the predictions AND the
// sha256 of every input that determines the result, as this build's OWN pushed commit, BEFORE the measurement. The
// claim ("a fall-os session's state survives close→reload byte-identical via the signed ledger, offline, and a
// poisoned ledger cannot corrupt it") is a CLAIM until the record proves the predictions predated the result.
//   node scripts/seal-persist.mjs --seal    write data/prereg-persist.json (predictions + input hashes)
//   node scripts/seal-persist.mjs --check    verify the inputs still hash to what the seal pinned (exit 1 on drift)
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const at = (f) => new URL('../' + f, import.meta.url);
// Hash EOL-NORMALIZED content (CRLF/CR → LF), so the seal pins the CONTENT, not the line endings. On Windows with
// core.autocrlf=true the working tree is CRLF while git stores LF; CI (Linux) checks out LF. Normalizing here makes
// the pinned hash identical on both, so a pure line-ending difference never reads as sealed-code drift. The vendored
// kernels are LF, so normalization is a no-op on them and they still match kestrel-ledger's own raw-LF seal pin.
const sha256 = (f) => createHash('sha256').update(Buffer.from(readFileSync(at(f), 'utf8').replace(/\r\n?/g, '\n'), 'utf8')).digest('hex');

// everything that determines the measured result: the wiring layer, the zone map, the vendored codec+kernel, the
// kard kernel it re-mints through, the one estate hash, and the measurement battery itself.
export const INPUTS = [
  'persist-ledger.mjs', 'zone-ledger-map.mjs',
  'vendor/kestrel/sentinel.mjs', 'vendor/kestrel/kestrelledger.mjs', 'vendor/kestrel/kestrel-db.mjs', 'vendor/kestrel/idb-mock.mjs',
  'kard.mjs', 'organs/estate.mjs', 'scripts/measure-persist.mjs',
];

// the vendored codec + kernel are pinned to KESTREL-LEDGER's sealed MEASURE commit; these are the authoritative hashes.
export const VENDOR_PIN = {
  commit: '4e6e506bfc8228b30fcdcc514e0b649d6663c424',
  repo: 'sjgant80-hub/kestrel-ledger',
  'vendor/kestrel/sentinel.mjs': '81f05c11fa98c72e7119f3b8166d2cf4ff10cdeccaa1ae0d711367d778944440',
  'vendor/kestrel/kestrelledger.mjs': '8d3b7d0173a0e6aef2c77e663aab83f6c3418ae396a87eba5867f2db369acd37',
};

export const PREREG = {
  organ: 'fall-os ⟵ kestrel-ledger (live persistence wiring)',
  what: 'fall-os (the crown PWA game) now persists through the KESTREL shadow fold: every real state change exhales a signed 6-byte Primorial-Fold packet into IndexedDB before the UI repaints; on boot the game inhales — reads the Didy\'s DNA + keypair, gate-replays the ledger, and reconstructs the exact save it closed in. No cloud. Predictions + input hashes committed as their OWN commit BEFORE the measurement (seal-before-measure, public record); re-derived on CI from the sealed inputs.',
  sealed: '2026-10-05',
  vendor: 'KESTREL-LEDGER kernel + IndexedDB adapter vendored verbatim at commit ' + VENDOR_PIN.commit + ' (sha256-pinned). Codec = Thomas Frumkin\'s Konomi / LIGHT primorial fold (used with permission); gate + bounded store = SENTINEL.',
  predictions: [
    { id: 'F1-byte-identical', claim: 'A scripted fall-os session (hatch, two re-seeds, memory, recall, three skin changes, forge, foundry, treasury, two soon-tier grants) exhaled into the ledger, then RAM dropped (an abrupt close) and the node woken ONLY from the ledger, reconstructs a save that is BYTE-IDENTICAL to the pre-close save — identity, level, xp, earned caps in earn order, completed zones, chosen skin, seed fact count, AND the signed kard (deterministic Ed25519 over the deterministic mint).', pass_if: 'canonicalSave(reconstructed) === canonicalSave(live)' },
    { id: 'F2-kestrel-fold', claim: 'The vendored KESTREL canonicalState (its rolling integrity fold over the applied packets) also re-derives identically across the close→reload — the wiring rides the proven kernel, it does not reimplement it.', pass_if: 'kestrelCanon(reconstructed) === kestrelCanon(live)' },
    { id: 'F3-tamper-rejected', claim: 'A forged packet (random signature), a tampered-payload packet, and a replayed (verbatim-copied) packet, all sitting in the ledger, are REJECTED on inhale by SENTINEL\'s verify-before-parse Ed25519 gate — so a poisoned ledger reconstructs to the SAME save as the clean ledger. A corrupt shadow fold cannot corrupt the Didy.', pass_if: 'forged+tampered+replay all rejected AND canonicalSave(poisoned) === canonicalSave(clean)' },
    { id: 'F4-repeat-safe', claim: 'Two identical events (re-seeding twice, each a real +100 xp) are distinct frames (a monotonic seq makes every legit frame unique), so neither is false-dropped as a replay — xp reconstructs to 300, not 200. Determinism of Ed25519 does not collapse legitimate repeats.', pass_if: 'reconstructed xp after hatch + two memory grants === 300' },
    { id: 'F5-scales', claim: 'Even a pathological 2,000-event session (far beyond any real ~15-event play) round-trips BYTE-IDENTICAL. The 6-byte coordinate fast-forward (trusted local replay) is well under 100ms; the fully-GATED inhale (an Ed25519 verify per frame) stays under 3s for 2,000 frames (~1ms/frame — a real session is sub-10ms). We report both honestly: the coordinate is cheap; the per-frame signature verification is the real, irreducible cost.', pass_if: 'stress byteIdentical === true AND pureReplayMs < 100 AND gatedReplayMs < 3000' },
    { id: 'F6-storage-honest', claim: 'The fully-signed ledger of a real session (71-byte frames) is compared honestly to the legacy single localStorage JSON save blob. We do NOT predict a big win: the 64-byte Ed25519 signature per frame dominates, so the signed ledger is of the same order as (and may exceed) the JSON blob. The ledger\'s value is crash-safe append-only durability + tamper-rejection, not byte savings. Reported, not graded as a win.', pass_if: 'ratios reported (not asserted as a saving)' },
  ],
};

export function inputHashes() {
  const out = {};
  for (const f of INPUTS) out[f] = sha256(f);
  return out;
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] || '').href;
const mode = isMain ? (process.argv.includes('--check') ? 'check' : process.argv.includes('--seal') ? 'seal' : null) : 'skip';

if (mode === 'seal') {
  const prereg = { ...PREREG, vendorPin: VENDOR_PIN, inputs: inputHashes() };
  writeFileSync(at('data/prereg-persist.json'), JSON.stringify(prereg, null, 2) + '\n');
  console.log('sealed · inputs pinned:');
  for (const [f, h] of Object.entries(prereg.inputs)) console.log('  ' + f.padEnd(34) + h);
} else if (mode === 'check') {
  let prereg;
  try { prereg = JSON.parse(readFileSync(at('data/prereg-persist.json'), 'utf8')); }
  catch { console.error('seal --check: data/prereg-persist.json missing or unreadable — not sealed'); process.exit(1); }
  if (!prereg.inputs) { console.error('seal --check: prereg has no input hashes — re-seal'); process.exit(1); }
  const now = inputHashes();
  let drift = 0;
  for (const f of INPUTS) {
    if (now[f] !== prereg.inputs[f]) { console.error('  DRIFT ' + f + '\n    sealed ' + prereg.inputs[f] + '\n    now    ' + now[f]); drift += 1; }
  }
  // the vendored codec + kernel must still match the KESTREL seal pin
  for (const f of ['vendor/kestrel/sentinel.mjs', 'vendor/kestrel/kestrelledger.mjs']) {
    if (now[f] !== VENDOR_PIN[f]) { console.error('  VENDOR DRIFT ' + f + ' no longer matches the kestrel-ledger pin ' + VENDOR_PIN[f]); drift += 1; }
  }
  if (drift) { console.error('seal --check: ' + drift + ' input(s) drifted from the seal — the measurement is no longer about the sealed code'); process.exit(1); }
  console.log('seal --check: all ' + INPUTS.length + ' inputs match the seal; vendored codec+kernel match the kestrel-ledger pin.');
}

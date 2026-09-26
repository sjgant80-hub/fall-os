import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sha256, canon, mintKard, kardSignable, attachSignature, verifyKard, spendGate, canOpen,
  KARD_KIND, MAX_CAPS, MAX_REF, MAX_LABEL,
} from './kard.mjs';

const OWNER = 'ab'.repeat(32);          // 64-hex = a 32-byte Ed25519 pubkey
const SIG = 'cd'.repeat(64);            // 128-hex = a 64-byte Ed25519 signature
function input(over = {}) {
  return {
    owner: OWNER,
    skinRef: 'skin:neon-brutalist@1',
    structureRef: 'struct:workspace@1',
    capabilities: ['render:structure', 'load:memory'],
    budgetCap: 100,
    createdAt: '2026-09-26T00:00:00Z',
    ...over,
  };
}
const mint = (over) => mintKard(input(over)).kard;

test('sha256 matches FIPS-180 known answers (pins the algorithm, not just determinism)', () => {
  assert.equal(sha256('').hash, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256('abc').hash, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256(5).ok, false);
});
test('canon sorts keys', () => {
  assert.equal(canon({ b: 1, a: 2 }), canon({ a: 2, b: 1 }));
  assert.notEqual(canon({ a: 1 }), canon({ a: 2 }));
});

// ── mintKard ───────────────────────────────────────────────────────────────────────────────────
test('mintKard produces a self-hashed kard of the right kind', () => {
  const r = mintKard(input());
  assert.equal(r.ok, true);
  assert.equal(r.kard.kind, KARD_KIND);
  assert.equal(r.kard.owner, OWNER);
  assert.match(r.kard.hash, /^[0-9a-f]{64}$/);
  assert.equal(r.kard.label, '');
});
test('mintKard refuses every malformed input', () => {
  assert.equal(mintKard(null).ok, false);
  assert.equal(mintKard(input({ owner: 'xyz' })).ok, false);          // non-hex
  assert.equal(mintKard(input({ owner: 'ab' })).ok, false);           // too short
  assert.equal(mintKard(input({ owner: 'abc' })).ok, false);          // odd length
  assert.equal(mintKard(input({ skinRef: '' })).ok, false);
  assert.equal(mintKard(input({ skinRef: 'x'.repeat(MAX_REF + 1) })).ok, false);
  assert.equal(mintKard(input({ structureRef: '   ' })).ok, false);
  assert.equal(mintKard(input({ capabilities: 'x' })).ok, false);
  assert.equal(mintKard(input({ capabilities: [''] })).ok, false);
  assert.equal(mintKard(input({ capabilities: ['a', 'a'] })).ok, false);
  assert.equal(mintKard(input({ budgetCap: 'lots' })).ok, false);
  assert.equal(mintKard(input({ budgetCap: -1 })).ok, false);
  assert.equal(mintKard(input({ createdAt: '' })).ok, false);
  assert.equal(mintKard(input({ label: 5 })).ok, false);
  assert.equal(mintKard(input({ label: 'x'.repeat(MAX_LABEL + 1) })).ok, false);
});
test('mintKard accepts inputs EXACTLY at the limits (boundary is > not >=)', () => {
  assert.equal(mintKard(input({ capabilities: Array.from({ length: MAX_CAPS }, (_, i) => 'c' + i) })).ok, true);
  assert.equal(mintKard(input({ skinRef: 's'.repeat(MAX_REF) })).ok, true);
  assert.equal(mintKard(input({ label: 'x'.repeat(MAX_LABEL) })).ok, true);
  assert.equal(mintKard(input({ budgetCap: 0 })).ok, true); // zero budget is legal (a read-only node)
  assert.equal(mintKard(input({ capabilities: [] })).ok, true);
});

// ── kardSignable ─────────────────────────────────────────────────────────────────────────────────
test('kardSignable strips only the signature and is deterministic', () => {
  const k = mint();
  const signed = { ...k, signature: { alg: 'Ed25519', pub: OWNER, sig: SIG } };
  const a = kardSignable(k), b = kardSignable(signed);
  assert.equal(a.ok, true);
  assert.equal(a.payload, b.payload);
  assert.equal(kardSignable({}).ok, false);
  assert.equal(kardSignable({ kind: KARD_KIND }).ok, false); // no hash
});

// ── attachSignature (self-sovereign: signer must be the owner) ─────────────────────────────────────
test('attachSignature binds the owner Ed25519 signature', () => {
  const r = attachSignature(mint(), OWNER, SIG);
  assert.equal(r.ok, true);
  assert.equal(r.kard.signature.pub, OWNER);
  assert.equal(r.kard.signature.sig, SIG);
});
test('attachSignature refuses a key that is not the kard owner (self-sovereign invariant)', () => {
  const r = attachSignature(mint(), 'ff'.repeat(32), SIG);
  assert.equal(r.ok, false);
  assert.match(r.why, /owner/);
});
test('attachSignature refuses a malformed key or signature', () => {
  assert.equal(attachSignature(mint(), 'zz', SIG).ok, false);           // bad pub
  assert.equal(attachSignature(mint(), OWNER, 'cd').ok, false);         // sig wrong length
  assert.equal(attachSignature(mint(), OWNER, 'cd'.repeat(63)).ok, false);
  assert.equal(attachSignature({}, OWNER, SIG).ok, false);              // not a kard
});

// ── verifyKard ─────────────────────────────────────────────────────────────────────────────────
test('verifyKard: intact kard is valid; signed flag reflects the signature', () => {
  const v = verifyKard(mint());
  assert.equal(v.valid, true);
  assert.equal(v.signed, false);
  const signed = attachSignature(mint(), OWNER, SIG).kard;
  const vs = verifyKard(signed);
  assert.equal(vs.valid, true);
  assert.equal(vs.signed, true);
  assert.equal(vs.owner, OWNER);
});
test('verifyKard catches a tampered kard (any field edit)', () => {
  const k = mint();
  assert.equal(verifyKard({ ...k, budgetCap: 999999 }).valid, false);
  assert.equal(verifyKard({ ...k, skinRef: 'skin:hacked' }).valid, false);
});
test('verifyKard catches a signature whose key is not the owner', () => {
  const k = mint();
  const forged = { ...k, signature: { alg: 'Ed25519', pub: 'ff'.repeat(32), sig: SIG } };
  assert.equal(verifyKard(forged).valid, false);
});
test('verifyKard rejects a signature block with the wrong alg (even if the key is the owner)', () => {
  const k = mint();
  const wrongAlg = { ...k, signature: { alg: 'RSA', pub: OWNER, sig: SIG } };
  assert.equal(verifyKard(wrongAlg).valid, false);
});
test('verifyKard refuses non-kards', () => {
  assert.equal(verifyKard({}).ok, false);
  assert.equal(verifyKard({ kind: KARD_KIND }).ok, false);
});

// ── spendGate — the uncrossable budget wall ──────────────────────────────────────────────────────
test('spendGate allows spend up to and INCLUDING the cap, refuses past it (boundary)', () => {
  const k = mint({ budgetCap: 100 });
  assert.equal(spendGate(k, 0, 100).allowed, true);      // exactly at cap ⇒ allowed
  assert.equal(spendGate(k, 0, 100).remaining, 0);
  assert.equal(spendGate(k, 0, 101).allowed, false);     // one past ⇒ refused
  assert.equal(spendGate(k, 60, 40).allowed, true);      // 100 total ⇒ allowed
  assert.equal(spendGate(k, 60, 41).allowed, false);     // 101 total ⇒ refused
  assert.equal(spendGate(k, 60, 41).remaining, 40);      // remaining reported off priorSpent
});
test('spendGate reports remaining correctly within budget', () => {
  const r = spendGate(mint({ budgetCap: 100 }), 30, 20);
  assert.equal(r.allowed, true);
  assert.equal(r.remaining, 50);
});
test('spendGate refuses a spend against a tampered (invalid) kard', () => {
  const k = mint({ budgetCap: 100 });
  const tampered = { ...k, budgetCap: 1000000 }; // raise the ceiling → hash mismatch → invalid
  assert.equal(spendGate(tampered, 0, 500).allowed, false);
});
test('spendGate rejects malformed / non-finite spend numbers', () => {
  const k = mint();
  assert.equal(spendGate(k, -1, 10).ok, false);
  assert.equal(spendGate(k, 0, -5).ok, false);
  assert.equal(spendGate(k, 'a', 10).ok, false);
  assert.equal(spendGate(k, Infinity, 1).ok, false);
  assert.equal(spendGate(k, 0, NaN).ok, false);
});
test('spendGate treats 0 spend / 0 cost as within budget (lower boundary)', () => {
  const k = mint({ budgetCap: 100 });
  assert.equal(spendGate(k, 0, 0).allowed, true);
  assert.equal(spendGate(k, 100, 0).allowed, true); // cost 0 exactly at the cap
  assert.equal(spendGate(k, 100, 0).remaining, 0);
});

// ── validator edges (isPub/isSig exact, isNum finite) + totality on null ───────────────────────────
test('mintKard rejects a non-string / wrong-length / non-hex owner (isPub is exact 64-hex)', () => {
  assert.equal(mintKard(input({ owner: 123 })).ok, false);            // non-string
  assert.equal(mintKard(input({ owner: 'a'.repeat(62) })).ok, false);  // too short
  assert.equal(mintKard(input({ owner: 'a'.repeat(66) })).ok, false);  // too long
  assert.equal(mintKard(input({ owner: 'Z'.repeat(64) })).ok, false);  // 64 chars but non-hex
});
test('mintKard rejects NaN / Infinity budgetCap (isNum requires finite)', () => {
  assert.equal(mintKard(input({ budgetCap: NaN })).ok, false);
  assert.equal(mintKard(input({ budgetCap: Infinity })).ok, false);
});
test('attachSignature rejects a non-string / wrong-length pub or sig', () => {
  assert.equal(attachSignature(mint(), 123, SIG).ok, false);           // non-string pub
  assert.equal(attachSignature(mint(), 'Z'.repeat(64), SIG).ok, false); // 64 non-hex pub
  assert.equal(attachSignature(mint(), OWNER, 123).ok, false);         // non-string sig
  assert.equal(attachSignature(mint(), OWNER, 'cd'.repeat(65)).ok, false); // sig too long (130)
});
test('verify / sign / spend / open stay TOTAL on null and wrong-kind (never throw)', () => {
  assert.equal(verifyKard(null).ok, false);
  assert.equal(kardSignable(null).ok, false);
  assert.equal(spendGate(null, 0, 1).ok, false);
  assert.equal(canOpen(null, { capabilities: [] }).ok, false);
  assert.equal(verifyKard({ kind: 'other', hash: 'abcd' }).ok, false);   // wrong kind but has a hash
  assert.equal(kardSignable({ kind: 'other', hash: 'abcd' }).ok, false);
});

// ── canOpen ──────────────────────────────────────────────────────────────────────────────────────
test('canOpen: a node with the required capabilities can instantiate; missing caps are named', () => {
  const k = mint({ capabilities: ['render:structure', 'load:memory'] });
  const ok = canOpen(k, { capabilities: ['render:structure', 'load:memory', 'net:none'] });
  assert.equal(ok.canOpen, true);
  assert.equal(ok.skinRef, 'skin:neon-brutalist@1');
  const no = canOpen(k, { capabilities: ['render:structure'] });
  assert.equal(no.canOpen, false);
  assert.deepEqual(no.missing, ['load:memory']);
});
test('canOpen refuses an invalid kard or a malformed node', () => {
  const tampered = { ...mint(), skinRef: 'x' };
  assert.equal(canOpen(tampered, { capabilities: [] }).canOpen, false);
  assert.equal(canOpen(mint(), null).ok, false);
  assert.equal(canOpen(mint(), { capabilities: 'x' }).ok, false);
});

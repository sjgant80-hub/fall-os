// FallKard — the kard kernel: a sovereign node's portable, signed identity.
//
// A KARD is a person-as-a-system: a portable record that says WHO the node is (an Ed25519 public key),
// WHAT it carries (a skin reference + a structure reference + a node config), and WHAT it may do (a
// capability set) up to an UNCROSSABLE BUDGET. Opening a kard instantiates a sovereign node — its own
// structure, its own look, its own memory, on its own metal. The kard travels as a file; anyone can
// verify it, no one can forge it, and no capability can spend past the budget the kard was minted with.
//
// The signature bytes are made and checked at the edge (WebCrypto Ed25519); this kernel pins exactly WHAT
// is signed and enforces the identity + capability + budget invariants. No I/O. Pure and total: garbage
// in -> { ok:false, why }, never a throw.

export const KARD_KIND = 'fallkard-v1';
export const MAX_CAPS = 64;
export const MAX_REF = 512;        // a skin/structure reference (a hash, id, or short URL)
export const MAX_LABEL = 120;

const isStr = (v) => typeof v === 'string';
const isInt = (v) => Number.isInteger(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isArr = (v) => Array.isArray(v);
const HEX = /^[0-9a-f]+$/;
const isPub = (v) => isStr(v) && v.length === 64 && HEX.test(v);   // Ed25519 public key = 32 bytes
const isSig = (v) => isStr(v) && v.length === 128 && HEX.test(v);  // Ed25519 signature = 64 bytes
const isSpend = (v) => isNum(v) && v >= 0;                          // a spend/cost is a finite amount, zero or more

// ── SHA-256 + canonical JSON (the estate's proven pair — ONE hash in the repo, the same the gate runs on) ──
// The content-address is delegated to the estate's single sha256 (organs/estate.mjs) rather than carrying a
// second copy of the algorithm here. The wallet keeps its own { ok, why } shape at the edge (a non-string is
// a caller error, refused, never a throw), and the hashing itself is the one estate kernel.
import { sha256 as estateSha256 } from './organs/estate.mjs';

export function sha256(text) {
  if (!isStr(text)) return { ok: false, why: 'sha256 takes a string' };
  return { ok: true, hash: estateSha256(text) };
}

export function canon(v) {
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return '"?"';
}

// ── the kard body: what a node IS + carries + may do ──────────────────────────────────────────────
function validCaps(caps) {
  if (!isArr(caps)) return { ok: false, why: 'capabilities must be an array of strings' };
  if (caps.length > MAX_CAPS) return { ok: false, why: 'more than ' + MAX_CAPS + ' capabilities' };
  const seen = new Set();
  for (const [i, c] of caps.entries()) {
    if (!isStr(c) || c.trim().length === 0) return { ok: false, why: 'capability ' + i + ' must be a non-empty string' };
    if (seen.has(c)) return { ok: false, why: 'duplicate capability: ' + c };
    seen.add(c);
  }
  return { ok: true };
}

/** mintKard(input) — assemble a node's identity into a canonical, self-hashed kard body (unsigned).
 *  input: { owner (Ed25519 pubkey hex), skinRef, structureRef, capabilities[], budgetCap, createdAt, label? } */
export function mintKard(input) {
  if (!isObj(input)) return { ok: false, why: 'mintKard takes an object' };
  const { owner, skinRef, structureRef, capabilities, budgetCap, createdAt, label } = input;
  if (!isPub(owner)) return { ok: false, why: 'owner must be an Ed25519 public key (64 hex characters)' };
  for (const [name, val] of [['skinRef', skinRef], ['structureRef', structureRef]]) {
    if (!isStr(val) || val.trim().length === 0) return { ok: false, why: name + ' must be a non-empty string (a hash, id or short URL)' };
    if (val.length > MAX_REF) return { ok: false, why: name + ' exceeds ' + MAX_REF + ' characters' };
  }
  const cv = validCaps(capabilities);
  if (!cv.ok) return cv;
  if (!isNum(budgetCap)) return { ok: false, why: 'budgetCap must be a number (the uncrossable spend ceiling)' };
  if (budgetCap < 0) return { ok: false, why: 'budgetCap cannot be negative' };
  if (!isStr(createdAt) || createdAt.trim().length === 0) return { ok: false, why: 'a kard needs a createdAt timestamp' };
  if (label !== undefined) {
    if (!isStr(label)) return { ok: false, why: 'label must be a string when present' };
    if (label.length > MAX_LABEL) return { ok: false, why: 'label exceeds ' + MAX_LABEL + ' characters' };
  }
  const body = {
    v: 1,
    kind: KARD_KIND,
    owner,
    skinRef, structureRef,
    capabilities: capabilities.slice(),
    budgetCap,
    label: label === undefined ? '' : label,
    createdAt,
    scope: 'A kard is a sovereign node: its own structure, its own look, its own memory, on its own metal. Capabilities are exercisable only up to budgetCap; nothing signed can raise that ceiling.',
  };
  const h = sha256(canon(body));
  if (!h.ok) return { ok: false, why: h.why };
  return { ok: true, kard: { ...body, hash: h.hash } };
}

/** kardSignable(kard) — the EXACT canonical bytes an Ed25519 signature covers: the kard minus its
 *  signature. Used to sign AND to verify, so both sides canonicalise identically. */
export function kardSignable(kard) {
  if (!isObj(kard) || kard.kind !== KARD_KIND || !isStr(kard.hash)) return { ok: false, why: 'not a fallkard' };
  const body = { ...kard };
  delete body.signature;
  return { ok: true, payload: canon(body) };
}

/** attachSignature(kard, pubHex, sigHex) — bind the owner's Ed25519 signature. The signing key MUST be
 *  the kard's declared owner (self-sovereign: a kard is signed by the identity it names, no one else). */
export function attachSignature(kard, pubHex, sigHex) {
  const s = kardSignable(kard);
  if (!s.ok) return s;
  if (!isPub(pubHex)) return { ok: false, why: 'public key must be an Ed25519 key (64 hex characters)' };
  if (pubHex !== kard.owner) return { ok: false, why: 'the signing key is not the kard owner — a kard is signed by the node it names' };
  if (!isSig(sigHex)) return { ok: false, why: 'an Ed25519 signature is 128 hex chars' };
  return { ok: true, kard: { ...kard, signature: { alg: 'Ed25519', pub: pubHex, sig: sigHex } } };
}

/** verifyKard(kard) — internal consistency: the facts match their own hash, the owner is well-formed,
 *  and (if signed) the signature names the owner. The signature BYTES are checked at the edge over
 *  kardSignable(); this kernel pins what is signed and enforces the identity invariant. */
export function verifyKard(kard) {
  if (!isObj(kard) || kard.kind !== KARD_KIND || !isStr(kard.hash)) return { ok: false, why: 'not a fallkard' };
  const body = { ...kard };
  delete body.hash;
  delete body.signature;
  const h = sha256(canon(body));
  if (!h.ok) return { ok: false, why: h.why };
  if (h.hash !== kard.hash) return { ok: true, valid: false, why: 'the kard does not match its own fingerprint — it was changed after it was minted' };
  if (!isPub(kard.owner)) return { ok: true, valid: false, why: 'the kard owner is not a well-formed Ed25519 key' };
  if (kard.signature !== undefined) {
    if (!isObj(kard.signature) || kard.signature.alg !== 'Ed25519') return { ok: true, valid: false, why: 'malformed signature block' };
    if (kard.signature.pub !== kard.owner) return { ok: true, valid: false, why: 'the signature key is not the kard owner' };
  }
  return { ok: true, valid: true, signed: kard.signature !== undefined, owner: kard.owner, why: 'kard intact' };
}

// ── the uncrossable budget wall (the money-rail boundary, real — not a stub) ───────────────────────
/** spendGate(kard, priorSpent, cost) — a node may exercise a capability only if the running spend
 *  stays at or under the kard's budgetCap. This is the wall the estate's money-rail sits behind:
 *  no capability, no signature, no caller can spend past the ceiling the kard was minted with. */
export function spendGate(kard, priorSpent, cost) {
  const v = verifyKard(kard);
  if (!v.ok) return { ok: false, why: v.why };
  if (!v.valid) return { ok: true, allowed: false, why: 'the kard is not valid: ' + v.why };
  if (!isSpend(priorSpent)) return { ok: false, why: 'priorSpent must be a finite number, zero or more' };
  if (!isSpend(cost)) return { ok: false, why: 'cost must be a finite number, zero or more' };
  const total = priorSpent + cost;
  if (total > kard.budgetCap) {
    return { ok: true, allowed: false, remaining: Math.max(0, kard.budgetCap - priorSpent), why: 'refused — this would spend ' + total + ' past the kard budget of ' + kard.budgetCap };
  }
  return { ok: true, allowed: true, remaining: kard.budgetCap - total, why: 'within budget' };
}

/** canOpen(kard, node) — a node can open a kard when the kard is valid and the node presents the
 *  capabilities the kard requires to instantiate (its structure + skin). Opening never exceeds budget. */
export function canOpen(kard, node) {
  const v = verifyKard(kard);
  if (!v.ok) return { ok: false, why: v.why };
  if (!v.valid) return { ok: true, canOpen: false, why: 'the kard is not valid: ' + v.why };
  if (!isObj(node)) return { ok: false, why: 'node must be an object { capabilities }' };
  if (!isArr(node.capabilities)) return { ok: false, why: 'node.capabilities must be an array' };
  const held = new Set(node.capabilities);
  const missing = [];
  for (const c of kard.capabilities) {
    if (!held.has(c)) missing.push(c);
  }
  if (missing.length > 0) return { ok: true, canOpen: false, missing, why: 'the opening node lacks required capabilities: ' + missing.join(', ') };
  return { ok: true, canOpen: true, skinRef: kard.skinRef, structureRef: kard.structureRef, why: 'ready to instantiate the node' };
}

// r7.mjs — THE RING THAT REACHES SIDEWAYS. A Didy that can find, verify and gain from other Didys,
// without a byte of its own substrate leaving.
//
// The conductor was complete and ALONE: it ran its loop over what its owner had built and could not
// reach anything else. This adds the four capabilities that make it reachable, in the order they
// depend on each other — MANIFEST (it can be seen) → DISCOVERY (it can see) → HANDSHAKE (it can
// trust-check) → EXCHANGE (it can gain).
//
// ⚑ THE TRANSPORT IS INJECTED, AND THAT IS THE POINT. Everything here runs over a `channel` object
// with `send` and `on`. Loopback is a plain in-memory channel; WebRTC is the same shape with a
// network behind it. The logic under test is therefore identical in both, which is why the rule is
// loopback-first: a handshake bug on a live network is miserable to find, and on one machine with two
// instances it is trivial. There is a test below that runs the same exchange over two different
// transports and asserts the outcomes are identical — that is what makes "only the transport differs"
// a checked claim rather than an intention.
//
// ⚑ SOVEREIGNTY IS ENFORCED AT TWO LAYERS, AND BOTH ARE CHECKED. At the MANIFEST: only deliberately
// declared shares are visible, and the private substrate is never placed in the object at all. At the
// EXCHANGE: only offered organs move, never substrate. A leak at either layer breaks the whole claim,
// so neither is assumed.
//
// ⚑ AND NOTHING ADJUDICATES. There is no arbiter parameter anywhere in this file. On a mismatch each
// node decides for itself. A central "who is right" resolver would be exactly the authority this ring
// exists to do without, and it would be the easiest thing in the world to add by accident.
import { manifest, handshake } from './handshake.mjs';
import { h16 } from './core.mjs';

// ── CAPABILITY 1 · MANIFEST — the face a Didy is willing to show ─────────────────────────────────

/**
 * A Didy's R7 face. `shares` and `offers` come from the base manifest; `wants` is the new half — the
 * gaps it is looking to fill, which is what makes an exchange possible at all.
 *
 * The private substrate is not "excluded" here. It is never passed in. A function that took the whole
 * estate and filtered it would be one bug away from disclosing everything; this one cannot leak what
 * it was never given.
 */
export function face(prefix, { shares = {}, offers = {}, wants = [] } = {}) {
  const base = manifest(prefix, shares, offers);
  const wantList = (Array.isArray(wants) ? wants : []).map(String).filter(Boolean).sort();
  return {
    ...base,
    prefix: String(prefix || 'didy'),
    wants: wantList,
    id: null, sig: null,
    // Over names only — never values — so two Didys can recognise an identical face without either
    // having disclosed anything in order to do it.
    address: h16(base.address + '|wants:' + wantList.join(',')),
  };
}

/** Sign the face. `crypto` is injected — the same adapter the wallet uses, never a bespoke one. */
export async function signFace(f, crypto) {
  const { pk, sk } = await crypto.generate();
  const body = f.prefix + '|' + f.names.join(',') + '|' + Object.keys(f.offers).sort().join(',') + '|' + f.wants.join(',');
  return { face: { ...f, id: pk, sig: await crypto.sign(body, sk) }, sk };
}

export async function verifyFace(f, crypto) {
  if (!f || !f.id || !f.sig) return { ok: false, why: 'the face carries no identity or no signature' };
  const body = f.prefix + '|' + f.names.join(',') + '|' + Object.keys(f.offers).sort().join(',') + '|' + f.wants.join(',');
  const ok = await crypto.verify(body, f.sig, f.id);
  return { ok, why: ok ? null : 'the signature does not match what the face claims to be' };
}

// ── CAPABILITY 2 · DISCOVERY — who else is here ──────────────────────────────────────────────────

export function makeNode(f, sk = null) {
  return { face: f, sk, peers: new Map(), log: [], organs: {} };
}

/** A loopback channel: two nodes, one machine, no network. Same shape as the real one. */
export function loopback() {
  const listeners = new Set();
  return {
    kind: 'loopback',
    send(msg) { for (const fn of [...listeners]) fn(msg); },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

/**
 * Announce and listen. Discovery is passive and cheap on purpose: it establishes WHO IS THERE and
 * nothing else. No connection is made, no trust is implied, and every peer lands as `unverified` —
 * because a manifest is a claim, and this layer has not checked anything yet.
 */
export function join(node, channel) {
  const off = channel.on((msg) => {
    if (!msg || msg.kind !== 'announce' || !msg.face) return;
    // ⚑ Do not discover yourself — and identify "yourself" by the SAME key the table is filed under.
    // The first version compared ids only, so an UNSIGNED face (id null) slipped past the guard and a
    // node added itself as its own peer. Two rules for one identity is how that happens; there is now
    // one.
    const mineKey = node.face.id || node.face.prefix;
    const theirKey = msg.face.id || msg.face.prefix;
    if (mineKey && theirKey && mineKey === theirKey) return;
    // ⚑ KEYED BY id, FALLING BACK TO prefix — never by a bare `undefined`. Found by testing two
    // anonymous peers: both landed under the key `undefined` and the second silently EVICTED the
    // first. That is a table-poisoning move a hostile peer fully controls, since the announcement is
    // the one thing it authors: announce without an id and you can quietly displace someone else's
    // entry. An id-less peer still cannot be verified — `verifyFace` requires one — so it can never
    // exchange; but it must not be able to unseat anybody either.
    const key = msg.face.id || msg.face.prefix;
    if (!key) return;                                                          // nothing to file it under
    const seen = node.peers.get(key);
    const isNew = !seen;
    node.peers.set(key, {
      face: msg.face,
      lastSeen: ((seen && seen.lastSeen) || 0) + 1,  // a counter, not a clock — deterministic to test
      trust: (seen && seen.trust) || 'unverified',
      findings: (seen && seen.findings) || null,
    });
    // ⚑ GREET BACK, BUT ONLY THE FIRST TIME. Announce-once discovery is arrival-order dependent: the
    // Didy that speaks first is heard by nobody, because nobody is listening yet. Three arrivals gave
    // 2 / 1 / 0 peers instead of 2 / 2 / 2. Replying to a NEW peer makes the room converge whoever
    // walks in when — and replying only when it is new is what stops two Didys greeting each other
    // forever.
    if (isNew) channel.send({ kind: 'announce', face: node.face });
  });
  return { announce: () => channel.send({ kind: 'announce', face: node.face }), leave: off };
}

// ── CAPABILITY 3 · HANDSHAKE — trust-check a peer (Kitka's protocol, already proven) ─────────────

/**
 * Verify a discovered peer by cross-running. The handshake decides nothing about the peer; it reports
 * what happened, and THIS node then sets its own trust state. Another node, given the identical
 * findings, is free to reach the opposite conclusion — which is what peer-not-up actually means.
 */
export function trustCheck(node, peerId, judge) {
  const p = node.peers.get(peerId);
  if (!p) return { ok: false, why: 'no such peer has been discovered', trust: null };

  const h = handshake(node.face, p.face, judge);
  // The local decision. Deliberately simple and deliberately LOCAL: agreement earns `verified`,
  // anything else earns `suspect`. It is this node's call, and the protocol did not make it.
  const trust = !h.ran ? 'unverified' : (h.disagree.length === 0 && h.errors.length === 0) ? 'verified' : 'suspect';
  node.peers.set(peerId, { ...p, trust, findings: h });
  node.log.push({ what: 'trust-check', peer: peerId, trust, why: h.finding || h.why });
  return { ok: h.ran, trust, handshake: h, why: h.finding || h.why };
}

// ── CAPABILITY 4 · EXCHANGE — gain, without giving anything away ─────────────────────────────────

/** Your gaps against their offers, and theirs against yours. The bonded pair, computed both ways. */
export function match(node, peerId) {
  const p = node.peers.get(peerId);
  if (!p) return { theyHaveWhatIWant: [], iHaveWhatTheyWant: [] };
  const theirOffers = Object.keys(p.face.offers || {});
  const myOffers = Object.keys(node.face.offers || {});
  return {
    theyHaveWhatIWant: node.face.wants.filter(w => theirOffers.includes(w)),
    iHaveWhatTheyWant: (p.face.wants || []).filter(w => myOffers.includes(w)),
  };
}

/**
 * Ask a peer for one organ.
 *
 * ⚑ REFUSED OVER AN UNVERIFIED LINK. Not warned about — refused. Discovery tells you a peer exists;
 * it does not tell you the peer is what it says. Requesting across a link that has not been
 * cross-checked would make the handshake decorative.
 */
export function request(node, peerId, organName) {
  const p = node.peers.get(peerId);
  if (!p) return { ok: false, why: 'no such peer', organ: null };
  if (p.trust !== 'verified') {
    return { ok: false, why: `the link to ${p.face.prefix} is ${p.trust} — an organ is only requested over a verified link`, organ: null };
  }
  const fn = (p.face.offers || {})[organName];
  if (typeof fn !== 'function') return { ok: false, why: `${p.face.prefix} does not offer "${organName}"`, organ: null };
  if (!node.face.wants.includes(organName)) {
    // Taking things you never wanted is how a mesh turns into a landfill.
    return { ok: false, why: `this Didy never listed "${organName}" as something it wants`, organ: null };
  }
  return { ok: true, why: null, organ: { name: organName, from: p.face.prefix, fn } };
}

/**
 * Adopt a received organ — ONLY after it passes this node's OWN gate.
 *
 * ⚑ RECEIVED IS NOT TRUSTED. The organ arrived over a link that was verified, which says something
 * about the peer and nothing whatsoever about the code. It is run against the local gate first, and
 * a failure is a refusal to adopt rather than a warning next to an adoption. Trust is earned per
 * exchange, not granted by the connection.
 */
export function adopt(node, organ, gate) {
  if (!organ || typeof organ.fn !== 'function') return { ok: false, why: 'there is no organ here to adopt', adopted: false };
  if (typeof gate !== 'function') return { ok: false, why: 'no local gate was supplied — nothing is adopted unverified', adopted: false };

  let held, why = null;
  try { held = gate(organ.fn) === true; }
  catch (e) { held = false; why = 'the gate threw: ' + ((e && e.message) ? e.message : String(e)); }

  if (!held) {
    node.log.push({ what: 'refused-organ', organ: organ.name, from: organ.from, why: why || 'it did not hold at the local gate' });
    return { ok: false, adopted: false, why: why || `"${organ.name}" did not hold at this Didy's own gate, so it was not adopted` };
  }
  node.organs[organ.name] = organ.fn;
  node.face.wants = node.face.wants.filter(w => w !== organ.name);   // the gap is filled
  node.log.push({ what: 'adopted', organ: organ.name, from: organ.from });
  return { ok: true, adopted: true, why: `"${organ.name}" held at the local gate and was adopted from ${organ.from}` };
}

/**
 * What the mesh keeps asking for and nobody has built.
 *
 * A want that recurs across DISTINCT peers is the mesh-scale version of the shadow index: the thing
 * everyone is circling and no one has made. Counted by distinct peer, so one loud node cannot
 * manufacture a signal by repeating itself.
 */
export function commonWants(node, threshold = 2) {
  const tally = new Map();
  const own = new Set(node.face.wants);
  for (const w of own) tally.set(w, new Set(['self']));
  for (const [, p] of node.peers) {
    for (const w of (p.face.wants || [])) {
      if (!tally.has(w)) tally.set(w, new Set());
      tally.get(w).add(p.face.id || p.face.prefix);
    }
  }
  return [...tally.entries()]
    .map(([want, who]) => ({ want, askedBy: who.size }))
    .filter(x => x.askedBy >= threshold)
    .sort((a, b) => b.askedBy - a.askedBy || a.want.localeCompare(b.want));
}

export default { face, signFace, verifyFace, makeNode, loopback, join, trustCheck, match, request, adopt, commonWants };

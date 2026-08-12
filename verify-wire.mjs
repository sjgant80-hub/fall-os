// verify-wire.mjs — THE HANDSHAKE AS IT MUST BE OVER A REAL WIRE.
//
// ⚑ FOUND BY PHASE 1, AND ONLY BY PHASE 1. The loopback implementation of the handshake passed the
// two functions around as objects, because a same-process channel hands things over by reference. It
// worked, it was gated, and it was quietly wrong: **a function cannot cross a wire.** JSON drops it,
// so the first real WebRTC link produced a face whose `offers` were empty and a handshake that could
// not run at all. Trust came back `unverified` and nothing had misbehaved.
//
// The protocol was never asking for functions to travel. Re-read: "both nodes run BOTH functions on
// the shared values, and exchange — here's your function's result on our shared values; here's mine."
// **The RESULTS travel. The implementations stay home.** That is what makes it trustless: two
// INDEPENDENT implementations of the same named judgement, computed separately, compared.
//
// The local `handshake()` in handshake.mjs is the single-process form and is still correct there.
// This is the networked form, and the difference is not cosmetic — sharing a function object means
// both sides ran the SAME code, which proves nothing about whether they agree.
//
// ⚑ AND NOTHING EXECUTABLE EVER CROSSES. The obvious "fix" would have been to send the function as
// source and eval it at the far end. That is remote code execution from a peer you have not verified
// yet — the exact thing the handshake exists to make unnecessary. Only names, values and numbers move.

const REQ = 'verify-req', RES = 'verify-res';

// ⚑ ONE KEY FOR ONE IDENTITY, EVERYWHERE. This is the third place the same mistake appeared: the
// peer table keys by the id, falling back to the prefix; the self-check compared ids alone; the wire
// protocol addressed by id alone. An unsigned Didy has no id, so messages went to `null` and
// silently matched nobody — a verification that never happened and never complained. Two rules for
// one identity is how that keeps happening, so there is now one, used by every side of the exchange.
const keyOf = (f) => (f && (f.id || f.prefix)) || null;

/**
 * A face that can actually be sent.
 *
 * ⚑ THE SECOND THING PHASE 1 EXPOSED. `manifest()` keeps an offer only when its value is a FUNCTION,
 * which is right in one process and empties the list the moment it is serialised. So a wire face
 * advertises offers as NAMES, each with an optional POINTER to where the thing lives.
 *
 * ⚑ AND THIS IS WHY AN ORGAN MUST NOT TRAVEL AS CODE. The local pub hands over a function reference,
 * which is fine between two objects in one process. Over a wire the equivalent would be shipping
 * source and running it — accepting executable code from a peer, which is precisely the attack that
 * put 341 stealers into a skill marketplace. A verified link says the peer is honest; it says nothing
 * about whether their code is safe, and no amount of handshaking makes running a stranger's code a
 * good idea.
 *
 * So what crosses is a POINTER. The receiver fetches it independently, runs it through its OWN gate,
 * and adopts only if it holds — the same rule as `adopt()`, with the fetch made explicit. The peer is
 * telling you where to look, not handing you something to run.
 */
export function offering(f, offers = {}) {
  const named = {};
  for (const [name, where] of Object.entries(offers)) {
    if (!name) continue;
    named[name] = typeof where === 'string' ? where : true;   // a URL to fetch, or just "I have this"
  }
  return { ...f, offers: named };
}

/** What a peer says it has that this Didy wants — over the wire, where offers are names. */
export function wireMatch(node, peerId) {
  const p = node.peers.get(peerId);
  if (!p) return { theyHaveWhatIWant: [], pointers: {} };
  const theirs = Object.keys(p.face.offers || {});
  const want = (node.face.wants || []).filter(w => theirs.includes(w));
  const pointers = {};
  for (const w of want) {
    const at = p.face.offers[w];
    pointers[w] = typeof at === 'string' ? at : null;
  }
  return {
    theyHaveWhatIWant: want,
    pointers,
    // Said every time, because the temptation to just accept what a verified peer sends is the whole
    // failure mode this design exists to avoid.
    note: 'these are POINTERS, not code. Fetch each one yourself and run it through your own gate before adopting it — a verified peer is not verified code.',
  };
}

/**
 * Answer verification requests. A node must be able to say what it computed, or nobody can check it.
 *
 * `judges` maps a judgement NAME to this node's own implementation. The name is agreed; the code is
 * local and private, and that separation is the entire point.
 */
export function serveVerify(node, channel, judges) {
  return channel.on(async (msg) => {
    if (!msg || msg.kind !== REQ || !msg.to || msg.to !== keyOf(node.face)) return;
    const fn = judges[msg.judge];
    const mine = node.face.shares || {};
    // Only the names the asker also named. Sovereignty holds here exactly as it does locally: a value
    // they did not name is not sent, and a value they named that we do not have simply is not there.
    const shared = (msg.names || []).filter(n => Object.prototype.hasOwnProperty.call(mine, n));
    const onTheirs = run(fn, msg.values || {});
    const ourValues = {};
    for (const n of shared) ourValues[n] = mine[n];
    const onOurs = run(fn, ourValues);
    channel.send({
      kind: RES, to: msg.from, from: keyOf(node.face), judge: msg.judge,
      have: typeof fn === 'function',
      shared, ourValues,
      onYours: onTheirs, onMine: onOurs,
    });
  });
}

function run(fn, values) {
  if (typeof fn !== 'function') return { ok: false, why: 'no implementation of that judgement here' };
  try { return { ok: true, value: fn(values) }; }
  catch (e) { return { ok: false, why: (e && e.message) ? e.message : String(e) }; }
}

/**
 * Ask a peer to verify with us, and compare what came back.
 *
 * Both sides compute over BOTH sets of values, so a disagreement can be attributed rather than merely
 * noticed — and a function that only misbehaves on certain inputs is caught, which agreeing on one
 * dataset alone would miss.
 */
export function askVerify(node, channel, peerId, judge, judges, { timeoutMs = 8000 } = {}) {
  const p = node.peers.get(peerId);
  if (!p) return Promise.resolve({ ok: false, why: 'no such peer has been discovered', trust: null });
  const fn = judges[judge];
  if (typeof fn !== 'function') {
    return Promise.resolve({ ok: false, why: `this Didy has no implementation of "${judge}" — there is nothing to cross-run`, trust: 'unverified' });
  }

  const mine = node.face.shares || {};
  const theirNames = p.face.names || [];
  const shared = Object.keys(mine).filter(n => theirNames.includes(n)).sort();
  const ourValues = {};
  for (const n of shared) ourValues[n] = mine[n];

  return new Promise((resolve) => {
    const done = (r) => { off(); clearTimeout(timer); resolve(r); };
    const timer = setTimeout(() => done({
      ok: false, trust: 'unverified',
      why: `${p.face.prefix} did not answer the verification within ${timeoutMs / 1000}s — silence is not a disagreement, and it is not trust either`,
    }), timeoutMs);

    const off = channel.on((msg) => {
      if (!msg || msg.kind !== RES || msg.to !== keyOf(node.face) || msg.from !== peerId) return;

      const ourOnOurs = run(fn, ourValues);
      const ourOnTheirs = run(fn, msg.ourValues || {});
      const agree = [], disagree = [], errors = [];

      const cmp = (label, ours, theirs) => {
        if (!ours.ok) return errors.push({ over: label, side: 'us', why: ours.why });
        if (!theirs || !theirs.ok) return errors.push({ over: label, side: 'them', why: (theirs && theirs.why) || 'no result' });
        const same = JSON.stringify(ours.value) === JSON.stringify(theirs.value);
        (same ? agree : disagree).push({ over: label, ours: ours.value, theirs: theirs.value });
      };
      cmp('our values', ourOnOurs, msg.onYours);
      cmp('their values', ourOnTheirs, msg.onMine);

      const trust = !msg.have ? 'unverified'
        : (disagree.length === 0 && errors.length === 0) ? 'verified' : 'suspect';
      node.peers.set(peerId, { ...p, trust, findings: { shared, agree, disagree, errors } });
      node.log.push({ what: 'verify-wire', peer: peerId, trust });

      done({
        ok: true, trust, shared, agree, disagree, errors,
        // As ever: it reports, and this node decides. Nothing here adjudicates.
        finding: !msg.have ? `${p.face.prefix} has no implementation of "${judge}" — nothing was cross-run, so nothing is verified`
          : (disagree.length === 0 && errors.length === 0)
            ? `both implementations agree on all ${shared.length} shared value${shared.length === 1 ? '' : 's'}`
            : `${disagree.length} disagreement${disagree.length === 1 ? '' : 's'}${errors.length ? ` and ${errors.length} error${errors.length === 1 ? '' : 's'}` : ''} — this node decides what that means`,
      });
    });

    channel.send({ kind: REQ, to: peerId, from: keyOf(node.face), judge, names: shared, values: ourValues });
  });
}

export default { serveVerify, askVerify };

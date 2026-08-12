// handshake.mjs — HOW TWO DIDYS CONNECT, without either one having to be believed.
//
// The problem, stated without any framework vocabulary: a node cannot trust another node's claim
// about itself. The lazy answer is to appoint someone in the middle who is trusted by everyone — and
// naming that option is what makes rejecting it a choice rather than an oversight. This protocol has
// no middle.
//
// THE MOVE: share the named values you are willing to share, AND the function you want them judged
// by. Both sides run BOTH functions over the values they have in common, then compare. Nobody is
// asked to believe anything; both sides compute the same thing and see whether the answers match.
//
// Three properties fall out of that single exchange, which is why it is one handshake and not three:
//   · SOVEREIGNTY   — only values whose NAMES appear on both sides are ever sent. A value the other
//                     side never named is not withheld by policy; it is never selected in the first
//                     place. The private substrate stays private by construction.
//   · TRUSTLESSNESS — no authority adjudicates. Both sides run both functions and compare results.
//                     Verification replaces belief.
//   · PEER, NOT UP  — A talks to B. On disagreement, each side decides for ITSELF what to do.
//
// ⚑ WHAT THIS DELIBERATELY DOES NOT DO. It does not decide whether a mismatch means the other node is
// hostile, broken, or simply differently configured. That judgement belongs to whoever owns the node,
// and a protocol that made it for them would be the authority this design exists to avoid. The
// protocol VERIFIES; it does not ADJUDICATE. `compare()` therefore returns findings, never a verdict
// about the peer.
import { h16 } from './core.mjs';

/**
 * What a Didy is willing to put on the table.
 *
 * `shares` are named values it will disclose IF the other side names them too. `offers` are the
 * functions it wants its values judged by. Everything else the node holds is simply absent from this
 * object — there is no "private" field to leak, because privates are never placed in the manifest.
 */
export function manifest(name, shares = {}, offers = {}) {
  // Built in sorted key order, so two nodes declaring the same names produce byte-identical objects.
  // Insertion order would make an identical manifest look different depending on how it was written.
  const clean = {};
  for (const k of Object.keys(shares).sort()) if (typeof k === 'string' && k) clean[k] = shares[k];
  const fns = {};
  for (const [k, f] of Object.entries(offers)) if (typeof f === 'function') fns[k] = f;
  const names = Object.keys(clean).sort();
  return {
    name: String(name || 'didy'),
    names,
    shares: clean,
    offers: fns,
    // Content address over the NAMES and the function names — never the values, so two nodes can
    // recognise a repeated handshake without either having disclosed anything to do it.
    address: h16(String(name) + '|' + names.join(',') + '|' + Object.keys(fns).sort().join(',')),
  };
}

/**
 * The names both sides hold — and, said out loud, the names each side is therefore NOT sending.
 *
 * The withheld lists are reported because sovereignty that cannot be observed is indistinguishable
 * from an empty manifest. A node should be able to see exactly what it kept.
 */
export function intersect(a, b) {
  const shared = a.names.filter(n => b.names.includes(n));
  return {
    shared,
    withheldByA: a.names.filter(n => !shared.includes(n)),
    withheldByB: b.names.filter(n => !shared.includes(n)),
  };
}

/** Only the shared names, and nothing else, ever leaves a node. */
export function disclose(m, shared) {
  const out = {};
  for (const n of shared) if (Object.prototype.hasOwnProperty.call(m.shares, n)) out[n] = m.shares[n];
  return out;
}

/**
 * Run one function over the disclosed values, catching whatever it does.
 *
 * A peer's function is untrusted code by definition. If it throws, that is a finding about the
 * function — recorded, and never allowed to abort the handshake, because a peer that crashes on your
 * data must not be able to stop you completing the exchange with anyone else.
 */
export function evaluate(fn, values) {
  try {
    return { ok: true, value: fn(values), why: null };
  } catch (e) {
    return { ok: false, value: null, why: (e && e.message) ? e.message : String(e) };
  }
}

/**
 * THE HANDSHAKE. Both nodes run BOTH functions over the values they share, and the two sets of
 * results are compared name by name.
 *
 * `judge` is the function name both sides are being asked to use. Each side supplies its own
 * implementation under that name; the point is precisely that they may differ.
 */
export function handshake(a, b, judge) {
  const { shared, withheldByA, withheldByB } = intersect(a, b);
  const fromA = disclose(a, shared);
  const fromB = disclose(b, shared);

  const aFn = a.offers[judge], bFn = b.offers[judge];
  const missing = [];
  if (typeof aFn !== 'function') missing.push(a.name);
  if (typeof bFn !== 'function') missing.push(b.name);
  if (missing.length) {
    return {
      shared, withheldByA, withheldByB, judge,
      ran: false,
      why: `${missing.join(' and ')} did not offer a function called "${judge}" — there is nothing to cross-run`,
      results: null, agree: [], disagree: [], errors: [],
    };
  }

  // Each side runs BOTH functions over BOTH disclosed sets. Four results, so a disagreement can be
  // attributed to the function or to the data rather than merely observed.
  const results = {
    aFnOnA: evaluate(aFn, fromA), aFnOnB: evaluate(aFn, fromB),
    bFnOnA: evaluate(bFn, fromA), bFnOnB: evaluate(bFn, fromB),
  };

  const errors = Object.entries(results).filter(([, r]) => !r.ok).map(([k, r]) => ({ run: k, why: r.why }));

  // Do the two functions agree about the same data? That is the question, asked twice — once over
  // A's values and once over B's — because agreeing on one side and not the other is a real and
  // different finding from disagreeing on both.
  const agree = [], disagree = [];
  const cmp = (label, x, y) => {
    if (!x.ok || !y.ok) return;
    const same = JSON.stringify(x.value) === JSON.stringify(y.value);
    (same ? agree : disagree).push({ over: label, byA: x.value, byB: y.value });
  };
  cmp(a.name + "'s values", results.aFnOnA, results.bFnOnA);
  cmp(b.name + "'s values", results.aFnOnB, results.bFnOnB);

  return {
    shared, withheldByA, withheldByB, judge,
    ran: true, why: null,
    disclosedByA: fromA, disclosedByB: fromB,
    results, agree, disagree, errors,
    // Deliberately NOT a verdict about the peer. It states what happened; what to do about it is the
    // node owner's business, and a protocol that decided it would be the authority this avoids.
    finding: disagree.length === 0 && errors.length === 0
      ? `both functions agree on all ${shared.length} shared value${shared.length === 1 ? '' : 's'}`
      : `${disagree.length} disagreement${disagree.length === 1 ? '' : 's'}${errors.length ? ` and ${errors.length} error${errors.length === 1 ? '' : 's'}` : ''} — each node decides for itself what that means`,
  };
}

export default { manifest, intersect, disclose, evaluate, handshake };

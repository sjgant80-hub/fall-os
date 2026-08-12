// pub.mjs — WHERE DIDYS MEET, AND LEAVE BETTER THAN THEY ARRIVED.
//
// The layer above the handshake. Several sovereign Didys turn up in a shared space, say what they can
// do and what they are missing, check each other, and each assembles a build out of what the others
// offered — then everyone goes home to their own machine, improved, still holding their own keys.
//
// ⚑ MANIFESTS COME IN. DATA NEVER DOES. Gerald's repos stay on Gerald's machine; your training
// substrate stays on yours. What meets here is what each Didy CHOSE to offer, cross-verified. "Bring
// your data to the shared pool" is the platform model wearing a friendly coat, and it is the one
// thing this file exists to make impossible: there is no pool. `enter()` takes a node and sends its
// face — there is no parameter through which substrate could travel even by mistake.
//
// ⚑ A PUB, NOT A LANDLORD. The pub holds no authoritative state. It has a roster only so it can
// introduce people, and everything that matters — the peer table, the trust, the adopted organs —
// lives on each node. Close the pub and nobody loses what they gained; nothing was being held for
// them. If it ever becomes a place you must log into that keeps state on everyone's behalf, it has
// become a platform and should be killed.
//
// ⚑ AND IT ADJUDICATES NOTHING. There is no "best build" computed here. Each Didy assembles the build
// IT wants from what IT verified. A central arbiter of the right answer would be the authority the
// whole ring exists to do without.
import { join, trustCheck, match, request, adopt } from './r7.mjs';

/**
 * Open a rendezvous. It is a channel and a roster of who has been seen — nothing else, deliberately.
 *
 * `ephemeral` is not a flag, it is the whole design: `close()` drops the roster and every node keeps
 * everything it gained. There is no persistence to lose.
 */
export function openPub(channel, name = 'the pub') {
  return {
    name: String(name),
    channel,
    roster: new Map(),          // id → prefix, purely so the room can be described
    links: [],                  // a log of who checked whom — the pub's memory of introductions
    closed: false,
  };
}

/**
 * A Didy arrives and says what it can do and what it is missing.
 *
 * The only thing that crosses is the face. There is no argument here for substrate, which is the
 * point: sovereignty enforced by the shape of the call rather than by a promise about how it is used.
 */
export function enter(pub, node) {
  if (pub.closed) return { ok: false, why: `${pub.name} is closed` };
  const link = join(node, pub.channel);
  link.announce();
  pub.roster.set(node.face.id || node.face.prefix, node.face.prefix);
  return { ok: true, why: null, leave: link.leave };
}

/** Who is here, and what they said they can do. Descriptive only — the pub asserts nothing. */
export function room(pub) {
  return [...pub.roster.entries()].map(([id, prefix]) => ({ id, prefix }));
}

/**
 * Everybody checks everybody. Trust is earned pairwise and held per-node — there is no shared
 * reputation, because a shared reputation is a central truth and would need a keeper.
 *
 * A peer that fails its cross-check does not get to collaborate: `request` already refuses over an
 * unverified link, so a Didy that lies is excluded by the same rule that lets an honest one in,
 * rather than by anybody's decision about it.
 */
export function rounds(pub, nodes, judge) {
  const done = [];
  for (const a of nodes) {
    for (const [peerId] of a.peers) {
      const r = trustCheck(a, peerId, judge);
      done.push({ by: a.face.prefix, peer: peerId, trust: r.trust, why: r.why });
    }
  }
  pub.links.push(...done);
  return done;
}

/**
 * Shadow-completion: whose gap meets whose build.
 *
 * Reported from the perspective of each node rather than as one global table, because "who can help
 * me" is a question each Didy answers for itself out of the peers IT has verified.
 */
export function gaps(nodes) {
  const out = [];
  for (const n of nodes) {
    for (const [peerId, p] of n.peers) {
      const m = match(n, peerId);
      for (const want of m.theyHaveWhatIWant) {
        out.push({ wanting: n.face.prefix, want, offeredBy: p.face.prefix, peerId, trust: p.trust });
      }
    }
  }
  return out;
}

/**
 * One Didy assembles the build IT wants.
 *
 * Every organ is requested over a verified link and then run through THIS node's own gate before it
 * is adopted. Received is not trusted: the link being verified says something about the peer and
 * nothing whatever about the code. What is refused is reported alongside what was taken, because a
 * build that hid its refusals would be a worse artefact than one that admitted them.
 */
export function assemble(node, gate) {
  const gained = [], refused = [], unreachable = [];
  // Snapshot the wants: adopting mutates the list, and iterating a list while it shrinks skips items.
  for (const want of [...node.face.wants]) {
    let got = null;
    for (const [peerId, p] of node.peers) {
      if (p.trust !== 'verified') continue;
      const r = request(node, peerId, want);
      if (r.ok) { got = r.organ; break; }
    }
    if (!got) { unreachable.push({ want, why: 'nobody verified here offers it' }); continue; }
    const a = adopt(node, got, gate);
    (a.adopted ? gained : refused).push({ organ: want, from: got.from, why: a.why });
  }
  return {
    who: node.face.prefix,
    gained, refused, unreachable,
    organs: Object.keys(node.organs).sort(),
    // Said plainly. "More complete and cross-verified" is the claim; anything grander would be a
    // story about emergence that the numbers do not support.
    finding: `${node.face.prefix} arrived offering ${Object.keys(node.face.offers).length} and left holding ${Object.keys(node.organs).length} adopted organ${Object.keys(node.organs).length === 1 ? '' : 's'}`
      + (refused.length ? `, having refused ${refused.length} that did not hold at its own gate` : '')
      + (unreachable.length ? `, with ${unreachable.length} gap${unreachable.length === 1 ? '' : 's'} nobody here could fill` : ''),
  };
}

/**
 * Did meeting actually help? Measured, not asserted.
 *
 * `best` is the most any single Didy could offer on its own; `together` is how many distinct organs
 * the room holds between them. The gap between those two numbers is the entire claim, and it is
 * reported as a count rather than a triumph.
 */
export function worthIt(nodes) {
  const alone = nodes.map(n => ({ who: n.face.prefix, had: Object.keys(n.face.offers).length }));
  const best = alone.reduce((m, x) => Math.max(m, x.had), 0);
  const together = new Set();
  for (const n of nodes) {
    for (const k of Object.keys(n.face.offers)) together.add(k);
    for (const k of Object.keys(n.organs)) together.add(k);
  }
  return {
    alone, best, together: together.size, organs: [...together].sort(),
    better: together.size > best,
    // The honest bound, in the output itself so it travels with the number.
    finding: together.size > best
      ? `best on their own: ${best}. between them: ${together.size}. more complete and cross-verified — not a mind that emerged`
      : `no better than the best individual (${best}) — meeting did not help here`,
  };
}

/**
 * Everyone goes home. The roster is dropped; nothing was being held on anyone's behalf.
 *
 * The test that this is a pub and not a platform is exactly this: closing it costs the nodes nothing.
 */
export function close(pub) {
  const had = pub.roster.size;
  pub.roster.clear();
  pub.closed = true;
  return { closed: true, wasHosting: had, kept: 'nothing — every gain went home on the node that made it' };
}

export default { openPub, enter, room, rounds, gaps, assemble, worthIt, close };

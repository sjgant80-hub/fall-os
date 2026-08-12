// walk.mjs — HOW THE CONDUCTOR DECIDES, stated with no framework vocabulary at all.
//
// You are standing at a node. The nodes you can reach each have a worth and a price. Weigh them, take
// the best affordable route, never let the purse go below nothing, and look further than one step
// before you commit. That is the whole rule, and it is the conductor's loop written the way you would
// explain it to someone at a kitchen table.
//
// ⚑ ONE SIGNED AXIS, NOT TWO. A node's worth is a single number that may be positive or negative.
// The obvious-looking design — a reward field and a separate penalty field — is a false split: it
// doubles the branches, invites double-counting, and forces every caller to decide how the two
// combine. Collapsing them removes a whole class of bug rather than handling it.
//
// ⚑ NEVER GO NEGATIVE, AND THE PRICE IS PAID FIRST. This is the load-bearing constraint and it is not
// the same as "the total must come out positive". The cost of reaching a node is paid on arrival,
// before its worth is collected, so a route that dips below nothing on the way is INVALID even when
// its destination is glorious. A plan you cannot afford to begin is not a cheaper plan; it is not a
// plan. This is the same rule the gate applies elsewhere: something unaffordable does not hold,
// whatever its payoff.

/**
 * A node's worth to you, as ONE signed number.
 *
 * `worth` may be negative — some places are worth going to despite costing you, and some are simply
 * bad. `price` is what it costs to arrive and is never negative; a road that pays you to walk it is a
 * worth, not a price, and conflating the two is how the single-axis rule gets quietly undone.
 */
export function node(name, worth = 0, price = 0) {
  return {
    name: String(name),
    worth: Number.isFinite(Number(worth)) ? Number(worth) : 0,
    price: Math.max(0, Number.isFinite(Number(price)) ? Number(price) : 0),
  };
}

/** What arriving here does to the purse: pay the price, then collect the worth. */
export const net = (n) => n.worth - n.price;

/**
 * Can this route be walked from here, with this purse, without ever dipping below nothing?
 *
 * Checked step by step rather than on the total, because the order matters: the price comes off
 * before the worth goes on, at every node.
 */
export function affordable(purse, route) {
  let held = Number(purse);
  if (!Number.isFinite(held)) return { ok: false, at: null, held: 0, why: 'the purse is not a number' };
  for (const n of route) {
    held -= n.price;
    if (held < 0) {
      return { ok: false, at: n.name, held, why: `cannot afford to reach ${n.name} — the price is paid before its worth is collected` };
    }
    held += n.worth;
    if (held < 0) {
      return { ok: false, at: n.name, held, why: `${n.name} takes the purse below nothing` };
    }
  }
  return { ok: true, at: null, held, why: null };
}

/**
 * Every route of at most `depth` steps out from `from`.
 *
 * Enumerated in full rather than greedily, because the point of looking deeper is that the best first
 * step and the best route can differ — a cheap node next door can be the only way to afford the one
 * beyond it. A walk that commits to the best-looking neighbour has not looked deeper; it has looked
 * once, twice.
 */
export function routes(graph, from, depth) {
  const out = [];
  const step = (at, sofar, seen) => {
    if (sofar.length >= depth) return;
    for (const nxt of (graph.edges[at] || [])) {
      if (seen.has(nxt)) continue;                 // a route that revisits a node is a loop, not a plan
      const n = graph.nodes[nxt];
      if (!n) continue;
      const route = [...sofar, n];
      out.push(route);
      step(nxt, route, new Set([...seen, nxt]));
    }
  };
  step(from, [], new Set([from]));
  return out;
}

/**
 * THE WALK. Stand at `from`, look up to `depth` steps out, take the best route you can actually
 * afford — and keep the ones you did not take.
 *
 * The roads not taken are returned rather than discarded, and the unaffordable ones are kept
 * separately from the merely worse: "I chose against it" and "I could not begin it" are different
 * facts about a decision, and a conductor that reported them as one would be hiding the more
 * interesting half.
 */
export function walk(graph, from, { purse = Infinity, depth = 2 } = {}) {
  const all = routes(graph, from, Math.max(1, Math.floor(depth) || 1));
  const priced = all.map(route => {
    const can = affordable(purse, route);
    return {
      route, path: route.map(n => n.name),
      total: route.reduce((s, n) => s + net(n), 0),
      affordable: can.ok, blockedAt: can.at, why: can.why,
    };
  });

  const usable = priced.filter(r => r.affordable).sort((a, b) => b.total - a.total || a.path.length - b.path.length);
  const unaffordable = priced.filter(r => !r.affordable);
  const best = usable[0] || null;

  return {
    from, purse, depth,
    considered: priced.length,
    best,
    // What was weighed and rejected, kept for the shadow index. Two lists, because they are two
    // different things.
    notTaken: usable.slice(1),
    couldNotAfford: unaffordable,
    finding: !best
      ? (priced.length
        ? `nothing affordable from ${from} — ${unaffordable.length} route${unaffordable.length === 1 ? '' : 's'} considered, every one of them out of reach`
        : `nowhere to go from ${from}`)
      : `best affordable route is ${best.path.join(' → ')} at ${best.total}, chosen over ${usable.length - 1} other${usable.length - 1 === 1 ? '' : 's'}${unaffordable.length ? ` (${unaffordable.length} unaffordable)` : ''}`,
  };
}

/**
 * The conductor's step: walk, then hand the decision to whoever owns it.
 *
 * `author` is the person, or a function standing in for one. Without an author nothing is committed —
 * the walk returns a field and the choice stays open. That is the same rule the rest of the estate
 * runs on, and it is why this is a conductor rather than an autopilot.
 */
export function step(graph, from, { purse = Infinity, depth = 2, author = null } = {}) {
  const seen = walk(graph, from, { purse, depth });
  if (!seen.best) return { ...seen, committed: null, why: seen.finding };
  if (typeof author !== 'function') {
    return { ...seen, committed: null, why: 'nothing is committed without an author — the field is open' };
  }
  const chosen = author(seen.best, seen.notTaken);
  // An author may only pick from what was actually offered and affordable. Handing back something
  // else is not a decision, it is a different question, and it is refused rather than honoured.
  const ok = chosen && [seen.best, ...seen.notTaken].some(r => r.path.join('>') === chosen.path.join('>'));
  return {
    ...seen,
    committed: ok ? chosen : null,
    why: ok ? `authored: ${chosen.path.join(' → ')}` : 'the author chose a route that was not on offer, so nothing was committed',
  };
}

export default { node, net, affordable, routes, walk, step };

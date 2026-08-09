// isa.mjs — the Konomi standards kernel. Point it at a plant's tags and it tells you what you have,
// what standard it conforms to, and — the part anyone actually pays for — WHAT DOESN'T MAP.
//
// ══ WHERE THIS CAME FROM ════════════════════════════════════════════════════════════════════════
//
// Thomas built the crosswalk (teslasolar/JEDI · docs/konomi): eight industrial standards, forty-four
// UDTs, and the mappings between them — ISA-88's RUNNING is PackML's EXECUTE, an OPC-UA Variable is a
// Sparkplug Metric, an ISA-95 Equipment is an OPC-UA Object. That is the hard part and it is real
// domain knowledge, not a diagram.
//
// What it did not have was a kernel: the data sat in a page as a JavaScript literal, rendered for
// reading. This makes it answer questions about an actual plant, and gates the answers.
//
// ══ WHAT IT IS FOR ══════════════════════════════════════════════════════════════════════════════
//
// A real plant has thousands of tags named by whoever was standing there in 1998. Nobody knows which
// conform to anything. The useful output is not "here is ISA-95" — everyone has the PDF — it is:
//
//     of your 412 tags, 310 map to a UDT, 102 do not, and here are the 102.
//
// The gap list is the product. A conformance report that only lists what passed is a report that
// tells you nothing you can act on, which is the same failure as a test suite with no red in it.
//
// Pure and deterministic: no clock, no I/O, no network. Tags are passed in — the adapter that reads
// them off a live PLC lives elsewhere, so this stays testable without a plant.

export const VERSION = '1.0.0';

// ── THE STANDARDS ───────────────────────────────────────────────────────────────────────────────
//
// Loaded rather than embedded, so `standards.json` stays the single source and can be regenerated
// from upstream when Thomas changes it. `load()` takes the parsed object.

export function load(data) {
  if (!data || !Array.isArray(data.standards)) throw new Error('konomi: standards data must have a `standards` array');
  const byId = new Map();
  const udtOwner = new Map();          // UDT name → the standard that defines it
  const collisions = [];

  for (const s of data.standards) {
    if (!s || !s.id) continue;
    byId.set(s.id, s);
    for (const u of (s.udts || [])) {
      const key = norm(u);
      // A UDT defined by two standards is a real finding, not an error: it is where the standards
      // genuinely overlap, and it is exactly where an integration breaks.
      if (udtOwner.has(key)) collisions.push({ udt: u, standards: [udtOwner.get(key).id, s.id] });
      else udtOwner.set(key, s);
    }
  }

  const edges = [];
  for (const c of (data.crosswalks || [])) {
    for (const m of (c.maps || [])) {
      const [from, to] = splitMap(m);
      if (from && to) edges.push({ from, to, fromStd: c.from, toStd: c.to, raw: m });
    }
  }

  const rings = new Map((data.rings || []).map(r => [r.id, r]));
  return { data, byId, udtOwner, collisions, edges, rings, signature: data.signature ?? null };
}

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The parts a tag name is made of.
 *
 * Splits on the separators plants actually use — underscore, dot, dash, space — and on camelCase
 * boundaries, then also offers adjacent pairs, because `ProcessCell` arrives as one segment in
 * `Line3_ProcessCell_Temp` but as two in `PROCESS_CELL_3`.
 */
export function segments(name) {
  const raw = String(name == null ? '' : name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(x => x.toLowerCase());
  const out = new Set(raw);
  for (let i = 0; i + 1 < raw.length; i++) out.add(raw[i] + raw[i + 1]);
  for (let i = 0; i + 2 < raw.length; i++) out.add(raw[i] + raw[i + 1] + raw[i + 2]);
  return out;
}

/** `WorkCenter=ProcessCell` and `Equipment→Object(ns=isa95)` are both mappings; read both. */
function splitMap(m) {
  const s = String(m == null ? '' : m);
  const arrow = s.split(/→|->/);
  if (arrow.length === 2) return [arrow[0].trim(), arrow[1].trim()];
  const eq = s.split('=');
  if (eq.length >= 2) return [eq[0].trim(), eq.slice(1).join('=').trim()];
  return [null, null];
}

// ── CLASSIFY ────────────────────────────────────────────────────────────────────────────────────

/**
 * Which UDT is this tag?
 *
 * Exact match on the normalised name first, then containment — a tag called `Line3_ProcessCell_Temp`
 * is a ProcessCell reading and a plant is full of names like that. Containment is reported as a
 * WEAKER match and never silently promoted, because "probably" is how a conformance report becomes
 * fiction.
 */
export function classify(k, tag) {
  const name = typeof tag === 'string' ? tag : (tag && (tag.udt || tag.name || tag.id)) || '';
  const key = norm(name);
  if (!key) return { tag: name, matched: false, why: 'no name to match on' };

  const exact = k.udtOwner.get(key);
  if (exact) return hit(name, exact, key, 'exact');

  // SEGMENTS, not substrings. Plant tags are `Line3_ProcessCell_Temp`, `OEE_LineA`, `plant.unit.temp`
  // — names assembled out of parts. Matching a whole segment is far more trustworthy than matching
  // anywhere in the string, and it fixes both failure modes at once: a blanket minimum length was
  // dropping `OEE`, a real three-letter KPI UDT, while raw containment was free to match fragments
  // inside unrelated words.
  const segs = segments(name);
  let best = null;
  for (const [u, std] of k.udtOwner) {
    if (segs.has(u) && (!best || u.length > best.u.length)) best = { u, std };
  }
  if (best) return hit(name, best.std, best.u, 'segment');

  // There WAS a further fallback here — concatenate everything and look for a long UDT anywhere in
  // it — and the gate showed it was unreachable. Adjacent-part joining already finds `ProcessCell`
  // in `PROCESS_CELL_3` and `Batch` in `BAT_CH`, so nothing was left for the fallback to catch, and
  // every mutation of it survived because no input could tell the difference. Removed rather than
  // kept as reassurance: unreachable code is a claim about coverage that is not true.
  return { tag: name, matched: false, why: 'no UDT in any loaded standard matches this name' };
}

function hit(name, std, udtKey, strength) {
  const udt = (std.udts || []).find(u => norm(u) === udtKey) || udtKey;
  return { tag: name, matched: true, strength, udt, standard: std.id, standardName: std.name, levels: std.levels };
}

/**
 * Conformance over a whole tag list. The gap list is the point, so it comes back whole and unsorted
 * into "close enough" — an unmapped tag is unmapped.
 */
export function conform(k, tags) {
  const list = Array.isArray(tags) ? tags : [];
  const results = list.map(t => classify(k, t));
  const matched = results.filter(r => r.matched);
  const gaps = results.filter(r => !r.matched);
  const byStandard = {};
  for (const r of matched) byStandard[r.standard] = (byStandard[r.standard] || 0) + 1;
  const weak = matched.filter(r => r.strength !== 'exact');
  return {
    total: list.length,
    matched: matched.length,
    gaps: gaps.length,
    coverage: list.length ? matched.length / list.length : 0,
    // Reported separately and never folded into `matched` in the headline: anything but an exact
    // match is a guess about a naming convention, and a plant manager is entitled to know which
    // number is which.
    exact: matched.length - weak.length,
    weak: weak.length,
    byStandard,
    unmapped: gaps.map(g => g.tag),
    results,
  };
}

// ── CROSSWALK ───────────────────────────────────────────────────────────────────────────────────

/**
 * What is this called in another standard?
 *
 * Walks the declared mappings, both directions, and returns the PATH — because "your ISA-88 Phase is
 * a Sparkplug Metric" is only trustworthy if you can see it went Phase → PackML EXECUTE → … and
 * decide for yourself whether each hop is sound.
 */
export function translate(k, term, { to = null, maxHops = 3 } = {}) {
  const start = String(term == null ? '' : term).trim();
  if (!start) return [];
  const seen = new Set([norm(start)]);
  const out = [];
  let frontier = [{ term: start, path: [] }];

  for (let hop = 0; hop < maxHops && frontier.length; hop++) {
    const next = [];
    for (const node of frontier) {
      for (const e of k.edges) {
        const forward = norm(e.from).includes(norm(node.term)) || norm(node.term).includes(norm(e.from));
        const back = norm(e.to).includes(norm(node.term)) || norm(node.term).includes(norm(e.to));
        if (!forward && !back) continue;
        const landing = forward ? e.to : e.from;
        const std = forward ? e.toStd : e.fromStd;
        const key = norm(landing);
        if (seen.has(key)) continue;
        seen.add(key);
        const step = { term: landing, standard: std, via: e.raw, hops: hop + 1, path: [...node.path, e.raw] };
        if (!to || std === to) out.push(step);
        next.push({ term: landing, path: step.path });
      }
    }
    frontier = next;
  }
  return out.sort((a, b) => a.hops - b.hops || a.term.localeCompare(b.term));
}

// ── THE RING BRIDGE ─────────────────────────────────────────────────────────────────────────────
//
// The part that makes this a JEDI organ rather than a generic conformance checker: every standard
// sits at an ISA-95 level, and every level is a ring. So a plant's tags land on the ring ladder, and
// a plant that is all R0/R1 and nothing above is a plant with sensors and no idea what they mean.

/** Which ring does this standard live on? Matched through the ISA-95 level the ring declares. */
export function ringOf(k, standardId) {
  const std = k.byId.get(standardId);
  if (!std) return null;
  // Match on the id's TOKENS, not the id verbatim. The ring table calls MQTT-Sparkplug
  // "Sparkplug/MQTT" — the same standard, written the way a person writes it — and a literal
  // comparison silently drops it off the ladder. A crosswalk that only works when both sides spell
  // things identically is not a crosswalk.
  const tokens = String(standardId).toLowerCase().split(/[^a-z0-9.]+/).filter(x => x.length > 1);
  for (const [, r] of k.rings) {
    const focus = String(r.focus || '').toLowerCase();
    if (tokens.length && tokens.every(tk => focus.includes(tk))) return r;
  }
  // fall back to the level text, so ISA-95's L0-L4 lands somewhere rather than nowhere
  for (const [, r] of k.rings) {
    const lvl = String(r.level || '').match(/L(\d)/);
    const own = String(std.levels || '').match(/L(\d)/);
    if (lvl && own && lvl[1] === own[1]) return r;
  }
  return null;
}

/** The plant, laid on the ring ladder. Where the estate's language and the plant floor meet. */
export function profile(k, tags) {
  const c = conform(k, tags);
  const rings = {};
  for (const [id] of k.rings) rings[id] = 0;
  for (const r of c.results) {
    if (!r.matched) continue;
    const ring = ringOf(k, r.standard);
    if (ring) rings[ring.id] = (rings[ring.id] || 0) + 1;
  }
  const held = Object.entries(rings).filter(([, n]) => n > 0).map(([id]) => id).sort();
  const top = held.length ? held[held.length - 1] : null;
  return {
    ...c, rings, ringsHeld: held.length, highest: top,
    // said plainly, because it is the whole diagnosis
    reading: held.length === 0 ? 'nothing on the ladder — no tag matched a standard'
      : held.length <= 2 ? `only ${held.join(', ')} — instrumentation without interpretation`
      : `${held.join(', ')} — reaching ${top}`,
  };
}

// ── CONTRADICTIONS ──────────────────────────────────────────────────────────────────────────────

/**
 * Where the loaded standards disagree with themselves.
 *
 * A UDT claimed by two standards is not necessarily wrong — it is where they overlap, and that is
 * where integrations break. Surfaced rather than deduplicated away, on the same principle as every
 * other gate here: the disagreement is the useful part.
 */
export function tensions(k) {
  const out = [...k.collisions];
  for (const e of k.edges) {
    const t = norm(e.to).replace(/\(.*\)$/, '');
    if (k.udtOwner.has(t) || /^[a-z0-9]+\.[a-z0-9]+$/.test(norm(e.to))) continue;

    // TWO DIFFERENT PROBLEMS, and calling them one thing was a lie the page then repeated.
    //
    //   MISSING STANDARD — the mapping points into a standard that is not in the set at all. Nothing
    //   can resolve those terms because the vocabulary that defines them was never loaded.
    //
    //   NAMING MISMATCH — the standard IS loaded, but the crosswalk writes terms one way and the UDT
    //   list writes them another: the mapping says `Variable`, OPC-UA's UDTs say `OPC_Variable`. The
    //   domain knowledge is correct; the two halves of the document just do not share a convention,
    //   which is exactly the kind of thing nobody notices until something tries to resolve it.
    const kind = k.byId.has(e.toStd) ? 'naming' : 'missing';
    out.push({ dangling: e.raw, from: e.fromStd, to: e.toStd, term: e.to, kind });
  }
  return out;
}

/** Everything the kernel holds, countable. */
export function census(k) {
  return {
    signature: k.signature,
    standards: k.byId.size,
    udts: k.udtOwner.size,
    crosswalks: k.edges.length,
    rings: k.rings.size,
    collisions: k.collisions.length,
    source: k.data.source || null,
  };
}

export default { VERSION, load, classify, conform, translate, ringOf, profile, tensions, census };

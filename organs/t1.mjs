// t1.mjs — TIER 1 · a real model, running in the visitor's own tab.
//
// Tier 0 gives a scored field of stances but cannot read a sentence. Tier 1 adds a small language
// model — downloaded once, then run entirely in the browser on WebGPU — whose ONLY job is to say
// each held stance in the terms of THIS decision. It phrases; it does not decide.
//
// ⚑ THE LOAD-BEARING CONSTRAINT. The page tells visitors: "the field, the gate and the shadow are
// this same code either way." That has to be structurally true, not a promise. So this module never
// returns a field — it returns PHRASINGS keyed to branches whose score, order, label and index are
// copied from the tier-0 result. A model that hallucinates a score, invents a stance, reorders the
// list or tries to award itself the win cannot move anything, because nothing it emits is ever read
// as a number. The test suite attacks exactly that, with adversarial replies.
//
// The model call itself is INJECTED — `phrase(field, decision, generate)` takes an async
// `generate(prompt) -> string`. Same seam the core uses for generate/score: the kernel stays pure,
// deterministic and gateable, and WebLLM is wired to it in door.mjs. It can therefore be proven
// without downloading a gigabyte, and the proof is about the logic rather than about one model's
// mood on the day.

export const SYSTEM =
  'You rewrite decision-making advice so it speaks to one specific situation. ' +
  'You never choose between options, never rank them, never add options, and never mention scores. ' +
  'You only restate the given approach in the words of the situation you are shown.';

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/**
 * The prompt. Numbered so the reply can be mapped back by position rather than by matching text —
 * matching on the stance NAME would let a model rename a stance and have its line silently applied
 * to a different one.
 *
 * The evidence is included because it is what makes the phrasing specific: the model is told which
 * cue words were found, so it grounds its sentence in the visitor's own wording rather than
 * inventing circumstances that were never mentioned.
 */
export function buildPrompt(decision, holds, evidence) {
  const dec = clean(decision) || '(no decision given)';
  const list = (holds || []).map((h, n) =>
    `${n + 1}. ${clean(h.value && h.value.label)} — ${clean(h.value && h.value.move)}`).join('\n');
  const signals = evidence && evidence.found
    ? evidence.signals.map(s => `${s.label} (${s.cues.join(', ')})`).join('; ')
    : 'none detected';
  return [
    `THE DECISION: ${dec}`,
    ``,
    `SIGNALS FOUND IN IT: ${signals}`,
    ``,
    `APPROACHES TO RESTATE:`,
    list,
    ``,
    `Rewrite each numbered approach as ONE short sentence naming what to actually do about THIS`,
    `decision. Keep the same numbers and the same order. Do not add, drop, rank or compare them.`,
    // Spelled out because repeating the input back is the characteristic small-model failure, and it
    // is the one that superficially looks like a correct answer. The kernel refuses echoes anyway;
    // saying it here means fewer of them to refuse.
    `Do NOT repeat the approach's name or reuse its wording — write a new sentence that mentions the`,
    `specifics of the situation above.`,
    `Reply with only the numbered lines.`,
  ].join('\n');
}

/**
 * Read the reply back. Returns `byIndex` (1-based position → sentence) plus `ignored`, every line
 * that did not parse, kept and reported.
 *
 * NOTHING IS SILENTLY DROPPED — the estate's rule, and it matters more here than usual: a small
 * model preambles, bullets, repeats itself and stops early, and a parser that quietly discards the
 * mess would report confident phrasings for some stances and leave others bare with no explanation.
 */
export function parseReply(text, count) {
  const n = Math.max(0, Math.floor(count || 0));
  const byIndex = new Map();
  const ignored = [];
  for (const raw of String(text == null ? '' : text).split('\n')) {
    // Small models bullet and bold their lists — `- **1.** do the thing` is a normal reply, not a
    // malformed one. Strip the decoration before looking for the number, or every phrasing from a
    // model that likes markdown is thrown away as unparseable.
    const line = raw.trim().replace(/^[-*•\s]+/, '').replace(/\*\*/g, '').trim();
    if (!line) continue;
    const m = line.match(/^(\d{1,2})\s*[).:\]-]\s*(.+)$/);
    if (!m) { ignored.push(line.slice(0, 120)); continue; }
    const idx = Number(m[1]);
    const body = clean(m[2]).replace(/^\*+|\*+$/g, '').trim();
    // Out of range, or a repeat of a number already answered: kept and reported, never applied.
    if (idx < 1 || idx > n || byIndex.has(idx) || !body) { ignored.push(line.slice(0, 120)); continue; }
    byIndex.set(idx, body);
  }
  return { byIndex, ignored, parsed: byIndex.size, expected: n };
}

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Reject a "phrasing" that is just the built-in wording handed back.
 *
 * ⚑ FOUND BY RUNNING A REAL MODEL. A 360M model asked to rewrite `Verify before you commit — Decide
 * what would prove this wrong` replies `Verify before you commit — Decide what would prove this
 * wrong.` Every check upstream passes: it is a valid numbered line for a real stance. But showing it
 * under a heading that says "in your words" tells the visitor a model did something for them when it
 * did nothing, which is the precise flavour of theatre this estate exists to delete.
 *
 * Returns the usable remainder, or null when there is nothing but an echo. The stance NAME is
 * stripped first, because prefixing the title is the small-model habit rather than the failure —
 * what follows it may still be genuinely new.
 */
export function deEcho(text, label, move) {
  let body = clean(text);
  if (!body) return null;
  const nLabel = norm(label);
  // "Verify before you commit — <rest>" / "Verify before you commit: <rest>"
  if (nLabel && norm(body).startsWith(nLabel)) {
    // If the pattern does not match, `replace` hands back the same string and the assignment is a
    // no-op — so the only thing worth checking is that stripping left something behind. (An extra
    // "and it actually changed" clause lived here until the mutation gate showed nothing could
    // distinguish it: it was unreachable logic dressed as a safety check.)
    const cut = clean(body.replace(/^[^—:\-]*[—:\-]\s*/, ''));
    if (cut) body = cut;
  }
  const nBody = norm(body), nMove = norm(move);
  if (!nBody) return null;
  if (nBody === nMove || nBody === nLabel) return null;
  // A model that pads the built-in sentence with a couple of words has still not said anything of
  // its own; require that the reply is not simply the move with decoration around it.
  if (nMove && nBody.includes(nMove)) return null;
  return body;
}

/**
 * Attach the model's sentences to the tier-0 branches.
 *
 * Every returned row carries the branch's OWN index, score and label, copied across. `phrased` is
 * the only field the model contributes, and it is absent — not guessed — when the model did not
 * produce a usable line for that row.
 */
export function attach(holds, parsed) {
  const list = holds || [];
  return list.map((h, n) => {
    const label = h.value && h.value.label, move = h.value && h.value.move;
    const raw = parsed.byIndex.get(n + 1) || null;
    return {
      i: h.i,
      score: h.score,
      label,
      move,
      phrased: raw ? deEcho(raw, label, move) : null,
      echoed: !!raw && deEcho(raw, label, move) === null,
    };
  });
}

/**
 * The whole tier: prompt → model → attached phrasings, with a report of what the model actually
 * managed. `generate` is injected and may throw or return junk; either way the caller still gets a
 * complete set of rows, because the deterministic text is what is really being shown.
 */
export async function phrase(decision, holds, evidence, generate) {
  const list = holds || [];
  const prompt = buildPrompt(decision, list, evidence);
  let reply = '', failed = null;
  try {
    reply = typeof generate === 'function' ? await generate(prompt) : '';
  } catch (e) {
    failed = (e && e.message) ? e.message : String(e);
  }
  const parsed = parseReply(reply, list.length);
  const rows = attach(list, parsed);
  const got = rows.filter(r => r.phrased).length;
  const echoed = rows.filter(r => r.echoed).length;
  return {
    rows, prompt, reply, failed,
    covered: got,
    echoed,
    expected: list.length,
    ignored: parsed.ignored,
    // Said plainly so the UI can say it plainly. A tier that quietly half-worked is worse than one
    // that admits it did: the visitor is being asked to trust the deterministic layer underneath.
    // "Echoed" gets its own sentence because it is the characteristic failure of the small models
    // this tier exists to run, and it is the one that most looks like success.
    note: failed ? `the model failed (${failed}) — showing the built-in wording`
      : got === 0 && echoed > 0 ? `the model only repeated the built-in wording back (${echoed} of ${list.length}) — a bigger model rewrites these properly`
        : got === 0 ? 'the model returned nothing usable — showing the built-in wording'
          : got < list.length ? `the model phrased ${got} of ${list.length}${echoed ? `, echoed ${echoed}` : ''} — the rest keep the built-in wording`
            : `phrased all ${got} against your decision`,
  };
}

/**
 * The guard, exported so it can be asserted rather than assumed: are these rows still the tier-0
 * field? Compares index, score and label pairwise. Used by the tests, and cheap enough that the UI
 * can run it before it renders anything the model touched.
 */
export function unmoved(holds, rows) {
  const a = holds || [], b = rows || [];
  if (a.length !== b.length) return false;
  for (let n = 0; n < a.length; n++) {
    if (a[n].i !== b[n].i) return false;
    if (a[n].score !== b[n].score) return false;
    if ((a[n].value && a[n].value.label) !== b[n].label) return false;
  }
  return true;
}

export default { SYSTEM, buildPrompt, parseReply, attach, phrase, unmoved };

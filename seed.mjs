// FallOS — seed.mjs: the history-import organ. Feed an empty Didy your own past.
//
// You export your chat history from ChatGPT or Claude (your GDPR/CCPA data-portability right), drag the
// file in, and this turns it into memory YOUR Didy holds — on your machine, never uploaded. The pipeline:
//   parse (per provider) -> normalize (one schema) -> extract facts (deterministic heuristics) ->
//   dedupe (stable content hash, so re-imports and ChatGPT+Claude merges are idempotent) ->
//   bucket (into the five-solid memory) -> recall (answer a question from what was learned).
//
// The FACT EXTRACTION here is deterministic and total: the same import always yields the same memory, and
// garbage in -> { ok:false, why } or a safe empty result, never a throw. A local model (WebLLM / Ollama /
// fallrelay) can ENRICH this at the edge, but the gated floor never needs one — the aha works offline.
// No I/O, no clock, no randomness (recency is read from the data's own timestamps). Pure and total.

import { sha256 } from './organs/estate.mjs';   // the estate's one content-address; same source the gate runs against

export const MAX_TURNS = 200000;     // a very large export; bounded so a hostile file cannot exhaust us
export const MAX_TEXT = 20000;       // per-turn text clamp (chars)
export const MAX_FACTS = 20000;      // bounded fact set
export const MAX_QUERY = 2000;       // recall query clamp
export const BUCKETS = ['crystal', 'dodeca', 'board', 'skin', 'addressbook'];

const isStr = (v) => typeof v === 'string';
const isArr = (v) => Array.isArray(v);
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v) => Number.isFinite(v);   // false for non-numbers and for NaN/±Infinity — no compound guard to flip

// ── text hygiene ────────────────────────────────────────────────────────────────────────────────
// Slicing unconditionally to MAX_TEXT clamps long text and returns short text whole — no boundary test.
function clean(text) {
  if (!isStr(text)) return '';
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

// ChatGPT create_time is seconds (float); Claude created_at is an ISO string. Return epoch ms, or 0.
function toEpochMs(v) {
  if (isNum(v)) return Math.round(v * 1000);               // ChatGPT seconds -> ms
  if (isStr(v)) {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
    if (!m) return 0;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);   // deterministic; no `new Date()`
  }
  return 0;
}

function mkTurn(source, conversationId, title, turnIndex, role, text, ts) {
  return { source, conversationId, title: clean(title), turnIndex, role, text: clean(text), ts };
}

// ── provider parsers ──────────────────────────────────────────────────────────────────────────────
// ChatGPT: conversations.json is an array of conversations, each with a `mapping` graph. The live thread
// is current_node walked up to the root via parent, then reversed. Fallback: all message nodes by time.
function textFromChatGptContent(content) {
  if (!isObj(content)) return '';
  if (isArr(content.parts)) return content.parts.filter(isStr).join('\n');
  if (isStr(content.text)) return content.text;
  return '';
}

export function parseChatGPT(data) {
  const convos = isArr(data) ? data : (isObj(data) && isArr(data.conversations) ? data.conversations : null);
  if (!convos) return { ok: false, why: 'not a ChatGPT export (expected an array of conversations, or { conversations: [...] })' };
  const turns = [];
  for (const [ci, convo] of convos.entries()) {
    if (!isObj(convo)) continue;
    const cid = isStr(convo.conversation_id) ? convo.conversation_id : (isStr(convo.id) ? convo.id : 'chatgpt-' + ci);
    const title = isStr(convo.title) ? convo.title : '';
    const mapping = isObj(convo.mapping) ? convo.mapping : null;
    const ordered = [];
    if (mapping) {
      // walk the live thread: current_node -> parent -> ... -> root, then reverse
      const chain = [];
      let nid = isStr(convo.current_node) ? convo.current_node : null;
      const guard = new Set();
      while (nid && isObj(mapping[nid]) && !guard.has(nid)) {
        guard.add(nid);
        chain.push(mapping[nid]);
        nid = isStr(mapping[nid].parent) ? mapping[nid].parent : null;
      }
      if (chain.length > 0) { chain.reverse(); ordered.push(...chain); }
      else {
        // fallback: every node that carries a message, by create_time
        const nodes = Object.keys(mapping).map((k) => mapping[k]).filter(isObj);
        nodes.sort((a, b) => toEpochMs(a.message && a.message.create_time) - toEpochMs(b.message && b.message.create_time));
        ordered.push(...nodes);
      }
    }
    let ti = 0;
    for (const node of ordered) {
      const msg = isObj(node) ? node.message : null;
      if (!isObj(msg)) continue;
      const role = isObj(msg.author) && isStr(msg.author.role) ? msg.author.role : 'unknown';
      if (role === 'system' || role === 'tool') continue;
      const text = clean(textFromChatGptContent(msg.content));
      if (text.length === 0) continue;
      turns.push(mkTurn('chatgpt', cid, title, ti++, role === 'user' ? 'user' : 'assistant', text, toEpochMs(msg.create_time)));
    }
  }
  return { ok: true, turns: turns.slice(0, MAX_TURNS) };   // bound the output; slice returns short arrays whole
}

// Claude: an array of conversations, each with chat_messages [{ sender:'human'|'assistant', text|content }].
function textFromClaudeMessage(msg) {
  if (isStr(msg.text) && msg.text.length > 0) return msg.text;
  if (isArr(msg.content)) return msg.content.filter(isObj).map((b) => (isStr(b.text) ? b.text : '')).join('\n');
  return '';
}

export function parseClaude(data) {
  const convos = isArr(data) ? data : (isObj(data) && isArr(data.conversations) ? data.conversations : null);
  if (!convos) return { ok: false, why: 'not a Claude export (expected an array of conversations)' };
  const turns = [];
  for (const [ci, convo] of convos.entries()) {
    if (!isObj(convo)) continue;
    const cid = isStr(convo.uuid) ? convo.uuid : (isStr(convo.id) ? convo.id : 'claude-' + ci);
    const title = isStr(convo.name) ? convo.name : (isStr(convo.title) ? convo.title : '');
    const msgs = isArr(convo.chat_messages) ? convo.chat_messages : (isArr(convo.messages) ? convo.messages : []);
    let ti = 0;
    for (const msg of msgs) {
      if (!isObj(msg)) continue;
      const sender = isStr(msg.sender) ? msg.sender : (isStr(msg.role) ? msg.role : 'unknown');
      const text = clean(textFromClaudeMessage(msg));
      if (text.length === 0) continue;
      const role = (sender === 'human' || sender === 'user') ? 'user' : 'assistant';
      turns.push(mkTurn('claude', cid, title, ti++, role, text, toEpochMs(msg.created_at)));
    }
  }
  return { ok: true, turns: turns.slice(0, MAX_TURNS) };   // bound the output; slice returns short arrays whole
}

/** parseExport(source, data) — pick the parser by provider name. */
export function parseExport(source, data) {
  if (source === 'chatgpt') return parseChatGPT(data);
  if (source === 'claude') return parseClaude(data);
  return { ok: false, why: 'unknown source "' + source + '" (expected "chatgpt" or "claude")' };
}

// ── deterministic fact extraction ───────────────────────────────────────────────────────────────
// Only the user's OWN words are mined for facts about them. Each pattern is anchored and specific so a
// stray sentence does not become a "fact". Weight = pattern specificity + recency (from data timestamps).
const STOP = new Set(('a an the and or but if then else of to in on for with at by from as is are was were be been ' +
  'this that these those i you he she it we they me my your our their do does did have has had will would can could ' +
  'should just really very so how what when where why who which about into out up down over please thanks thank ok ' +
  'also now yes no hi hey hello let get got need want make made help sure well ill dont cant im ive youre okay').split(' '));

const PREF_RE = [
  /\bi (?:really )?(?:prefer|like|love|enjoy|favou?r) ([^.,;!?\n]{2,120})/i,
  /\bi (?:hate|dislike|can'?t stand|don'?t (?:like|want)) ([^.,;!?\n]{2,120})/i,
  /\bi (?:always|usually|tend to|normally) ([^.,;!?\n]{2,120})/i,
  /\bmy favou?rite [a-z ]{0,30}?(?:is|are) ([^.,;!?\n]{2,120})/i,
];
const ID_RE = [
  /\bi(?:'m| am) (?:a|an) ([^.,;!?\n]{2,80})/i,
  /\bmy name is ([^.,;!?\n]{2,60})/i,
  /\bi work (?:as|at|in|for|on) ([^.,;!?\n]{2,80})/i,
  /\bi(?:'m| am) (?:based |living |from )([^.,;!?\n]{2,60})/i,
];
const PROJ_RE = [
  /\bi(?:'m| am) (?:working on|building|developing|making|writing) ([^.,;!?\n]{2,120})/i,
  /\bmy (?:project|app|company|startup|business|thesis|book) (?:is|called|named) ([^.,;!?\n]{2,120})/i,
  /\bhelp me (?:with |build |write |plan )([^.,;!?\n]{3,120})/i,
];
const CORRECTION_RE = /^\s*(?:actually|no[,. ]|not quite|that'?s (?:wrong|not right)|instead|correction|i meant)\b/i;
// [Mm]y handles sentence-initial "My"; the name stays case-sensitive ([A-Z]…) so we don't capture verbs.
const PERSON_RE = /\b[Mm]y (?:friend|colleague|wife|husband|partner|manager|boss|mum|dad|mother|father|brother|sister|co-?founder|teammate|assistant|therapist|doctor|coach) (?:is |named |called )?([A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+)?)/;

function mineTurn(turn, out) {
  if (turn.role !== 'user') return;
  const t = turn.text;
  for (const re of PREF_RE) { const m = t.match(re); if (m) out.push(fact('preference', m[1], turn, 3)); }
  for (const re of ID_RE) { const m = t.match(re); if (m) out.push(fact('identity', m[1], turn, 4)); }
  for (const re of PROJ_RE) { const m = t.match(re); if (m) out.push(fact('project', m[1], turn, 3)); }
  const pm = t.match(PERSON_RE); if (pm) out.push(fact('person', pm[1], turn, 3));
  if (CORRECTION_RE.test(t)) out.push(fact('correction', t.slice(0, 160), turn, 4));
}

function fact(kind, raw, turn, base) {
  const text = clean(raw).replace(/^(?:that|to|the|a|an) /i, '');
  return { kind, text, source: turn.source, conversationId: turn.conversationId, turnIndex: turn.turnIndex, ts: turn.ts, base, count: 1 };
}

// recurring entities: significant Title-Case tokens that appear in 2+ turns are the person's real
// topics. Counting individual tokens (not multi-word runs) is robust to sentence-initial capitals
// ("Can Crumb…" still counts "Crumb"); common capitalised sentence-starters are filtered by STOP.
function mineEntities(turns) {
  const seen = new Map();     // token -> { count, ts, source, conversationId, turnIndex }
  const TOK_RE = /\b([A-Z][a-zA-Z0-9]{2,})\b/g;
  for (const turn of turns) {
    if (!isObj(turn) || !isStr(turn.text) || turn.role !== 'user') continue;
    const local = new Set();
    let m;
    TOK_RE.lastIndex = 0;
    while ((m = TOK_RE.exec(turn.text)) !== null) {
      const tok = m[1];
      if (STOP.has(tok.toLowerCase())) continue;
      if (local.has(tok)) continue;               // count a token once per turn
      local.add(tok);
      const prev = seen.get(tok);
      if (prev) { prev.count += 1; prev.ts = Math.max(prev.ts, turn.ts); }
      else seen.set(tok, { count: 1, ts: turn.ts, source: turn.source, conversationId: turn.conversationId, turnIndex: turn.turnIndex });
    }
  }
  const out = [];
  for (const [tok, info] of seen) {
    if (info.count < 2) continue;                 // recurring only
    out.push({ kind: 'entity', text: tok, source: info.source, conversationId: info.conversationId, turnIndex: info.turnIndex, ts: info.ts, base: 2, count: info.count });
  }
  return out;
}

/** extractFacts(turns) — deterministic. Returns a flat, unbucketed fact list (pre-dedupe). */
export function extractFacts(turns) {
  if (!isArr(turns)) return { ok: false, why: 'extractFacts takes an array of turns' };
  const out = [];
  for (const turn of turns) {
    if (!isObj(turn) || !isStr(turn.text)) continue;
    mineTurn(turn, out);
  }
  for (const e of mineEntities(turns)) out.push(e);
  return { ok: true, facts: out.slice(0, MAX_FACTS) };   // bound; slice returns short arrays whole
}

// ── dedupe (idempotent re-import + cross-provider merge) ──────────────────────────────────────────
function factKey(f) {
  return sha256(f.kind + '|' + f.text.toLowerCase());   // estate sha256 → hex string; identical fact ⇒ identical key
}

/** dedupe(facts) — merge identical facts by (kind, normalized text). Keeps the newest source location,
 *  sums counts, so a fact stated in 5 conversations outranks one stated once. Idempotent. */
export function dedupe(facts) {
  if (!isArr(facts)) return { ok: false, why: 'dedupe takes an array of facts' };
  const by = new Map();
  for (const f of facts) {
    if (!isObj(f) || !isStr(f.text) || f.text.length === 0) continue;
    const k = factKey(f);
    const prev = by.get(k);
    if (prev) {
      prev.count += (isNum(f.count) ? f.count : 1);
      if (f.ts > prev.ts) { prev.ts = f.ts; prev.source = f.source; prev.conversationId = f.conversationId; prev.turnIndex = f.turnIndex; }
    } else {
      by.set(k, { ...f, count: isNum(f.count) ? f.count : 1 });
    }
  }
  return { ok: true, facts: [...by.values()] };
}

// ── weight + bucket into the five-solid memory ────────────────────────────────────────────────────
// weight = pattern specificity (base) + how often it was repeated (capped). Recency is not a weight term
// — it breaks ties in the ordering below, where it is directly testable, rather than a fuzzy score add.
function scoreFacts(facts) {
  for (const f of facts) {
    if (!isObj(f)) continue;
    const rep = Math.min(3, (f.count || 1) - 1);
    f.weight = (f.base || 1) + rep;
  }
  return facts;
}

const KIND_BUCKET = { identity: 'crystal', correction: 'crystal', preference: 'dodeca', project: 'board', person: 'addressbook', entity: 'board' };

/** bucket(facts) — sort each fact into one of the five memory solids, ordered by weight (desc). The
 *  `skin` (self-model) is DERIVED: the top identity + top preferences, the short "who this Didy is". */
export function bucket(facts) {
  if (!isArr(facts)) return { ok: false, why: 'bucket takes an array of facts' };
  scoreFacts(facts);
  const mem = { crystal: [], dodeca: [], board: [], skin: [], addressbook: [] };
  for (const f of facts) {
    if (!isObj(f) || !isStr(f.text)) continue;
    const b = KIND_BUCKET[f.kind] || 'board';
    mem[b].push(f);
  }
  for (const k of BUCKETS) mem[k].sort((a, b) => (b.weight - a.weight) || (b.ts - a.ts) || a.text.localeCompare(b.text));
  const selfId = mem.crystal.filter((f) => f.kind === 'identity').slice(0, 3);
  const selfPref = mem.dodeca.slice(0, 3);
  mem.skin = [...selfId, ...selfPref].map((f) => ({ kind: f.kind, text: f.text, weight: f.weight }));
  return { ok: true, memory: mem };
}

/** seedMemory(sources) — the whole pipeline. sources: [{ source:'chatgpt'|'claude', data }].
 *  Returns { ok, stats, memory }. Deterministic: same exports in -> same memory out. */
export function seedMemory(sources) {
  if (!isArr(sources) || sources.length === 0) return { ok: false, why: 'seedMemory takes a non-empty array of { source, data }' };
  const allTurns = [];
  const perSource = {};
  const convoIds = new Set();
  for (const s of sources) {
    if (!isObj(s)) return { ok: false, why: 'each source must be { source, data }' };
    const p = parseExport(s.source, s.data);
    if (!p.ok) return p;
    perSource[s.source] = (perSource[s.source] || 0) + p.turns.length;
    for (const t of p.turns) { allTurns.push(t); convoIds.add(t.source + ':' + t.conversationId); }
  }
  const ex = extractFacts(allTurns);
  if (!ex.ok) return ex;
  const dd = dedupe(ex.facts);
  if (!dd.ok) return dd;
  const bk = bucket(dd.facts);
  if (!bk.ok) return bk;
  const byKind = {};
  for (const f of dd.facts) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  return {
    ok: true,
    stats: { conversations: convoIds.size, turns: allTurns.length, facts: dd.facts.length, byKind, perSource },
    memory: bk.memory,
  };
}

// ── recall — the FIRST-RECALL aha, deterministic and offline ──────────────────────────────────────
function tokens(text) {
  return clean(text).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
}

/** recall(memory, query, topN?) — score every seeded fact against the query by word overlap + weight,
 *  return the top matches and a plain-language answer built ONLY from the user's own history. No LLM. */
export function recall(memory, query, topN) {
  if (!isObj(memory)) return { ok: false, why: 'recall takes a seeded memory object' };
  if (!isStr(query)) return { ok: false, why: 'query must be a string' };
  const q = query.slice(0, MAX_QUERY);   // clamp; slice returns short strings whole — no boundary test
  const n = Number.isInteger(topN) && topN > 0 ? Math.min(topN, 20) : 5;
  const qset = new Set(tokens(q));
  const all = [];
  for (const k of BUCKETS) {
    if (k === 'skin' || !isArr(memory[k])) continue;      // skin is a derived view of crystal+dodeca
    for (const f of memory[k]) if (isObj(f) && isStr(f.text)) all.push(f);
  }
  const scored = [];
  for (const f of all) {
    let overlap = 0;
    for (const w of tokens(f.text)) if (qset.has(w)) overlap += 1;
    const score = overlap * 10 + (f.weight || 0);
    if (overlap > 0 || qset.size === 0) scored.push({ fact: f, overlap, score });
  }
  scored.sort((a, b) => (b.score - a.score) || (b.fact.ts - a.fact.ts) || a.fact.text.localeCompare(b.fact.text));
  const hits = scored.slice(0, n);
  const phrase = { identity: 'you are', preference: 'you prefer', project: "you're working on", correction: 'you corrected me that', person: 'you mentioned', entity: 'you often bring up' };
  const parts = hits.filter((h) => h.overlap > 0).map((h) => (phrase[h.fact.kind] || 'you noted') + ' ' + h.fact.text);
  const answer = parts.length > 0
    ? 'From your history: ' + parts.slice(0, 3).join('; ') + '.'
    : 'I have not learned anything about that yet — feed me more of your history and ask again.';
  return { ok: true, hits, answer, matched: parts.length };
}

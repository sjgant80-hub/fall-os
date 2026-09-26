import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseChatGPT, parseClaude, parseExport, extractFacts, dedupe, bucket, seedMemory, recall, BUCKETS,
} from './seed.mjs';

// ── fixtures: shaped like the REAL exports ────────────────────────────────────────────────────────
// ChatGPT: a `mapping` graph with a current_node; the live thread is current_node -> parent -> root.
const chatgptExport = [
  {
    title: 'Weekend plans', conversation_id: 'c1', current_node: 'n3',
    mapping: {
      root: { id: 'root', message: null, parent: null, children: ['n1'] },
      n1: { id: 'n1', parent: 'root', children: ['n2'], message: { author: { role: 'user' }, create_time: 1700000000, content: { content_type: 'text', parts: ['I prefer tea over coffee, always.'] } } },
      n2: { id: 'n2', parent: 'n1', children: ['n3'], message: { author: { role: 'assistant' }, create_time: 1700000010, content: { parts: ['Noted!'] } } },
      n3: { id: 'n3', parent: 'n2', children: [], message: { author: { role: 'user' }, create_time: 1700000020, content: { parts: ["I'm working on a bakery app called Crumb."] } } },
      orphan: { id: 'orphan', parent: 'root', children: [], message: { author: { role: 'user' }, create_time: 1700000005, content: { parts: ['a discarded edit branch'] } } },
    },
  },
];

// Claude: array of conversations with chat_messages [{ sender, text }] (and a content-array variant).
const claudeExport = [
  {
    uuid: 'u1', name: 'Setup', created_at: '2024-02-01T10:00:00Z',
    chat_messages: [
      { sender: 'human', text: 'My name is Sam. I work as a baker.', created_at: '2024-02-01T10:00:00Z' },
      { sender: 'assistant', text: '', content: [{ type: 'text', text: 'Hello Sam.' }], created_at: '2024-02-01T10:00:05Z' },
      { sender: 'human', text: 'Actually, I meant I run the bakery, not just bake.', created_at: '2024-02-01T10:01:00Z' },
    ],
  },
];

test('parseChatGPT walks the live thread (current_node -> root, reversed) and drops orphan branches', () => {
  const r = parseChatGPT(chatgptExport);
  assert.equal(r.ok, true);
  // live thread = n1(user), n2(assistant), n3(user); orphan is NOT on the current_node chain
  assert.equal(r.turns.length, 3);
  assert.deepEqual(r.turns.map((t) => t.role), ['user', 'assistant', 'user']);
  assert.match(r.turns[0].text, /tea over coffee/);
  assert.match(r.turns[2].text, /bakery app called Crumb/);
  assert.ok(r.turns.every((t) => t.source === 'chatgpt' && t.conversationId === 'c1'));
  assert.ok(r.turns.every((t) => t.text !== 'a discarded edit branch'));   // orphan excluded
});

test('parseChatGPT falls back to time-ordered nodes when there is no current_node (and tolerates messageless nodes in the sort)', () => {
  const noCurrent = [{ title: 'x', conversation_id: 'c2', mapping: {
    a: { id: 'a', parent: null, children: [], message: { author: { role: 'user' }, create_time: 20, content: { parts: ['second'] } } },
    b: { id: 'b', parent: null, children: [], message: { author: { role: 'user' }, create_time: 10, content: { parts: ['first'] } } },
    m: { id: 'm', parent: null, children: [] },   // NO message — the fallback sort must not read .create_time off undefined
  } }];
  const r = parseChatGPT(noCurrent);
  assert.equal(r.ok, true);
  assert.deepEqual(r.turns.map((t) => t.text), ['first', 'second']);   // sorted by create_time, messageless dropped
});

test('parseChatGPT skips system/tool roles and empty content', () => {
  const withSystem = [{ conversation_id: 'c3', current_node: 's2', mapping: {
    s1: { id: 's1', parent: null, children: ['s2'], message: { author: { role: 'system' }, create_time: 1, content: { parts: ['you are a bot'] } } },
    s2: { id: 's2', parent: 's1', children: [], message: { author: { role: 'user' }, create_time: 2, content: { parts: [''] } } },
  } }];
  const r = parseChatGPT(withSystem);
  assert.equal(r.ok, true);
  assert.equal(r.turns.length, 0);   // system dropped, empty user text dropped
});

test('parseChatGPT accepts the { conversations: [...] } wrapper form', () => {
  const wrapped = { conversations: chatgptExport };
  const r = parseChatGPT(wrapped);
  assert.equal(r.ok, true);
  assert.equal(r.turns.length, 3);
});

test('parseClaude reads text and content-array messages, human -> user, with correct timestamps', () => {
  const r = parseClaude(claudeExport);
  assert.equal(r.ok, true);
  assert.equal(r.turns.length, 3);
  assert.deepEqual(r.turns.map((t) => t.role), ['user', 'assistant', 'user']);
  assert.equal(r.turns[1].text, 'Hello Sam.');            // text:'' falls through to content:[{type,text}]
  assert.ok(r.turns.every((t) => t.source === 'claude'));
  // timestamp is parsed correctly (month is 0-indexed): 2024-02-01T10:00:00Z
  assert.equal(r.turns[0].ts, Date.UTC(2024, 1, 1, 10, 0, 0));
  assert.equal(r.turns[2].ts, Date.UTC(2024, 1, 1, 10, 1, 0));
});

test('parseExport dispatches by provider and rejects unknown sources', () => {
  assert.equal(parseExport('chatgpt', chatgptExport).ok, true);
  assert.equal(parseExport('claude', claudeExport).ok, true);
  const bad = parseExport('gemini', []);
  assert.equal(bad.ok, false);
  assert.match(bad.why, /unknown source/);
});

test('malformed / truncated exports are refused or safely empty — never a throw (the OpenAI-changed-the-schema case)', () => {
  // wrong top-level shapes -> ok:false with a reason
  for (const junk of [null, 42, 'a string', true, { nope: 1 }]) {
    const r = parseChatGPT(junk);
    assert.equal(r.ok, false, 'top-level junk refused: ' + JSON.stringify(junk));
  }
  // right shape, broken innards -> ok:true, nothing crashes, junk skipped
  const brokenInnards = [
    null, 7, 'x',
    { conversation_id: 'ok', mapping: null },                       // mapping missing
    { conversation_id: 'ok2', current_node: 'missing', mapping: {} }, // current_node points nowhere
    { conversation_id: 'ok3', current_node: 'z', mapping: { z: { id: 'z', parent: 'z', children: [], message: { author: null, content: null } } } }, // self-parent loop + null author/content
  ];
  const r = parseChatGPT(brokenInnards);
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.turns));
  // Claude broken innards
  const rc = parseClaude([null, 5, { chat_messages: null }, { chat_messages: [null, 3, { sender: 'human' }] }]);
  assert.equal(rc.ok, true);
  assert.ok(Array.isArray(rc.turns));
});

test('extractFacts catches preference / identity / project / correction from USER turns only', () => {
  const turns = [
    { source: 'x', conversationId: 'c', turnIndex: 0, role: 'user', text: 'I prefer tea over coffee', ts: 10 },
    { source: 'x', conversationId: 'c', turnIndex: 1, role: 'assistant', text: 'I prefer nothing, I am a bot', ts: 11 }, // assistant ignored
    { source: 'x', conversationId: 'c', turnIndex: 2, role: 'user', text: "I'm a baker in Leeds", ts: 12 },
    { source: 'x', conversationId: 'c', turnIndex: 3, role: 'user', text: "I'm working on a bakery app", ts: 13 },
    { source: 'x', conversationId: 'c', turnIndex: 4, role: 'user', text: 'Actually, I meant sourdough not rye', ts: 14 },
  ];
  const r = extractFacts(turns);
  assert.equal(r.ok, true);
  const kinds = r.facts.map((f) => f.kind);
  assert.ok(kinds.includes('preference'));
  assert.ok(kinds.includes('identity'));
  assert.ok(kinds.includes('project'));
  assert.ok(kinds.includes('correction'));
  assert.ok(!r.facts.some((f) => /I am a bot/.test(f.text)), 'assistant turns are not mined');
});

test('extractFacts surfaces recurring entities (2+ turns) but not one-offs, and never mines assistant turns', () => {
  const turns = [
    { source: 'x', conversationId: 'c', turnIndex: 0, role: 'user', text: 'Crumb needs a new logo', ts: 1 },
    { source: 'x', conversationId: 'c', turnIndex: 1, role: 'user', text: 'Can Crumb support gift cards?', ts: 2 },
    { source: 'x', conversationId: 'c', turnIndex: 2, role: 'user', text: 'Atlantis is a one-off mention', ts: 3 },
    // the assistant repeats "Zephyr" twice — assistant words are NOT the user's facts, so no Zephyr entity
    { source: 'x', conversationId: 'c', turnIndex: 3, role: 'assistant', text: 'Zephyr is a nice name. Zephyr again.', ts: 4 },
    { source: 'x', conversationId: 'c', turnIndex: 4, role: 'assistant', text: 'Consider Zephyr for the logo.', ts: 5 },
  ];
  const r = extractFacts(turns);
  const ents = r.facts.filter((f) => f.kind === 'entity' || f.kind === 'person');
  assert.ok(ents.some((f) => f.text === 'Crumb'), 'Crumb recurs in USER turns -> entity');
  assert.ok(!ents.some((f) => f.text === 'Atlantis'), 'single mention is not an entity');
  assert.ok(!ents.some((f) => f.text === 'Zephyr'), 'assistant-only tokens are never mined');
});

test('extractFacts captures a person from "my <relation> Name"', () => {
  const turns = [{ source: 'x', conversationId: 'c', turnIndex: 0, role: 'user', text: 'My colleague Dana reviewed it.', ts: 1 }];
  const r = extractFacts(turns);
  assert.ok(r.facts.some((f) => f.kind === 'person' && /Dana/.test(f.text)));
});

test('dedupe merges identical facts, sums counts, and is idempotent', () => {
  const facts = [
    { kind: 'preference', text: 'tea over coffee', source: 'chatgpt', conversationId: 'a', turnIndex: 0, ts: 10, base: 3, count: 1 },
    { kind: 'preference', text: 'Tea over coffee', source: 'claude', conversationId: 'b', turnIndex: 5, ts: 20, base: 3, count: 1 },
    { kind: 'identity', text: 'baker', source: 'x', conversationId: 'c', turnIndex: 0, ts: 5, base: 4, count: 1 },
  ];
  const r = dedupe(facts);
  assert.equal(r.ok, true);
  assert.equal(r.facts.length, 2);   // the two "tea over coffee" (case-insensitive) collapse
  const tea = r.facts.find((f) => /tea over coffee/i.test(f.text));
  assert.equal(tea.count, 2);
  assert.equal(tea.ts, 20);          // kept the newest location
  // idempotent: deduping again changes nothing
  const again = dedupe(r.facts);
  assert.equal(again.facts.length, 2);
  assert.equal(again.facts.find((f) => /tea/i.test(f.text)).count, 2);
});

test('dedupe with EQUAL timestamps keeps the first-seen source (strict >, not >=)', () => {
  const facts = [
    { kind: 'preference', text: 'oat milk', source: 'chatgpt', conversationId: 'a', turnIndex: 0, ts: 100, base: 3, count: 1 },
    { kind: 'preference', text: 'oat milk', source: 'claude', conversationId: 'b', turnIndex: 9, ts: 100, base: 3, count: 1 },
  ];
  const r = dedupe(facts);
  assert.equal(r.facts.length, 1);
  assert.equal(r.facts[0].source, 'chatgpt', 'equal ts must not overwrite the source');
  assert.equal(r.facts[0].count, 2);
});

test('dedupe drops empty-text facts (guard is all-or: none of null / non-string / empty survives)', () => {
  const facts = [
    { kind: 'preference', text: '', source: 'x', conversationId: 'a', turnIndex: 0, ts: 1, base: 3, count: 1 },
    { kind: 'identity', text: 'baker', source: 'x', conversationId: 'a', turnIndex: 1, ts: 1, base: 4, count: 1 },
  ];
  const r = dedupe(facts);
  assert.equal(r.facts.length, 1);
  assert.equal(r.facts[0].text, 'baker');
});

test('bucket routes facts into the five solids and derives the skin self-model', () => {
  const facts = [
    { kind: 'identity', text: 'baker', ts: 5, base: 4, count: 1 },
    { kind: 'preference', text: 'tea over coffee', ts: 10, base: 3, count: 3 },
    { kind: 'project', text: 'bakery app', ts: 12, base: 3, count: 1 },
    { kind: 'person', text: 'Sam Jones', ts: 8, base: 2, count: 2 },
    { kind: 'correction', text: 'sourdough not rye', ts: 14, base: 4, count: 1 },
  ];
  const r = bucket(facts);
  assert.equal(r.ok, true);
  for (const k of BUCKETS) assert.ok(Array.isArray(r.memory[k]), k + ' is an array');
  assert.ok(r.memory.crystal.some((f) => f.text === 'baker'));           // identity -> crystal
  assert.ok(r.memory.crystal.some((f) => f.text === 'sourdough not rye')); // correction -> crystal
  assert.ok(r.memory.dodeca.some((f) => f.text === 'tea over coffee'));   // preference -> dodeca
  assert.ok(r.memory.board.some((f) => f.text === 'bakery app'));         // project -> board
  assert.ok(r.memory.addressbook.some((f) => f.text === 'Sam Jones'));    // person -> addressbook
  assert.ok(r.memory.skin.length > 0 && r.memory.skin.some((f) => f.text === 'baker')); // derived self-model
});

test('bucket weight = base + capped repetition (exact), so a repeated fact outranks a one-off', () => {
  const facts = [
    { kind: 'preference', text: 'stated once', ts: 0, base: 3, count: 1 },
    { kind: 'preference', text: 'stated four times', ts: 0, base: 3, count: 4 },
  ];
  const r = bucket(facts);
  const once = r.memory.dodeca.find((f) => f.text === 'stated once');
  const four = r.memory.dodeca.find((f) => f.text === 'stated four times');
  assert.equal(once.weight, 3, 'base 3 + rep min(3, 1-1)=0');       // kills count -1->+1 and base ||->&&
  assert.equal(four.weight, 6, 'base 3 + rep min(3, 4-1)=3');       // kills count ||->&& (would drop rep to 0)
  assert.ok(r.memory.dodeca.indexOf(four) < r.memory.dodeca.indexOf(once), 'higher weight sorts first');
});

test('bucket ordering: weight beats recency, then newer ts, then alphabetical', () => {
  // weight vs ts DISAGREE: A has higher weight but older ts; A must still come first (weight wins)
  const wVsTs = bucket([
    { kind: 'entity', text: 'AlphaHeavy', ts: 1, base: 2, count: 4 },   // weight 5, old
    { kind: 'entity', text: 'BetaLight', ts: 999, base: 2, count: 1 },  // weight 2, new
  ]);
  assert.equal(wVsTs.memory.board[0].text, 'AlphaHeavy', 'weight beats a newer ts');
  // equal weight + equal ts -> alphabetical, regardless of input order (kills the localeCompare ||->&&)
  const tie = bucket([
    { kind: 'entity', text: 'Zulu', ts: 5, base: 2, count: 2 },
    { kind: 'entity', text: 'Alpha', ts: 5, base: 2, count: 2 },
  ]);
  assert.deepEqual(tie.memory.board.map((f) => f.text), ['Alpha', 'Zulu']);
  // equal weight, DIFFERENT ts -> newer first (kills the ts tiebreak ||->&&)
  const byTs = bucket([
    { kind: 'entity', text: 'Older', ts: 1, base: 2, count: 1 },
    { kind: 'entity', text: 'Newer', ts: 100, base: 2, count: 1 },
  ]);
  assert.equal(byTs.memory.board[0].text, 'Newer', 'at equal weight, newer ts sorts first');
});

test('seedMemory runs the whole pipeline over ChatGPT + Claude and is idempotent', () => {
  const sources = [{ source: 'chatgpt', data: chatgptExport }, { source: 'claude', data: claudeExport }];
  const r = seedMemory(sources);
  assert.equal(r.ok, true);
  assert.ok(r.stats.turns >= 5);
  assert.equal(r.stats.conversations, 2);
  assert.ok(r.stats.facts > 0);
  // the merged memory holds facts from BOTH providers
  assert.ok(r.memory.dodeca.some((f) => /tea over coffee/i.test(f.text)));   // from ChatGPT
  assert.ok(r.memory.crystal.some((f) => /baker/i.test(f.text)));            // from Claude
  // idempotent: same exports -> same memory shape/counts
  const r2 = seedMemory(sources);
  assert.deepEqual(r2.stats.byKind, r.stats.byKind);
  assert.equal(r2.memory.dodeca.length, r.memory.dodeca.length);
});

test('seedMemory refuses bad input', () => {
  assert.equal(seedMemory([]).ok, false);
  assert.equal(seedMemory(null).ok, false);
  assert.equal(seedMemory([{ source: 'chatgpt', data: 'not-an-array' }]).ok, false);
});

const multiPref = [{
  conversation_id: 'mp', current_node: 'p2',
  mapping: {
    p1: { id: 'p1', parent: null, children: ['p2'], message: { author: { role: 'user' }, create_time: 1, content: { parts: ['I prefer tea over coffee'] } } },
    p2: { id: 'p2', parent: 'p1', children: [], message: { author: { role: 'user' }, create_time: 2, content: { parts: ['I love cycling on weekends'] } } },
  },
}];

test('seedMemory byKind counts every deduped fact of a kind (not just one)', () => {
  const r = seedMemory([{ source: 'chatgpt', data: multiPref }]);
  assert.equal(r.ok, true);
  assert.equal(r.stats.byKind.preference, 2, 'two distinct preferences must both be counted');
});

test('seedMemory perSource accumulates turns across sources of the same provider', () => {
  const r = seedMemory([{ source: 'chatgpt', data: multiPref }, { source: 'chatgpt', data: multiPref }]);
  assert.equal(r.ok, true);
  assert.equal(r.stats.perSource.chatgpt, 4, 'two imports of 2 turns each = 4, not overwritten to 2');
});

test('recall answers from the user own history by word-overlap (the offline floor), and is honest when it knows nothing', () => {
  const seeded = seedMemory([{ source: 'chatgpt', data: chatgptExport }, { source: 'claude', data: claudeExport }]);
  // the deterministic floor matches on shared vocabulary (local-embedding recall is the optional edge)
  const hit = recall(seeded.memory, 'do I like coffee or tea?');
  assert.equal(hit.ok, true);
  assert.match(hit.answer, /tea over coffee/i);
  assert.ok(hit.matched > 0);
  // deterministic: same query -> same answer
  assert.equal(recall(seeded.memory, 'do I like coffee or tea?').answer, hit.answer);
  // recalls the project too, from its own words
  assert.match(recall(seeded.memory, 'what bakery app am I building?').answer, /bakery app/i);
  // honest empty when nothing overlaps
  const miss = recall(seeded.memory, 'quantum chromodynamics tensor eigenvalues');
  assert.equal(miss.matched, 0);
  assert.match(miss.answer, /have not learned/i);
});

test('recall validates its inputs', () => {
  assert.equal(recall(null, 'q').ok, false);
  assert.equal(recall({ crystal: [] }, 123).ok, false);
});

// a hand-built memory with controlled weights/timestamps, to pin recall's ranking and phrasing exactly
const rmem = {
  crystal: [{ kind: 'identity', text: 'a baker in Leeds', weight: 4, ts: 10 }],
  dodeca: [
    { kind: 'preference', text: 'tea over coffee', weight: 6, ts: 20 },
    { kind: 'preference', text: 'a minimal logo', weight: 5, ts: 5 },
    { kind: 'preference', text: 'a bright logo design', weight: 3, ts: 5 },
  ],
  board: [
    { kind: 'project', text: 'js framework migration', weight: 3, ts: 8 },
    { kind: 'entity', text: 'thoughts about launch', weight: 2, ts: 8 },
    { kind: 'entity', text: 'match Zulu', weight: 2, ts: 7 },     // input order Zulu-before-Alpha on purpose
    { kind: 'entity', text: 'match Alpha', weight: 2, ts: 7 },
  ],
  addressbook: [],
  skin: [{ kind: 'identity', text: 'ignored self-model line', weight: 9, ts: 99 }],
};

test('recall phrases the answer by fact kind, from the user own words', () => {
  const r = recall(rmem, 'coffee');
  assert.ok(r.matched >= 1);
  assert.match(r.answer, /you prefer tea over coffee/i);   // kind-specific phrase, not a generic "you noted"
});

test('recall ranks by overlap then weight (higher-weight fact wins a tie on overlap)', () => {
  const r = recall(rmem, 'logo');                          // both logo facts overlap once
  assert.equal(r.hits[0].fact.text, 'a minimal logo');     // weight 5 beats weight 3 (and beats ts/alpha order)
});

test('recall breaks a full tie (equal score and ts) alphabetically, regardless of input order', () => {
  const r = recall(rmem, 'match');
  assert.equal(r.hits[0].fact.text, 'match Alpha');        // Alpha < Zulu, though Zulu was inserted first
});

test('recall honours topN, and falls back to the default when topN is 0/invalid', () => {
  assert.equal(recall(rmem, '', 3).hits.length, 3);        // empty query returns all, capped to topN
  assert.equal(recall(rmem, '', 0).hits.length, 5);        // topN 0 is not "zero results" — it's the default 5
});

test('recall pushes nothing for a no-overlap query (strict overlap > 0), so hits and matched are empty', () => {
  const r = recall(rmem, 'xylophone zzz');
  assert.equal(r.hits.length, 0);
  assert.equal(r.matched, 0);
  assert.match(r.answer, /have not learned/i);
});

test('recall on an empty query returns candidates but matches nothing (parts require real overlap)', () => {
  const r = recall(rmem, '');
  assert.ok(r.hits.length > 0);
  assert.equal(r.matched, 0);
});

test('recall ignores 2-char tokens and stopwords in the query (so they never spuriously match)', () => {
  assert.equal(recall(rmem, 'js').matched, 0);             // "js" is 2 chars -> dropped -> no match on js-framework
  assert.equal(recall(rmem, 'about').matched, 0);          // "about" is a stopword -> dropped both sides
});

test('recall never searches the derived skin bucket', () => {
  assert.equal(recall(rmem, 'ignored').matched, 0);        // the skin self-model is a view, not a recall target
});

test('totality: no export or extractor call throws on hostile garbage', () => {
  const garbage = [null, undefined, 0, '', [], {}, NaN, Infinity, [[[]]], { a: { b: { c: 1 } } }, 'ЀЁЂ\u0000', [1, 'x', null]];
  for (const g of garbage) {
    assert.doesNotThrow(() => parseChatGPT(g));
    assert.doesNotThrow(() => parseClaude(g));
    assert.doesNotThrow(() => parseExport('chatgpt', g));
    assert.doesNotThrow(() => extractFacts(g));
    assert.doesNotThrow(() => dedupe(g));
    assert.doesNotThrow(() => bucket(g));
    assert.doesNotThrow(() => seedMemory(g));
    assert.doesNotThrow(() => recall(g, 'q'));
    assert.doesNotThrow(() => recall({ crystal: g }, 'q'));
  }
});

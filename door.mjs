// door.mjs — THE DOOR. The page described fall-os and handed the visitor nothing to use.
//
// This makes the OS usable in the tab, on the visitor's own input, with no key, no account, no
// upload and no server:
//
//   1 · THE LIVE CONDUCTOR — the real `conduct()` from didy.mjs, running the real five phases over
//       the real core, on whatever the visitor types. Nothing commits until they author it.
//   2 · ONE REAL TOOL — the konomi tag-conformance scanner, working on their own pasted tags.
//   3 · THE SOVEREIGNTY PROOF — a network kill-switch and a request counter that stays at zero,
//       because there is nothing to count.
//
// Every import below is the SAME source the test suites and the mutation gate run against. The page
// does not re-implement the loop to demonstrate it — that would make the demo a drawing of the
// product rather than the product.
import { KAPPA, GOLDEN_DEG } from './core.mjs';
import { makeDidy, register, conduct } from './didy.mjs';
import { t0Organ, summarise } from './organs/t0.mjs';
import { recurring, ranked } from './shadow.mjs';
import { load as loadStandards, conform } from './organs/isa.mjs';
import { SYSTEM as T1_SYSTEM, phrase, unmoved } from './organs/t1.mjs';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

// ── 3 · THE SOVEREIGNTY PROOF ────────────────────────────────────────────────────────────────────
//
// The claim on this page is "nothing leaves your machine". A claim like that is worth nothing while
// it is only written down, so the page counts what it does on the network and lets the visitor cut
// it entirely.
//
// ⚑ THE COUNTER READS THE BROWSER'S OWN RESOURCE TIMELINE, NOT OUR WRAPPER — and that correction
// came from catching it lying. The first version counted inside a patched `window.fetch`, which
// looked thorough and was not: loading a model pulled **twelve** off-origin requests (huggingface.co
// ×10, esm.run, raw.githubusercontent.com) while the counter sat contentedly at 0, because WebLLM
// stores shards through the **Cache API**, which never touches `fetch`. A sovereignty counter that
// under-reports is worse than no counter — it manufactures exactly the confidence it should be
// earning. PerformanceObserver sees what actually hit the network whatever API asked for it.
//
// The wrappers stay, but only for what they are genuinely good at: BLOCKING, and counting the calls
// they blocked (a blocked call never reaches the network, so the observer would never see it).
//
// Stated limit, because the honest version of this has one: this observes the requests of THIS
// document. It is not a browser firewall and cannot see inside a third-party worker's own scope.
//
// Counted in TWO buckets, because a single number here would be dishonest in one direction or the
// other. This page loads its own static files — the standards list the tag scanner needs is one of
// them. Counting those in the headline would read "requests: 2" and look like phoning home; skipping
// them silently would mean the counter hides real traffic. So OFF-ORIGIN calls — anything leaving for
// a host that is not this page — are the headline, because that is what the sovereignty claim is
// actually about, and same-origin file loads are shown beside it, named as what they are.
//
// The document itself arrived over the network like any web page. Everything after that is counted.
let offCalls = 0, assetCalls = 0, offline = false;
const offLog = [];

const offHosts = new Map();

function recordCall(url) {
  let sameOrigin = true, host = '';
  try {
    const u = new URL(String(url), location.href);
    sameOrigin = u.origin === location.origin;
    host = u.host;
  } catch { sameOrigin = false; }

  if (sameOrigin) assetCalls++;
  else {
    offCalls++;
    offLog.push(String(url).slice(0, 120));
    offHosts.set(host, (offHosts.get(host) || 0) + 1);
  }

  const c = $('netCount');
  if (c) { c.textContent = String(offCalls); c.classList.toggle('hot', offCalls > 0); }
  const a = $('assetCount');
  if (a) a.textContent = String(assetCalls);
  renderHosts();
}

// Everything the document actually put on the wire, whichever API asked for it — fetch, XHR, a
// dynamic import, a stylesheet, or the Cache API that made the first version of this counter wrong.
// `buffered: true` replays the entries from before this ran, so the page's own boot loads are
// included rather than being invisible by luck of timing.
(function observeRealTraffic() {
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) recordCall(e.name);
    }).observe({ type: 'resource', buffered: true });
  } catch { /* an older browser just gets the wrapper's numbers */ }
})();

// Naming every host the page reached is what makes the counter worth believing. A number on its own
// asks for trust; a number that says "214 — all of them to huggingface.co, because you clicked load
// a model" can be checked. It stays hidden while the count is zero, which is its resting state.
function renderHosts() {
  const box = $('netHosts');
  if (!box) return;
  if (!offHosts.size) { box.hidden = true; return; }
  box.hidden = false;
  box.textContent = '↳ ' + [...offHosts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([h, n]) => `${h || 'unknown'} ×${n}`)
    .join(' · ') + ' — all of it the model you asked for; nothing was sent';
}

(function armNetworkProof() {
  const realFetch = window.fetch ? window.fetch.bind(window) : null;
  if (realFetch) {
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      // Counted here ONLY when blocked: a blocked call never reaches the network, so the resource
      // observer will never see it, and a refused attempt is exactly what the visitor wants counted.
      if (offline) { recordCall(url); return Promise.reject(new TypeError('fall-os: network is switched off by the visitor')); }
      return realFetch(input, init);
    };
  }
  const RealXHR = window.XMLHttpRequest;
  if (RealXHR) {
    const open = RealXHR.prototype.open;
    RealXHR.prototype.open = function (method, url, ...rest) {
      if (offline) { recordCall(url); throw new DOMException('fall-os: network is switched off by the visitor', 'NetworkError'); }
      return open.call(this, method, url, ...rest);
    };
  }
})();

function setOffline(next) {
  offline = next;
  document.body.classList.toggle('is-offline', offline);
  const btn = $('netToggle'), pill = $('netPill'), banner = $('netBanner');
  if (btn) btn.textContent = offline ? 'Reconnect the network' : 'Cut the network';
  if (pill) { pill.textContent = offline ? 'Network: OFF' : 'Network: on'; pill.classList.toggle('off', offline); }
  if (banner) banner.hidden = !offline;
}

// ── TIER 1 · a real model, downloaded once, then living in this tab ──────────────────────────────
//
// Strictly opt-in and never touched on page load. It is the one thing here that costs the visitor
// something — a model file over the network — so it happens only when they click, after being told
// the size, and the page says plainly that this is bytes coming IN and never data going OUT.
//
// It is loaded from a CDN by dynamic import, which is why it cannot be part of the default promise:
// a page that claims to need nothing must not quietly fetch a gigabyte to prove it.
const MODELS = [
  { id: 'Llama-3.2-1B-Instruct-q4f32_1-MLC', label: 'Llama 3.2 · 1B', size: '~1.1 GB' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC', label: 'Qwen 2.5 · 1.5B', size: '~1.6 GB' },
  // Kept because it is the fastest way to see the tier work at all, and labelled for what it does:
  // measured on this page, it hands the built-in wording straight back rather than rewriting it.
  { id: 'SmolLM2-360M-Instruct-q4f32_1-MLC', label: 'SmolLM2 · 360M (fast, often just echoes)', size: '~0.4 GB' },
];

let engine = null, engineModel = null, loading = false;

const tierName = () => (engine ? 'Tier 1 · ' + (MODELS.find(m => m.id === engineModel) || {}).label : 'Tier 0 · built in');

function setTier(msg, busy) {
  const t = $('tierNow');
  if (t) t.textContent = msg || tierName();
  const b = $('loadModel');
  if (b) b.disabled = !!busy;
}

async function loadModel() {
  if (loading || engine) return;
  const id = $('modelPick').value;
  const meta = MODELS.find(m => m.id === id) || MODELS[0];

  if (!navigator.gpu) {
    setTier('Tier 0 only — this browser has no WebGPU, so a model cannot run here.');
    return;
  }
  if (offline) {
    setTier('Tier 0 only — the network is switched off, and the model has to be downloaded first.');
    return;
  }

  loading = true;
  setTier(`fetching ${meta.label} (${meta.size}) — first time only…`, true);
  try {
    // Imported at click time, not at page load: the default experience must stay dependency-free.
    const webllm = await import('https://esm.run/@mlc-ai/web-llm');
    engine = await webllm.CreateMLCEngine(id, {
      initProgressCallback: (p) => setTier(`${meta.label}: ${p.text || ''}`.slice(0, 110), true),
    });
    engineModel = id;
    setTier(tierName() + ' — running in this tab. Cut the network; it keeps working.');
    $('modelRow').classList.add('loaded');
  } catch (e) {
    engine = null;
    // Named, not swallowed. "It didn't work" on a gigabyte download is the most annoying possible
    // outcome, and the reason is usually specific and actionable (no f16, out of memory, blocked).
    setTier('the model failed to load: ' + ((e && e.message) ? e.message : String(e)).slice(0, 140));
  } finally {
    loading = false;
    const b = $('loadModel');
    if (b) b.disabled = !!engine;
  }
}

// The injected generator the t1 kernel calls. Everything about how the model is reached lives here;
// nothing about it lives in the kernel, which is why the kernel is testable without a gigabyte.
const generate = async (prompt) => {
  const r = await engine.chat.completions.create({
    messages: [{ role: 'system', content: T1_SYSTEM }, { role: 'user', content: prompt }],
    temperature: 0.4,
    max_tokens: 420,
  });
  return (r && r.choices && r.choices[0] && r.choices[0].message.content) || '';
};

// ── 1 · THE LIVE CONDUCTOR ───────────────────────────────────────────────────────────────────────

const PHASES = ['EXPLORE', 'RESOLVE', 'VERIFY', 'BUILD', 'REMEMBER'];
const didy = makeDidy('fall');          // one conductor for the session, so its memory and shadow accumulate
let lastRun = null;
// branch index → the model's sentence for it. Keyed by the branch's OWN index, never by position,
// so a re-render cannot slide one stance's phrasing onto another.
let phrasings = new Map();

function lightPhases(upto) {
  PHASES.forEach((p, i) => {
    const n = $('ph-' + p);
    if (n) { n.classList.toggle('on', i <= upto); n.classList.toggle('pending', i > upto); }
  });
}

// EXPLORE, drawn: each branch sits at its own multiple of the golden angle, which is why the
// candidates spread across the taxonomy instead of bunching near the obvious one. This is the page's
// original demo widget doing an actual job — the explore phase of a working conductor.
function drawFan(branches, chosenIdx) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = $('fan');
  if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const cx = 130, cy = 130, R = 104;
  const ring = document.createElementNS(NS, 'circle');
  ring.setAttribute('cx', cx); ring.setAttribute('cy', cy); ring.setAttribute('r', R);
  ring.setAttribute('class', 'fan-ring');
  svg.appendChild(ring);
  branches.forEach((b) => {
    const a = (b.theta - 90) * Math.PI / 180;
    const r = 34 + (R - 34) * b.score;                       // distance from the centre IS the score
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', cx); line.setAttribute('y1', cy);
    line.setAttribute('x2', x); line.setAttribute('y2', y);
    line.setAttribute('class', 'fan-line' + (b.holds ? ' holds' : ''));
    svg.appendChild(line);
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y);
    dot.setAttribute('r', b.i === chosenIdx ? 7 : 4.5);
    dot.setAttribute('class', 'fan-dot' + (b.holds ? ' holds' : '') + (b.i === chosenIdx ? ' chosen' : ''));
    svg.appendChild(dot);
  });
  const gate = document.createElementNS(NS, 'circle');
  gate.setAttribute('cx', cx); gate.setAttribute('cy', cy);
  gate.setAttribute('r', 34 + (R - 34) * KAPPA);
  gate.setAttribute('class', 'fan-gate');
  svg.appendChild(gate);
}

function evidenceChips(ev) {
  const box = $('evidence');
  if (!box) return;
  box.innerHTML = '';
  if (!ev.found) {
    box.appendChild(el('span', 'chip none', 'no signals found — ranked by stated defaults only'));
    return;
  }
  for (const s of ev.signals) {
    const c = el('span', 'chip');
    c.appendChild(el('b', null, s.label));
    c.appendChild(el('i', null, ' ' + s.cues.join(' · ')));
    box.appendChild(c);
  }
}

function stanceRow(b, { committed = false, canCommit = true } = {}) {
  const row = el('div', 'stance' + (b.holds ? '' : ' road') + (committed ? ' committed' : ''));
  const head = el('div', 'stance-head');
  head.appendChild(el('span', 'stance-name', b.value.label));
  const pct = el('span', 'stance-score', (b.score * 100).toFixed(0) + '%');
  pct.title = 'score ' + b.score.toFixed(3) + ' · gate κ = ' + KAPPA.toFixed(3);
  head.appendChild(pct);
  row.appendChild(head);
  row.appendChild(el('p', 'stance-move', b.value.move));

  const bar = el('div', 'bar');
  const fill = el('div', 'bar-fill' + (b.holds ? ' holds' : ''));
  fill.style.width = (b.score * 100).toFixed(1) + '%';
  bar.appendChild(fill);
  const gate = el('div', 'bar-gate');
  gate.style.left = (KAPPA * 100).toFixed(1) + '%';
  gate.title = 'κ = ' + KAPPA.toFixed(3) + ' — the collapse threshold';
  bar.appendChild(gate);
  row.appendChild(bar);

  // The why. A score a visitor cannot audit is a number they have no reason to trust, so every row
  // names the signals that raised it and the ones that pushed it down.
  const why = el('div', 'why');
  if (b.value.up && b.value.up.length) why.appendChild(el('span', 'up', '▲ ' + b.value.up.join(', ')));
  if (b.value.down && b.value.down.length) why.appendChild(el('span', 'down', '▼ ' + b.value.down.join(', ')));
  if (!why.childNodes.length) why.appendChild(el('span', 'flat', 'no signal either way — this is its stated default'));
  row.appendChild(why);

  // The model's sentence, when there is one — attributed, and always BELOW the built-in move rather
  // than replacing it. The visitor should be able to see exactly which words came from a model and
  // which came from code that was mutation-tested.
  const said = phrasings.get(b.i);
  if (said) {
    const p = el('div', 'phrased');
    p.appendChild(el('span', 'phrased-tag', 'in your words'));
    p.appendChild(el('span', 'phrased-text', said));
    row.appendChild(p);
  }

  if (b.holds && canCommit && !committed) {
    const btn = el('button', 'commit', 'Commit this →');
    btn.addEventListener('click', () => commit(b));
    row.appendChild(btn);
  }
  if (committed) row.appendChild(el('div', 'committed-tag', '✓ you authored this — built and remembered'));
  return row;
}

function renderField(field, ev, committedIdx) {
  const holds = $('holdsList'), roads = $('roadsList');
  holds.innerHTML = ''; roads.innerHTML = '';
  for (const b of field.holds) holds.appendChild(stanceRow(b, { committed: b.i === committedIdx }));
  for (const b of field.roads) roads.appendChild(stanceRow(b, { canCommit: false }));
  $('holdsCount').textContent = field.holds.length;
  $('roadsCount').textContent = field.roads.length;
  $('verdict').textContent = summarise(field, ev);
  drawFan([...field.holds, ...field.roads], committedIdx == null ? -1 : committedIdx);
}

function run() {
  const text = $('ask').value.trim();
  if (!text) { $('verdict').textContent = 'Type a decision you are actually facing, then run it.'; return; }
  const n = Number($('branches').value) || 6;

  const organ = t0Organ(text);
  register(didy, 't0', organ);                 // TRAIN the conductor with the tier-0 organ
  const r = conduct(didy, text, { n });        // the real loop — no author, so nothing is decided

  lastRun = { text, n, organ, field: r.field };
  phrasings = new Map();                       // last run's wording must never leak onto this one
  evidenceChips(organ.evidence);
  lightPhases(2);                              // EXPLORE, RESOLVE, VERIFY have run; BUILD waits on the visitor
  renderField(r.field, organ.evidence, null);
  $('buildNote').hidden = r.field.holds.length === 0;
  $('emptyNote').hidden = r.field.holds.length > 0;
  renderMemory();
  $('result').hidden = false;
  $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // The deterministic field is already on screen. If a model is loaded it now says the same stances
  // in the terms of this decision — an addition that arrives late, never a gate on the answer.
  if (engine) runPhrasing(r.field, organ, text);
}

async function runPhrasing(field, organ, text) {
  const note = $('t1note');
  if (note) { note.hidden = false; note.textContent = 'the model is putting these in your words…'; }
  const res = await phrase(text, field.holds, organ.evidence, generate);

  // Assert the promise the page makes, at run time, on the real result. If the rows ever stopped
  // matching the tier-0 field, showing them anyway would make the page a liar — so it says so and
  // shows nothing from the model instead.
  if (!unmoved(field.holds, res.rows)) {
    if (note) note.textContent = 'the model’s output did not line up with the field, so it was discarded — the built-in wording stands.';
    return;
  }
  phrasings = new Map(res.rows.filter(r => r.phrased).map(r => [r.i, r.phrased]));
  if (note) {
    note.textContent = res.note + ' — scores, order and the gate are unchanged, and were never sent anywhere.';
  }
  // Re-render with the wording attached. Same field object, so nothing was recomputed.
  renderField(field, organ.evidence, null);
}

// BUILD + REMEMBER. The visitor is the author: the same deterministic loop is re-run with an author
// that picks the branch they clicked, so what gets built is what a person chose — the 90/10 split as
// a thing you do rather than a thing the page claims.
function commit(branch) {
  if (!lastRun) return;
  register(didy, 't0', lastRun.organ);
  const r = conduct(didy, lastRun.text, {
    n: lastRun.n,
    author: (holds) => holds.find(h => h.i === branch.i) || null,
  });
  lightPhases(4);
  renderField(r.field, lastRun.organ.evidence, branch.i);
  renderMemory();
  $('buildNote').hidden = true;
}

function renderMemory() {
  const m = $('memList');
  m.innerHTML = '';
  if (!didy.memory.length) {
    m.appendChild(el('li', 'muted-li', 'nothing authored yet — the conductor builds only what you commit'));
  } else {
    for (const entry of didy.memory.slice(-6).reverse()) {
      const li = el('li');
      li.appendChild(el('b', null, entry.built.label));
      li.appendChild(el('span', 'muted-li', ' — ' + entry.decision));
      m.appendChild(li);
    }
  }
  $('shadowCount').textContent = didy.shadow.shadows.size;
  const rec = recurring(didy.shadow, 2);
  const rl = $('recurList');
  rl.innerHTML = '';
  if (!rec.length) {
    rl.appendChild(el('li', 'muted-li', 'run a second, different decision — anything you keep forking toward but never commit to shows up here'));
  } else {
    for (const s of rec.slice(0, 4)) {
      const li = el('li');
      // `branch` is the readable description the index stores; `id` is its content address. Showing
      // the address was a bug that made the most interesting panel on the page read as hex noise.
      li.appendChild(el('b', null, s.branch || s.id));
      li.appendChild(el('span', 'muted-li', ' — nearly chosen in ' + s.times_shadowed + ' different decisions'));
      rl.appendChild(li);
    }
  }
}

// ── 2 · ONE REAL TOOL ────────────────────────────────────────────────────────────────────────────
//
// The konomi tag-conformance scanner, vendored from the JEDI fork and gated there at 44/44. A plant
// engineer pastes their tag list and gets back which tags map onto the industrial standards and — the
// part that is actually worth something — WHICH ONES DO NOT, named rather than counted. It runs
// entirely on the pasted text; nothing is uploaded, and it works with the network switched off.
let konomi = null;

async function armTool() {
  try {
    // Loaded eagerly at startup and held in memory, so the tool still works after the visitor cuts
    // the network. The service worker precaches it, so a reload works offline too.
    const res = await fetch('./organs/standards.json');
    konomi = loadStandards(await res.json());
    const s = $('toolReady');
    if (s) s.textContent = konomi.byId.size + ' standards · ' + konomi.udtOwner.size + ' UDTs loaded — ready, and it keeps working offline';
  } catch (e) {
    const s = $('toolReady');
    if (s) s.textContent = 'standards failed to load: ' + e.message;
  }
}

function scanTags() {
  if (!konomi) { $('toolOut').textContent = 'the standards have not finished loading yet.'; return; }
  const raw = $('tags').value;
  const tags = raw.split(/[\n,;]+/).map(t => t.trim()).filter(Boolean);
  if (!tags.length) { $('toolOut').textContent = 'paste some tag names first — one per line.'; return; }

  const r = conform(konomi, tags);
  const out = $('toolOut');
  out.innerHTML = '';

  const head = el('div', 'tool-head');
  head.appendChild(el('b', null, r.matched + ' of ' + r.total + ' tags map'));
  head.appendChild(el('span', null, ' · ' + (r.coverage * 100).toFixed(0) + '% coverage'));
  out.appendChild(head);

  // The kernel refuses to fold these two together, so neither does the page: an exact hit is a fact,
  // a weak hit is a guess about someone's naming convention, and a plant manager is entitled to know
  // which number is which before they act on it.
  const split = el('p', 'tool-split');
  split.appendChild(el('b', null, r.exact + ' exact'));
  split.appendChild(el('span', null, ' — matched the standard outright · '));
  split.appendChild(el('b', null, r.weak + ' inferred'));
  split.appendChild(el('span', null, ' — matched on a naming convention, treat as a guess'));
  out.appendChild(split);

  const missed = r.results.filter(x => !x.matched);
  if (missed.length) {
    const g = el('div', 'tool-gaps');
    g.appendChild(el('h5', null, 'The ' + missed.length + ' that do NOT map — named, not counted:'));
    const ul = el('ul');
    for (const gap of missed) {
      const li = el('li');
      li.appendChild(el('code', null, gap.tag));
      li.appendChild(el('span', 'muted-li', ' — ' + gap.why));
      ul.appendChild(li);
    }
    g.appendChild(ul);
    out.appendChild(g);
  } else {
    out.appendChild(el('p', 'tool-clean', 'Every tag mapped. Nothing was dropped silently — that is the whole report.'));
  }

  const by = el('div', 'tool-by');
  by.appendChild(el('h5', null, 'Where the mapped ones landed:'));
  const ul2 = el('ul');
  for (const [std, count] of Object.entries(r.byStandard)) {
    const li = el('li');
    li.appendChild(el('code', null, std));
    li.appendChild(el('span', 'muted-li', ' — ' + count + ' tag' + (count === 1 ? '' : 's')));
    ul2.appendChild(li);
  }
  by.appendChild(ul2);
  out.appendChild(by);
}

// Every prose mention of the estate's size is a slot filled from estate.json, which is itself
// generated from the canonical index. The page previously said "1,548 repositories" in eight places
// as typed text; the index had moved to 1,621 and the page had no way to notice. A surface that
// states a fact about the estate has to READ it — a typed count is a claim, and claims go stale.
async function fillEstateCounts() {
  const slots = document.querySelectorAll('.repoCount');
  if (!slots.length) return;
  try {
    const t = (await (await fetch('./estate.json')).json()).totals;
    const n = t && (t.repositories ?? t.total);
    if (typeof n === 'number') for (const s of slots) s.textContent = n.toLocaleString();
  } catch { /* leave the last generated value standing rather than blanking the sentence */ }
}

// ── wire ─────────────────────────────────────────────────────────────────────────────────────────

function boot() {
  $('runAsk').addEventListener('click', run);
  $('ask').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); });
  document.querySelectorAll('[data-example]').forEach(b =>
    b.addEventListener('click', () => { $('ask').value = b.getAttribute('data-example'); run(); }));

  $('netToggle').addEventListener('click', () => setOffline(!offline));

  const pick = $('modelPick');
  for (const m of MODELS) {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = `${m.label} · ${m.size}`;
    pick.appendChild(o);
  }
  $('loadModel').addEventListener('click', loadModel);
  if (!navigator.gpu) {
    $('loadModel').disabled = true;
    setTier('Tier 0 · built in — this browser has no WebGPU, so tier 1 cannot run here.');
  } else {
    setTier();
  }
  $('openTool').addEventListener('click', () => {
    const p = $('toolPanel');
    p.hidden = false;
    $('openTool').textContent = 'The tool is open below ↓';
    p.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('scanTags').addEventListener('click', scanTags);
  $('sampleTags').addEventListener('click', () => {
    $('tags').value = ['Line3_ProcessCell_Temp', 'Unit_Filler_State', 'OEE', 'PLC_SCRATCH_7',
      'Equipment_Mixer_Speed', 'Alarm_HighPressure', 'Batch_Recipe_ID', 'WIDGET_COUNT_RAW'].join('\n');
    scanTags();
  });

  lightPhases(-1);
  renderMemory();
  armTool();
  fillEstateCounts();
  $('goldenNote').textContent = 'branches fan at ' + GOLDEN_DEG.toFixed(2) + '° · gate κ = ' + KAPPA.toFixed(3);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

// game.mjs — FALL-OS AS ONE GAME. Not a marketing page with links out; a single self-contained world
// you play inside this one tab. You HATCH an empty Didy, feed it your own history, and LEVEL UP through
// the estate's real systems — memory, verify, skin, budget, mesh — each one a zone in here, each unlock a
// real capability your Didy earns. One save file that grows. Nothing leaves your machine; nothing links out.
//
// Everything is kernel-backed and gated:
//   · seed.mjs  — the history-import + five-solid memory + offline recall (witness 67/67)
//   · kard.mjs  — the signed capability wallet: canOpen gates a zone, spendGate is the budget wall (witness 49/49)
//   · organs/estate.mjs — the one content-address (sha256) both of the above share
//   · the Forge and the Tag Foundry are the estate's real conductor + conformance tool, already in this page
//
// — Kar (karma-didy), fall-os · the game
import { seedMemory, recall } from './seed.mjs';
import { mintKard, attachSignature, verifyKard, kardSignable, canOpen, spendGate } from './kard.mjs';
import { sha256 } from './organs/estate.mjs';
// ── sovereign persistence: the KESTREL shadow fold (vendored, pinned — vendor/kestrel/VENDOR.md) ──────────────────
import { openKestrelDB, putGenome, getGenome, putWallet, getWallet, exhale, getLedger } from './vendor/kestrel/kestrel-db.mjs';
import { genome as kestrelGenome, reconstruct as kestrelReconstruct, canonicalState as kestrelCanon, replayStore, WIRE, PAYLOAD } from './vendor/kestrel/kestrelledger.mjs';
import { encodeGrant, encodeSkin, encodeSeed, packEvent, gatedSurvivors, reduceProgress, DIDY_SOURCE } from './persist-ledger.mjs';
import { ZONE_LEDGER, SKIN_ORDER, zoneIndexById, skinIndex } from './zone-ledger-map.mjs';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const SAVE_KEY = 'fallos.game.v1';           // legacy local save — the graceful fallback where in-tab Ed25519 is absent
const bufToHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// ── THE WORLD — every zone is a system already in THIS repo. lvl = the level it unlocks at; cap = the
// capability your Didy earns; kernel = the real module behind it (named, never linked out). No zone opens
// a URL — the whole estate is nested in this one page. ──────────────────────────────────────────────────
const ZONES = [
  { id: 'hatch',   lvl: 0, name: 'The Nursery',    verb: 'Hatch',        cap: 'identity', kernel: 'kard.mjs · WebCrypto Ed25519', play: 'hatch',
    blurb: 'An empty Didy is born: a real Ed25519 identity minted in this tab, and a signed capability card (a kard) that says what it may do. The private half never leaves your device.' },
  { id: 'memory',  lvl: 1, name: 'The Memory Grove', verb: 'Seed',       cap: 'memory',   kernel: 'seed.mjs', play: 'seed',
    blurb: 'Feed your Didy your own past. Drop a ChatGPT or Claude export; it is parsed here, mined for what it says about you, and filed into a five-part memory — on your machine, never uploaded.' },
  { id: 'recall',  lvl: 1, name: 'First Light',     verb: 'Recall',      cap: 'recall',   kernel: 'seed.mjs · recall', play: 'recall',
    blurb: 'Ask your freshly-seeded Didy about you. It answers from your own words — deterministic, offline, no model needed. The first spark of a mind that is yours.' },
  { id: 'forge',   lvl: 2, name: 'The Forge',       verb: 'Direct',      cap: 'build',    kernel: 'core.mjs · didy.mjs', play: 'reveal:door',
    blurb: 'Put a real decision to the conductor. It explores options at the golden angle, scores them against one shared gate, and commits only what you author — the estate’s real five-phase loop, running here.' },
  { id: 'foundry', lvl: 2, name: 'The Tag Foundry', verb: 'Wield',       cap: 'tool',     kernel: 'organs/isa.mjs', play: 'reveal:tool',
    blurb: 'Wield one of the estate’s tools: paste industrial tag names and it maps them to the ISA-95/88 standard, on your own input, offline. A real organ, not a demo of one.' },
  { id: 'skin',    lvl: 3, name: 'The Wardrobe',    verb: 'Skin',        cap: 'skin',     kernel: 'kard.skinRef', play: 'skin',
    blurb: 'Give your Didy a face of its own. The skin you choose is written into your kard as its skinRef, so your look travels with your identity.' },
  { id: 'dynamo',  lvl: 4, name: 'The Dynamo',      verb: 'Recycle',     cap: 'cheap',    kernel: 'core.mjs · content cache', play: 'soon',
    blurb: 'Run on your own electric. The core caches by content, so identical work is never paid for twice — the seed of running an estate cheaply on hardware you own.' },
  { id: 'mint',    lvl: 5, name: 'The Mint',        verb: 'Own',         cap: 'mint',     kernel: 'fallforgemint (estate organ)', play: 'soon',
    blurb: 'Own a model instead of renting one. This is where your Didy stops borrowing intelligence by the token and starts holding weights of its own.' },
  { id: 'dreaming',lvl: 6, name: 'The Dreaming',    verb: 'Reflect',     cap: 'reflect',  kernel: 'walled by construction', play: 'soon',
    blurb: 'Your Didy consolidates overnight, reorganising what it learned — walled so it can neither publish nor spend while it dreams. Autonomy that cannot surprise you.',
    credit: 'The Dreaming draws on Gary W. Floyd’s dream-state design, shared with the estate — Gary W. Floyd, Lumiea Systems Research Division — ThunderStruck Service LLC, “Dream State Architecture: GEP-Guided Memory Consolidation and Entropy Regulation in Artificial Consciousness Systems,” 2025.' },
  { id: 'treasury',lvl: 7, name: 'The Treasury',    verb: 'Spend',       cap: 'spend',    kernel: 'kard.mjs · spendGate', play: 'spend',
    blurb: 'A budget your Didy cannot cross. Every action costs; the wall is a real gated kernel, and no capability, signature or caller can spend past the ceiling the kard was minted with.' },
  { id: 'mesh',    lvl: 8, name: 'The Mesh',        verb: 'Connect',     cap: 'mesh',     kernel: 'r7.mjs · webrtc.mjs', play: 'soon',
    blurb: 'Meet other Didys peer to peer — no server, no middleman. Your identity is your address; the estate becomes a fabric of sovereign nodes.' },
];
const zoneById = (id) => ZONES.find((z) => z.id === id);
const BUDGET_CAP = 100;   // sparks — the demonstrable budget ceiling minted into every kard

// ── THE SAVE FILE — one growing record. Progress persists; the memory itself (yours, and large) is kept
// in-session and re-seeded, never written off your device beyond its summary. ──────────────────────────
let save = null;
let memory = null;       // in-session five-solid memory
const sources = [];      // accumulated export sources (ChatGPT + Claude merge)
let signKey = null;      // the WebCrypto private key, this tab only
let pubKeyObj = null;    // the WebCrypto public key, for the gated inhale (verify-before-parse)
let spent = 0;           // running spend for the Treasury demo

// ── THE SHADOW FOLD — IndexedDB as a binary append-only ledger of signed 6-byte packets ──────────────────────────
let db = null;           // the KESTREL_OS IndexedDB handle (this tab)
let ledgerSeq = 0;       // monotonic exhale counter (= stored frame count) — makes every legit frame unique
let livePackets = 0;     // count of VALID (applied) frames — what the HUD shows (rejected poison is not counted)
let lastInhale = null;   // { gated, frames, applied, rejectedTotal } from the last boot replay, for the HUD
const ZONE_TABLE = ZONE_LEDGER.map((z) => ({ id: z.id, cap: z.cap, lvl: z.lvl }));
const ledgerActive = () => !!(db && signKey && pubKeyObj);
const wcSign = (msg) => crypto.subtle.sign({ name: 'Ed25519' }, signKey, msg);
const wcVerify = (key, msg, sig) => crypto.subtle.verify({ name: 'Ed25519' }, key, sig, msg);

function blankSave() {
  return { id: null, kard: null, level: -1, xp: 0, caps: [], skin: 'aurora', seededStats: null, done: {} };
}

async function ensureDB() {
  if (db) return db;
  try { db = await openKestrelDB(); } catch { db = null; }
  return db;
}

// EXHALE — fold one state transition into the ledger as a signed 71-byte frame, BEFORE the UI repaints. Crash/close
// after this line loses nothing: the coordinate is already committed to the shadow fold. No sovereign key → no-op
// (the legacy local save covers that browser).
async function exhaleFrame(cmd) {
  if (!ledgerActive()) return false;
  const p = packEvent(cmd); if (!(p instanceof Uint8Array)) return false;
  const msg = new Uint8Array(1 + PAYLOAD); msg[0] = DIDY_SOURCE; msg.set(p, 1);
  let sig; try { sig = new Uint8Array(await wcSign(msg)); } catch { return false; }
  const raw = new Uint8Array(WIRE); raw[0] = DIDY_SOURCE; raw.set(p, 1); raw.set(sig, 1 + PAYLOAD);
  try { await exhale(db, raw); ledgerSeq += 1; livePackets += 1; return true; } catch { return false; }
}
const exhaleGrant = (zoneId) => exhaleFrame(encodeGrant(zoneIndexById(zoneId), ledgerSeq));
const exhaleSkinEvt = (name) => exhaleFrame(encodeSkin(skinIndex(name), ledgerSeq));
const exhaleSeedEvt = (facts) => exhaleFrame(encodeSeed(facts, ledgerSeq));

// INHALE — germination on boot. Open the DB, read the DNA + keypair, gate-replay the ledger, reduce it back into a
// save. Returns null when there is no ledger yet (fresh player / no in-tab Ed25519), so the caller falls back.
async function inhale() {
  if (typeof indexedDB === 'undefined') return null;
  await ensureDB(); if (!db) return null;
  let g; try { g = await getGenome(db); } catch { g = null; }
  if (!g || !g.id) return null;
  try { const w = await getWallet(db); if (w && w.priv && w.pub) { signKey = w.priv; pubKeyObj = w.pub; } } catch { /* keyless → local-trust replay below */ }
  let frames = []; try { frames = await getLedger(db); } catch { frames = []; }
  ledgerSeq = frames.length;
  let payloads;
  if (pubKeyObj) {
    const ctx = { keys: { [DIDY_SOURCE]: pubKeyObj }, lattice: { [DIDY_SOURCE]: { maxBudget: 65535, resources: 0xFF } }, seen: replayStore(8192), verify: wcVerify };
    const r = await gatedSurvivors(frames, ctx);
    payloads = r.survivors;
    lastInhale = { gated: true, frames: frames.length, applied: payloads.length, rejectedTotal: r.rejectedTotal };
  } else {
    payloads = frames.map((f) => f.subarray(1, 1 + PAYLOAD));   // local-trust replay (no in-tab Ed25519)
    lastInhale = { gated: false, frames: frames.length, applied: payloads.length, rejectedTotal: 0 };
  }
  const prog = reduceProgress(payloads, ZONE_TABLE, SKIN_ORDER);
  livePackets = payloads.length;        // the HUD shows applied frames; a rejected poison frame is not counted
  const kestrelDigest = kestrelReconstruct({ ...kestrelGenome(), id: g.id }, payloads);
  lastInhale.fold = (kestrelDigest.state.fold >>> 0);
  return {
    id: g.id, level: prog.level, xp: prog.xp, caps: prog.caps.slice(), skin: prog.skin,
    done: prog.done, seededStats: prog.facts != null ? { facts: prog.facts } : null, kard: null, _scopeOk: false,
  };
}

async function wipeLedger() {
  try { if (db && db.close) db.close(); } catch { /* ignore */ }
  db = null;
  try { await new Promise((res) => { const r = indexedDB.deleteDatabase('KESTREL_OS'); r.onsuccess = r.onerror = r.onblocked = () => res(); }); } catch { /* ignore */ }
}

// persist(): with the sovereign ledger active, state already lives in the shadow fold (exhaled per transition), so
// this is a no-op. Only the fallback browser (no in-tab Ed25519) writes the legacy local save.
function persist() {
  if (ledgerActive()) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...save, kard: save.kard })); } catch { /* private/quota — plays fine this session */ }
}
function restore() {
  try { const raw = localStorage.getItem(SAVE_KEY); if (raw) return JSON.parse(raw); } catch { /* unreadable — new game */ }
  return null;
}

// ── L0 · HATCH — mint identity + a real signed kard ────────────────────────────────────────────────────
async function hatch() {
  const btn = $('g-hatchBtn'); if (btn) { btn.disabled = true; btn.textContent = 'Hatching…'; }
  let id = '', signed = false;
  try {
    if (window.crypto && crypto.subtle && crypto.subtle.generateKey) {
      // non-extractable private key (it can sign + be stored, but never exported); the public key stays exportable
      const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
      id = bufToHex(await crypto.subtle.exportKey('raw', kp.publicKey));   // 32-byte pubkey → 64 hex = a kard owner
      signKey = kp.privateKey; pubKeyObj = kp.publicKey; signed = true;
    } else { throw new Error('no-ed25519'); }
  } catch {
    const buf = new Uint8Array(32);
    (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(buf) : buf.forEach((_, i) => (buf[i] = (Math.random() * 256) | 0));
    id = sha256(bufToHex(buf)).slice(0, 64);   // a well-formed 64-hex id when this browser lacks in-tab Ed25519
    signKey = null; pubKeyObj = null; signed = false;
  }
  save.id = id; save.caps = ['identity'];
  // write the immutable DNA + the keypair into the shadow fold, so a reload can wake this exact Didy from the ledger
  if (signed) {
    await ensureDB();
    if (db) {
      try { await putGenome(db, { ...kestrelGenome(), id, structureRef: 'fallos-didy-v1', bornSkin: save.skin || 'aurora', createdAt: '2026-01-01T00:00:00Z' }); } catch { /* genome write failed — fall back to local save */ }
      try { await putWallet(db, { priv: signKey, pub: pubKeyObj, pubHex: id, budgetCap: BUDGET_CAP }); } catch { /* keyless → local save */ }
      ledgerSeq = 0; livePackets = 0;
    }
  }
  await remintKard();
  await grant('hatch', 0);         // the first exhaled event (GRANT of the hatch zone)
  renderIdentity(signed);
  return id;
}

// re-mint the kard whenever caps change, and sign it when we hold the key (self-sovereign: signed by its owner)
async function remintKard() {
  const minted = mintKard({
    owner: save.id, skinRef: save.skin || 'aurora', structureRef: 'fallos-didy-v1',
    capabilities: save.caps.slice(), budgetCap: BUDGET_CAP, createdAt: '2026-01-01T00:00:00Z', label: 'my didy',
  });
  if (!minted.ok) return;
  let kard = minted.kard;
  if (signKey) {
    try {
      const p = kardSignable(kard);
      if (p.ok) {
        const sig = bufToHex(await crypto.subtle.sign({ name: 'Ed25519' }, signKey, new TextEncoder().encode(p.payload)));
        const attached = attachSignature(kard, save.id, sig);
        if (attached.ok) kard = attached.kard;
      }
    } catch { /* unsigned kard is still valid; it just is not countersigned this session */ }
  }
  save.kard = kard; persist();
}

function renderIdentity(signed) {
  const box = $('g-identity'); if (!box) return;
  box.hidden = false; box.innerHTML = '';
  const v = verifyKard(save.kard);
  box.appendChild(el('div', 'g-idtag', 'your didy'));
  box.appendChild(el('code', 'g-idval', save.id.slice(0, 20) + '…'));
  const state = signed && v.signed ? 'Ed25519 · signed by its owner' : (signed ? 'Ed25519 · minted' : 'local id (this browser lacks in-tab Ed25519 — honest label)');
  box.appendChild(el('p', 'g-idnote', 'kard ' + (v.valid ? 'valid' : 'invalid') + ' · ' + state + ' — held only on this device.'));
  const btn = $('g-hatchBtn'); if (btn) { btn.textContent = 'Hatched ✓'; btn.disabled = true; }
}

// ── grant a capability + level up. This is where the ladder becomes REAL: the kard is re-minted with the
// new cap, and canOpen confirms your Didy (holding its earned caps) may open it — the level IS the scope. ─
async function grant(zoneId, lvl) {
  const z = zoneById(zoneId); if (!z) return;
  if (!save.caps.includes(z.cap)) save.caps.push(z.cap);
  save.done[zoneId] = true;
  save.level = Math.max(save.level, lvl);
  save.xp += 100;
  await remintKard();
  // prove the scope with the real kernel: a node presenting the earned caps can open the kard
  const opened = canOpen(save.kard, { capabilities: save.caps.slice() });
  save._scopeOk = !!(opened.ok && opened.canOpen);
  await exhaleGrant(zoneId);        // EXHALE this level-up into the shadow fold before the UI repaints
  persist(); renderHUD(); renderMap();
}

// ── L1 · SEED + RECALL (the proven seed.mjs pipeline) ───────────────────────────────────────────────────
function detectProvider(data) {
  const arr = Array.isArray(data) ? data : (data && Array.isArray(data.conversations) ? data.conversations : null);
  if (!arr) return null;
  for (const c of arr) if (c && typeof c === 'object') {
    if (c.mapping || typeof c.create_time === 'number') return 'chatgpt';
    if (Array.isArray(c.chat_messages) || c.uuid || Array.isArray(c.messages)) return 'claude';
  }
  return 'chatgpt';
}
async function ingestFile(file) {
  if (/\.zip$/i.test(file.name)) { seedStatus(`“${file.name}” is the whole export archive — unzip it and drop the <b>conversations.json</b> inside.`, 'warn'); return; }
  let text; try { text = await file.text(); } catch { seedStatus('Could not read that file.', 'warn'); return; }
  let data; try { data = JSON.parse(text); } catch { seedStatus(`“${file.name}” is not JSON — drop the <b>conversations.json</b> from your export.`, 'warn'); return; }
  const pick = ($('g-provider') && $('g-provider').value !== 'auto') ? $('g-provider').value : detectProvider(data);
  if (!pick) { seedStatus('That JSON does not look like a chat export.', 'warn'); return; }
  sources.push({ source: pick, data });
  reseed(`Added ${file.name} · read as ${pick}.`);
}
async function reseed(note) {
  const res = seedMemory(sources);
  if (!res.ok) { seedStatus(res.why || 'Could not seed from that file.', 'warn'); sources.pop(); return; }
  memory = res.memory; save.seededStats = res.stats;
  renderSeedStats(res.stats, note);
  await exhaleSeedEvt(res.stats.facts || 0);   // EXHALE the seed's headline fact count into the shadow fold
  await grant('memory', 1);
  const rc = $('g-recallWrap'); if (rc) rc.hidden = false;
  renderSuggestions();
}
const SAMPLE = [
  { title: 'Weekend', create_time: 1710000000, mapping: {
    a: { message: { author: { role: 'user' }, create_time: 1710000000, content: { parts: ['I really prefer hiking in the mountains over the beach. My name is Alex and I work as a data engineer.'] } }, parent: null },
    b: { message: { author: { role: 'user' }, create_time: 1710000100, content: { parts: ["I'm building a trail-mapping side project in Rust. Help me plan the schema."] } }, parent: 'a' },
    c: { message: { author: { role: 'user' }, create_time: 1710000200, content: { parts: ['My colleague is Priya. Actually, I meant Postgres, not MySQL, for the project.'] } }, parent: 'b' } }, current_node: 'c' },
  { title: 'Coffee', create_time: 1710500000, mapping: {
    d: { message: { author: { role: 'user' }, create_time: 1710500000, content: { parts: ['I love pour-over coffee. I usually wake up at 6am. The Rust project is going well.'] } }, parent: null } }, current_node: 'd' },
];
function loadSample() { sources.length = 0; sources.push({ source: 'chatgpt', data: SAMPLE }); reseed('Loaded a small sample (not your data) so you can see the aha — then drop your real export.'); }

function tokensLocal(t) { return String(t || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2); }
function suggestFromMemory() {
  if (!memory) return [];
  const picks = [], seen = new Set();
  const add = (list) => { for (const f of (list || [])) { const w = tokensLocal(f.text)[0]; if (w && !seen.has(w)) { seen.add(w); picks.push(w); } if (picks.length >= 5) return; } };
  add(memory.board); add(memory.dodeca); add(memory.addressbook); add(memory.crystal);
  return picks.slice(0, 5);
}
function renderSuggestions() {
  const row = $('g-examples'); if (!row) return;
  const picks = suggestFromMemory(); if (!picks.length) return;
  row.innerHTML = ''; row.appendChild(el('span', 'g-exlead', 'ask about:'));
  for (const w of picks) { const b = el('button'); b.type = 'button'; b.textContent = w; b.addEventListener('click', () => { const a = $('g-ask'); if (a) a.value = w; ask(w); }); row.appendChild(b); }
}
function ask(q) {
  if (!memory) return; const out = $('g-answer'); if (!out) return;
  const r = recall(memory, q, 5);
  out.hidden = false; out.innerHTML = '';
  out.appendChild(el('p', 'g-ans', r.answer));
  const hitting = (r.hits || []).filter((h) => h.overlap > 0).slice(0, 5);
  if (hitting.length) { const ul = el('ul', 'g-hits'); for (const h of hitting) { const li = el('li'); li.appendChild(el('span', 'g-hk', h.fact.kind)); li.appendChild(el('span', 'g-ht', h.fact.text)); ul.appendChild(li); } out.appendChild(ul); }
  if (!save.done.recall) grant('recall', 1);
}
function renderSeedStats(s, note) {
  seedStatus(note || 'Seeded.', 'ok');
  const g = $('g-seedStats'); if (g) {
    g.hidden = false; g.innerHTML = '';
    for (const [label, val] of [['conversations', s.conversations], ['turns', s.turns], ['facts', s.facts], ['kinds', Object.keys(s.byKind || {}).length]]) {
      const c = el('div', 'g-stat'); c.appendChild(el('b', null, String(val))); c.appendChild(el('span', null, label)); g.appendChild(c);
    }
  }
  const b = $('g-buckets'); if (b && memory) {
    b.hidden = false; b.innerHTML = '';
    const names = { crystal: 'who you are', dodeca: 'what you prefer', board: 'what you work on', addressbook: 'people', skin: 'self-model' };
    for (const k of ['crystal', 'dodeca', 'board', 'addressbook', 'skin']) {
      const n = (memory[k] || []).length; const cell = el('div', 'g-bucket' + (n ? '' : ' empty'));
      cell.appendChild(el('span', 'g-bn', names[k])); cell.appendChild(el('span', 'g-bc', String(n))); b.appendChild(cell);
    }
  }
}
function seedStatus(html, kind) { const s = $('g-seedStatus'); if (!s) return; s.hidden = false; s.className = 'g-status ' + (kind || ''); s.innerHTML = html; }

// ── L3 · SKIN — a cosmetic written into the kard ────────────────────────────────────────────────────────
const SKINS = { aurora: ['#5c7cfa', '#9775fa'], ember: ['#ff8f5e', '#f0664f'], forest: ['#2fbd85', '#3bc9a0'], slate: ['#8d99a9', '#5c7cfa'], gold: ['#e6a23c', '#f0c674'] };
async function applySkin(name, record) {
  const pair = SKINS[name] || SKINS.aurora;
  document.documentElement.style.setProperty('--accent', pair[0]);
  document.documentElement.style.setProperty('--accent2', pair[1]);
  const changed = save.skin !== name;
  save.skin = name; await remintKard();
  if (record && changed) await exhaleSkinEvt(name);   // EXHALE a real skin change (not the start/new-game re-apply)
}

// ── L7 · TREASURY — the real spendGate budget wall ──────────────────────────────────────────────────────
function trySpend(cost) {
  const out = $('g-spendOut'); if (!out || !save.kard) return;
  const r = spendGate(save.kard, spent, cost);
  if (r.ok && r.allowed) { spent += cost; out.className = 'g-status ok'; out.innerHTML = `Spent ${cost}. <b>${r.remaining}</b> sparks left under the wall.`; }
  else { out.className = 'g-status warn'; out.innerHTML = r.why ? r.why.replace('kard budget', 'wall') : `Refused — that would cross the ${BUDGET_CAP}-spark wall.`; }
  out.hidden = false;
  const bar = $('g-spendBar'); if (bar) bar.style.width = Math.min(100, (spent / BUDGET_CAP) * 100) + '%';
  if (!save.done.treasury && save.level >= 7) grant('treasury', 7);
}

// ── THE HUD + THE MAP ───────────────────────────────────────────────────────────────────────────────────
function renderHUD() {
  const set = (id, v) => { const n = $(id); if (n) n.textContent = v; };
  set('g-hudLevel', Math.max(0, save.level));
  set('g-hudXp', save.xp);
  set('g-hudKnows', save.seededStats ? save.seededStats.facts : 0);
  set('g-hudCaps', save.caps.length);
  const idn = $('g-hudId'); if (idn) idn.textContent = save.id ? save.id.slice(0, 10) + '…' : 'not hatched';
  const caps = $('g-hudCapList'); if (caps) { caps.innerHTML = ''; for (const c of save.caps) caps.appendChild(el('span', 'g-cap', c)); }
  const scope = $('g-hudScope'); if (scope) scope.textContent = save._scopeOk ? 'scope verified' : (save.caps.length ? 'scope open' : '');
  const led = $('g-hudLedger');
  if (led) {
    if (!save.id) led.textContent = '—';
    else if (!ledgerActive()) led.textContent = 'local save';
    else {
      const resumed = lastInhale && lastInhale.frames > 0;
      const dropped = lastInhale && lastInhale.rejectedTotal ? ' · ' + lastInhale.rejectedTotal + ' rejected' : '';
      led.textContent = livePackets + ' packet' + (livePackets === 1 ? '' : 's') + (resumed ? ' · resumed' : '') + (lastInhale && lastInhale.gated ? ' · gated' : '') + dropped;
    }
  }
}
function zoneState(z) {
  if (save.done[z.id]) return 'done';
  return (save.level >= z.lvl - 1) ? 'open' : 'locked';   // a zone opens when you reach the level just below it
}
function renderMap() {
  const map = $('g-map'); if (!map) return;
  map.innerHTML = '';
  for (const z of ZONES) {
    const st = zoneState(z);
    const node = el('button', 'g-zone ' + st); node.type = 'button'; node.dataset.zone = z.id;
    node.appendChild(el('span', 'g-zlvl', 'L' + z.lvl));
    node.appendChild(el('span', 'g-zname', z.name));
    node.appendChild(el('span', 'g-zverb', z.verb));
    const badge = el('span', 'g-zstate', st === 'done' ? '✓' : (st === 'open' ? '▸' : '○'));
    node.appendChild(badge);
    node.addEventListener('click', () => openZone(z.id));
    map.appendChild(node);
  }
}

// ── ZONE PANELS — everything opens IN-PAGE. No zone navigates away. ─────────────────────────────────────
function openZone(id) {
  const z = zoneById(id); if (!z) return;
  const st = zoneState(z);
  if (st === 'locked') { flashLocked(z); return; }
  const stage = $('g-stage'); if (!stage) return;
  stage.hidden = false; stage.innerHTML = '';
  stage.appendChild(zoneHeader(z, st));
  const body = el('div', 'g-zbody'); stage.appendChild(body);
  buildZoneBody(z, body, st);
  stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function zoneHeader(z, st) {
  const h = el('div', 'g-zhead');
  const left = el('div');
  left.appendChild(el('span', 'g-zeye', 'L' + z.lvl + ' · ' + z.verb.toUpperCase()));
  left.appendChild(el('h3', null, z.name));
  left.appendChild(el('p', 'g-zblurb', z.blurb));
  left.appendChild(el('p', 'g-zkernel', 'powered by ' + z.kernel + ' — in this repo, running here'));
  if (z.credit) left.appendChild(el('p', 'g-zcredit', z.credit));
  h.appendChild(left);
  const close = el('button', 'btn g-zclose', 'Close ✕'); close.type = 'button'; close.addEventListener('click', () => { $('g-stage').hidden = true; });
  h.appendChild(close);
  return h;
}
function flashLocked(z) {
  const stage = $('g-stage'); if (!stage) return;
  stage.hidden = false; stage.innerHTML = '';
  const box = el('div', 'g-locked');
  box.appendChild(el('span', 'g-zeye', 'Locked · unlocks at level ' + z.lvl));
  box.appendChild(el('h3', null, z.name));
  box.appendChild(el('p', 'g-zblurb', z.blurb + ' Level up to open it — it is already here, waiting.'));
  box.appendChild(el('p', 'g-zkernel', 'kernel present in this repo: ' + z.kernel));
  if (z.credit) box.appendChild(el('p', 'g-zcredit', z.credit));
  const close = el('button', 'btn', 'Close ✕'); close.type = 'button'; close.addEventListener('click', () => { stage.hidden = true; });
  box.appendChild(close);
  stage.appendChild(box); stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function buildZoneBody(z, body, st) {
  if (z.play === 'hatch') {
    if (save.id) { body.appendChild(el('p', 'g-note', 'Your Didy is hatched. Its identity and signed kard are held on this device.')); return; }
    const btn = el('button', 'btn primary', 'Hatch my Didy →'); btn.type = 'button'; btn.id = 'g-hatchBtn';
    btn.addEventListener('click', hatch); body.appendChild(btn);
    body.appendChild(el('div', 'g-identity', null)).id = 'g-identity'; $('g-identity').hidden = true;
  } else if (z.play === 'seed') {
    const drop = el('div', 'g-drop'); drop.id = 'g-drop'; drop.tabIndex = 0; drop.setAttribute('role', 'button'); drop.setAttribute('aria-label', 'Drop your conversations.json or click to choose');
    drop.innerHTML = '<b>Drop your <code>conversations.json</code></b><small>ChatGPT or Claude · nothing is uploaded</small>';
    body.appendChild(drop);
    const fi = el('input'); fi.type = 'file'; fi.id = 'g-file'; fi.accept = '.json,application/json'; fi.hidden = true; body.appendChild(fi);
    const rowc = el('div', 'g-droprow');
    const lab = el('label', null, 'read as '); lab.style.cssText = 'font-size:.82rem;color:var(--muted)';
    const sel = el('select'); sel.id = 'g-provider'; for (const [v, t] of [['auto', 'auto-detect'], ['chatgpt', 'ChatGPT'], ['claude', 'Claude']]) { const o = el('option', null, t); o.value = v; sel.appendChild(o); } lab.appendChild(sel);
    rowc.appendChild(lab);
    const samp = el('button', 'btn', 'No export handy? Try a sample →'); samp.type = 'button'; samp.addEventListener('click', loadSample); rowc.appendChild(samp);
    body.appendChild(rowc);
    body.appendChild(Object.assign(el('div', 'g-status'), { id: 'g-seedStatus', hidden: true }));
    body.appendChild(Object.assign(el('div', 'g-stats'), { id: 'g-seedStats', hidden: true }));
    body.appendChild(Object.assign(el('div', 'g-buckets'), { id: 'g-buckets', hidden: true }));
    wireSeed();
    if (save.seededStats) seedStatus('Your identity is restored — re-drop your export to reload its memory (never stored off your device).', 'ok');
  } else if (z.play === 'recall') {
    if (!memory) { body.appendChild(el('p', 'g-note', 'Seed your Didy in the Memory Grove first, then return here for its first words.')); return; }
    const wrap = el('div'); wrap.id = 'g-recallWrap';
    const rowa = el('div', 'g-askrow');
    const inp = el('input'); inp.type = 'text'; inp.id = 'g-ask'; inp.placeholder = 'what do I like? what am I working on? who do I mention?';
    const b = el('button', 'btn primary', 'Ask →'); b.type = 'button'; b.addEventListener('click', () => { const q = inp.value.trim(); if (q) ask(q); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const q = inp.value.trim(); if (q) ask(q); } });
    rowa.appendChild(inp); rowa.appendChild(b); wrap.appendChild(rowa);
    wrap.appendChild(Object.assign(el('div', 'g-examples'), { id: 'g-examples' }));
    wrap.appendChild(Object.assign(el('div', 'g-answer'), { id: 'g-answer', hidden: true }));
    body.appendChild(wrap); renderSuggestions();
  } else if (z.play === 'skin') {
    body.appendChild(el('p', 'g-note', 'Pick a face. It is written into your kard as its skinRef.'));
    const row = el('div', 'g-skins');
    for (const name of Object.keys(SKINS)) {
      const sw = el('button', 'g-skin' + (save.skin === name ? ' on' : '')); sw.type = 'button';
      sw.style.background = `linear-gradient(135deg,${SKINS[name][0]},${SKINS[name][1]})`;
      sw.title = name; sw.setAttribute('aria-label', 'skin ' + name);
      sw.addEventListener('click', async () => { await applySkin(name, true); [...row.children].forEach((c) => c.classList.remove('on')); sw.classList.add('on'); if (!save.done.skin) grant('skin', 3); });
      row.appendChild(sw);
    }
    body.appendChild(row);
  } else if (z.play === 'spend') {
    body.appendChild(el('p', 'g-note', `Your kard was minted with a ${BUDGET_CAP}-spark budget it cannot cross. Try to spend past it — the wall is real.`));
    const bar = el('div', 'g-spendtrack'); const fill = el('div', 'g-spendfill'); fill.id = 'g-spendBar'; fill.style.width = Math.min(100, (spent / BUDGET_CAP) * 100) + '%'; bar.appendChild(fill); body.appendChild(bar);
    const row = el('div', 'g-spendrow');
    for (const c of [10, 30, 80]) { const b = el('button', 'btn', 'Spend ' + c); b.type = 'button'; b.addEventListener('click', () => trySpend(c)); row.appendChild(b); }
    const reset = el('button', 'btn', 'Reset'); reset.type = 'button'; reset.addEventListener('click', () => { spent = 0; const o = $('g-spendOut'); if (o) o.hidden = true; const bb = $('g-spendBar'); if (bb) bb.style.width = '0%'; }); row.appendChild(reset);
    body.appendChild(row);
    body.appendChild(Object.assign(el('div', 'g-status'), { id: 'g-spendOut', hidden: true }));
    if (!save.done.treasury) grant('treasury', 7);
  } else if (z.play && z.play.indexOf('reveal:') === 0) {
    const target = z.play.split(':')[1];
    body.appendChild(el('p', 'g-note', 'This system already runs further down this same page — no new tab, no link out. Enter it here:'));
    const b = el('button', 'btn primary', 'Enter ' + z.name + ' →'); b.type = 'button';
    b.addEventListener('click', () => {
      const sel = target === 'door' ? '#door' : '#toolPanel';
      const node = document.querySelector(sel);
      if (node) { if (target === 'tool') { node.hidden = false; const t = $('openTool'); if (t) t.click(); } node.scrollIntoView({ behavior: 'smooth', block: 'start' }); node.classList.add('g-flash'); setTimeout(() => node.classList.remove('g-flash'), 1600); }
      if (!save.done[z.id]) grant(z.id, z.lvl);
    });
    body.appendChild(b);
  } else {   // 'soon' — the economy/mesh tiers: the SCOPE is genuinely reached now; the deeper interaction deepens over time
    body.appendChild(el('p', 'g-note', 'This tier is yours. Its system comes online as your Didy grows and its kernel is already in this repo — nothing here links out. Reaching it grants the ' + z.cap + ' scope on your kard.'));
    if (!save.done[z.id]) grant(z.id, z.lvl);
  }
}

function wireSeed() {
  const drop = $('g-drop'), fi = $('g-file');
  if (drop && fi) {
    drop.addEventListener('click', () => fi.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { const fs = e.dataTransfer && e.dataTransfer.files; if (fs) for (const f of fs) ingestFile(f); });
    fi.addEventListener('change', (e) => { for (const f of e.target.files) ingestFile(f); e.target.value = ''; });
  }
}

async function newGame() {
  save = blankSave(); memory = null; sources.length = 0; signKey = null; pubKeyObj = null; spent = 0; ledgerSeq = 0; livePackets = 0; lastInhale = null;
  try { localStorage.removeItem(SAVE_KEY); } catch { /* nothing to clear */ }
  await wipeLedger();        // the shadow fold is wiped — a new Didy starts from an empty ledger
  await applySkin('aurora');
  renderHUD(); renderMap(); const st = $('g-stage'); if (st) st.hidden = true;
  openZone('hatch');
}

async function start() {
  if (!$('g-map')) return;   // game not on this page
  let prior = null;
  try { prior = await inhale(); } catch { prior = null; }        // the sovereign ledger first
  if (!prior) { const ls = restore(); if (ls && ls.id) prior = ls; }   // legacy local save fallback
  save = (prior && prior.id) ? { ...blankSave(), ...prior } : blankSave();
  // rebuild the signed kard from the restored key + replayed caps/skin — byte-identical to the one at close
  if (save.id && ledgerActive()) { try { await remintKard(); } catch { /* keep the restored kard */ } }
  if (save.skin) await applySkin(save.skin);
  renderHUD(); renderMap();
  const ng = $('g-new'); if (ng) ng.addEventListener('click', () => { newGame(); });
  // open the first unfinished playable zone to guide the player in
  const first = save.id ? (save.seededStats ? 'recall' : 'memory') : 'hatch';
  openZone(first);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

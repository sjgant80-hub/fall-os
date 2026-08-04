// build-estate.mjs — generate estate.json for the site FROM the canonical estate index.
//
// §C tell 1 (ONE-KERNEL): the estate's facts live in ONE canonical source. Every surface READS it;
// none hand-copies. A hand-typed list of builds on the page is, by that rule, already a bug — it is
// how entries silently go missing and how counts drift out of agreement (§C tell 12, COHERENT).
//
// So: read estate-index.json, derive the counts and the live builds, classify each into a faculty by
// deterministic keyword rules, verify every emitted link actually resolves, and write estate.json.
// The page renders whatever this emits. Re-run it and the page is correct again.
import { readFileSync, writeFileSync } from 'node:fs';

const INDEX = 'C:/Users/sjgan/.claude/projects/C--Users-sjgan--claude/memory/estate-index.json';
const OUT = new URL('../estate.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const raw = JSON.parse(readFileSync(INDEX, 'utf8'));
const repos = Array.isArray(raw) ? raw : (raw.repos || Object.values(raw).find(v => Array.isArray(v)));

// Builds that postdate the index snapshot. Named here ONLY so they are candidates for the live check
// below — their inclusion is still decided by whether the URL actually resolves, never by assertion.
const RECENT = ['fall-os', 'the-oracle', 'recollapse', 'generative-estate', 'seedmind', 'the-ear', 'the-dreamer',
  'bonded-pair', 'golden-placer', 'soundcheck', 'earned', 'hum', 'airgap', 'agora', 'the-wallet', 'the-kg',
  'the-rotor', 'the-cam', 'the-spike', 'the-throat', 'one-ladder', 'mesh-sings', 'wishwood-keeper', 'glampos',
  'missig', 'niceassos', 'estate-nest', 'offramp-v2', 'geometric-computer', 'the-toll', 'witness', 'acg-assessor'];

// Deterministic faculty classification — a rule over name + description, not a hand-sorted list.
const FACULTIES = [
  ['Runtime, conductor & routing',   /fall-os|didy|router|wisp|forge|hub\b|colony|remember/i],
  ['Reasoning — past, present, future', /oracle|recollapse|generative-estate|dreamer|seedmind|missig/i],
  ['Memory & consolidation',         /nest|offramp|recall|memory|remember|sync|note/i],
  ['Trust rail & verification',      /witness|assessor|proof|earned|hardened|foldsig|charter|sieve/i],
  ['Identity, agents & economy',     /wallet|agora|market|signature|kard|colony|kcc|lineage|swarm/i],
  ['Geometric & neuromorphic',       /geometric|golden|rotor|cam\b|spike|placer|quine|cube|attractor|herd/i],
  ['Mesh, transport & sensing',      /mesh|ladder|airgap|throat|ear\b|soundcheck|hum\b|light|sings|sonif/i],
  ['Business operations',            /wishwood|glampos|account|hub|mortgage|vault|konomium|roost|desk/i],
  ['Legal & consumer',               /justice|divorcer|redress|legal|insurance/i],
  ['Agents on the open web',         /browser|toll|scene|report|base|temu|trilogy|kg\b/i],
];
const facultyOf = r => {
  const s = `${r.name} ${r.desc || ''}`;
  for (const [name, re] of FACULTIES) if (re.test(s)) return name;
  return 'Other sovereign builds';
};

// §A: the engineering layer is public, the internal notation is not. Repo descriptions in the index
// sometimes carry it (◊·κ=1, φ, prime-indices). Strip it here so it can never reach a public surface
// through a description we did not write for that surface.
const PRIVATE_NOTATION = /[◊κφΨψΩ]|\b\d+\s*·\s*prime\s*\d+\b|\bprime\s+\d+\b|·\s*κ\s*=\s*[\d.]+/gi;
const sanitize = s => String(s || '')
  .replace(/◊·κ=1/gi, '')
  .replace(PRIVATE_NOTATION, '')
  .replace(/\s*·\s*·\s*/g, ' · ')
  .replace(/\s{2,}/g, ' ')
  .replace(/^[\s·—-]+|[\s·—-]+$/g, '')
  .trim();

const liveUrl = n => `https://sjgant80-hub.github.io/${n}/`;
async function resolves(name) {
  try {
    const res = await fetch(liveUrl(name), { method: 'HEAD', redirect: 'follow' });
    return res.status === 200;
  } catch { return false; }
}

const total = repos.length;
const publicCount = repos.filter(r => !r.private).length;
const privateCount = repos.filter(r => r.private).length;

// candidates = EVERY public repo in the index, plus the post-snapshot names. Deduped.
// (Earlier this checked only repos the index already flagged live — which silently excluded every
// repo that went live after the snapshot. Checking them all is the only version that cannot miss one.)
const byName = new Map(repos.map(r => [r.name, r]));
const candidates = [...new Set([...repos.filter(r => !r.private).map(r => r.name), ...RECENT])];

const checked = [];
for (let i = 0; i < candidates.length; i += 40) {
  const batch = candidates.slice(i, i + 40);
  checked.push(...await Promise.all(batch.map(async n => ({ name: n, ok: await resolves(n) }))));
}
const liveNames = checked.filter(c => c.ok).map(c => c.name);
const dropped = checked.filter(c => !c.ok).map(c => c.name);

const builds = liveNames.map(n => {
  const r = byName.get(n) || { name: n, desc: '' };
  return { name: n, desc: sanitize(r.desc), faculty: facultyOf(r), url: liveUrl(n) };
}).sort((a, b) => a.name.localeCompare(b.name));

// group, dropping empty faculties
const grouped = [];
for (const [f] of [...FACULTIES, ['Other sovereign builds']]) {
  const items = builds.filter(b => b.faculty === f);
  if (items.length) grouped.push({ faculty: f, items });
}

const out = {
  generated_from: 'estate-index.json',
  totals: { repositories: total, public: publicCount, private: privateCount, live_verified: builds.length },
  faculties: grouped,
};
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`estate.json written · ${total} repos · ${builds.length} live verified · ${grouped.length} faculties`);
if (dropped.length) console.log(`not live (excluded, not asserted): ${dropped.join(', ')}`);

# LIVEWARE core — the one move

**▶ Live: https://sjgant80-hub.github.io/liveware-core/**

Every organ in the estate is the **same operation** aimed at a different target. This is that
operation, once, as shared DNA:

> **hold** possibility open → **fork** on the golden offset (137.5°, so branches diverge, not
> cluster) → **resolve** at the κ-gate (≥ κ = 1/φ holds, < κ clashes) → **collapse deliberately**
> (never auto — the collapse is *authored*) → **cache** by content (`run(S) == S`).

`core.mjs` is that move. The **three tenses** are it, differently injected:

| organ | target | generate | score | author |
|---|---|---|---|---|
| **The Oracle** | the future | divergent futures | plausibility | *none* — never auto-collapses |
| **Re-collapse** | the past | re-readings of a fixed event | opens-future | a person chooses |
| **Generative estate** | build-space | candidate builds from a spec | proof-of-play (κ) | collapse what verifies |

The gate proves it (`test.mjs §5`): all three are `organ(...)` over the one `move`. The
**roads-not-taken are kept first-class** — the queryable shadow (the foundation the
shadow-index builds on).

## Proof-of-play

```bash
node test.mjs      # 26/26
```
`witness mutate core.mjs --cap 200 --baseline witness.baseline.json` → **killed 10/12, survived 0,
2 clamp-equivalents baselined, clean:true**. Witness runs in CI on every push. The live page
imports `core.mjs` — the gated logic **is** the live logic.

## Honest

The veil/shadow language is a way to think, not a claim. What's *built* here is pure
engineering: fork with a non-clustering offset, gate at a threshold, collapse only when
authored, cache by content — and keep the roads not taken. The shape works whether or not the
cosmology behind it is true.

## The shadow-index — catch the un-collapsed 99% (Layer 6, first shadow-catcher)

Every collapse casts a **shadow**: the roads-not-taken the core keeps but that otherwise
evaporate. `shadow.mjs` **catches** them — content-addresses each un-collapsed branch (so the
same branch forked-toward across *different* decisions dedupes and counts up) and runs a
**recurrence detector**: the branch you keep circling but never commit to is the signal for the
next build.

> **Proven** (`shadow.test.mjs §3`): three unrelated decisions each fork toward "notes that dream
> overnight"; the detector surfaces it as the single 3× signal, naming the three decisions —
> the cross-time pattern memory alone would never connect. The demo shows it live: re-fork and
> the roads you keep passing over rank up.

Zero myth ("keep, address, count, search the un-collapsed"), zero new compute (a collector on
outputs the organs already discard). Query it: *what did I nearly build here* (`shadowsOf`),
*the un-collapsed twin of X* (`twinsOf`), *what do I keep circling* (`recurring`), *resurrect a
shadow into a live spec* (`resurrect`). `witness mutate shadow.mjs --cap 200` → **10/10 killed,
clean** (no baseline needed).

## fall-os — one core, one conductor, many organs

An OS isn't 20 tools stuck together: it's **one core** (the bloodstream — `core.mjs`) + **one
conductor** (a **Didy**) with every build registered as an **organ** that routes through them. The
merge is three moves — build the core (done), run the conductor, and *wrap* existing tools to call
the core instead of rebuilding them.

- **`wire.mjs`** — the first real wrap: runs the **actual** Oracle / re-collapse / generative-estate
  kernels (vendored verbatim in `organs/`) and casts their real roads-not-taken into the shared
  shadow-index. Proven (§4): a real Oracle stance forked-toward across 3 decisions surfaces at count 3.
- **`didy.mjs`** — the conductor. It runs the single loop **EXPLORE → RESOLVE → VERIFY → BUILD →
  REMEMBER**, and *every* phase calls the shared core (golden fork · κ-gate · authored collapse ·
  content cache). Organs are **called by** the loop, never run standalone. **Grounded**: it builds
  only what an author collapses (never reflexive); the roads-not-taken are remembered into the
  shadow-index. So an upgrade to the core improves every organ at once — a pile becomes an organism.

  A **Didy** is the *generic, trainable* conductor that ships with every fork: blank, unsigned. You
  **train** it by registering organs and **sign** it with your prefix — a trained instance is a
  `<prefix>-didy`, a new signed branch of the fold-tree. `makeDidy()` → a blank `didy`; `makeDidy('kel')`
  → `kel-didy`.

`witness mutate wire.mjs` → 16/16 killed, clean. `witness mutate didy.mjs` → 17/17 killed, clean.

## Files
- `core.mjs` — the shared core / bloodstream (fork / hold / collapse / cache / move / organ). Injected generators + scorers; pure, deterministic, gated.
- `shadow.mjs` — the shadow-index (cast / castShadow / recurring / query / resurrect). Imports only the core's `h16`.
- `wire.mjs` · `organs/` — the three **real** organs (vendored) wrapped to cast their roads-not-taken into the shared index.
- `didy.mjs` — the fall-os **conductor** (the single loop; organs register + route through the core).
- `test.mjs` · `shadow.test.mjs` · `wire.test.mjs` · `didy.test.mjs` — proof-of-play (26 + 22 + 15 + 22), all witness-gated in CI.
- `index.html` — the live demo (the field + golden-offset fork + authored collapse + the shadow-index recurrence panel).
- `sw.js` · `manifest.webmanifest` — offline PWA.

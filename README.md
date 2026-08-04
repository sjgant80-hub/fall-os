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

## Files
- `core.mjs` — the kernel (fork / hold / collapse / cache / move / organ). Generators + scorers injected; pure, deterministic, gated.
- `shadow.mjs` — the shadow-index (cast / castShadow / recurring / query / resurrect). Imports only the core's `h16`.
- `test.mjs` · `shadow.test.mjs` — proof-of-play (26/26 + 22/22, incl. the three-tenses reduction and the recurrence detector).
- `index.html` — the live demo (the field + golden-offset fork + authored collapse + the shadow-index recurrence panel).
- `sw.js` · `manifest.webmanifest` — offline PWA.

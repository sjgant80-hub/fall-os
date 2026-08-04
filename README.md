# fall-os

**A deterministic decision-orchestration runtime — one shared core, one conductor, composable organs.**

**Live site & interactive demo → https://sjgant80-hub.github.io/fall-os/**

fall-os factors the machinery common to decision- and build-tools — generating options, scoring
them, committing to one, caching the result — into a single shared core and a single control loop.
Any number of tools then plug in as *organs* that route through them. Improving the core improves
every organ at once. The runtime is deterministic, has no runtime dependencies, and runs offline.

---

## Architecture

A **conductor** runs one control loop; every phase of the loop calls the shared **core**; **organs**
register against phases.

```
                       Conductor  (one control loop)
                            |  invokes each phase of
                     ┌──────┴──────┐
                     │ Shared core │  expand · score(κ) · commit · cache
                     └──────┬──────┘
                            │  every organ calls
    forward · reinterpretation · synthesis · memory · not-taken index
```

**The control loop:** `explore → resolve → verify → build → remember`

1. **Explore** — expand candidate branches at successive golden-angle offsets (≈137.5°) for
   near-uniform, low-overlap coverage of the option space.
2. **Resolve** — score each candidate; it *holds* at or above the threshold κ = 1/φ ≈ 0.618,
   otherwise it *clashes*.
3. **Verify** — an author (an automated check or a person) commits one candidate. Nothing is
   selected implicitly.
4. **Build** — the committed candidate is produced and cached by content, so identical inputs
   build once (`run(S) == S`).
5. **Remember** — the selection is recorded; every not-taken branch is written to an index.

## Modules

| Module | Responsibility | Mutation gate |
|---|---|---|
| `core.mjs` | Shared engine: golden-offset expansion, the κ-gate, deliberate commitment, content-addressed cache. | 10/12, clean |
| `didy.mjs` | The conductor: the control loop, the organ registry, grounded commitment. | 17/17, clean |
| `shadow.mjs` | Not-taken index: content-addresses discarded branches, deduplicates across decisions, ranks by recurrence. | 10/10, clean |
| `wire.mjs` (+ `organs/`) | Adapters registering three existing engines as organs; routes their discarded branches into the shared index. | 16/16, clean |
| `depth.mjs` | Search-depth control: bounds how far the conductor expands before it resolves. | 8/8, clean |

The conductor is generic and trainable. A fresh instance ships unsigned as `didy`; registering
organs and signing it with an owner prefix yields a `<prefix>-didy` — a named descendant.

## Verification

Each module has a deterministic assertion suite **and** a mutation-testing gate that alters one
operator at a time and requires the suite to catch it — a passing assertion suite is necessary but
not sufficient. Both run in CI on every push, for all five modules. Surviving mutants are either
killed with a new test or recorded in a baseline as reviewed equivalents with a written rationale.

```bash
node test.mjs && node shadow.test.mjs && node wire.test.mjs && node didy.test.mjs && node depth.test.mjs
```

## Run locally

```bash
node scripts/serve.mjs   # serves the site + modules at http://localhost:8260
```

The published page imports the same `core.mjs` and `shadow.mjs` the tests verify — the demo is the
gated logic, not a reimplementation.

## Design notes

- **Deterministic** — no wall-clock or randomness in the kernels; identical inputs give identical
  results; content-addressing makes repeated work free.
- **Grounded** — commitment is always authored, and only for candidates at or above the threshold;
  below threshold the field stays open.
- **Alternatives retained** — discarded candidates are content-addressed and indexed; a branch
  reconsidered across separate decisions accrues a queryable recurrence count.
- **Terminology** — the framework uses possibility/collapse vocabulary (κ, golden offset,
  content-addressing); the implementation is ordinary deterministic code. κ = 1/φ is a project
  convention for a single shared acceptance threshold.

## Lineage

fall-os shares the principle of the *assos* line of sovereign, self-contained systems. It descends
from foundational work by [Thomas Frumkin](https://github.com/teslasolar) (the *assos* systems, the
Regulus engine, and a broad body of sovereign human–AI tooling). Designed, implemented, and
maintained under [sjgant80-hub](https://github.com/sjgant80-hub).

# fall-os

**▶ [Live — open fall-os](https://sjgant80-hub.github.io/fall-os/)**

**📄 [Download the pitch deck (PDF)](https://www.ai-nativesolutions.com/fall-os-deck.pdf)**  ·  **📄 [Download the prospectus (PDF)](https://www.ai-nativesolutions.com/fall-os-prospectus.pdf)**  ·  [Deck online](https://www.ai-nativesolutions.com/deck.html) · [Prospectus online](https://www.ai-nativesolutions.com/prospectus.html)

*The sovereign operating system for an AI-run estate — 1,548 repositories, 371 live builds, one shared core.*

---

You chat with a conductor. It runs on **your own models** — a local-first cascade that escalates to
a frontier API only if you allow it — builds what you ask, wires it into the estate, and runs
operations once you have trained it. Every agent carries a signed identity and a budget it cannot
cross. Every build must survive a mutation gate before it ships. No datacenter, no subscription,
nothing leaves the machine unless you send it.

---

## What it is

Cloud AI rents you intelligence by the token and keeps the memory. fall-os inverts that: inference
defaults to hardware you own, the memory is a corpus you own, and the orchestration is a
deterministic runtime you can audit line by line. The conductor is the interface — you direct it the
way you would a coding agent, except the weights, the context, the history and the outputs are yours.

**Design thesis:** compression and orchestration beat raw scale. You do not need their datacenter —
you need the right compression and hardware you already own.

## What it does

| | |
|---|---|
| **Build** | Describe what you need; the conductor expands candidate implementations, generates code, and runs it through the gate. Anything that fails verification is discarded — it never reaches you as working software. |
| **Operate** | Trained organs run real deployments: multi-channel reservations with a double-booking guard, offline housekeeping across a multi-unit site, encrypted bookkeeping, cited legal drafting, unified inbox and reply drafting. |
| **Delegate** | A **90 / 10** operating split — 90 % machine execution, 10 % human judgement. Consequential actions stay authored; autonomy is granted per organ, never assumed. |
| **Constrain** | Every agent holds an Ed25519 identity that *is* its capability and its budget ceiling. Overrun is impossible by construction, and every transfer is signed onto a hash-chained ledger. |

## How it works

### 1 · The model cascade — local first, frontier optional

Requests descend to the cheapest capable tier. Your key hits your provider directly; there is no
intermediary service and no token metering by us.

| Tier | Runs on | Notes |
|---|---|---|
| **T0** Built-in deterministic logic | on-device | Kernels, templates and gates — no model needed |
| **T1** In-browser model (WebLLM) | on-device | No install, no server, works offline |
| **T2** Your local host (Ollama) | your hardware | Mid-size local models, e.g. **Qwen 14B**, over localhost |
| **T2.5** Large local / co-located | your hardware | Heavier weights where hardware allows |
| **T3** Free-tier APIs | opt-in · BYOK | Optional burst capacity, your account |
| **T4** Frontier models | opt-in · BYOK | Maximum capability on demand — never required |

Routing between a local Ollama host and frontier providers by task, quality and cost is a live
component of the estate (`fallrouter`), not a diagram.

### 2 · The control loop

Every request runs the same five phases, each implemented by the shared core:

`explore → resolve → verify → build → remember`

1. **Explore** — expand candidates at golden-angle offsets so options diverge rather than cluster.
2. **Resolve** — score against one shared acceptance threshold — the same bar in every organ.
3. **Verify** — run proof. Nothing is selected implicitly; commitment is authored.
4. **Build** — produce the committed result and cache by content (`run(S) == S`).
5. **Remember** — record the decision and index every alternative not taken, with a recurrence count.

### 3 · The estate is the context

The estate's repositories are treated as a single addressable field — content-signed, graph-indexed,
retrievable at reasoning time (`the wisp`, `estate-nest`, `fall-remember`, `offramp-v2`). Prior
sessions become live memory; overnight consolidation reorganises what was learned without retraining
any weights. **Your corpus is your context, not a vendor's training data.**

### 4 · Runtime modules

| Module | Responsibility | Mutation gate |
|---|---|---|
| `core.mjs` | Shared engine: golden-offset expansion, acceptance gate, deliberate commitment, content-addressed cache | 10/12 · clean |
| `didy.mjs` | The conductor: five-phase control loop, organ registry, grounded commitment | 17/17 · clean |
| `shadow.mjs` | Not-taken index: content-addresses discarded options, deduplicates, ranks by recurrence | 10/10 · clean |
| `wire.mjs` | Adapters registering existing engines as organs without rewriting them | 16/16 · clean |
| `depth.mjs` | Search-depth control — how far the conductor expands before it resolves | 8/8 · clean |

The conductor is generic and trainable: a fresh instance ships blank as `didy`; registering organs
and signing it with an owner prefix yields a `<prefix>-didy`. The reference instance is private.

## The trust rail

Nothing ships on a claim; everything ships on a proof.

- **`witness`** — deterministic mutation + fuzz gate. Alters one operator at a time and requires the
  suite to catch it, so a green suite proves the tests actually constrain behaviour. Runs in CI on
  every push; packaged as a GitHub Action any repository can adopt.
- **`acg-assessor`** — deterministic structural rubric, reproducible rather than model opinion.
- **`proof-of-play` / `earned`** — capability must be demonstrated against a pinned artifact and a
  canonical grader; a self-graded claim dies on re-grade.

```bash
node test.mjs && node shadow.test.mjs && node wire.test.mjs && node didy.test.mjs && node depth.test.mjs
```

## The ecosystem

fall-os is the runtime beneath **1,548 repositories** (1,503 public, 45 private) — 371 live builds and the load-bearing organs across runtime & routing, the three tenses, memory & consolidation, deployed business
operations, agents/identity/economy, the trust rail, geometric & neuromorphic compute, mesh &
transport & sensing, legal & consumer, and open-web agents. The live site maps them with links.

The private subset (45) covers foundational architecture and research, the reference conductor and
governance internals, mesh internals and sensitive tooling. Not listed individually; enquiries welcome.

## Run locally

```bash
node scripts/serve.mjs   # http://localhost:8260
```

The published page imports the same `core.mjs` and `shadow.mjs` the tests verify — the demo *is* the
gated logic, not a reimplementation. Pure ES modules, no build step, no runtime dependencies.

## Lineage

fall-os shares the principle of the *assos* line of sovereign, self-contained systems, and descends
from foundational work by [Thomas Frumkin](https://github.com/teslasolar) (the *assos* systems, the
Regulus engine, and a broad body of sovereign human–AI tooling). Designed, implemented and maintained
under [sjgant80-hub](https://github.com/sjgant80-hub).

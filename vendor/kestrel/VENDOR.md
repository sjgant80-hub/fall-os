# Vendored: KESTREL-LEDGER (the shadow fold ρ) — fall-os's live persistence

These files are the **KESTREL-LEDGER** kernel + IndexedDB adapter, vendored **verbatim** into fall-os so the Didy
persists and resumes across sessions through a signed, append-only binary ledger (no cloud). fall-os's own wiring
layer lives at the repo root: `persist-ledger.mjs` + `zone-ledger-map.mjs`.

## Pin — kestrel-ledger @ its sealed MEASURE commit
- repo: `sjgant80-hub/kestrel-ledger`
- commit: `4e6e506bfc8228b30fcdcc514e0b649d6663c424` ("measure: byte-identical reconstruction, 25.9x coordinate ledger, 10k replay ~16ms, poisoned ledger rejected")

## sha256 of the vendored files (verify with `sha256sum vendor/kestrel/*.mjs`)
| file | sha256 | matches kestrel-ledger's seal pin? |
|---|---|---|
| `sentinel.mjs` | `81f05c11fa98c72e7119f3b8166d2cf4ff10cdeccaa1ae0d711367d778944440` | ✅ `data/prereg.json` @ seal `ba23d9c` |
| `kestrelledger.mjs` | `8d3b7d0173a0e6aef2c77e663aab83f6c3418ae396a87eba5867f2db369acd37` | ✅ `data/prereg.json` @ seal `ba23d9c` |
| `kestrel-db.mjs` | `097eef818850b57f60daa5602370eecc3cf7f03c385cef6277ebe843fa12060b` | at commit `4e6e506` (IO adapter — not a measurement input) |
| `idb-mock.mjs` | `e7a543b9fa5f9e943508860a72b33df1371030cc56e4f6b81c47c90fc9831575` | at commit `4e6e506` (test helper — not shipped on the page) |

The two kernels (`sentinel.mjs`, `kestrelledger.mjs`) hash **exactly** to the hashes kestrel-ledger pinned in its own
seal before it measured. fall-os re-asserts this in `scripts/seal-persist.mjs` (`--check` fails on any drift from the
pin), so these bytes cannot change underneath the proof without a seal break.

## What each file is
- **`sentinel.mjs`** — the 6-byte Primorial-Fold codec, the κ-witness fold, and the verify-before-parse Ed25519 gate
  + bounded replay store. Pure; crypto is injected.
- **`kestrelledger.mjs`** — the pure state machine (`applyPrimorialFold`), the inhale (`reconstruct`/`verifyReplay`),
  `canonicalState` (the integrity fold), `genome`, and the three store names.
- **`kestrel-db.mjs`** — the thin IndexedDB IO: `openKestrelDB` / `putGenome` / `putWallet` / `exhale` / `getLedger` /
  `wakeKestrelNode`. The IndexedDB factory is injected, so it runs the same in the browser and in node tests.
- **`idb-mock.mjs`** — a dependency-free in-memory IndexedDB for the node tests (NOT shipped on the live page / not in
  the service-worker cache).
- **`*.test.mjs`** — the kernels' own suites, run in fall-os CI as a regression gate on the vendored bytes.

## Provenance / license
The primorial-fold codec is **Thomas Frumkin's Konomi / LIGHT architecture**, used with permission. The gate +
bounded replay store are **SENTINEL**'s (`sjgant80-hub/sentinel`). MIT, credited — see the repo `NOTICE` and the
estate memories `[[kestrel-ledger]]`, `[[konomi-provenance]]`, `[[gary-floyd-papers]]`.

**Do not edit these files in place.** To update the pin, re-vendor from a newer sealed kestrel-ledger commit and
update the hashes here and in `scripts/seal-persist.mjs`.

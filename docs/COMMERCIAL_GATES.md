# KATA Commercial Gates G0–G10 (kata-only)

No capability moves to `PRODUCTION` in `capability-matrix.json` without
passing each gate in order. Application tests alone never imply a commercial
claim. A missing gate fails the release; targets are never lowered to fit a
miss (Rule D).

## G0 — Repository truth

Inventory every feature, connector, endpoint, test, benchmark, documented
claim, production dependency, and deployment. Eliminate contradictions
(for example broad roadmap claims vs actual browser-oriented implementation).
Record the result in `capability-matrix.json` with
`PRODUCTION / EXPERIMENTAL / PLANNED / UNSUPPORTED`.

## G1 — Functional correctness

`npm test` green for the claimed surface. Necessary, never sufficient for a
competitive claim.

## G2 — Real-system integration

Claimed connectors and workflows run against real sandboxes or instances
(PostgreSQL, ServiceNow, GitHub, vendor sandbox, OpenAlex live). Synthetic
fixtures do not satisfy G2 (Rule A).

## G3 — Adversarial and fault qualification

Fault injection: process, worker, database, network, DNS, connector, and
browser failures; latency, duplicates, stale reads, retry storms, quota
exhaustion. Invariants preserved; consequential paths fail closed.

## G4 — Performance qualification

Pinned workloads record wall-clock, overhead vs handcrafted workflow (target
API-first overhead <= 20%), and worker capacity. No silent budget asymmetry
between product and comparison (Rule B).

## G5 — External benchmark

One of `benchmarks/manifests/workarena-plus-plus.json`,
`webarena-verified.json`, or `tau3-bench.json` pinned to an exact commit SHA,
run with the fair train/dev-demonstrations to held-out-eval method.
`benchmarks/results/<suite>/<timestamp>/` holds manifest, environment, raw,
metrics, failures, comparison, report, and hashes (Rule G).

## G6 — Security qualification

Threat model plus SAST and dependency scanning, CodeQL, tenant and auth
fuzzing, secret-hygiene scan (zero embedded credentials), and unlabeled-branch
scan (zero unlabeled). `scripts/contract-gate.mjs` plus `static-check.mjs`
must pass.

## G7 — Resilience and restore qualification

Create real state, back up, destroy, restore, verify hashes and invariants,
resume operation. Crash and upgrade paths exercised.

## G8 — Usability qualification

An engineer unfamiliar with the code completes the primary workflow using
only docs and UI. Track time to value, setup failures, manual steps, and
undocumented steps. Authoring economics target: median correction after 3–5
good demonstrations <= 2h, labor reduction >= 75% vs handcrafted.

## G9 — Commercial field proof

At least one reproducible external or design-partner workload. The repository
itself is never the sole customer.

## G10 — Competitive claim eligibility

Only after G0–G9 may marketing contain faster than, higher success rate than,
lower overhead than, best, or leading, and only for the dimension actually
measured, with linked immutable evidence.

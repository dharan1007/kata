# KATA — Demonstration-to-Agent Workflow Compiler

KATA compiles expert demonstrations into typed, portable automation programs.
New billing or plan features are frozen; compiler, qualification, and benchmark
evidence are the product surface.

## Pipeline

```text
Human demonstrations (3-5 recommended, min 2 simple)
  -> Capture Layer (browser / desktop / API / audit logs)
  -> Event Normalizer
  -> Multi-Demonstration Alignment (lib/compiler/alignment.js)
  -> Inference Engine (lib/compiler/inference.js + demonstrations.js)
  -> Semantic KIR (lib/compiler/semantic-kir.js)
  -> Execution Planner, API-first (lib/compiler/api-first.js)
  -> Compiler Targets (lib/compiler/targets.js)
  -> Qualification Runner (lib/compiler/qualify-runner.js + qualification.js)
  -> Versioned Production Workflow
```

Existing `compileTraces` (consensus induction over `ACTION_COMPLETED` traces)
remains the induction core. The semantic layer adds what it lacked: typed
workflow nodes, credential hygiene, ambiguity as data, and a production gate.

## Demonstrations

- Recommended 3-5 demonstrations; minimum 2 only for extremely simple workflows.
- Distinct values across demonstrations where possible (customer 123 vs 845,
  refund 500 vs 800). Identical values cannot yield variables.
- Duplicates rejected. See `lib/compiler/demonstrations.js`.
- Example inference: `customer_id` and `refund_amount` become variables;
  `check balance` stays invariant; refund gated by eligibility predicate;
  confirmation emitted only after verified refund. Coordinates never memorized.

## Semantic KIR

Typed nodes: `ReadResource, CallAPI, BrowserNavigate, BrowserInteract,
Extract, Transform, Branch, Loop, Wait, HumanApproval, ConsequentialAction,
Verify, Compensate, Emit, Escalate`.

Every node carries inputs, outputs, types, preconditions, postconditions,
sideEffectClass, credentialRequirements (reference only), retryPolicy,
timeout, verification, and provenance. `semanticNodeToKir` maps each semantic
kind onto the existing fail-closed KIR v2 graph so current validation,
canonical hashing, static verification, and durable execution keep working.

Credential rule: capture reference, identity scope, and required permission.
Plaintext secrets in compiled inputs or outputs fail validation
(`SEMANTIC_EMBEDDED_CREDENTIAL`).

## API-first compilation

When permitted network or API evidence shows an authorized stable API
reproduces a demonstrated browser sequence (for example `PATCH
/customers/{id}` with `{"status":"APPROVED"}` replacing open, type, search,
change-status, save clicks), the planner emits `api-first` for that node.
The browser path is kept when no stable API exists, authorization blocks API
access, or the compiler cannot prove the API path. `compilePipeline()` retains
an API-first plan only when its candidate includes a successful, user-authorized
browser capture with a valid digest and non-empty post-state, an explicit test
input, and an executor whose result matches that post-state. Missing or
mismatched proof returns the node to the browser path. This checks the recorded
post-state only; it does not claim downstream equivalence or unreported side
effects.
See `lib/compiler/api-first.js`.

## Ambiguity

Divergent step 8 across three demonstrations yields `NEEDS_LABEL` with
hypotheses `optional-step`, `conditional-branch`, and `operator-variance`.
The owner labels the distinction; the compiler never invents a branch.
`assertNoUnlabeledBranches` blocks production with unlabeled ambiguity.
See `lib/compiler/needs-label.js`.

## Qualification and drift

Lifecycle: `CAPTURED -> INFERRED -> REVIEW_REQUIRED -> QUALIFIED -> STAGED ->
PRODUCTION`, with `DRIFTED` and `BLOCKED` as explicit non-progress states.
`QUALIFIED` requires replay against a real sandbox or test system.
See `lib/compiler/qualification.js` and `qualify-runner.js`.

Drift signals: OpenAPI change, GraphQL change, missing locator, role change,
flow change, permission change, result-schema change, policy change.
Non-semantic drift attempts automatic repair then replays qualification and
deploys only when fully qualified. Semantic ambiguity moves to `BLOCKED` for
owner review. Consequential workflows are never self-healed into production.
See `lib/compiler/drift.js`.

## PACT boundary

KATA decides what the workflow should do. PACT decides whether the exact
consequential operation may execute now. `ConsequentialAction` nodes split
from read or transform nodes, then authorize, execute, verify, and continue
with the receipt. KATA does not reimplement authorization. See
`lib/compiler/pact.js`.

## Benchmarks and targets

- `benchmarks/manifests/workarena-plus-plus.json` (682 ServiceNow flows).
- `benchmarks/manifests/webarena-verified.json` (812 tasks, 258 hard subset).
- `benchmarks/manifests/tau3-bench.json` (pinned current release).
- `benchmarks/manifests/kata-qualification.json` (internal replay, economics, drift).
- Runner: `node benchmarks/runners/run-suite.mjs <suite>` scaffolds an
  immutable `benchmarks/results/<suite>/<timestamp>/` run with manifest,
  environment, raw, metrics, failures, comparison, report, and hashes.

Fair method: demonstrations come from allowed train or dev tasks, KATA is
frozen, then unseen held-out tasks are evaluated. Task success and authoring
hours are reported separately; faster authoring can win even at equal success.

Release targets: stable API replay >= 99%, browser or API qualification >=
95%, correction after 3-5 demos <= 2h, labor reduction >= 75%, API overhead <=
20%, non-semantic drift recovery >= 90%, zero embedded credentials, zero
unlabeled branches. Missing a target fails the gate; progress and superiority
stay separate. No top-benchmark claim without held-out evidence.

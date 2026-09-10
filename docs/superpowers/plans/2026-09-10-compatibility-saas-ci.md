# KATA Compatibility SaaS and CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn KATA's interoperability engine into a project-centric compatibility product with persisted reports, baselines, policy evaluation, machine-readable exports, and CI enforcement without adding an unsafe hosted browser crawler.

**Architecture:** Customer browser/extension/CLI/CI gathers legitimate evidence and submits bounded normalized evidence to KATA. The server evaluates that evidence through KATA's existing interoperability evaluator, persists compact findings/receipts, compares approved baselines, and returns deterministic CI exit classes.

**Tech Stack:** Node.js 24 ESM, existing KATA interoperability modules, PostgreSQL, built-in crypto, `node:test`, a dependency-free Node CLI entrypoint.

**Spec:** `docs/superpowers/specs/2026-09-10-monetization-ready-control-plane-design.md`

## Global Constraints

- Do not add a generic server-side arbitrary URL-fetch agent tool.
- Authenticated/private targets use user-authorized extension or customer-run CLI/CI evidence collection.
- Cross-origin, CAPTCHA, anti-bot, paywall, CSP/CORS and authentication restrictions are reported, never bypassed.
- Reports distinguish KATA internal failure from a valid BLOCKED finding.
- Hosted evaluation consumes quota through Plan B reservation semantics.
- Existing canonical KATA interoperability evaluator remains the source of finding semantics.

---

## File Structure

- `lib/commercial/runs.js` — run creation, evidence validation, evaluation and persistence.
- `lib/commercial/reports.js` — report projection, retention and export.
- `lib/commercial/baselines.js` — approved baseline management and regression comparison.
- `lib/commercial/policy.js` — deterministic organization CI policy evaluation.
- `lib/commercial/ci.js` — CI result/exit-class projection.
- `bin/kata.mjs` — local/customer-CI command line client/evidence submitter.
- `netlify/database/migrations/004_compatibility_runs.sql` — runs/findings/baselines/policies.
- `tests/commercial-runs.test.js`
- `tests/commercial-policy.test.js`
- `tests/commercial-ci.test.js`
- `tests/cli.test.js`

### Task 1: Define persisted compatibility-run schema

**Files:**
- Create: `netlify/database/migrations/004_compatibility_runs.sql`
- Create: `tests/commercial-runs-schema.test.js`

**Interfaces:**
- `compatibility_runs` belongs to organization/project/environment and records source type, status, evaluator version, request ID, compact evidence digest, score summary and timestamps.
- `compatibility_findings` belongs to one run and stores code/severity/layer/possibility/blocked reason/compliant path/remediation/confidence plus bounded evidence JSON.
- `project_baselines` references exactly one successful run per environment.
- `policy_profiles` belongs to organization and stores validated deterministic policy JSON.

- [ ] **Step 1: Write RED migration tests**

Assert tenant/project foreign keys, unique baseline per environment, indexes for project+created_at, constrained run statuses `QUEUED|RUNNING|COMPLETED|FAILED`, constrained severities, and no secret/browser-cookie/token columns.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-runs-schema.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement migration**

Persist evidence digest and only the normalized bounded evidence needed to explain findings. Do not persist entire DOM snapshots, raw auth headers, model prompts or session credentials.

- [ ] **Step 4: Run test and commit**

```bash
node --test tests/commercial-runs-schema.test.js
git add netlify/database/migrations/004_compatibility_runs.sql tests/commercial-runs-schema.test.js
git commit -m "feat: add compatibility run persistence schema"
```

### Task 2: Build evidence-to-report execution service

**Files:**
- Create: `lib/commercial/runs.js`
- Create: `lib/commercial/reports.js`
- Create: `tests/commercial-runs.test.js`

**Interfaces:**
- `createCompatibilityRun({store,actor,projectId,environmentId,evidence,idempotencyKey})`.
- `getRun({store,actor,runId})`.
- `getReport({store,actor,runId})`.
- `exportReport({store,actor,runId,format:'json'})`.

- [ ] **Step 1: Write RED tests around bounded evidence and semantics**

Prove an evidence payload above the configured byte/node/finding limits is rejected before quota commit, cross-tenant reads fail, `AUTH_REQUIRED`/`POLICY_BLOCKED` evidence becomes a completed report finding rather than a server exception, and a thrown evaluator defect finalizes the run as `FAILED` and releases the usage reservation.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-runs.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement normalized evidence validation**

Accepted source types: `browser-extension`, `cli`, `ci`, `api-evidence`. Every source includes `collectorVersion`, `targetOrigin`, `collectedAt`, bounded `runtime`, `api`, `mcp`, `webmcp`, `securityPolicies` evidence. Reject raw credential-bearing fields by exact reserved-key filter before persistence.

- [ ] **Step 4: Invoke existing KATA interop evaluation**

Adapt normalized evidence into the existing `lib/server/interop-evaluator.js`/graph path rather than duplicating finding logic. Persist evaluator version and SHA-256 evidence digest in the receipt.

- [ ] **Step 5: Run tests and commit**

```bash
node --test tests/commercial-runs.test.js
git add lib/commercial/runs.js lib/commercial/reports.js tests/commercial-runs.test.js
git commit -m "feat: persist bounded compatibility reports"
```

### Task 3: Add baselines and deterministic regression comparison

**Files:**
- Create: `lib/commercial/baselines.js`
- Create: `tests/commercial-baselines.test.js`

**Interfaces:**
- `setBaseline({store,actor,environmentId,runId})`.
- `compareWithBaseline({store,actor,runId}) -> {newFindings,resolvedFindings,severityChanges,scoreDelta}`.

- [ ] **Step 1: Write RED tests**

Prove only a completed run from the same project/environment can become a baseline, MEMBER baseline mutation follows policy role rules, cross-environment baseline substitution fails, and comparison is stable regardless of database row order.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-baselines.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement comparison by stable finding identity**

Use finding code + normalized layer/surface identity as the comparison key. A changed message string must not create a false regression when identity/severity are unchanged.

- [ ] **Step 4: Run and commit**

```bash
node --test tests/commercial-baselines.test.js
git add lib/commercial/baselines.js tests/commercial-baselines.test.js
git commit -m "feat: compare compatibility baselines deterministically"
```

### Task 4: Add organization policy profiles and CI outcome classes

**Files:**
- Create: `lib/commercial/policy.js`
- Create: `lib/commercial/ci.js`
- Create: `tests/commercial-policy.test.js`
- Create: `tests/commercial-ci.test.js`

**Interfaces:**
- `validatePolicyProfile(input)` supports `maxNewSeverity`, `forbidFindingCodes`, `requiredCapabilities`, `requireSourceBoundRelease`.
- `evaluatePolicy({report,baselineDelta,policy}) -> {pass,violations}`.
- `toCiOutcome(result)` maps to exit classes 0/2/3/4/5 from the design.

- [ ] **Step 1: Write RED policy tests**

Prove a new critical finding fails, a resolved finding does not fail, `AUTH_REQUIRED` maps to exit 4, target/configuration restriction maps to 3, KATA/provider transient failure maps to 5, and unsafe policy fields/functions/regex source are rejected rather than executed.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-policy.test.js tests/commercial-ci.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement allowlisted declarative policy evaluation**

No `eval`, dynamic JS, user regex execution or arbitrary expression language. Policies are JSON with finite keys and finite enumerated severity/capability values.

- [ ] **Step 4: Run tests and commit**

```bash
node --test tests/commercial-policy.test.js tests/commercial-ci.test.js
git add lib/commercial/policy.js lib/commercial/ci.js tests/commercial-policy.test.js tests/commercial-ci.test.js
git commit -m "feat: enforce declarative compatibility policy"
```

### Task 5: Build the customer-run CLI/CI contract

**Files:**
- Create: `bin/kata.mjs`
- Modify: `package.json`
- Create: `tests/cli.test.js`

**Interfaces:**
- `kata collect --target https://app.example --out evidence.json` collects only what the local process/browser integration can legitimately observe.
- `kata submit --project <id> --environment <id> --evidence evidence.json` sends evidence with CI/API token.
- `kata verify ...` submits and applies policy, exiting with 0/2/3/4/5.

- [ ] **Step 1: Write RED CLI contract tests**

Spawn the CLI as a child process against a local fake HTTP endpoint. Prove secrets are accepted through `KATA_TOKEN` environment variable rather than CLI echo, error output redacts tokens, invalid target protocols fail before network calls, and server-provided exit class is honored.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/cli.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement dependency-free argument parsing and bounded HTTP behavior**

Use built-in `process.argv`, `fetch`, `AbortSignal.timeout`, manual redirects unless explicitly safe, JSON byte bounds and stable stderr messages. Never add CAPTCHA solving, stealth automation, cookie extraction or origin bypass.

- [ ] **Step 4: Add package bin mapping and run tests**

`package.json` gets:

```json
"bin": { "kata": "./bin/kata.mjs" }
```

Run: `node --test tests/cli.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bin/kata.mjs package.json tests/cli.test.js
git commit -m "feat: add KATA compatibility CI client"
```

### Task 6: Expose project run/report/baseline/policy APIs

**Files:**
- Modify: `lib/commercial/router.js`
- Create: `tests/commercial-runs-api.test.js`

**Interfaces:**
- `POST /api/projects/:projectId/runs`.
- `GET /api/projects/:projectId/runs`.
- `GET /api/runs/:runId/report`.
- `POST /api/environments/:environmentId/baseline`.
- `GET|PUT /api/organizations/:orgId/policy`.

- [ ] **Step 1: Write RED API tests**

Assert source principals are scope-checked, quota reservation occurs before evaluation, a repeated idempotency key returns the same run, Developer can export JSON, Free cannot, Team policy controls are server-enforced, and private report responses are `Cache-Control: private, no-store`.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-runs-api.test.js`

Expected: FAIL.

- [ ] **Step 3: Wire routes to existing commercial services**

Do not put evaluator/business logic in route branches. Return stable run/report receipts with request IDs.

- [ ] **Step 4: Run full plan gate**

```bash
node --test tests/commercial-runs*.test.js tests/commercial-baselines.test.js tests/commercial-policy.test.js tests/commercial-ci.test.js tests/cli.test.js
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/commercial/router.js tests/commercial-runs-api.test.js
git commit -m "feat: expose compatibility reports and CI policy APIs"
```

## Plan D Completion Gate

Plan D is complete only when legitimate local/browser/CI evidence produces persisted tenant-safe reports, arbitrary hosted crawling is still absent, quota failure semantics are correct, baseline deltas are deterministic, policy is declarative/non-executable, CI returns documented exit classes, secret-bearing inputs are rejected/redacted, and `npm run check` remains green.
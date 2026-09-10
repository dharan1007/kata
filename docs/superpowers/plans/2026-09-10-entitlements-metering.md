# KATA Entitlements and Metering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one server-authoritative plan/entitlement system, scoped CI principals, and concurrency-safe usage reservation/outcome accounting.

**Architecture:** Plan names map once into immutable entitlement values; downstream code asks capability questions rather than branching on plan strings. Usage is reserved transactionally before execution and finalized afterward so retries and concurrent requests cannot overspend quota.

**Tech Stack:** Node.js 24 ESM, PostgreSQL transactions/constraints, built-in crypto, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-10-monetization-ready-control-plane-design.md`

## Global Constraints

- Commercial authorization remains server-side and tenant-first.
- UI/browser metadata cannot grant plans, quotas, roles or scopes.
- A BLOCKED compatibility diagnosis counts when KATA produced a legitimate assessment; KATA internal failures do not consume quota.
- Idempotent retries cannot consume quota twice.
- Existing KATA protocol semantics remain unchanged.
- Every task ends with targeted tests; the plan ends with `npm run check`.

---

## File Structure

- `lib/commercial/plans.js` — canonical Free/Developer/Team/Enterprise entitlement registry.
- `lib/commercial/entitlements.js` — subscription state to effective entitlement snapshot.
- `lib/commercial/usage.js` — reserve/finalize/release usage workflow.
- `lib/commercial/ci-tokens.js` — least-privilege project/environment CI credentials.
- `netlify/database/migrations/002_entitlements_usage.sql` — subscription snapshot, quota bucket, reservation and usage tables.
- `tests/commercial-entitlements.test.js`
- `tests/commercial-usage.test.js`
- `tests/commercial-ci-tokens.test.js`

### Task 1: Define one canonical plan registry

**Files:**
- Create: `lib/commercial/plans.js`
- Create: `tests/commercial-entitlements.test.js`

**Interfaces:**
- `PLAN_IDS = ['free','developer','team','enterprise']`.
- `getPlanEntitlements(planId)` returns a frozen plain object.
- `deriveEffectiveEntitlements({billingState,planId,enterpriseOverrides})` returns server-authoritative capabilities.

- [ ] **Step 1: Write RED tests for exact bootstrap plans**

```js
assert.deepEqual(getPlanEntitlements('free'),{
  maxProjects:2,monthlyEvaluations:30,historyDays:7,privateProjects:false,
  apiKeys:false,ciTokens:false,ciEnforcement:false,regressionHistory:false,
  jsonExport:false,organizationMembers:1,policyManagement:false,
  auditExport:false,enterpriseSelfHosting:false
});
assert.equal(getPlanEntitlements('developer').monthlyEvaluations,500);
assert.equal(getPlanEntitlements('team').organizationMembers,10);
assert.throws(()=>getPlanEntitlements('made-up'),/UNKNOWN_PLAN/);
```

Also prove returned objects are frozen and caller mutation cannot change future authorization.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-entitlements.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement registry and canonical billing-state mapping**

Only `ACTIVE` paid subscriptions grant Developer/Team paid capabilities. `PAST_DUE`, `HALTED`, `CANCELLED`, `EXPIRED`, `RECONCILIATION_REQUIRED` default to an explicit restricted/free policy defined in this module; do not let the browser choose fallback behavior.

- [ ] **Step 4: Run tests and commit**

```bash
node --test tests/commercial-entitlements.test.js
git add lib/commercial/plans.js lib/commercial/entitlements.js tests/commercial-entitlements.test.js
git commit -m "feat: add canonical commercial entitlements"
```

### Task 2: Add entitlement and usage database state

**Files:**
- Create: `netlify/database/migrations/002_entitlements_usage.sql`
- Create: `tests/commercial-usage-schema.test.js`

**Interfaces:**
- `subscription_accounts` stores canonical billing state + plan ID.
- `entitlement_snapshots` stores derived evidence/version, never client-authored values.
- `usage_buckets` has unique `(organization_id,metric,window_start)`.
- `usage_reservations` has unique `(organization_id,metric,idempotency_key)`.
- `usage_events` references one reservation and records terminal outcome.
- `ci_tokens` are project/environment scoped and store only key hash/prefix metadata.

- [ ] **Step 1: Write migration contract tests**

Assert the unique constraints above, foreign keys to organization/project, non-negative unit checks, allowed reservation states `RESERVED|COMMITTED|RELEASED`, and absence of raw token/secret columns.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-usage-schema.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement migration**

Use `timestamptz`, integer units, explicit status CHECK constraints and indexes for current-month usage reads and per-organization activity history.

- [ ] **Step 4: Run tests and commit**

```bash
node --test tests/commercial-usage-schema.test.js
git add netlify/database/migrations/002_entitlements_usage.sql tests/commercial-usage-schema.test.js
git commit -m "feat: add entitlement and usage schema"
```

### Task 3: Implement transactional quota reservation

**Files:**
- Create: `lib/commercial/usage.js`
- Create: `tests/commercial-usage.test.js`

**Interfaces:**
- `reserveUsage({store,organizationId,metric,units,idempotencyKey,entitlements,now})`.
- `commitUsage({store,reservationId,outcome,metadata})`.
- `releaseUsage({store,reservationId,reason})`.
- `getUsageSummary({store,organizationId,windowStart})`.

- [ ] **Step 1: Write RED tests for concurrency/idempotency semantics**

Tests must prove:

```js
const a=await reserveUsage({...base,idempotencyKey:'req-1'});
const b=await reserveUsage({...base,idempotencyKey:'req-1'});
assert.equal(a.id,b.id);
```

and simulate two reservations racing for one remaining unit; exactly one must become `RESERVED`, the other must throw `QUOTA_EXCEEDED`/429. Also prove release of a KATA internal failure returns the reserved unit and a completed BLOCKED assessment commits it.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-usage.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement reservation with one transaction and row locking**

Inside `store.transaction`, select/create the current bucket, lock it (`FOR UPDATE` in the SQL store), check `used_units + reserved_units + units <= limit`, insert the unique reservation, and atomically increment reserved units. A duplicate idempotency key returns the existing reservation without incrementing again.

Finalize by moving units from reserved to used for committed outcomes or decrementing reserved for released outcomes. Terminal transitions are idempotent.

- [ ] **Step 4: Run tests and commit**

```bash
node --test tests/commercial-usage.test.js
git add lib/commercial/usage.js tests/commercial-usage.test.js
git commit -m "feat: add atomic usage reservation ledger"
```

### Task 4: Add server-scoped CI tokens

**Files:**
- Create: `lib/commercial/ci-tokens.js`
- Create: `tests/commercial-ci-tokens.test.js`

**Interfaces:**
- `issueCiToken({store,actor,projectId,environmentId,scopes}) -> {token,record}`.
- `verifyCiToken({store,presentedToken,requiredScope,projectId,environmentId})`.
- `revokeCiToken(...)`.

- [ ] **Step 1: Write RED least-privilege tests**

Prove a token for project A cannot submit/read project B, an environment-scoped token cannot act on sibling environments, `ci:enforce` is not implied by `runs:create`, and plans without `ciTokens` cannot issue one.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-ci-tokens.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement token hashing using the same secure key primitive as Plan A**

Use a distinct recognizable prefix such as `kata_ci_`; persist only prefix/hash/scopes. The verifier returns a service principal containing immutable organization/project/environment scope.

- [ ] **Step 4: Run tests and commit**

```bash
node --test tests/commercial-ci-tokens.test.js
git add lib/commercial/ci-tokens.js tests/commercial-ci-tokens.test.js
git commit -m "feat: add least privilege CI principals"
```

### Task 5: Wire entitlement/usage APIs without plan-string authorization

**Files:**
- Modify: `lib/commercial/router.js`
- Create: `tests/commercial-entitlement-api.test.js`

**Interfaces:**
- `GET /api/usage` returns current effective limits/consumption.
- `GET /api/account` includes effective entitlement snapshot for rendering only.
- `POST /api/ci-tokens` and DELETE route use capability/scope checks.

- [ ] **Step 1: Write RED route tests**

Assert a request body `{plan:'team'}` changes nothing, a Free user cannot create API/CI keys, a Developer can create API keys but cannot create organization team membership beyond entitlement, and Team CI token issuance succeeds within project scope.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-entitlement-api.test.js`

Expected: FAIL.

- [ ] **Step 3: Wire the router to `deriveEffectiveEntitlements` and usage service**

Commercial routes must resolve billing state from store, derive entitlements server-side, then authorize the requested capability. Do not accept a plan/capability override header.

- [ ] **Step 4: Run complete plan gate**

```bash
node --test tests/commercial-entitlement-api.test.js tests/commercial-entitlements.test.js tests/commercial-usage.test.js tests/commercial-ci-tokens.test.js
npm run check
```

Expected: all tests and existing KATA release checks PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/commercial/router.js tests/commercial-entitlement-api.test.js
git commit -m "feat: enforce commercial entitlements and usage"
```

## Plan B Completion Gate

Plan B is complete only when plan strings cannot directly authorize features, effective entitlements are server-derived, concurrent quota reservations cannot overspend, retries are idempotent, failed internal operations can release quota safely, CI credentials are least-privilege, and `npm run check` remains green.
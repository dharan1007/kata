# KATA Entitlements and Metering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one server-authoritative plan/entitlement system, a public pricing contract, scoped CI principals, and concurrency-safe usage reservation/outcome accounting.

**Architecture:** Plan IDs map once into immutable entitlements and public display metadata. Downstream code asks capability questions instead of branching on plan strings. Usage is reserved transactionally before execution and finalized afterward so retries and concurrent requests cannot overspend quota.

**Tech Stack:** Node.js 24 ESM, PostgreSQL transactions/constraints, built-in crypto, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-10-monetization-ready-control-plane-design.md`

## Global Constraints

- Commercial authorization remains server-side and tenant-first.
- UI/browser metadata cannot grant plans, quotas, roles or scopes.
- Public pricing metadata may describe plans but can never authorize a feature.
- A valid BLOCKED compatibility diagnosis consumes an evaluation because KATA delivered the diagnosis; KATA internal failure does not.
- Idempotent retries cannot consume quota twice.
- Existing KATA protocol semantics remain unchanged.
- Every task ends with targeted tests; the plan ends with `npm run check`.

---

## File Structure

- `lib/commercial/plans.js` — canonical plan IDs, public pricing metadata and immutable entitlement registry.
- `lib/commercial/entitlements.js` — billing state to effective entitlement snapshot.
- `lib/commercial/usage.js` — reserve/finalize/release usage workflow.
- `lib/commercial/ci-tokens.js` — least-privilege project/environment CI credentials.
- `netlify/database/migrations/002_entitlements_usage.sql` — subscription snapshot, quota bucket, reservation, usage and CI-token tables.
- `tests/commercial-entitlements.test.js`
- `tests/commercial-usage-schema.test.js`
- `tests/commercial-usage.test.js`
- `tests/commercial-ci-tokens.test.js`
- `tests/commercial-entitlement-api.test.js`

### Task 1: Define one canonical plan and pricing registry

**Files:**
- Create: `lib/commercial/plans.js`
- Create: `lib/commercial/entitlements.js`
- Create: `tests/commercial-entitlements.test.js`

**Interfaces:**
- `PLAN_IDS = ['free','developer','team','enterprise']`.
- `getPlanEntitlements(planId)` returns a frozen authorization object.
- `getPublicPlans()` returns display-safe price/features only.
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
assert.equal(getPublicPlans().find(p=>p.id==='developer').priceInrMonthly,999);
assert.equal(getPublicPlans().find(p=>p.id==='team').priceInrMonthly,4999);
assert.throws(()=>getPlanEntitlements('made-up'),/UNKNOWN_PLAN/);
```

Also prove returned objects are frozen, public pricing output contains no provider plan IDs/secrets, and caller mutation cannot change future authorization.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-entitlements.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement plan registry and billing-state mapping**

Only server-reconciled `ACTIVE` Developer/Team subscriptions grant those paid entitlements. `PAST_DUE`, `HALTED`, `CANCELLED`, `EXPIRED` and `RECONCILIATION_REQUIRED` map through one documented restricted/free rule; the browser cannot choose fallback behavior. Enterprise overrides are accepted only from a server-side contract record, never request JSON.

- [ ] **Step 4: Run tests and commit**

```bash
node --test tests/commercial-entitlements.test.js
git add lib/commercial/plans.js lib/commercial/entitlements.js tests/commercial-entitlements.test.js
git commit -m "feat: add canonical plans and entitlements"
```

### Task 2: Add entitlement and usage database state

**Files:**
- Create: `netlify/database/migrations/002_entitlements_usage.sql`
- Create: `tests/commercial-usage-schema.test.js`

**Interfaces:**
- `subscription_accounts` stores canonical billing state and plan ID.
- `entitlement_snapshots` stores derived evidence/version, never client-authored capability values.
- `usage_buckets` unique `(organization_id,metric,window_start)`.
- `usage_reservations` unique `(organization_id,metric,idempotency_key)`.
- `usage_events` references one reservation and records terminal outcome.
- `ci_tokens` are project/environment scoped and store only key hash/prefix metadata.

- [ ] **Step 1: Write RED migration tests**

Assert all uniqueness/foreign-key constraints above, non-negative unit checks, reservation states `RESERVED|COMMITTED|RELEASED`, explicit subscription-state checks and absence of raw token/secret columns.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-usage-schema.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement migration**

Use `timestamptz`, integer units, explicit CHECK constraints and indexes for current-window usage plus organization time-range queries. Seed no paid plan state from client-visible data.

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

- [ ] **Step 1: Write RED idempotency/concurrency tests**

```js
const a=await reserveUsage({...base,idempotencyKey:'req-1'});
const b=await reserveUsage({...base,idempotencyKey:'req-1'});
assert.equal(a.id,b.id);
```

Simulate two reservations racing for one remaining unit; exactly one becomes `RESERVED` and the other throws `QUOTA_EXCEEDED` with 429. Prove an internal KATA failure releases the unit while a completed report whose result is BLOCKED commits it.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-usage.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement reservation under one transaction/row lock**

Inside `store.transaction`, lock/create the current bucket, check `used_units + reserved_units + units <= limit`, insert the unique reservation and increment reserved units. On duplicate idempotency key, return the existing reservation without incrementing again. Terminal finalize/release operations are themselves idempotent.

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
- `revokeCiToken({store,actor,tokenId})`.

- [ ] **Step 1: Write RED least-privilege tests**

Prove a token for project A cannot submit/read project B, an environment-scoped token cannot act on sibling environments, `ci:enforce` is not implied by `runs:create`, plans without `ciTokens` cannot issue one, and raw CI tokens are one-time reveal/hash-only at rest.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-ci-tokens.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement token hashing with the Plan A key primitive**

Use prefix `kata_ci_`; persist prefix/hash/scopes only. The verifier returns an immutable service principal containing organization/project/environment scope.

- [ ] **Step 4: Run tests and commit**

```bash
node --test tests/commercial-ci-tokens.test.js
git add lib/commercial/ci-tokens.js tests/commercial-ci-tokens.test.js
git commit -m "feat: add least privilege CI principals"
```

### Task 5: Expose public pricing and authenticated usage/credential APIs

**Files:**
- Modify: `lib/commercial/router.js`
- Create: `tests/commercial-entitlement-api.test.js`

**Interfaces:**
- `GET /api/pricing` is public and returns `getPublicPlans()` only.
- `GET /api/usage` returns current effective limits and consumption for the authenticated tenant.
- `GET /api/account` includes effective entitlement snapshot for rendering only.
- `POST /api/ci-tokens` and revoke route use server capability/scope checks.

- [ ] **Step 1: Write RED HTTP tests**

Assert a body/header such as `{plan:'team'}` or `X-Kata-Plan: team` changes nothing, Free cannot create API/CI keys, Developer may create API keys but not Team-only CI enforcement, Team CI-token issuance succeeds within scope, and `/api/pricing` exposes no Razorpay plan identifiers or entitlement override internals.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-entitlement-api.test.js`

Expected: FAIL.

- [ ] **Step 3: Wire router to the canonical registry**

Resolve subscription state from store, derive entitlements server-side, authorize the capability, then call the operation. `/api/pricing` is display data only and is never consulted by the authorization path.

- [ ] **Step 4: Run complete Plan B gate**

```bash
node --test tests/commercial-entitlements.test.js tests/commercial-usage-schema.test.js tests/commercial-usage.test.js tests/commercial-ci-tokens.test.js tests/commercial-entitlement-api.test.js
npm run check
```

Expected: all tests and existing KATA release checks PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/commercial/router.js tests/commercial-entitlement-api.test.js
git commit -m "feat: enforce commercial entitlements and expose pricing"
```

## Plan B Completion Gate

Plan B is complete only when plan strings cannot directly authorize features, public pricing is derived from the same registry without exposing secrets, effective entitlements are server-derived, concurrent quota reservations cannot overspend, retries are idempotent, failed internal operations release quota safely, CI credentials are least-privilege, and `npm run check` remains green.
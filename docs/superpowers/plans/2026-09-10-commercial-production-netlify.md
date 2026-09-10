# KATA Commercial Production Migration and Release Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move KATA's commercial production surface from Vercel Hobby to a source-bound Netlify Free bootstrap deployment with equivalent-or-stronger verification, hard budget safety, production database migrations, and truthful launch readiness.

**Architecture:** Preserve the existing Vercel deployment as rollback/reference while building Netlify in parallel. A provider-neutral public router plus the commercial router are mounted behind one Netlify Functions entrypoint. GitHub Actions promotes only an exact `main` SHA whose Release Gate and CodeQL pass; production is accepted only after provenance, integrity, API, commercial-readiness and canonical-domain checks pass.

**Tech Stack:** Node.js 24 ESM, Netlify Functions, Netlify Identity, Netlify Database/PostgreSQL, Netlify CLI 27.5.1, GitHub Actions, existing KATA build/integrity scripts, Node/curl smoke verification.

**Spec:** `docs/superpowers/specs/2026-09-10-monetization-ready-control-plane-design.md`

## Global Constraints

- Do not delete or disable Vercel until Netlify production and rollback verification are complete.
- Do not deploy merely because an audit/scheduled task ran.
- No promotion without exact-source Release Gate and CodeQL success.
- Readiness fails closed if Identity, database, Razorpay, legal, support, provider-budget, migrations or release governance are incomplete.
- Netlify Free is bootstrap infrastructure, not an enterprise uptime SLA.
- No automatic paid upgrade/auto-recharge path is introduced.
- Existing MCP/WebMCP/API/security behavior must pass unchanged after migration.
- Netlify CLI is pinned to `27.5.1` for this implementation; future updates require a reviewed dependency update.

---

## File Structure

- `netlify.toml` — build/functions/redirect/header configuration.
- `netlify/functions/kata-api.mjs` — Netlify Web Request/Response entrypoint.
- `lib/server/public-router.js` — provider-neutral current public API routing.
- `lib/platform/netlify-http.js` — Vercel compatibility/request adaptation during migration.
- `lib/commercial/provider-budget.js` — free-plan safety threshold state.
- `scripts/verify-commercial-schema.mjs` — source/database migration-version verifier.
- `scripts/netlify-smoke.mjs` — exact deployment/canonical smoke checks.
- `scripts/commercial-release-check.mjs` — launch readiness gate.
- `.github/workflows/deploy-netlify-production.yml` — guarded promotion.
- `docs/COMMERCIAL_RELEASE.md` — operator setup/cutover/rollback contract.
- `docs/GITHUB_RELEASE_GOVERNANCE.md` — required main-branch/ruleset settings.
- Tests: `tests/public-router.test.js`, `tests/netlify-routing.test.js`, `tests/provider-budget.test.js`, `tests/commercial-release.test.js`, `tests/netlify-deploy-workflow.test.js`, `tests/release-governance.test.js`.

### Task 1: Extract provider-neutral public HTTP routing

**Files:**
- Create: `lib/server/public-router.js`
- Create: `lib/platform/netlify-http.js`
- Create: `tests/public-router.test.js`
- Modify: `api/health.js`, `api/capabilities.js`, `api/search.js`, `api/invoke.js`, `api/triage.js`, `api/compile.js`, `api/execute.js`, `api/agents.js`, `api/mcp.js`, `api/openapi.js` only as compatibility wrappers.

**Interfaces:**
- `createPublicRouter(deps).handle(request) -> Response` implements the existing endpoint contracts.
- Vercel wrappers translate req/res into that router until cutover.

- [ ] **Step 1: Write RED parity tests**

For `/api/health`, `/api/capabilities`, `/api/openapi`, `/api/invoke` and representative MCP/search errors, assert the new Web-Request router produces the same status/body/cache/security contract as existing handlers.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/public-router.test.js`

Expected: FAIL because `public-router.js` does not exist.

- [ ] **Step 3: Extract routing only**

Move endpoint selection and HTTP adaptation, but continue calling existing `createToolRegistry`, MCP, OpenAlex/search and capability logic. Do not duplicate canonical tool definitions or alter public schemas.

- [ ] **Step 4: Keep Vercel handlers as thin shims and verify**

```bash
node --test tests/public-router.test.js tests/api.test.js tests/mcp.test.js
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/public-router.js lib/platform/netlify-http.js api tests/public-router.test.js
git commit -m "refactor: make KATA public API provider neutral"
```

### Task 2: Add Netlify function/static routing with security-header parity

**Files:**
- Create: `netlify.toml`
- Create: `netlify/functions/kata-api.mjs`
- Create: `tests/netlify-routing.test.js`
- Modify: `scripts/build.mjs`

**Interfaces:**
- `/api/*` reaches the Netlify function before SPA fallback.
- Public paths route to `public-router`; management/billing/support paths route to `commercial-router`.
- Static routes fall back to `index.html`; release/integrity/extension/robots/favicon assets remain direct.

- [ ] **Step 1: Write RED routing/header tests**

Assert unknown API paths return JSON 404 rather than SPA HTML, static app routes resolve to the shell, and Netlify configuration preserves HSTS, CSP, nosniff, frame protection, referrer policy, Origin-Agent-Cluster and `Permissions-Policy: ... tools=(self)` semantics from current production configuration.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/netlify-routing.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement v2 Netlify function entrypoint**

Use `export default async (request,context)=>Response`. Initialize reusable provider adapters at module scope where safe, but never cache an authenticated principal/tenant across requests. The Razorpay webhook branch forwards untouched request bytes into raw-body verification.

- [ ] **Step 4: Implement `netlify.toml` routing and run checks**

Function/API routing precedes SPA fallback. No broad cross-origin header is added.

```bash
node --test tests/netlify-routing.test.js
npm run check
```

- [ ] **Step 5: Commit**

```bash
git add netlify.toml netlify/functions/kata-api.mjs scripts/build.mjs tests/netlify-routing.test.js
git commit -m "feat: add Netlify production routing"
```

### Task 3: Implement hard provider-budget safety

**Files:**
- Create: `lib/commercial/provider-budget.js`
- Modify: `lib/commercial/readiness.js`
- Create: `tests/provider-budget.test.js`

**Interfaces:**
- `evaluateProviderBudget({monthlyCreditLimit,safetyCreditLimit,estimatedCreditsUsed,measuredAt,now})`.
- States: `healthy|warning|blocked|unknown`.
- Essential account/billing-cancellation/privacy operations remain available when new compatibility work is blocked.

- [ ] **Step 1: Write RED budget tests**

```js
assert.equal(evaluateProviderBudget({monthlyCreditLimit:300,safetyCreditLimit:240,estimatedCreditsUsed:241,measuredAt:now,now}).state,'blocked');
```

Prove stale/absent measurements return `unknown`, safety limit cannot exceed monthly limit, and `blocked` denies new hosted evaluation reservation but not account export or subscription cancellation.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/provider-budget.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement explicit trusted measurement contract**

Do not invent an undocumented Netlify usage API. Budget state accepts only configured trusted/operator measurement evidence and exposes timestamp/staleness. `KATA_NETLIFY_MONTHLY_CREDIT_LIMIT=300` and a lower explicit safety limit are configuration; usage evidence remains separate.

- [ ] **Step 4: Run and commit**

```bash
node --test tests/provider-budget.test.js
git add lib/commercial/provider-budget.js lib/commercial/readiness.js tests/provider-budget.test.js
git commit -m "feat: fail closed at provider budget limits"
```

### Task 4: Add migration-version and commercial release checks

**Files:**
- Create: `scripts/verify-commercial-schema.mjs`
- Create: `scripts/commercial-release-check.mjs`
- Modify: `.github/workflows/release-gate.yml`
- Create: `tests/commercial-release.test.js`

**Interfaces:**
- Source migration sequence must be exactly ordered with no duplicate numeric prefixes.
- Production/preview smoke supplies actual applied migration version.
- Offline PR release gate performs source-only verification and does not need production secrets.

- [ ] **Step 1: Write RED migration/release tests**

Require source migrations `001` through `005` in increasing order and assert readiness cannot be `ready` when applied migration evidence is below the highest source migration.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-release.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement source and live modes**

`verify-commercial-schema.mjs --source-only` validates files and imports. Live mode receives a database/store adapter and compares applied migration evidence without printing credentials.

- [ ] **Step 4: Extend Release Gate and verify**

```bash
node --test tests/commercial-release.test.js
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-commercial-schema.mjs scripts/commercial-release-check.mjs .github/workflows/release-gate.yml tests/commercial-release.test.js
git commit -m "ci: verify commercial migration contract"
```

### Task 5: Add exact-SHA Netlify promotion workflow

**Files:**
- Create: `.github/workflows/deploy-netlify-production.yml`
- Create: `scripts/netlify-smoke.mjs`
- Create: `docs/COMMERCIAL_RELEASE.md`
- Create: `tests/netlify-deploy-workflow.test.js`

**Interfaces:**
- GitHub secrets: `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`.
- Deployment source SHA comes only from successful Release Gate `workflow_run.head_sha` for a `main` push.
- CLI command uses exact `netlify-cli@27.5.1`.

- [ ] **Step 1: Write RED workflow tests**

Require exact-SHA checkout/check, non-empty deploy credentials, `npm ci`, full `npm run check`, source-bound build, production deploy, exact deployment smoke before canonical smoke, and verification of `/api/health`, `/api/capabilities`, `/api/openapi`, `/integrity.json`, `/release.json`, `/api/status`, `/api/readiness/commercial`.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/netlify-deploy-workflow.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement the pinned deploy command**

The production workflow uses a prebuilt output and explicit credentials, for example:

```bash
npx --yes netlify-cli@27.5.1 deploy \
  --prod \
  --no-build \
  --dir=dist \
  --functions=netlify/functions \
  --site="$NETLIFY_SITE_ID" \
  --auth="$NETLIFY_AUTH_TOKEN" \
  --message="KATA $EXPECTED_SHA" \
  --json > /tmp/netlify-deploy.json
```

Parse the JSON for the immutable deploy URL/ID. Never print the auth token.

- [ ] **Step 4: Implement `netlify-smoke.mjs`**

Verify exact source SHA, `source-bound` provenance, integrity manifest, required KATA tools, OpenAPI MCP contract, public status, and commercial readiness. Smoke errors identify failed check names but redact environment values.

- [ ] **Step 5: Write operator setup/cutover document**

Document enabling Identity in the Netlify dashboard, provisioning Database, configuring Razorpay test/live variables/webhook, legal/support identity, key pepper, credit limit/safety threshold, GitHub deployment secrets, preview checks and rollback. No fake IDs/secrets are committed.

- [ ] **Step 6: Run and commit**

```bash
node --test tests/netlify-deploy-workflow.test.js
npm run check
git add .github/workflows/deploy-netlify-production.yml scripts/netlify-smoke.mjs docs/COMMERCIAL_RELEASE.md tests/netlify-deploy-workflow.test.js
git commit -m "ci: add source bound Netlify production promotion"
```

### Task 6: Require real GitHub release governance

**Files:**
- Create: `docs/GITHUB_RELEASE_GOVERNANCE.md`
- Modify: `lib/commercial/readiness.js`
- Create: `tests/release-governance.test.js`

**Interfaces:**
- Required `main` policy: PR required, KATA Release Gate required, CodeQL/security check required when available, force-push disabled, branch deletion disabled.
- Readiness includes verified governance evidence, not merely a config boolean.

- [ ] **Step 1: Write RED governance tests**

Assert readiness remains blocked while the repository reports unprotected `main`; documentation must name every required rule. A self-declared request header/body/env such as `branchProtected=true` cannot satisfy readiness.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/release-governance.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement evidence contract**

Use a release-time GitHub API/ruleset verification step when credentials permit read access. If the connected account cannot configure the ruleset, document the exact GitHub Settings action and keep readiness blocked until a later verification observes the required policy.

- [ ] **Step 4: Run and commit**

```bash
node --test tests/release-governance.test.js
git add docs/GITHUB_RELEASE_GOVERNANCE.md lib/commercial/readiness.js tests/release-governance.test.js
git commit -m "security: require verified release branch governance"
```

### Task 7: Execute parallel commercial cutover

**Files:**
- Modify: `.github/workflows/deploy-production.yml` only after successful Netlify production verification.
- Modify: `README.md`, `llms.txt`, `docs/COMMERCIAL_RELEASE.md` with the verified canonical Netlify URL/domain.

- [ ] **Step 1: Run final repository gate**

```bash
npm ci
npm run check
```

Expected: all legacy and commercial tests/build/static checks PASS.

- [ ] **Step 2: Verify CodeQL and Release Gate on the exact implementation SHA**

Stop on any failure. Record exact SHA and run URLs in the release PR.

- [ ] **Step 3: Provision/authorize Netlify bootstrap resources**

Confirm the site is credit-based Free, Identity is enabled, Database exists, no paid auto-upgrade is configured, and KATA's safety threshold is below the 300-credit monthly limit. If account authorization cannot be completed through available tools, record those exact external actions and do not claim readiness.

- [ ] **Step 4: Perform Razorpay test-mode lifecycle**

Verify checkout creation, valid signed webhook, duplicate idempotency, ACTIVE entitlement mapping, cancellation and downgrade. Live payment mode remains disabled until merchant-owned KYC/live credentials exist.

- [ ] **Step 5: Deploy exact verified SHA through the guarded workflow**

Run only after Plans A-F are complete and all verification passes.

- [ ] **Step 6: Verify canonical production**

Require:

```text
/api/health                  HTTP 200 + ok
/release.json                exact expected SHA + source-bound provenance
/integrity.json              complete integrity manifest
/api/capabilities            required KATA tools
/api/openapi                 required protocol contract
/api/status                  evidence-derived state
/api/readiness/commercial    ready
```

Also smoke signup/login/project/run and Razorpay test-mode flow without exposing secrets in logs.

- [ ] **Step 7: Cut canonical product links/domain to the verified Netlify production URL**

Use the actual deployment/domain returned by Netlify; do not guess a URL.

- [ ] **Step 8: Disable automatic Vercel production promotion but retain rollback deployment**

Change the old workflow to manual/reference-only after Netlify is canonical. Keep the known-good Vercel deployment during the initial rollback window.

- [ ] **Step 9: Re-run live verification and record final release evidence**

Record Netlify deploy ID/URL, source SHA, readiness result, test totals, Release Gate and CodeQL status.

## Plan G Completion Gate

Plan G is complete only when commercial production runs on infrastructure whose plan permits commercial use, exact source is tied to passing Release Gate + CodeQL, migrations/Identity/database/billing/legal/support/budget/release-governance checks are configured and readiness is `ready`, canonical live smoke checks pass, Vercel remains a verified rollback/reference during cutover, and no automatic paid infrastructure path exists.
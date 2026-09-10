# KATA Commercial Production Migration and Release Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move KATA's commercial production surface from the non-commercial Vercel Hobby deployment to a source-bound Netlify Free bootstrap deployment with equivalent-or-stronger verification, hard budget safety, production database migrations, and truthful launch readiness.

**Architecture:** Preserve the existing Vercel production as rollback/reference while building Netlify in parallel. A Netlify function adapter exposes both existing KATA public APIs and the new commercial router without duplicating business logic. GitHub Actions promotes only an exact SHA whose Release Gate and CodeQL pass; production is accepted only after source provenance, integrity, API, commercial-readiness and canonical-domain checks pass.

**Tech Stack:** Node.js 24 ESM, Netlify Functions, Netlify Identity, Netlify Database/PostgreSQL, GitHub Actions, existing KATA build/integrity scripts, curl/Node smoke verification.

**Spec:** `docs/superpowers/specs/2026-09-10-monetization-ready-control-plane-design.md`

## Global Constraints

- Do not delete or disable the Vercel deployment until Netlify production and rollback verification are complete.
- Do not deploy commercial production merely because an audit/schedule ran.
- No production promotion without exact-source Release Gate and CodeQL success.
- Production readiness must fail closed if Identity, database, Razorpay, legal, support, provider-budget or migrations are incomplete.
- Netlify Free is a bootstrap hard-budget environment, not an enterprise uptime SLA.
- Provider usage must stop/degrade safely before unexpected paid usage; no automatic paid-plan upgrade is configured.
- Existing MCP/WebMCP/API/security behavior must pass unchanged after platform migration.

---

## File Structure

- `netlify.toml` — build/functions/redirect/header configuration.
- `netlify/functions/kata-api.mjs` — Web Request/Response router entrypoint for existing public and commercial APIs.
- `lib/platform/netlify-http.js` — request/response compatibility adapter around current Vercel-style handlers where needed.
- `lib/server/public-router.js` — provider-neutral routing for existing `api/*.js` semantics, extracted without changing tool logic.
- `lib/commercial/provider-budget.js` — configured safety-threshold state.
- `scripts/netlify-smoke.mjs` — exact deployment/canonical contract verification.
- `scripts/commercial-release-check.mjs` — release + commercial readiness verification.
- `.github/workflows/deploy-netlify-production.yml` — guarded promotion.
- `docs/COMMERCIAL_RELEASE.md` — operator setup/cutover/rollback checklist.
- Tests: `tests/netlify-routing.test.js`, `tests/provider-budget.test.js`, `tests/commercial-release.test.js`.

### Task 1: Extract a provider-neutral public HTTP router

**Files:**
- Create: `lib/server/public-router.js`
- Create: `tests/public-router.test.js`
- Modify: existing `api/health.js`, `api/capabilities.js`, `api/search.js`, `api/invoke.js`, `api/triage.js`, `api/compile.js`, `api/execute.js`, `api/agents.js`, `api/mcp.js`, `api/openapi.js` only as thin wrappers.

**Interfaces:**
- `createPublicRouter(deps).handle(request) -> Response` supports the current public endpoint contracts.
- Existing Vercel wrappers translate req/res to the same router until cutover.

- [ ] **Step 1: Write RED parity tests**

For `/api/health`, `/api/capabilities`, `/api/openapi`, `/api/invoke` and representative MCP/search error cases, invoke both the existing wrapper contract fixture and the new Web-Request router fixture and assert equivalent status/body/security/cache semantics.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/public-router.test.js`

Expected: FAIL because `public-router.js` does not exist.

- [ ] **Step 3: Extract routing, not business logic**

Move endpoint selection/body/query adaptation into `public-router.js`; continue calling `createToolRegistry`, MCP handler, OpenAlex/search and capability modules. Do not duplicate tool definitions or change public JSON schemas.

- [ ] **Step 4: Keep Vercel wrappers as compatibility shims**

Each `api/*.js` wrapper should adapt the incoming request and return through the provider-neutral router. Existing Vercel tests must remain green.

- [ ] **Step 5: Run tests and commit**

```bash
node --test tests/public-router.test.js tests/api.test.js tests/mcp.test.js
npm run check
git add lib/server/public-router.js api tests/public-router.test.js
git commit -m "refactor: make KATA public API provider neutral"
```

### Task 2: Add Netlify build/function routing without weakening headers

**Files:**
- Create: `netlify.toml`
- Create: `netlify/functions/kata-api.mjs`
- Create: `lib/platform/netlify-http.js`
- Create: `tests/netlify-routing.test.js`
- Modify: `scripts/build.mjs`

**Interfaces:**
- Netlify function routes `/api/*` to public router first, then commercial router for management paths.
- Static SPA routes fall back to `index.html` without intercepting `/api/*`, `/release.json`, `/integrity.json`, extension assets or robots/favicon.

- [ ] **Step 1: Write RED routing/header tests**

Assert API paths are never rewritten to SPA HTML, unknown API path returns JSON 404, static app routes return the shell, security headers include the current CSP/HSTS/nosniff/frame/origin/referrer/Permissions-Policy values, and `tools=(self)` is preserved.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/netlify-routing.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement Netlify function entrypoint**

Use Netlify's Web `Request`/`Response` function model. Initialize provider adapters once per module where safe, but do not cache user identity/tenant state across requests. Commercial webhook path must receive untouched raw request bytes.

- [ ] **Step 4: Implement `netlify.toml` redirects/headers**

Function redirect precedes SPA fallback. Copy security semantics from `vercel.json` rather than creating weaker defaults. Keep any cross-origin allowances explicit and minimal.

- [ ] **Step 5: Update build emission and run tests**

```bash
node --test tests/netlify-routing.test.js
npm run check
```

- [ ] **Step 6: Commit**

```bash
git add netlify.toml netlify/functions/kata-api.mjs lib/platform/netlify-http.js scripts/build.mjs tests/netlify-routing.test.js
git commit -m "feat: add Netlify production routing"
```

### Task 3: Implement hard provider-budget readiness and safe degradation

**Files:**
- Create: `lib/commercial/provider-budget.js`
- Modify: `lib/commercial/readiness.js`
- Create: `tests/provider-budget.test.js`

**Interfaces:**
- `evaluateProviderBudget({monthlyCreditLimit,safetyCreditLimit,estimatedCreditsUsed,measuredAt})`.
- States: `healthy|warning|blocked|unknown`.
- Commercial write/heavy hosted operations may be blocked at safety threshold while account/billing/privacy access stays available.

- [ ] **Step 1: Write RED budget tests**

```js
assert.equal(evaluateProviderBudget({monthlyCreditLimit:300,safetyCreditLimit:240,estimatedCreditsUsed:241,measuredAt:now}).state,'blocked');
```

Prove stale/absent usage evidence returns `unknown`, not healthy; `safetyCreditLimit` cannot exceed monthly limit; and billing cancellation/account export remain classified essential even when new compatibility runs are blocked.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/provider-budget.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement explicit config/evidence contract**

Do not invent a provider credit-reading API if unavailable. Accept usage evidence only from a configured trusted measurement source/operator job; expose its timestamp. Commercial readiness is blocked if no budget ceiling/safety threshold is configured.

- [ ] **Step 4: Run and commit**

```bash
node --test tests/provider-budget.test.js
git add lib/commercial/provider-budget.js lib/commercial/readiness.js tests/provider-budget.test.js
git commit -m "feat: fail closed at commercial provider budget limits"
```

### Task 4: Add production database migration and preview verification workflow

**Files:**
- Modify: `.github/workflows/release-gate.yml`
- Create: `scripts/verify-commercial-schema.mjs`
- Create: `tests/commercial-release.test.js`

**Interfaces:**
- Release Gate validates migration ordering, duplicate versions, and commercial module imports without needing production secrets.
- Preview deployment applies Netlify Database migrations to the preview database branch before commercial smoke tests.

- [ ] **Step 1: Write RED migration/release tests**

Assert migrations are strictly ordered `001..005`, no duplicate numeric prefix exists, every migration file is represented in schema verification, and production readiness cannot be `ready` when migration version evidence is below required source migration version.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-release.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement schema release verifier**

The script computes the highest required source migration and validates a supplied database migration state in preview/production smoke mode. It never applies production SQL from the browser.

- [ ] **Step 4: Extend Release Gate with offline-commercial checks**

Release Gate runs all node tests/build/static checks and `node scripts/verify-commercial-schema.mjs --source-only`. It must not require Razorpay/Netlify production secrets on pull requests.

- [ ] **Step 5: Run and commit**

```bash
node --test tests/commercial-release.test.js
npm run check
git add .github/workflows/release-gate.yml scripts/verify-commercial-schema.mjs tests/commercial-release.test.js
git commit -m "ci: verify commercial migration contract"
```

### Task 5: Build exact-SHA Netlify deployment and live smoke verification

**Files:**
- Create: `.github/workflows/deploy-netlify-production.yml`
- Create: `scripts/netlify-smoke.mjs`
- Create: `scripts/commercial-release-check.mjs`
- Create: `docs/COMMERCIAL_RELEASE.md`
- Create: `tests/netlify-deploy-workflow.test.js`

**Interfaces:**
- Workflow inputs/secrets: `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` plus runtime env configured in Netlify.
- Expected source comes only from successful Release Gate `workflow_run.head_sha` on `main` push.
- Smoke script receives exact deployment URL, expected SHA and canonical URL.

- [ ] **Step 1: Write RED workflow contract tests**

Read workflow YAML/text and assert it checks exact source before deploy, reruns `npm run check`, builds source-bound `release.json`, verifies deployment URL before canonical alias, verifies `/api/health`, `/api/capabilities`, `/api/openapi`, `/integrity.json`, `/api/readiness/commercial`, and fails when canonical release SHA differs.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/netlify-deploy-workflow.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement guarded deploy workflow**

Use a pinned Netlify CLI version installed with `npx --yes netlify-cli@<reviewed-exact-version>` after verifying its current release during implementation. Workflow refuses empty token/site ID, checks out exact SHA, runs full gate, performs production deploy, captures deploy URL, then executes `scripts/netlify-smoke.mjs`.

- [ ] **Step 4: Implement smoke/readiness script**

Verify source SHA/provenance/integrity; required KATA tool names; OpenAPI MCP path; commercial readiness `status==='ready'`; and a safe authenticated-free public status response. Never print secret environment values.

- [ ] **Step 5: Document operator-owned setup exactly**

`docs/COMMERCIAL_RELEASE.md` lists: create/authorize Netlify site; enable Identity; configure registration/providers; provision Database; configure Razorpay test/live credentials and webhook URL; configure legal/support identity; set `KATA_KEY_PEPPER`; set budget ceiling; set GitHub deploy secrets; run preview; run live checkout/webhook test; promote canonical domain. No fake values are committed.

- [ ] **Step 6: Run tests and commit**

```bash
node --test tests/netlify-deploy-workflow.test.js
npm run check
git add .github/workflows/deploy-netlify-production.yml scripts/netlify-smoke.mjs scripts/commercial-release-check.mjs docs/COMMERCIAL_RELEASE.md tests/netlify-deploy-workflow.test.js
git commit -m "ci: add source bound Netlify production promotion"
```

### Task 6: Harden GitHub release governance or fail readiness explicitly

**Files:**
- Create: `docs/GITHUB_RELEASE_GOVERNANCE.md`
- Modify: `lib/commercial/readiness.js`
- Create: `tests/release-governance.test.js`

**Interfaces:**
- Required main policy: PR required, Release Gate required, CodeQL/security check required when available, no force push, no branch deletion.
- `GITHUB_RELEASE_GOVERNANCE_VERIFIED_AT` and a source-controlled expected policy version provide operator evidence only; readiness cannot claim GitHub settings changed merely from documentation.

- [ ] **Step 1: Write RED governance tests**

Assert current readiness is blocked without verified governance evidence and documentation contains exact GitHub Settings/Ruleset requirements. If repository API permissions at implementation time permit ruleset mutation, add an authenticated setup script with a dry-run default; otherwise leave the external blocker explicit.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/release-governance.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement readiness evidence and operator guide**

Do not convert an unprotected branch into `ready` by environment variable alone: evidence must include expected policy version, verification timestamp and release commit/reference checked by the smoke workflow.

- [ ] **Step 4: Run and commit**

```bash
node --test tests/release-governance.test.js
git add docs/GITHUB_RELEASE_GOVERNANCE.md lib/commercial/readiness.js tests/release-governance.test.js
git commit -m "security: require verified release branch governance"
```

### Task 7: Execute parallel cutover and only then retire Vercel promotion

**Files:**
- Modify: `.github/workflows/deploy-production.yml` only after successful Netlify production verification.
- Modify: `README.md`, `llms.txt`, `docs/COMMERCIAL_RELEASE.md` with verified canonical URL.

**Interfaces:**
- Vercel remains rollback/reference until Netlify canonical deployment is healthy and source-bound.
- Old workflow is disabled, not deleted, only after cutover proof is recorded.

- [ ] **Step 1: Run complete local/repository verification**

```bash
npm ci
npm run check
```

Expected: PASS with all legacy + commercial tests.

- [ ] **Step 2: Verify CodeQL and Release Gate for the exact implementation SHA**

Do not continue on failure. Record exact SHA/run URLs in the release PR.

- [ ] **Step 3: Provision/authorize the Netlify resources without paid upgrade**

Confirm the site is on the credit-based Free plan, Identity is enabled, Database is provisioned, auto-recharge/paid upgrade is not configured, and the configured safety threshold is below the monthly hard credit limit. If account authorization cannot be performed by the agent, readiness remains blocked with these exact operator actions.

- [ ] **Step 4: Configure Razorpay test mode and perform E2E payment lifecycle**

Verify checkout creation, signed webhook receipt, duplicate webhook idempotency, subscription ACTIVE mapping, entitlement activation, cancellation and entitlement downgrade in test mode. Live mode is not enabled until merchant KYC/live credentials are operator-provided.

- [ ] **Step 5: Deploy exact verified SHA through the guarded Netlify workflow**

Run only after meaningful commercial implementation is complete and all prior gates pass.

- [ ] **Step 6: Verify canonical production**

Require all of:

```text
/api/health                  200 + ok
/release.json                exact source SHA + source-bound provenance
/integrity.json              complete integrity manifest
/api/capabilities            required KATA tool registry
/api/openapi                 MCP + commercial public contract where intended
/api/status                  evidence-derived public state
/api/readiness/commercial    ready
```

Also execute signup/login/project/run and Razorpay test-mode smoke flow against the production deployment without exposing secrets in logs.

- [ ] **Step 7: Cut canonical product links/domain to Netlify**

Only after Step 6 passes. Update docs with the actual verified URL; do not guess it.

- [ ] **Step 8: Disable old automatic Vercel production promotion while retaining rollback deployment**

Change `.github/workflows/deploy-production.yml` to manual/reference-only or remove its automatic trigger only after Netlify is canonical. Do not delete the known-good Vercel deployment during the initial rollback window.

- [ ] **Step 9: Re-run final live verification and commit cutover metadata/docs**

`npm run check` must still pass. Record the exact Netlify deployment identifier/URL, source SHA and readiness result in the release PR/report.

## Plan G Completion Gate

Plan G is complete only when commercial production runs on a provider plan permitting the intended commercial use, the source SHA is exactly tied to passing Release Gate + CodeQL, migrations/Identity/database/billing/legal/support/budget/release governance are configured and readiness reports `ready`, the canonical site passes all live smoke checks, Vercel remains a verified rollback/reference during cutover, and no automatic paid infrastructure path is introduced.
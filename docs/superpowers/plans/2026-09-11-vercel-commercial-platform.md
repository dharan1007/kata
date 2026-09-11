# Vercel Commercial Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Netlify-specific commercial control-plane coupling and provide a fail-closed Vercel-compatible identity/database boundary without weakening authentication or tenant isolation.

**Architecture:** Keep `lib/commercial/*` provider-agnostic. Move the SQL store into a generic PostgreSQL adapter with lazy pool resolution suitable for Vercel serverless runtimes, add an OIDC UserInfo identity adapter that only trusts a provider-validated bearer token, and expose a Vercel composition factory. Readiness must identify the configured provider types and concrete endpoint/connection prerequisites instead of trusting only boolean flags.

**Tech Stack:** Node.js 24, Web Fetch API, PostgreSQL store contract, OIDC UserInfo, Vercel Functions-compatible injected connection pool.

**Spec:** GitHub issue #124.

## Global Constraints

- Never infer identity from arbitrary request headers.
- Never expose raw bearer tokens, database URLs, peppers, or provider secrets in readiness output.
- Remote identity verification endpoints must use HTTPS.
- Commercial routes remain fail closed until identity, database, migrations, billing, legal/support, provider budget, and release governance checks are ready.
- Preserve current tenant, CSRF/origin, API-key, quota, audit, billing, and transaction semantics.

---

### Task 1: Provider-neutral platform adapters

**Files:**
- Create: `lib/platform/oidc-identity.js`
- Create: `lib/platform/postgres-database.js`
- Create: `lib/platform/vercel-commercial.js`
- Modify: `lib/platform/netlify-identity.js`
- Modify: `lib/platform/netlify-database.js`
- Test: `tests/commercial-platform.test.js`

**Interfaces:**
- `createOidcIdentityAdapter({userinfoUrl, fetchImpl}) -> { getPrincipal(request) }`
- `createPostgresCommercialStore({pool,getPool}) -> CommercialStore`
- `createVercelCommercialPlatform({userinfoUrl,fetchImpl,pool,getPool}) -> {provider,identityProvider,databaseProvider,identity,store}`

- [ ] Write regression tests proving arbitrary identity headers are ignored, OIDC bearer tokens are validated only through HTTPS UserInfo, only stable subject/email survive projection, invalid/unavailable providers fail closed, and lazy database pools can reconnect between operations.
- [ ] Run the release gate and confirm the new tests fail before implementation.
- [ ] Implement the adapters with bounded JSON response handling and no secret reflection.
- [ ] Re-run the complete release gate.

### Task 2: Readiness and deployment contract

**Files:**
- Modify: `lib/commercial/readiness.js`
- Modify: `tests/commercial-readiness.test.js`
- Modify: `docs/PRODUCTION.md`

**Interfaces:**
- `KATA_IDENTITY_PROVIDER=oidc`
- `KATA_OIDC_USERINFO_URL=https://...`
- `KATA_DATABASE_PROVIDER=postgres`
- `DATABASE_URL` or `KATA_DATABASE_URL` must contain a PostgreSQL URL.

- [ ] Add failing readiness tests proving boolean flags alone cannot mark identity/database ready.
- [ ] Implement provider-aware fail-closed checks without emitting secret values.
- [ ] Document Vercel as the authoritative production target and the injected serverless pool contract.
- [ ] Re-run complete release gate and CodeQL.

### Task 3: Migrations path de-coupling

**Files:**
- Move canonical SQL migrations from `netlify/database/migrations/` to `database/migrations/`.
- Modify: `tests/commercial-schema.test.js`
- Modify: `tests/commercial-monetization-schema.test.js`

**Interfaces:**
- Canonical production migrations live under `database/migrations/` independent of host.

- [ ] Update regression tests to the provider-neutral migration path.
- [ ] Move all three migrations without changing SQL semantics.
- [ ] Run complete release gate and verify schema invariants remain green.

### Task 4: Release qualification

- [ ] Verify the final PR diff contains no secret values and no security-control bypass.
- [ ] Confirm complete KATA Release Gate passes on the final head.
- [ ] Confirm CodeQL passes on the same head.
- [ ] Leave the PR unmerged until #148 pre-alias production enforcement is active; this branch must not cause an ungated production promotion.

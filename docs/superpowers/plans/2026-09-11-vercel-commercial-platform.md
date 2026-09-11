# Vercel Production Blocker Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove KATA's host-specific commercial coupling, make MCP Registry publication resilient, and prevent Vercel production builds until the exact `main` SHA passes both the complete release gate and CodeQL.

**Architecture:** Keep `lib/commercial/*` provider-agnostic; use OIDC UserInfo and a generic PostgreSQL store for Vercel/serverless composition; keep canonical migrations host-neutral; use a committed Vercel `ignoreCommand` as a pre-build exact-SHA production gate; preserve the post-deploy provenance verifier and downstream MCP Registry publication.

**Specs:** GitHub issues #124, #148 and #149.

## Global Constraints

- Never infer identity from arbitrary request headers.
- Never expose raw bearer tokens, database URLs, peppers, or provider secrets in readiness output.
- Remote identity verification endpoints must use HTTPS and must not follow redirects.
- Commercial routes remain fail closed until real external readiness prerequisites are present.
- Production uncertainty never means approval: stale source, failed/cancelled checks, provider/API failure and timeout all retain the existing deployment.
- No long-lived Vercel deploy token is introduced.

### Task 1: Provider-neutral commercial adapters

- [x] Add `lib/platform/oidc-identity.js` with verified, bounded HTTPS UserInfo handling.
- [x] Add `lib/platform/postgres-database.js` with eager or lazy pool contracts and pinned transaction clients.
- [x] Add `lib/platform/vercel-commercial.js` composition.
- [x] Reduce `netlify-database.js` to a compatibility wrapper.
- [x] Add regression coverage for spoofed headers, stable identity claims and lazy database lifecycle.

### Task 2: Concrete readiness and migrations

- [x] Require `KATA_IDENTITY_PROVIDER=oidc` plus a valid HTTPS UserInfo URL.
- [x] Require `KATA_DATABASE_PROVIDER=postgres` plus a PostgreSQL connection URL.
- [x] Prevent boolean-only configured flags from marking those providers ready.
- [x] Keep readiness output free of endpoint, hostname, credential, token and pepper values.
- [x] Move canonical migrations to `database/migrations/` and update schema tests without changing SQL semantics.

### Task 3: Registry reliability

- [x] Add bounded all-error retries to the pre-publication Registry lookup.
- [x] Keep network exhaustion fail closed instead of treating it as `exists=false`.
- [x] Add bounded retries to the pinned publisher download while retaining SHA-256 verification.
- [x] Keep post-publication transport failures inside the bounded convergence loop.
- [x] Treat immutable metadata conflicts as immediate hard failures.

### Task 4: Repository-controlled Vercel production ordering

- [x] Add regression tests proving Vercel production `main` cannot proceed without exact-SHA push successes for `KATA Release Gate` and `CodeQL`.
- [x] Configure `vercel.json` `ignoreCommand` to invoke `scripts/vercel-prebuild-gate.mjs`.
- [x] Allow non-main previews without polling production checks.
- [x] Require Vercel production/repository metadata and current GitHub `main` SHA to match the candidate.
- [x] Poll the exact SHA using bounded unauthenticated public GitHub Actions reads.
- [x] Fail closed on failed/cancelled checks, stale SHA, malformed deployment identity, GitHub outage/rate limit or timeout.
- [x] Recheck `main` after both required checks succeed before permitting the build.
- [x] Preserve the existing post-deploy exact-source verifier and Registry ordering.

### Task 5: Verification and rollout

- [x] Capture RED evidence for the missing Vercel commercial platform contract.
- [x] Capture RED evidence for the missing Vercel pre-build gate.
- [ ] Run the complete KATA Release Gate on the final combined head.
- [ ] Run CodeQL on the same final head.
- [ ] Merge only after both are green.
- [ ] Verify the merged `main` push creates no Vercel production build before those exact-SHA checks succeed.
- [ ] Verify canonical `/release.json`, `/api/health`, production logs and Registry workflow after promotion.

GitHub `main` branch/ruleset enforcement (#117) remains an account-level repository administration control and is intentionally not represented as solved by application code.

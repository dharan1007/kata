# KATA Production Contract

This document defines what KATA may claim in production, how operators verify a release, and which commercial capabilities must remain blocked until real provider configuration exists.

## Canonical production surfaces

The canonical deployment is `https://kata-webmcp.vercel.app`.

Public production surfaces include:

- `/api/health` — service liveness/version evidence;
- `/api/capabilities` — canonical tool/protocol capabilities;
- `/api/agents` — model/agent bridge schemas;
- `/api/openapi` — machine-actionable HTTP contract;
- `/api/invoke` — canonical tool invocation;
- `/api/mcp` — MCP Streamable HTTP transport;
- `/api/pricing` — display-safe commercial plan metadata only;
- `/api/readiness/commercial` — fail-closed commercial readiness evidence;
- `/release.json` and `/integrity.json` — source and artifact provenance.

The public pricing response is not an authorization source. Entitlements are derived only from server-side subscription state.

## CLI

The dependency-free `kata` CLI exercises the same canonical HTTP surfaces:

```bash
node bin/kata.mjs health
node bin/kata.mjs capabilities
node bin/kata.mjs pricing
node bin/kata.mjs readiness
node bin/kata.mjs search "browser interoperability"
node bin/kata.mjs invoke kata_search_research --args '{"query":"MCP interoperability"}'
node bin/kata.mjs doctor
```

The default base is the canonical Vercel deployment. Alternate remote bases must use HTTPS; HTTP is accepted only for loopback development. When a protected endpoint requires a bearer credential, the CLI reads `KATA_TOKEN` from the environment. Tokens are intentionally rejected as command-line arguments so they are not exposed in process listings or shell history.

`doctor` checks health, release provenance, integrity, capabilities, OpenAPI, pricing, and commercial readiness together. A commercially blocked readiness result is visible as state; it is not converted into a fake green subscription state.

## Exact-source release authority

GitHub Actions and Vercel Git provide different evidence and are treated differently.

On GitHub Actions, KATA accepts source-bound provenance only when the checked-out `HEAD` equals the advertised SHA and `git status --porcelain=v1 --untracked-files=all` is clean.

On Vercel, the build may not expose a normal local Git worktree. KATA therefore accepts provider-bound Vercel Git provenance only when Vercel itself supplies a valid commit SHA, repository owner/slug, and commit ref while `VERCEL=1`. Production acceptance additionally requires repository `dharan1007/kata` and ref `main`.

Production ordering is enforced before Vercel builds `main`. `vercel.json` commits `ignoreCommand: "node scripts/vercel-prebuild-gate.mjs"`. For non-main previews the gate immediately permits the build. For `main`, it requires Vercel's production target plus the exact `dharan1007/kata` Git identity and a valid 40-character candidate SHA. It then verifies that GitHub's current `main` still points to that SHA and polls the public GitHub Actions API for exact-SHA `push` runs of both `KATA Release Gate` and `CodeQL`. Only when both are completed successfully, and `main` still points to the candidate SHA, does the ignored-build command return Vercel's "proceed" exit code.

The gate is deliberately fail closed. A failed/cancelled required workflow, stale SHA, malformed deployment identity, GitHub API outage or rate-limit response, or exhaustion of the bounded 20-attempt / 30-second polling window makes the ignored-build command return Vercel's "skip" exit code. Vercel therefore cancels/skips that Git deployment before the application build and leaves the existing production deployment in service. No Vercel deploy token, GitHub token, or project-side Deployment Check is required for this ordering control.

After a permitted build reaches production, `.github/workflows/deploy-production.yml` remains an independent post-deploy verifier: it rebuilds from the exact release-gated SHA and accepts canonical production only when Vercel Git provenance, release/integrity evidence, health, capabilities, OpenAPI, pricing, and commercial readiness all match that SHA. MCP Registry publication remains downstream of this verified production workflow.

## Supply-chain release gate

KATA commits `package-lock.json`, installs through `npm ci --ignore-scripts`, fails on high-severity dependency advisories, verifies the installable package surface with `npm pack --dry-run`, and emits an SPDX 2.3 SBOM. The current core has no third-party runtime npm dependencies; that fact is recorded rather than used as a reason to skip a lockfile/SBOM contract.

A verified release includes retained evidence for:

- complete tests;
- build and static route checks;
- source-bound `release.json`;
- SHA-256-bound `integrity.json`;
- package dry-run;
- SPDX SBOM;
- CodeQL.

## Commercial authorization order

Commercial access follows this order and must not be bypassed:

```text
verified principal
 -> organization/service-principal scope
 -> object ownership within that organization
 -> reconciled server-side subscription state
 -> derived immutable entitlements
 -> operation-specific role/scope
 -> bounded execution and usage reservation
```

Client-rendered plan names, query parameters, request JSON, browser storage, mutable identity metadata, or checkout-return pages do not grant capabilities.

## Billing state and Razorpay boundary

KATA's Razorpay adapter verifies webhook HMAC over the exact raw body before JSON parsing, requires a provider event ID, bounds payload/response sizes and provider deadlines, and maps provider events into a deterministic billing state machine. Duplicate events are idempotent. Older events cannot resurrect cancelled state. Ambiguous ordering becomes `RECONCILIATION_REQUIRED` rather than guessing.

KATA stores provider identifiers, event ordering metadata, a digest of accepted webhook bytes, and sanitized billing state. It does not store card numbers, CVV, raw payment instruments, or raw webhook bodies.

Paid entitlement becomes effective only after provider-authenticated reconciled `ACTIVE` evidence commits with the entitlement snapshot.

## Usage accounting

Hosted metered operations reserve quota transactionally before work begins. Reservation idempotency prevents retries from charging twice, and concurrent reservations cannot exceed the effective limit. A valid completed `BLOCKED` diagnosis consumes the evaluation because KATA delivered the result; an internal KATA failure releases the reservation.

## Identity, database, merchant and legal prerequisites

Commercial readiness must remain `blocked` unless every required external control is real and verified. Source code cannot legitimately manufacture these values.

Vercel is KATA's authoritative production runtime. The commercial control plane is host-neutral internally and is composed for Vercel through `createVercelCommercialPlatform()`. Production customer identity uses the standards-based OIDC UserInfo boundary in `lib/platform/oidc-identity.js`: KATA accepts a bearer credential only as input to the configured HTTPS UserInfo endpoint, follows no redirects, bounds the provider response, requires a stable provider `sub`, and projects only the stable subject plus normalized email. Arbitrary `x-user-*`, role, plan, or other client-controlled headers/claims are never identity or entitlement authority.

The production database boundary is `createPostgresCommercialStore()` in `lib/platform/postgres-database.js`. It accepts either a validated PostgreSQL pool or a lazy `getPool()` resolver. Lazy acquisition is the preferred integration point for Vercel/serverless runtimes because pool/client lifecycle remains owned by the selected PostgreSQL driver/integration while KATA's transaction contract obtains one client for `BEGIN`/`COMMIT`/`ROLLBACK` and releases it deterministically. The legacy Netlify-named adapter is compatibility-only and delegates to this provider-neutral implementation.

Canonical SQL migrations live under `database/migrations/`; they are not owned by any hosting provider. Moving the files does not assert that production has applied them: `KATA_MIGRATIONS_CURRENT=true` remains a separate operator assertion after migration verification.

Identity/database readiness is concrete rather than boolean-only. The production environment must provide:

- `KATA_IDENTITY_PROVIDER=oidc`;
- a valid HTTPS `KATA_OIDC_USERINFO_URL`;
- `KATA_DATABASE_PROVIDER=postgres`;
- a PostgreSQL connection URL in `KATA_DATABASE_URL` or `DATABASE_URL`;
- the selected runtime's actual pool/UserInfo integration code when mounting protected commercial routes.

The readiness endpoint reports provider names and ready/blocked state only. It must never emit the UserInfo URL, database hostname/credentials, bearer tokens, peppers, webhook secrets, or merchant secrets.

The readiness matrix also covers:

- source-bound release;
- key/token pepper material;
- Razorpay live/test merchant credentials and required plan mappings;
- webhook configuration;
- legal/business identity and reviewed Terms/Privacy information;
- support configuration;
- provider-budget guardrails;
- current database migrations;
- release governance.

If one is absent, the public core may remain usable but KATA must not advertise the commercial SaaS path as ready.

## Data isolation

Organization IDs are the tenancy boundary. Projects, environments, API keys, CI tokens, usage buckets/reservations/events, subscriptions, billing events and audit events are scoped to an organization. Service principals may be narrowed further to project/environment scope. Raw credentials are one-time reveal and hash-only at rest.

Do not deploy the commercial router against a database whose migrations or tenancy constraints have not passed the repository gate.

## Browser/agent security boundary

KATA's browser extension and active-tab paths use explicit user-authorized browser execution. Cross-origin controls, CORS, CSP, authentication, rate limits, bot challenges and Permissions Policy are evidence, not obstacles to bypass. KATA does not become a credential scraper, CAPTCHA solver, stealth browser or generic arbitrary-origin fetch proxy.

State-changing OpenAPI/MCP execution is preview-bound and guarded against stale contract fingerprints. Sensitive credential material remains in trusted session brokers rather than model/tool arguments or page-visible return values.

## Deployment verification

Before a production `main` build begins, the committed Vercel pre-build gate requires:

- Vercel production target and repository identity `dharan1007/kata`;
- a valid candidate SHA that is still the current GitHub `main` SHA;
- exact-SHA `push` run success for `KATA Release Gate`;
- exact-SHA `push` run success for `CodeQL`.

Failure, cancellation, timeout, stale source, malformed Vercel Git metadata, or GitHub verification uncertainty skips the deployment instead of interpreting uncertainty as approval.

After Vercel builds and aliases an approved SHA, the post-deploy verifier requires canonical production to report:

- the exact expected source SHA;
- `source-bound` Vercel Git provenance for `dharan1007/kata` on `main`;
- provider-bound exact-SHA evidence;
- health `ok`;
- the required canonical tools with no duplicate names;
- MCP in OpenAPI;
- complete safe pricing metadata;
- source-bound commercial readiness evidence (`ready` or explicitly `blocked`);
- an integrity manifest with the required static assets;
- a `release.json` digest/byte binding that matches the canonical integrity bytes.

A production SHA is not considered accepted merely because Vercel reports `READY`.

## Rollback

If canonical production fails any acceptance check:

1. treat that deployment as failed even if Vercel reports `READY`;
2. identify the last accepted Vercel deployment/source SHA;
3. roll Vercel back to that deployment or revert the offending `main` commit;
4. rerun the exact locked release gate;
5. accept the canonical URL only after source, API and integrity checks pass.

## Remaining governance requirement

Repository branch/ruleset enforcement is an infrastructure control, not an application feature. Production governance should require pull requests, the KATA Release Gate, CodeQL, blocked force-push/deletion, and reviewed changes on `main`. If repository administration has not enabled those rules, `/api/readiness/commercial` must not be treated as evidence that repository governance is complete merely because application tests are green.

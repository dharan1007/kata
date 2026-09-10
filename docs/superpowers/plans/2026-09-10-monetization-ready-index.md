# KATA Monetization-Ready Implementation Index

This index coordinates the seven implementation plans for the approved monetization-ready control-plane design. It is not an eighth implementation subsystem; it defines dependency order, shared interfaces, release gates, and external operator prerequisites.

**Design:** `docs/superpowers/specs/2026-09-10-monetization-ready-control-plane-design.md`

## Execution order

1. **Plan A — Commercial foundation**  
   `2026-09-10-commercial-foundation.md`
2. **Plan B — Entitlements and metering**  
   `2026-09-10-entitlements-metering.md`
3. **Plan C — Razorpay billing**  
   `2026-09-10-razorpay-billing.md`
4. **Plan D — Compatibility SaaS and CI**  
   `2026-09-10-compatibility-saas-ci.md`
5. **Plan E — Commercial UX, positioning and onboarding**  
   `2026-09-10-commercial-ux-positioning.md`
6. **Plan F — Legal/privacy/support/status/enterprise foundation**  
   `2026-09-10-legal-support-enterprise.md`
7. **Plan G — Commercial production migration and release governance**  
   `2026-09-10-commercial-production-netlify.md`

Plans C and D may be developed independently after A+B are green, but each must merge through its own complete release gate. Plans E and F consume the stable A-D contracts. Plan G is the final production/cutover plan and cannot declare commercial readiness until A-F are complete.

## Shared interfaces that must remain stable

### Principal

Interactive Identity sessions:

```js
{
  type: 'user',
  authn: 'identity-session',
  subject: '<verified-provider-subject>',
  email: '<verified-provider-email>'
}
```

API key principals:

```js
{
  type: 'service',
  authn: 'api-key',
  organizationId,
  projectId: null | string,
  scopes: string[],
  keyId
}
```

CI principals:

```js
{
  type: 'service',
  authn: 'ci-token',
  organizationId,
  projectId,
  environmentId: null | string,
  scopes: string[],
  tokenId
}
```

No service may treat user-editable identity metadata as KATA role, tenant, plan, entitlement, billing, or support authority.

### Interactive-session CSRF boundary

All POST/PUT/PATCH/DELETE requests authenticated by the Netlify Identity cookie session must carry an `Origin` exactly equal to the KATA request origin. Missing, wildcard, suffix-matched, substring-matched, or cross-origin values fail before business logic. API-key/CI-token principals use explicit credential scopes and are not converted into cookie sessions.

### Secret lifecycle

Raw API keys, CI tokens, invitation tokens, Razorpay credentials/webhook secrets, Netlify deploy credentials, and Identity session secrets never enter logs, audit metadata, report evidence, browser workspace persistence, or database plaintext columns. User-facing generated credentials are one-time reveal only.

### Commercial authorization order

```text
verified principal
 -> tenant/service-principal scope
 -> object ownership under that tenant
 -> effective server-derived entitlement
 -> operation-specific role/scope
 -> bounded execution
```

A plan name, price, client-rendered feature flag, query parameter, request body field, localStorage value, or mutable Identity metadata can never skip this sequence.

### Internal support/operator authority

Tenant roles are not platform-operator roles. Any future KATA support/operator mutation path must use a separately configured server-side operator principal/allowlist and generate an audit event. A customer OWNER/ADMIN does not automatically gain platform support authority, and mutable Identity metadata cannot create an operator. If no secure operator principal is configured, support-side mutation remains unavailable rather than falling back to tenant or client claims.

### Billing authority

Only reconciled server-side subscription state can produce paid entitlements. Browser checkout completion is informational. Razorpay webhook processing requires raw-body HMAC verification, unique provider event IDs, duplicate safety, out-of-order protection, durable acceptance, and reconciliation when state is ambiguous.

### Usage authority

Quota is reserved transactionally before a hosted metered operation and finalized afterward. Idempotent retries cannot consume twice; concurrent reservations cannot exceed the effective limit; KATA internal failure releases the reservation; a legitimate completed BLOCKED diagnosis consumes it.

### Compatibility evidence boundary

Hosted commercial KATA evaluates bounded evidence collected through legitimate customer browser/extension/CLI/CI/API paths. It does not become a generic arbitrary-URL fetcher, browser farm, credential scraper, CAPTCHA solver, bot-defense bypass, paywall bypass, or cross-origin policy bypass.

### Release authority

No production release is successful until the exact source SHA:

1. passes the complete KATA Release Gate;
2. passes CodeQL/security checks required by repository policy;
3. produces a source-bound `release.json` and integrity manifest;
4. is deployed through the guarded commercial workflow;
5. passes immutable-deployment smoke verification;
6. converges on the canonical production URL;
7. reports commercial readiness `ready` using real provider/configuration evidence.

## Cross-plan database migration contract

```text
001_commercial_foundation.sql
002_entitlements_usage.sql
003_billing.sql
004_compatibility_runs.sql
005_trust_enterprise.sql
```

No later migration may redefine an earlier table in application code. Changes use additive/explicit SQL migrations and the release verifier checks source migration ordering against applied production state.

## Bootstrap cost contract

The commercial bootstrap target is zero fixed infrastructure spend, not infinite free capacity. Netlify Free has a hard credit budget; database/functions/deploy/bandwidth usage are budgeted within it. KATA blocks or degrades non-essential hosted work before the configured safety threshold. Account access, billing cancellation, privacy export/deletion request paths, and status/support access remain available as far as provider availability permits. No automatic paid upgrade or auto-recharge is introduced by KATA.

Heavy work remains customer-funded/BYOK where possible: local browser, extension, customer CI runner, customer's APIs/MCP servers, and customer's model provider.

## External operator-owned launch prerequisites

These cannot be fabricated in source code and therefore remain explicit readiness checks until the owner supplies/configures them:

- Netlify account/site authorization and commercial Free-plan site creation;
- Netlify Identity enablement/provider choices;
- Netlify Database provisioning and applied migrations;
- GitHub deployment secrets for the Netlify site;
- Razorpay merchant/KYC state and test/live credentials/plan IDs/webhook secret;
- actual legal entity/business identity, support/privacy contacts, effective dates, jurisdiction/address fields requiring operator/legal review;
- canonical domain/DNS ownership if a custom domain is used;
- verified GitHub `main` ruleset/branch governance.

The code must surface each missing prerequisite through `/api/readiness/commercial` rather than presenting a false green state.

## Review gates

After every task: run the targeted RED/GREEN test named in that plan.

After every plan: run `npm run check` and review the diff for secrets, tenant-boundary regressions, and accidental protocol changes.

Before merging implementation PRs: require full Release Gate and CodeQL on the exact head SHA.

Before commercial production cutover: require Plans A-F complete, Plan G repository checks complete, Razorpay test-mode lifecycle verified, Netlify Identity/Database configured, GitHub release governance verified, exact-SHA live smoke PASS, and `/api/readiness/commercial` equal to `ready`.

## Definition of completion

The implementation program is complete only when a new customer can self-register, recover access, provision/use an isolated tenant, create a project/environment, obtain a real compatibility result, use properly scoped API/CI credentials when entitled, see usage and billing state, upgrade through provider-verified billing, manage Team governance, obtain private support where entitled, exercise privacy export/deletion paths, and pass the exact-source production release/readiness gate without founder-side manual data edits.

External merchant/legal/account authorization may still require the owner to supply credentials or complete KYC/provider UI actions, but those are configuration prerequisites—not missing product implementation—and must remain visibly blocked until completed.
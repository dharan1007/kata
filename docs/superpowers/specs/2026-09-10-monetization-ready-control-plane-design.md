# KATA Monetization-Ready Control Plane — Design

## Status

Approved architectural direction for turning KATA from a strong interoperability/research-engineering project into a commercial product that can onboard, meter, bill, support, and govern customers without weakening KATA's existing protocol and browser-security boundaries.

This design intentionally separates KATA's open-source interoperability engine from the commercial control plane. The core continues to provide deterministic HTTP, MCP, WebMCP, browser, API-discovery, workflow, and model-tool-schema capabilities. The commercial layer adds identity, organizations, projects, API credentials, entitlements, quotas, billing state, usage receipts, commercial onboarding, support/status/legal surfaces, and enterprise governance.

## 1. Product objective

KATA must support a complete self-service path:

```text
visitor
  -> create account
  -> receive personal organization
  -> create a project/application target
  -> run a real interoperability assessment
  -> see exact findings and compliant remediation paths
  -> generate API/CLI/CI integration credentials
  -> optionally upgrade
  -> payment provider confirms commercial state
  -> server-side entitlements change
  -> usage is atomically metered
  -> organization administrators manage members, keys, policy and billing
  -> support can correlate customer-visible receipts to operational evidence
```

A commercial launch is not considered ready until that path is functional, tested, observable, tenant-isolated, and deployable through an exact-source release gate.

## 2. Non-negotiable constraints

1. KATA must not pay for customer LLM inference, browser farms, proxies, CAPTCHA solving, scraping infrastructure, or third-party API consumption. Heavy execution remains BYOK, local, CI-runner-based, self-hosted, or customer-funded.
2. KATA must not bypass authentication, authorization, CAPTCHAs, anti-bot controls, paywalls, robots policies, CSP, CORS, iframe isolation, Permissions Policy, rate limits, or site terms.
3. The canonical KATA semantic/tool registry remains the single source of truth for HTTP, MCP, WebMCP, and model-specific projections.
4. Existing abort/cancellation, preview-binding, bounded execution, exact-origin, and explicit-failure semantics remain intact.
5. Commercial authorization must never depend on browser-controlled metadata, mutable user metadata, query parameters, client plan names, or UI visibility.
6. Raw API keys, payment secrets, webhook secrets, and provider secret credentials must never be persisted in client-readable storage or returned after initial issuance.
7. Billing events are evidence, not direct authority. Entitlements derive from a reconciled subscription state persisted server-side.
8. No production deployment is successful until the exact verified source SHA is live on the canonical production URL and health, capability, legal-readiness, and billing-readiness checks all pass.
9. ₹0 fixed infrastructure spend is a bootstrap constraint, not a promise of infinite free capacity. The production configuration must fail closed at provider free-plan hard limits instead of silently creating paid usage.
10. Enterprise hosted SLA claims are prohibited while the service depends on free-tier infrastructure without a contractual SLA. Enterprise self-hosting/customer-funded hosting may be sold separately.
11. Netlify Identity browser authentication is cookie-backed; every unsafe cookie-authenticated management request must satisfy an exact same-origin CSRF check before business logic executes.
12. Bare npm imports are not shipped directly to browsers. Browser dependencies are bundled into first-party integrity-bound assets so CSP does not need CDN/runtime-import exceptions.
13. Team invitation tokens are one-time reveal, hash-only at rest, expiry-bound, and acceptance is tied to the verified invited email address.
14. Customer tenant roles and mutable Identity metadata never confer KATA platform-support/operator authority; any operator capability is a separate server-configured principal boundary.

## 3. Commercial positioning

The primary product statement changes from research-first language to:

> Make your software work reliably with AI agents.
>
> Test, diagnose and enforce interoperability across MCP, WebMCP, OpenAPI, browsers, APIs, plugins and model tool runtimes.

Research/OpenAlex remains a real production connector and proof of KATA's semantic-workflow engine. It is no longer the commercial category definition.

Primary product surfaces:

- Compatibility: determine whether an application, API, MCP server, or browser surface can be used by an agent and why.
- Remediation: state what is technically possible, what is blocked, the blocking layer, and the safest compliant path.
- CI: detect interoperability regressions before release.
- Developer integration: expose machine-readable reports, API keys, CLI/CI credentials, and stable agent-facing schemas.
- Governance: organization policy, audit history, scoped keys, billing, quotas, member access, and enterprise export/self-hosting.

## 4. Commercial plans and canonical entitlement registry

Initial plans are deliberately limited to four product states:

### Free — ₹0

- 1 personal organization
- 2 active projects
- 30 compatibility evaluations per rolling calendar month
- public/local/basic interoperability assessment
- local CLI and browser extension
- basic MCP/WebMCP/OpenAPI diagnostics
- 7-day hosted report history
- no organization invitations
- no CI enforcement token

### Developer — ₹999/month

- 1 personal organization
- 10 active projects
- 500 compatibility evaluations/month
- private projects
- 90-day report history
- API keys
- CI token and machine-readable reports
- regression comparisons
- export JSON

### Team — ₹4,999/month

- organization workspace
- 10 members included
- 50 active projects
- 5,000 compatibility evaluations/month
- CI enforcement
- shared baselines and policy profiles
- role-based membership
- organization audit trail
- 365-day hosted report history
- scoped API keys
- billing/admin console
- priority support contract as explicitly published, without uptime SLA claims on free-tier hosting

### Enterprise — contract

- customer-funded/self-hosted or separately contracted infrastructure
- SSO/OIDC when implemented and contracted
- private deployment
- custom data retention
- custom policy packs
- signed audit exports
- advanced role/scoped service accounts
- support/SLA terms only when backed by the purchased infrastructure/support contract

The plan name must never be used directly in authorization branches. One canonical server module maps subscription state to entitlements:

```js
{
  maxProjects,
  monthlyEvaluations,
  historyDays,
  privateProjects,
  apiKeys,
  ciTokens,
  ciEnforcement,
  regressionHistory,
  jsonExport,
  organizationMembers,
  policyManagement,
  auditExport,
  enterpriseSelfHosting
}
```

Every API/UI/CLI/MCP commercial operation asks the same entitlement evaluator. Feature decisions are server-enforced and returned to the UI only for rendering.

## 5. Identity and authentication

The approved bootstrap provider is Netlify Identity because the credit-based Free plan provides email/password, supported external providers, server-side Functions integration, recovery flows, and role primitives without an additional Identity subscription fee.

Identity is an authentication provider only. KATA authorization lives in KATA's own organization/membership database.

Authentication contract:

- server validates provider-issued identity/JWT for every authenticated request;
- user ID comes from the verified identity subject, never a request body field;
- user profile display data is not authorization data;
- signup creates exactly one personal organization through an idempotent provisioning transaction;
- recovery and email-change use provider-supported flows;
- account deletion revokes/removes commercial records according to retention/legal requirements before the identity account is removed;
- service/API keys are separate principals and never masquerade as interactive user sessions.

## 6. Tenant and organization model

Core entities:

```text
users
organizations
organization_members
organization_invitations
projects
project_environments
api_keys
ci_tokens
subscription_accounts
billing_events
entitlement_snapshots
usage_reservations
usage_events
compatibility_runs
compatibility_findings
policy_profiles
audit_events
support_tickets
legal_acceptances
```

Membership roles:

- OWNER: billing, membership, keys, policy, deletion, transfer, all project operations.
- ADMIN: membership except owner transfer, projects, keys, policy, reports.
- MEMBER: use projects and run permitted evaluations; no billing/member administration.

Authorization must always be tenant-first:

```text
verified principal
 -> organization membership/service principal scope
 -> project ownership under that organization
 -> operation entitlement
 -> object-level permission
```

No endpoint may authorize merely because an authenticated user can guess a project ID or organization ID.

Organization deletion requires OWNER authority, a fresh confirmation, and an explicit retention/deletion job/receipt. Ownership transfer cannot leave an organization ownerless.

## 7. Projects and environments

A project represents the customer's product/application. A project may have environments such as production, staging, and preview.

Minimum project fields:

```text
id
organization_id
name
slug
default_target_url
visibility
created_by
created_at
archived_at
```

Environment fields:

```text
id
project_id
name
target_url
expected_origin
baseline_run_id
created_at
```

Target URL validation accepts only legitimate HTTP(S) origins/URLs supported by the specific evaluation surface. Private/authenticated applications are assessed through authorized local/extension/CI flows instead of creating an arbitrary server-side URL-fetch primitive.

## 8. API keys and CI credentials

KATA keys use a recognizable non-secret prefix, for example `kata_live_` and `kata_test_`. Keys are generated from cryptographically secure random bytes.

Persistence stores only:

```text
id
organization_id
project_id nullable
prefix
secret_hash
scopes
created_by
created_at
last_used_at
expires_at nullable
revoked_at nullable
```

The full key is returned exactly once after creation. Server-side verification hashes/compares the presented key using a suitable keyed or password-safe strategy and constant-time equality where applicable.

Scopes are explicit, for example:

```text
projects:read
runs:create
runs:read
reports:read
ci:enforce
keys:manage
```

A key cannot grant more privilege than its owning organization/plan permits. Revocation is immediate for subsequent requests.

CI tokens are separate from general-purpose API keys when their semantics differ; they should be project/environment scoped and suitable for least-privilege pipeline use.

## 9. Usage accounting and quota enforcement

Naive `count(*) < limit` enforcement is prohibited because concurrent requests can exceed a quota.

KATA uses a reservation/outcome ledger:

```text
request accepted
 -> begin transaction
 -> resolve current entitlement window
 -> acquire/atomically update quota bucket
 -> create unique usage_reservation(request_id, org, metric, units)
 -> commit reservation
 -> execute bounded operation
 -> append usage_event outcome referencing reservation
```

A retry with the same idempotency/request key cannot consume quota twice.

Billable/metered metric examples:

- compatibility_evaluation
- hosted_report
- ci_evaluation
- api_interop_evaluation

The initial plans meter compatibility evaluations rather than low-level internal calls. This keeps pricing understandable and reduces accounting cardinality.

Failed operations caused by KATA internal errors should not consume the monthly evaluation quota. Legitimate completed assessments that produce BLOCKED findings do count: a compliant diagnosis of a real restriction is product value, not a failed KATA run.

Usage records contain no raw credentials, model prompts, browser secrets, payment secrets, or unnecessary content snapshots.

## 10. Billing architecture

Razorpay is the initial India payment provider. Billing is implemented behind a provider interface so KATA business logic is not hard-wired to Razorpay payloads.

Canonical billing states:

```text
FREE
CHECKOUT_PENDING
AUTHENTICATED
ACTIVE
PAST_DUE
HALTED
CANCEL_PENDING
CANCELLED
EXPIRED
RECONCILIATION_REQUIRED
```

The provider adapter maps provider-specific subscription states/events into this canonical state machine.

The browser never sets paid state. Checkout creates provider-side intent/subscription metadata containing only non-secret KATA identifiers required for reconciliation.

Webhook processing requirements:

1. receive raw request body;
2. validate `X-Razorpay-Signature` using HMAC-SHA256 and the configured webhook secret;
3. validate body size and content type;
4. read unique `x-razorpay-event-id`;
5. insert event ID under a unique constraint before applying its business transition;
6. tolerate duplicate delivery;
7. tolerate out-of-order delivery by comparing provider event timestamps/state and reconciling when ambiguous;
8. persist minimal redacted billing evidence;
9. update canonical subscription state transactionally;
10. derive a new entitlement snapshot;
11. return 2xx only after durable acceptance.

No webhook handler stores card/payment instrument data.

Provider API reconciliation is a separate server-side operation used when event ordering or missed delivery makes local state ambiguous. A browser-visible "payment successful" callback is never treated as sufficient entitlement evidence.

Production billing is disabled until all mandatory billing environment variables and merchant configuration are present. Missing billing configuration must produce `BILLING_NOT_CONFIGURED`, not a fake checkout URL.

## 11. Netlify commercial production architecture and ₹0 bootstrap budget

KATA's current Vercel Hobby deployment remains a development/reference deployment until commercial production is moved, because commercial production cannot rely on a plan whose terms exclude the intended use.

Bootstrap commercial production uses Netlify's credit-based Free plan with its hard monthly limit. The design assumes 300 monthly credits and must include a KATA-side resource budget well below provider exhaustion.

No Netlify AI inference/Agent Runner usage is part of the product architecture.

Budget controls:

- production deploy cadence is release-only, not every scheduled audit;
- preview/branch deployments are used for validation where free;
- commercial API endpoints reject excessive body sizes early;
- compatibility heavy execution is local/customer CI whenever possible;
- database access is indexed and bounded;
- report payloads have size/retention caps;
- Free plan quota is intentionally modest;
- no background polling loops;
- no unbounded logs or event retention;
- a provider-budget readiness endpoint exposes whether KATA is approaching a configured safety threshold;
- commercial production must fail closed before an unexpected paid upgrade path is required.

Netlify Database consumes credits for database compute/bandwidth. Therefore KATA must not assume database capacity is free/unmetered. Database usage is part of the same bootstrap budget, with indexes, bounded queries, retention pruning, and no high-frequency session writes.

The architecture keeps storage/provider access behind repository interfaces so the control plane can later move to another Postgres provider or customer-hosted Postgres without changing entitlement/billing semantics.

## 12. Commercial application/API boundaries

Authenticated commercial endpoints are separate from existing public interoperability endpoints unless the operation naturally belongs in the canonical KATA tool registry.

Proposed management API namespace:

```text
/api/account
/api/organizations
/api/organizations/:orgId/members
/api/projects
/api/projects/:projectId
/api/projects/:projectId/environments
/api/projects/:projectId/runs
/api/projects/:projectId/reports
/api/keys
/api/usage
/api/billing/checkout
/api/billing/subscription
/api/billing/webhook/razorpay
/api/audit
/api/support
/api/legal/acceptance
/api/readiness/commercial
```

Existing `/api/invoke`, `/api/mcp`, `/api/openapi`, `/api/capabilities`, and WebMCP behavior remain canonical interoperability surfaces. Commercial gating is applied only where the operation is a commercial hosted service. Open-source/local functionality must not be crippled merely to manufacture SaaS scarcity.

## 13. Compatibility product and paid value boundary

A compatibility run produces a stable machine-readable report:

```text
run metadata
observed surfaces
capability graph
findings[]
  code
  severity
  layer
  evidence
  technicalPossibility
  blockedReason
  compliantPath
  remediation
  confidence
summary scores
baseline delta
receipt
```

Restriction findings explicitly distinguish:

- technically unsupported;
- browser/security-policy blocked;
- authentication/user-authorization required;
- rate-limited;
- API/provider unsupported;
- terms/policy/manual-review restriction;
- configuration error;
- KATA internal failure.

KATA never calls a compliant restriction diagnosis a successful execution of the blocked action.

Free users receive basic findings and current-run result. Developer/Team plans unlock longer history, private hosted reports, regression comparison, CI credentials, machine-readable export, and organization policy—not fake extra technical capability.

## 14. CI/CD product

Canonical CLI outcome classes:

```text
0  compatible / policy pass
2  interoperability regression or policy failure
3  target/configuration blocked
4  authentication/user action required
5  KATA/provider transient failure
```

CI must be able to compare the current evaluation with the previous deployment.

Example policy controls:

- forbid new critical findings;
- require MCP protocol contract availability;
- require WebMCP capability only where the application claims it;
- forbid loss of a required agent/API surface;
- forbid unsafe broad origin/credential exposure;
- require release provenance metadata.

CI evaluation should preferentially execute on the customer's GitHub/CI runner. KATA's hosted control plane stores compact metadata/results rather than running a browser farm.

## 15. Onboarding and UX

The landing page's primary CTA becomes `Test your application`.

Unauthenticated visitor flow:

```text
landing
 -> compatibility explanation
 -> limited public/basic test where technically appropriate
 -> result preview
 -> create account to save/history/private-project
```

Authenticated first-run flow:

```text
account provisioned
 -> personal org created
 -> create project
 -> choose target type: website / API / MCP / authenticated browser app
 -> run supported assessment or install/use extension/CLI for authenticated target
 -> view findings
 -> optional baseline
 -> generate CI/API credential if entitled
```

The UI must not ask users to paste raw HTML/CSS/JS as the primary product workflow. Modern applications are evaluated through their actual URLs, APIs, MCP endpoints, browser context, extension evidence, or customer-run CLI/CI.

Navigation becomes product-oriented:

```text
Overview
Projects
Runs
Reports
CI
API Keys
Team
Usage
Billing
Audit
Support
Settings
```

Developer documentation remains public and explains exact input/output examples.

## 16. Product positioning changes

README, landing page, metadata, `llms.txt`, developer docs, and support docs must agree on KATA's category.

Required positioning hierarchy:

1. Agent interoperability / compatibility platform.
2. MCP, WebMCP, OpenAPI, browser and model-tool integration.
3. Deterministic workflow semantics as a differentiator.
4. OpenAlex research connector as a real reference/application domain.

No page may claim features such as unattended cloud scheduling, enterprise SSO, formal uptime SLA, or certification until those capabilities actually exist and are release-tested.

## 17. Support model

Support surfaces:

- Free: GitHub issues/discussions for public product questions/bugs; no response-time commitment.
- Developer: authenticated private support ticket intake; target response objective clearly labelled as an objective, not contractual SLA.
- Team: priority private support queue with published business-hour response target.
- Enterprise: support/SLA terms are contract-specific and available only when backed by appropriate infrastructure/support capability.

Support tickets include organization/project/run IDs and sanitized diagnostic receipts, never raw API keys/payment secrets/browser credentials.

Severity taxonomy:

- SEV-1: paid product unavailable, cross-tenant/security-critical exposure, billing system incorrectly grants/denies broad access.
- SEV-2: major commercial feature unusable without workaround.
- SEV-3: localized defect or integration regression with workaround.
- SEV-4: question/documentation/request.

## 18. Status and observability

`/api/health` remains lightweight service health. Add `/api/readiness/commercial` for machine-readable commercial launch/readiness state.

Readiness fields include:

```text
releaseSha
sourceBound
identityConfigured
databaseConfigured
billingConfigured
webhookConfigured
legalConfigured
supportConfigured
providerBudgetConfigured
migrationsCurrent
status
```

The public status page must not hard-code "operational". It derives component state from bounded health/readiness signals and can publish active incidents.

Every authenticated request has a request ID. Important commercial transitions generate audit events with actor, organization, target object, action, outcome, timestamp, and correlation/request ID.

Secrets and full sensitive request bodies are excluded from logs.

## 19. Audit event model

Audit events are append-only from ordinary application APIs. They cover:

- organization/member changes;
- project creation/archive;
- API key/CI token create/revoke;
- policy changes;
- billing state transitions;
- entitlement transitions;
- support/admin actions;
- account deletion/export requests.

Audit events are tenant-readable according to entitlement/role but not client-editable.

## 20. Legal and privacy readiness

KATA requires the following public documents before live checkout is enabled:

- Terms of Service
- Privacy Notice
- Acceptable Use Policy
- Refund/Cancellation Policy
- Subprocessor/Third-Party Services disclosure
- Security overview/contact path

These files contain deployment-time legal identity placeholders only in source templates. Production readiness is false until configured with the actual merchant/legal entity name, business/contact address where legally required, privacy contact, support contact, effective dates, jurisdiction/venue terms reviewed by the operator, and payment-provider disclosures.

KATA records a versioned legal acceptance for signup/checkout where required:

```text
user_id
organization_id
document_type
document_version
accepted_at
request_id
```

Privacy lifecycle includes:

- data inventory by purpose;
- purpose-limited collection;
- account/profile export;
- account deletion request;
- project/report deletion subject to stated retention/legal requirements;
- billing records retained only as required for accounting/legal purposes;
- no sale of customer data;
- no use of customer private project data for model training by KATA unless separately and explicitly opted in in a future design.

The implementation must be reviewed against the currently applicable Indian DPDP Act/Rules and any jurisdictions actually targeted before legal launch. KATA code must not present machine-generated legal text as legal advice or as already lawyer-approved.

## 21. Enterprise control foundation

Initial enterprise-capable foundation is implemented without pretending all enterprise features exist.

Required now:

- OWNER/ADMIN/MEMBER roles;
- organization/project scopes;
- API key scopes;
- policy profiles;
- audit events;
- configurable retention fields;
- organization export;
- self-hosting configuration contract;
- provider-neutral storage/billing/auth interfaces where practical.

Deferred until contracted/required:

- SAML/SCIM;
- formal SOC 2 certification;
- dedicated regions/data residency guarantees;
- customer-managed encryption keys;
- contractual 99.9x% uptime;
- advanced DLP.

Deferred items must be shown as unavailable/contact-sales roadmap capabilities, not enabled-looking UI.

## 22. Open-source/commercial boundary

The existing MIT-licensed code remains MIT. Already published versions cannot be retroactively made proprietary.

Open-source KATA Core keeps:

- canonical tool schemas;
- basic MCP/WebMCP/OpenAPI interoperability;
- local/browser capabilities;
- CLI-compatible core diagnostics where feasible;
- deterministic workflow engine;
- reference connectors.

Commercial hosted value consists primarily of:

- persistent private organizations/projects;
- hosted history/reports;
- CI baselines/enforcement;
- server-managed keys;
- usage/quotas;
- team governance;
- billing;
- policy/audit history;
- support;
- enterprise packaging.

Commercial code may remain in the same private-flagged application repository initially if license boundaries are explicit. If proprietary modules are introduced later, they must be clearly separated and their licensing documented; this design does not attempt to retroactively restrict existing MIT code.

## 23. Release and branch security

Current `main` must not remain an unrestricted direct-push commercial release source.

Required GitHub release governance:

- protect `main` or apply an equivalent repository ruleset;
- require pull request before merge;
- require KATA Release Gate status;
- require CodeQL/security status where available;
- disallow force-push/deletion of the release branch;
- release deployment runs only for a successful verified `main` push;
- deployment checks exact SHA before build;
- release artifact embeds source SHA and integrity manifest;
- production smoke checks health, commercial readiness, capabilities, OpenAPI, static integrity and canonical alias convergence.

If repository-plan/API permissions prevent programmatic branch protection, commercial readiness stays false and the precise manual GitHub configuration is documented.

## 24. Production migration from Vercel

Migration is parallel, not destructive:

1. keep current Vercel deployment available as non-commercial reference/fallback while building;
2. create Netlify preview/branch environment;
3. provision Identity and Database using the approved free-plan account;
4. apply schema migrations;
5. configure test-mode Razorpay credentials/webhooks;
6. run release/security/e2e tests;
7. deploy a source-bound Netlify production build;
8. verify canonical Netlify URL and commercial readiness;
9. switch the public commercial KATA canonical link/domain only after verification;
10. do not delete Vercel until rollback confidence is established.

The old GitHub Vercel production workflow is disabled only after the new production release workflow has an equivalent or stronger exact-source gate.

## 25. Database integrity and indexes

All tables carrying organization data include `organization_id` directly or through a non-ambiguous parent foreign key. Foreign keys and uniqueness constraints enforce invariants rather than relying only on application code.

Required examples:

- unique `(organization_id, slug)` for projects;
- unique `(project_id, name)` for environments;
- unique billing provider event ID;
- unique API key hash/prefix identifier as appropriate;
- unique membership `(organization_id, user_id)`;
- exactly one effective owner invariant enforced transactionally;
- unique usage reservation idempotency key within the relevant principal/scope;
- indexes for organization/project/run/time-range dashboard queries.

Migrations are ordered and idempotent only where safe. Production never silently auto-mutates schema from browser code.

## 26. Security-specific acceptance criteria

Before monetization launch, tests must prove:

- user A cannot read/write user B's organization/project/report/key data;
- MEMBER cannot mutate billing/membership/policy;
- ADMIN cannot transfer/remove the final OWNER where prohibited;
- revoked API keys fail immediately;
- key scopes are enforced server-side;
- plan entitlements cannot be overridden by request body/header/browser storage;
- duplicate billing webhooks do not duplicate entitlements or usage;
- out-of-order billing events do not incorrectly re-activate cancelled subscriptions;
- invalid webhook signatures make no state changes;
- raw webhook verification uses the unparsed body;
- concurrent quota reservations cannot exceed the configured limit;
- aborted/failed internal operations do not leave paid usage in an inconsistent state;
- existing MCP/WebMCP/browser origin/auth/CSP/Permissions Policy restrictions remain unchanged;
- commercial endpoints enforce body/time/rate limits;
- logs/audit events redact secrets;
- account deletion/export respects tenant boundaries.

## 27. Testing strategy

Every implementation subsystem follows RED -> GREEN -> refactor discipline.

Test layers:

1. pure unit tests for entitlement, billing-state mapping, scopes, quota arithmetic, URL validation and policy evaluation;
2. database/integration tests for tenant isolation, transactions, idempotency, concurrent quota reservation and billing transitions;
3. API contract tests for identity, organizations, projects, keys, usage, billing and readiness;
4. browser/UI tests for onboarding, project creation, key one-time reveal, billing states, member administration and inaccessible controls;
5. existing full KATA protocol suite to catch interoperability regressions;
6. static/security checks;
7. CodeQL;
8. preview deployment smoke tests;
9. production exact-SHA/readiness/API smoke tests.

No subsystem is considered finished merely because its happy-path UI works.

## 28. Implementation decomposition

This design is intentionally decomposed into independently reviewable implementation plans:

### Plan A — Commercial foundation

Identity verification adapter, database abstraction/migrations, users, organizations, memberships, projects, environments, API-key primitives, tenant authorization, and commercial readiness skeleton.

### Plan B — Entitlements and metering

Canonical plan registry, entitlement evaluator, scoped service principals, atomic quota reservations, usage outcomes, usage dashboard/API, and CI token foundation.

### Plan C — Razorpay billing

Provider interface, checkout/session creation, canonical subscription state, raw-body webhook validation, replay/out-of-order handling, reconciliation, entitlement updates, cancellation and billing UI.

### Plan D — Compatibility SaaS workflow and CI

Project-driven compatibility runs, stored reports/findings, baselines, regression evaluation, CLI/CI contract, machine-readable exports and policy enforcement.

### Plan E — Commercial UX, positioning, onboarding and documentation

Landing/navigation/product copy, account/org/project onboarding, pricing, usage/billing/team/audit/support interfaces, developer docs, README/llms.txt alignment.

### Plan F — Legal/privacy/support/status/enterprise foundation

Legal templates/config gates, acceptance tracking, export/delete flows, support tickets/severity, status/readiness surface, audit export, retention controls, self-hosting contract.

### Plan G — Commercial production migration and release governance

Netlify project/config, free-credit safety budget, exact-source deploy gate, production smoke/readiness verification, branch/ruleset hardening or explicit external blocker, domain/canonical cutover, rollback validation.

Each plan must leave the repository in a passing, independently useful state. Plans must not be merged as one giant unreviewable patch.

## 29. Definition of monetization-ready 10/10

KATA may be called monetization-ready only when all of the following are true:

- a new user can self-register and recover an account;
- tenant isolation is verified;
- personal organization provisioning is reliable/idempotent;
- projects/environments work;
- a user can obtain real compatibility value without manual founder intervention;
- Developer/Team plans map to central server entitlements;
- usage quotas are concurrency-safe and observable;
- production Razorpay test-mode lifecycle passes end to end;
- live mode can be enabled solely by merchant-owned credentials/configuration, without code changes;
- webhook validation/idempotency/out-of-order behavior is tested;
- API/CI credentials are one-time reveal, hashed, scoped and revocable;
- onboarding, pricing, usage, billing, team, audit, support and legal pages are complete;
- privacy export/delete paths are implemented;
- no false SLA/compliance/enterprise claims exist;
- commercial hosting permits commercial use and stays within a hard ₹0 bootstrap budget until the provider limit is reached;
- `main` release governance prevents unverified source from reaching production;
- the commercial deployment is source-bound to a passing Release Gate and CodeQL result;
- live health/readiness/API/capability/integrity checks pass on the canonical commercial deployment;
- existing KATA MCP/WebMCP/security behavior remains green.

External merchant/legal configuration may remain operator-owned: Razorpay KYC/live credentials, actual legal entity/address/privacy contact, domain/DNS ownership, and any provider account authorization. KATA must expose each missing external item precisely through commercial readiness; it must never pretend these have been completed.

## 30. Verified external assumptions as of 2026-09-10

- Netlify Identity is available on credit-based Free plans at no additional Identity fee and supports email/password, supported OAuth providers, server-side Functions verification, recovery, and role primitives. Custom outgoing identity email and Identity audit log require Pro, so KATA must not depend on those for the Free bootstrap architecture.
- Netlify's credit-based Free plan provides 300 credits/month with a hard limit and no auto-recharge. Production deploys and compute/bandwidth/web requests consume credits. The design therefore budgets provider use rather than assuming unlimited free infrastructure.
- Netlify Database consumes compute and bandwidth credits; the historical free-storage period ended before this design date. KATA must treat database activity as metered provider usage.
- Razorpay webhook signatures use HMAC-SHA256 over the raw request body. Duplicate events can occur, the `x-razorpay-event-id` header is the deduplication key, and event ordering is not guaranteed.
- The Digital Personal Data Protection Rules, 2025 were published by India's Ministry of Electronics and Information Technology on 2025-11-14 with an associated enforcement timeline. KATA's live legal/privacy launch must be checked against the provisions currently in force at deployment time.

## 31. Explicit non-goals for the first commercial release

The first monetization-ready release does not include:

- KATA-operated remote browser farms;
- KATA-funded model inference;
- CAPTCHA bypass or anti-bot circumvention;
- broad credential scraping;
- arbitrary remote URL fetching as an agent tool;
- SAML/SCIM before a real enterprise customer requires it;
- SOC 2 claims without certification;
- fabricated status/SLA metrics;
- fake payment success in the absence of Razorpay evidence;
- an artificial feature paywall around the existing MIT core.

These exclusions protect the zero-cost bootstrap economics and KATA's existing security model.

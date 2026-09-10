# KATA Legal, Privacy, Support, Status and Enterprise Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the non-billing commercial trust layer required to sell KATA responsibly: legal/config gates, privacy lifecycle, support intake, status/readiness, audit export, retention controls and enterprise-ready governance foundations without claiming certifications or SLAs that do not exist.

**Architecture:** Legal documents are versioned templates whose production activation requires real operator-owned identity/contact configuration. Privacy/support/audit flows use tenant-scoped server services and append-only evidence; public status derives from health/readiness signals instead of hard-coded marketing state.

**Tech Stack:** Node.js 24 ESM, PostgreSQL, existing commercial router, static HTML/ESM views, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-10-monetization-ready-control-plane-design.md`

## Global Constraints

- Machine-generated legal text must not be presented as lawyer-approved legal advice.
- Checkout remains blocked until mandatory legal/merchant/privacy/support configuration is present.
- Customer data is not sold and private project data is not used for model training without a future explicit opt-in design.
- Audit/support logs exclude raw API keys, payment secrets and browser credentials.
- No SOC 2, SAML/SCIM, data-residency, CMK or uptime-SLA claim until actually implemented/contracted.
- Tenant deletion/export cannot cross organization boundaries.

---

## File Structure

- `legal/terms.template.md`
- `legal/privacy.template.md`
- `legal/acceptable-use.template.md`
- `legal/refund-cancellation.template.md`
- `legal/subprocessors.template.md`
- `lib/commercial/legal.js` — document registry/configuration/acceptance logic.
- `lib/commercial/privacy.js` — export/deletion orchestration.
- `lib/commercial/support.js` — support ticket intake/severity/state.
- `lib/commercial/audit.js` — append/query/export helpers.
- `lib/commercial/status.js` — component status projection.
- `lib/commercial/retention.js` — bounded retention policy representation and pruning candidates.
- `netlify/database/migrations/005_trust_enterprise.sql`
- `tests/commercial-legal.test.js`
- `tests/commercial-privacy.test.js`
- `tests/commercial-support.test.js`
- `tests/commercial-audit.test.js`
- `tests/commercial-status.test.js`

### Task 1: Add versioned legal templates and launch configuration gates

**Files:**
- Create: all `legal/*.template.md` files listed above
- Create: `lib/commercial/legal.js`
- Create: `tests/commercial-legal.test.js`

**Interfaces:**
- `LEGAL_DOCUMENTS` maps `terms|privacy|acceptable_use|refund_cancellation|subprocessors` to explicit versions.
- `renderLegalDocument({type,config})` returns rendered text only when mandatory fields exist.
- `evaluateLegalReadiness(config)` returns missing fields without inventing them.

- [ ] **Step 1: Write RED readiness tests**

Prove missing `KATA_LEGAL_ENTITY_NAME`, `KATA_SUPPORT_EMAIL`, `KATA_PRIVACY_EMAIL`, `KATA_LEGAL_EFFECTIVE_DATE`, and required address/jurisdiction configuration keep legal readiness blocked; literal strings such as `TBD`, `TODO`, `Example Company` and fake GST/company IDs are rejected.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-legal.test.js`

Expected: FAIL.

- [ ] **Step 3: Write conservative templates**

Templates explain service scope, account responsibilities, acceptable use, billing/cancellation mechanics, third-party providers, privacy purposes/retention/contact and dispute/jurisdiction placeholders rendered only from verified deployment config. Include an explicit source comment saying operator/legal review is required before enabling live checkout.

- [ ] **Step 4: Implement document versioning/readiness**

Do not read legal identity from user-editable profile fields. Document versions are source constants; production configuration supplies entity/contact/effective-date values.

- [ ] **Step 5: Run tests and commit**

```bash
node --test tests/commercial-legal.test.js
git add legal lib/commercial/legal.js tests/commercial-legal.test.js
git commit -m "feat: add legal document and launch readiness contract"
```

### Task 2: Add legal acceptance, support and retention schema

**Files:**
- Create: `netlify/database/migrations/005_trust_enterprise.sql`
- Create: `tests/commercial-trust-schema.test.js`

**Interfaces:**
- `legal_acceptances` unique on `(user_id,organization_id,document_type,document_version)`.
- `support_tickets` belongs to organization and optional project/run.
- `audit_events` receives retention/export indexes but remains ordinary-API append-only.
- organization/project retention settings are bounded integer days, not arbitrary SQL expressions.
- `privacy_requests` tracks `EXPORT|DELETE` with status and request/correlation IDs.

- [ ] **Step 1: Write RED schema tests**

Assert tenant FKs, legal version uniqueness, support severity CHECK `SEV1|SEV2|SEV3|SEV4`, privacy action/status constraints, and absence of generic `payload text` columns intended to dump full secrets/request bodies.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-trust-schema.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement the migration**

Use bounded JSON only for sanitized metadata, add indexes for organization/status/created_at, and constrain retention days to a finite supported range such as 1..3650.

- [ ] **Step 4: Run tests and commit**

```bash
node --test tests/commercial-trust-schema.test.js
git add netlify/database/migrations/005_trust_enterprise.sql tests/commercial-trust-schema.test.js
git commit -m "feat: add commercial trust and privacy schema"
```

### Task 3: Implement append-only audit services and redaction

**Files:**
- Create: `lib/commercial/audit.js`
- Create: `tests/commercial-audit.test.js`

**Interfaces:**
- `appendAuditEvent({store,organizationId,actor,action,targetType,targetId,outcome,requestId,metadata})`.
- `listAuditEvents({store,actor,organizationId,cursor,limit})`.
- `exportAuditEvents(...)` requires `auditExport` entitlement.

- [ ] **Step 1: Write RED redaction/tenant tests**

Pass metadata containing keys `authorization`, `cookie`, `apiKey`, `token`, `secret`, `webhookSecret`, nested variants and raw credential-like values; assert they are removed/redacted before store insertion. Prove another organization's actor cannot list/export the events.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-audit.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement finite metadata allowlist/redaction**

Prefer allowlisted metadata fields for known actions. The generic safety layer recursively drops credential-name keys and bounds depth/key count/string length. Ordinary app APIs expose no update/delete audit method.

- [ ] **Step 4: Run and commit**

```bash
node --test tests/commercial-audit.test.js
git add lib/commercial/audit.js tests/commercial-audit.test.js
git commit -m "feat: add redacted tenant audit ledger"
```

### Task 4: Implement private support workflow and truthful response objectives

**Files:**
- Create: `lib/commercial/support.js`
- Create: `tests/commercial-support.test.js`

**Interfaces:**
- `createSupportTicket({store,actor,organizationId,projectId?,runId?,subject,description,severity})`.
- `listSupportTickets(...)` tenant-scoped.
- `updateSupportTicket(...)` only authorized support/admin path.
- Plan support policy returns `community|private|priority|contract` and explicitly labels non-contract response times as objectives.

- [ ] **Step 1: Write RED tests**

Prove Free cannot use private ticket API, Developer can create a private ticket, Team gets priority classification, users cannot self-label routine questions as SEV1 without meeting server validation rules, secrets are redacted, and cross-tenant ticket references are rejected.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-support.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement support service**

SEV1 requires one of the finite server-recognized categories: service-wide paid outage, suspected cross-tenant/security exposure, or broad billing authorization fault. Other tickets are normalized downward unless support staff escalates.

- [ ] **Step 4: Run and commit**

```bash
node --test tests/commercial-support.test.js
git add lib/commercial/support.js tests/commercial-support.test.js
git commit -m "feat: add private commercial support workflow"
```

### Task 5: Implement privacy export/delete orchestration

**Files:**
- Create: `lib/commercial/privacy.js`
- Create: `lib/commercial/retention.js`
- Create: `tests/commercial-privacy.test.js`

**Interfaces:**
- `requestAccountExport({store,actor,requestId})`.
- `buildAccountExport({store,actor})` returns only the principal's permitted personal/org data.
- `requestAccountDeletion({store,actor,confirmation,requestId})`.
- `executeDeletion({store,requestId})` applies deletion/anonymization rules and retains only legally required billing evidence.

- [ ] **Step 1: Write RED privacy tests**

Prove export contains no API-key hashes/provider secrets; user A cannot export user B or unrelated org data; deletion of a final OWNER is blocked until ownership/organization disposition is resolved; repeated deletion request IDs are idempotent; retained billing records are detached/minimized according to explicit rule rather than silently dropping accounting evidence.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-privacy.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement deterministic export/delete packages**

Export JSON includes document version, generatedAt, identity/profile fields, memberships, owned project metadata, report metadata, legal acceptances and support/audit entries the user is entitled to see. Do not export other members' private profile data unnecessarily.

Deletion requires an exact confirmation phrase generated for the current account and a fresh authenticated session signal supplied by the identity adapter.

- [ ] **Step 4: Run and commit**

```bash
node --test tests/commercial-privacy.test.js
git add lib/commercial/privacy.js lib/commercial/retention.js tests/commercial-privacy.test.js
git commit -m "feat: add privacy export and deletion lifecycle"
```

### Task 6: Add truthful public status and commercial readiness projection

**Files:**
- Create: `lib/commercial/status.js`
- Modify: `lib/commercial/readiness.js`
- Modify: `lib/commercial/router.js`
- Modify: `src/commercial/views.js`
- Create: `tests/commercial-status.test.js`

**Interfaces:**
- Public `GET /api/status` returns bounded component state with no secrets.
- `GET /api/readiness/commercial` remains detailed enough for launch automation but hides secret values.
- Status components: `core_api`, `identity`, `database`, `billing`, `webhook`, `compatibility`, `commercial_release`.

- [ ] **Step 1: Write RED tests**

Assert status cannot report `operational` when required dependency check is failing/stale, readiness returns names of missing configuration but never their values, and no static HTML string hard-codes all systems operational.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-status.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement bounded health aggregation**

Each component state derives from a current check timestamp and finite state `operational|degraded|blocked|unknown`. Expired/stale check evidence becomes `unknown`, not green.

- [ ] **Step 4: Expose status/support/legal/privacy routes**

Add management/public routes for legal document display/acceptance, support, account export/delete and public status with the authorization rules from earlier tasks.

- [ ] **Step 5: Run complete plan gate**

```bash
node --test tests/commercial-legal.test.js tests/commercial-privacy.test.js tests/commercial-support.test.js tests/commercial-audit.test.js tests/commercial-status.test.js
npm run check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/commercial/status.js lib/commercial/readiness.js lib/commercial/router.js src/commercial/views.js tests/commercial-status.test.js
git commit -m "feat: expose commercial trust and status surfaces"
```

### Task 7: Publish an honest enterprise/self-hosting contract

**Files:**
- Create: `docs/ENTERPRISE.md`
- Create: `docs/SELF_HOSTING.md`
- Create: `tests/enterprise-contract.test.js`

**Interfaces:**
- Current enterprise-ready foundation: roles, scopes, policies, audit, retention, export, self-hosting configuration boundary.
- Explicitly unavailable unless later implemented/contracted: SAML, SCIM, SOC 2, CMK, regional residency guarantees, contractual uptime.

- [ ] **Step 1: Write RED documentation contract test**

Require both documents to list current controls and explicit unavailable controls. Fail if they contain phrases `SOC 2 certified`, `99.99% uptime`, `SAML included`, or `data residency guaranteed` outside an explicit `not currently provided` statement.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/enterprise-contract.test.js`

Expected: FAIL.

- [ ] **Step 3: Write enterprise/self-hosting docs**

Self-hosting documents required environment-variable classes and interfaces without publishing real secrets. Explain that customer-funded deployment is the path for contractual infrastructure/SLA needs during bootstrap.

- [ ] **Step 4: Run final gate and commit**

```bash
node --test tests/enterprise-contract.test.js
npm run check
git add docs/ENTERPRISE.md docs/SELF_HOSTING.md tests/enterprise-contract.test.js
git commit -m "docs: publish enterprise and self hosting boundaries"
```

## Plan F Completion Gate

Plan F is complete only when live checkout cannot activate with incomplete legal configuration, legal acceptance is versioned, privacy export/delete is tenant-safe and idempotent, support has explicit truthful tiers, audit metadata is secret-redacted, status is evidence-derived rather than hard-coded, enterprise documentation makes no unsupported certification/SLA claim, and the full KATA release gate remains green.
# KATA Commercial Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the provider-neutral commercial identity, tenant, project, credential, and readiness foundation needed for every paid KATA feature.

**Architecture:** Keep the existing KATA semantic/protocol engine unchanged. Add `lib/commercial/*` business modules that accept explicit identity/database adapters, plus thin Netlify adapters isolated under `lib/platform/*`. Commercial HTTP logic uses Web `Request`/`Response` semantics so Vercel/Netlify wrappers cannot become business logic.

**Tech Stack:** Node.js 24 ESM, built-in `node:crypto`, `@netlify/identity`, `@netlify/database`, PostgreSQL migrations, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-10-monetization-ready-control-plane-design.md`

## Global Constraints

- Node.js 24.x remains the release/runtime contract.
- Keep the canonical KATA semantic/tool registry as the single source of truth for HTTP, MCP, WebMCP and model-tool projections.
- Do not weaken existing cancellation, preview binding, origin controls, CSP, Permissions Policy, authentication or explicit-failure semantics.
- Heavy browser/model/API execution remains BYOK, local, customer-CI or customer-funded.
- Commercial authorization never trusts browser plan names, mutable profile metadata or request-supplied user IDs.
- Raw API keys and provider secrets are never persisted or logged.
- Every commercial change follows RED -> GREEN and ends with `npm run check` before merge.

---

## File Structure

- `lib/commercial/errors.js` — typed commercial errors and status mapping.
- `lib/commercial/identity.js` — verified principal abstraction and idempotent account provisioning.
- `lib/commercial/authz.js` — organization/project/role/scope authorization.
- `lib/commercial/store.js` — storage interface used by commercial services.
- `lib/commercial/organizations.js` — organization/member invariants.
- `lib/commercial/projects.js` — projects and environments.
- `lib/commercial/keys.js` — API key issue/verify/revoke primitives.
- `lib/commercial/router.js` — authenticated management API routing using Web Request/Response.
- `lib/commercial/readiness.js` — machine-readable commercial readiness evaluator.
- `lib/platform/netlify-identity.js` — adapter around `@netlify/identity`.
- `lib/platform/netlify-database.js` — adapter around `@netlify/database` and transactions.
- `netlify/database/migrations/001_commercial_foundation.sql` — initial commercial schema.
- `tests/commercial-*.test.js` — unit/contract tests.
- `tests/helpers/commercial-store.js` — deterministic in-memory contract double for business-layer tests only.

### Task 1: Establish provider-neutral commercial interfaces

**Files:**
- Modify: `package.json`
- Create: `lib/commercial/errors.js`
- Create: `lib/commercial/store.js`
- Create: `lib/platform/netlify-identity.js`
- Create: `lib/platform/netlify-database.js`
- Create: `tests/commercial-platform.test.js`

**Interfaces:**
- `CommercialStore.transaction(fn)` runs `fn(tx)` on one database connection.
- `CommercialStore.query(text, params)` returns `{ rows }`.
- `IdentityProvider.getPrincipal(request)` returns `{ type:'user', subject, email } | null`.
- `commercialError(code,status,details?)` returns an error with stable `code` and `status`.

- [ ] **Step 1: Write failing interface tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {commercialError} from '../lib/commercial/errors.js';
import {createIdentityAdapter} from '../lib/platform/netlify-identity.js';

test('commercial errors expose stable public code/status',()=>{
  const error=commercialError('AUTH_REQUIRED',401);
  assert.equal(error.code,'AUTH_REQUIRED');
  assert.equal(error.status,401);
});

test('identity adapter never accepts a request body user id',async()=>{
  const adapter=createIdentityAdapter({getUser:async()=>({id:'verified-user',email:'a@example.com'})});
  const principal=await adapter.getPrincipal(new Request('https://kata.test/api/account',{method:'POST',body:JSON.stringify({userId:'attacker'})}));
  assert.equal(principal.subject,'verified-user');
});
```

- [ ] **Step 2: Run the targeted test and confirm RED**

Run: `node --test tests/commercial-platform.test.js`

Expected: FAIL because the new modules do not exist.

- [ ] **Step 3: Install current Netlify packages with exact versions and commit the lockfile**

Run:

```bash
npm install --save-exact @netlify/identity@latest @netlify/database@latest
```

Do not hand-edit version numbers. `package-lock.json` must be committed so CI/release builds resolve the exact reviewed versions.

- [ ] **Step 4: Implement the small interfaces**

```js
// lib/commercial/errors.js
export function commercialError(code,status=400,details){
  const error=new Error(code);
  error.code=code;
  error.status=status;
  if(details!==undefined) error.details=details;
  return error;
}
```

`createIdentityAdapter({getUser})` must derive `subject` only from the verified provider result. `createNetlifyDatabaseStore({getDatabase})` must use `db.pool.connect()` for `transaction()` so BEGIN/COMMIT/ROLLBACK execute on one connection.

- [ ] **Step 5: Run targeted tests**

Run: `node --test tests/commercial-platform.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/commercial/errors.js lib/commercial/store.js lib/platform/netlify-identity.js lib/platform/netlify-database.js tests/commercial-platform.test.js
git commit -m "feat: add commercial platform interfaces"
```

### Task 2: Create the tenant database schema and invariants

**Files:**
- Create: `netlify/database/migrations/001_commercial_foundation.sql`
- Create: `tests/commercial-schema.test.js`

**Interfaces:**
- UUID/string identifiers are generated server-side.
- Membership uniqueness is `(organization_id,user_id)`.
- Project slug uniqueness is `(organization_id,slug)`.
- Environment name uniqueness is `(project_id,name)`.
- API key material persists only prefix/hash/scope metadata.

- [ ] **Step 1: Write schema contract tests before the migration**

```js
const sql=await readFile('netlify/database/migrations/001_commercial_foundation.sql','utf8');
assert.match(sql,/unique\s*\(organization_id,\s*user_id\)/i);
assert.match(sql,/unique\s*\(organization_id,\s*slug\)/i);
assert.match(sql,/secret_hash/i);
assert.doesNotMatch(sql,/\bsecret\s+text\b/i);
```

Also assert foreign keys exist from memberships/projects/environments/keys to their owning tenant objects and that ordinary objects use `ON DELETE CASCADE` only where deletion semantics in the spec require it.

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test tests/commercial-schema.test.js`

Expected: FAIL because migration `001_commercial_foundation.sql` does not exist.

- [ ] **Step 3: Implement the migration**

Create tables `users`, `organizations`, `organization_members`, `projects`, `project_environments`, `api_keys`, and `audit_events`. Use `timestamptz`, explicit foreign keys, unique constraints above, indexes on organization/project and time-range access, and CHECK constraints for roles `OWNER|ADMIN|MEMBER` and visibility values.

Do not create payment, quota, report or support tables in this migration; those belong to later plans.

- [ ] **Step 4: Run schema tests**

Run: `node --test tests/commercial-schema.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/database/migrations/001_commercial_foundation.sql tests/commercial-schema.test.js
git commit -m "feat: define commercial tenant schema"
```

### Task 3: Implement verified account provisioning and tenant authorization

**Files:**
- Create: `lib/commercial/identity.js`
- Create: `lib/commercial/authz.js`
- Create: `tests/helpers/commercial-store.js`
- Create: `tests/commercial-identity-authz.test.js`

**Interfaces:**
- `provisionAccount({store,principal}) -> { user, personalOrganization }`.
- `requirePrincipal(principal)` rejects null with `AUTH_REQUIRED`/401.
- `requireOrgRole({store,principal,organizationId,allowedRoles})` returns membership or throws 403.
- `requireProjectAccess({store,principal,projectId,allowedRoles})` resolves tenant through the project, never through a request body org ID.

- [ ] **Step 1: Write RED tests for idempotency and cross-tenant denial**

```js
const first=await provisionAccount({store,principal});
const second=await provisionAccount({store,principal});
assert.equal(first.user.id,second.user.id);
assert.equal(first.personalOrganization.id,second.personalOrganization.id);
assert.equal(store.organizations.length,1);

await assert.rejects(
  ()=>requireProjectAccess({store,principal:userA,projectId:projectOwnedByB.id,allowedRoles:['OWNER','ADMIN','MEMBER']}),
  error=>error.code==='FORBIDDEN'
);
```

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/commercial-identity-authz.test.js`

Expected: FAIL because provisioning/authz modules do not exist.

- [ ] **Step 3: Implement provisioning in one transaction**

Provision by verified identity `subject`. Insert/update non-authoritative profile fields, then `INSERT ... ON CONFLICT` the single personal organization and OWNER membership. A retried signup/login event must not create a second personal organization.

- [ ] **Step 4: Implement role checks**

`OWNER` > `ADMIN` > `MEMBER` is not inferred numerically; every operation passes an explicit allowed-role set. Final-owner removal/transfer behavior is delegated to organization service in Task 4.

- [ ] **Step 5: Run tests**

Run: `node --test tests/commercial-identity-authz.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/commercial/identity.js lib/commercial/authz.js tests/helpers/commercial-store.js tests/commercial-identity-authz.test.js
git commit -m "feat: provision commercial identities and enforce tenant access"
```

### Task 4: Implement organizations, memberships, projects and environments

**Files:**
- Create: `lib/commercial/organizations.js`
- Create: `lib/commercial/projects.js`
- Create: `tests/commercial-organizations-projects.test.js`

**Interfaces:**
- `createOrganization({store,actor,name})`.
- `addMember({store,actor,organizationId,userId,role})`.
- `changeMemberRole(...)` and `removeMember(...)` preserve at least one OWNER.
- `createProject({store,actor,organizationId,name,slug,defaultTargetUrl,visibility})`.
- `createEnvironment({store,actor,projectId,name,targetUrl})`.
- `validateTargetUrl(value)` accepts only HTTP(S) and strips credentials.

- [ ] **Step 1: Write tests for owner invariant, slug uniqueness and URL validation**

Include tests that MEMBER cannot invite, ADMIN cannot remove the final OWNER, cross-tenant project mutation is denied, `https://user:pass@example.com` is rejected, and `file:`, `javascript:`, localhost/private-network server-fetch semantics are not silently enabled by project creation.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-organizations-projects.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement service functions with transactional owner checks**

The final-owner check and membership mutation must occur in the same transaction. Project/environment creation validates URLs but does not fetch them.

- [ ] **Step 4: Run tests**

Run: `node --test tests/commercial-organizations-projects.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/commercial/organizations.js lib/commercial/projects.js tests/commercial-organizations-projects.test.js
git commit -m "feat: add commercial organizations and projects"
```

### Task 5: Implement scoped one-time-reveal API keys

**Files:**
- Create: `lib/commercial/keys.js`
- Create: `tests/commercial-keys.test.js`

**Interfaces:**
- `issueApiKey({store,actor,organizationId,projectId,scopes,environment='live'}) -> {key,record}`.
- `verifyApiKey({store,presentedKey,requiredScope}) -> service principal`.
- `revokeApiKey({store,actor,keyId})`.

- [ ] **Step 1: Write RED tests**

Prove generated keys begin `kata_live_` or `kata_test_`, raw key appears only in the issuance result, store records do not contain it, unauthorized scopes are rejected, revoked keys fail immediately, and malformed prefixes fail without performing a broad database scan.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-keys.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement key generation and hashing**

Use `randomBytes(32)` and a server-held `KATA_KEY_PEPPER` with HMAC-SHA256 for lookup/verification. Persist a short non-secret display prefix plus the HMAC digest. Compare digests with `timingSafeEqual` after equal-length validation. Never log the presented key.

- [ ] **Step 4: Run tests**

Run: `node --test tests/commercial-keys.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/commercial/keys.js tests/commercial-keys.test.js
git commit -m "feat: add scoped commercial API keys"
```

### Task 6: Add the management API router and readiness skeleton

**Files:**
- Create: `lib/commercial/router.js`
- Create: `lib/commercial/readiness.js`
- Create: `tests/commercial-router.test.js`
- Create: `tests/commercial-readiness.test.js`

**Interfaces:**
- `createCommercialRouter(deps).handle(request)` returns a Web `Response`.
- Initial routes: `GET /api/account`, `GET|POST /api/organizations`, `GET|POST /api/projects`, `GET|POST /api/keys`, `DELETE /api/keys/:id`, `GET /api/readiness/commercial`.
- `evaluateCommercialReadiness(config)` returns `{status:'ready'|'blocked',checks:[...]}`.

- [ ] **Step 1: Write RED API contract tests**

Use actual `Request` objects. Assert anonymous account access gets 401, authenticated account call provisions once, organization/project objects never accept actor IDs from request JSON, API-key issuance returns raw key once with `Cache-Control: no-store`, and readiness reports missing identity/database/key-pepper config as explicit blockers.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-router.test.js tests/commercial-readiness.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement bounded JSON parsing and error serialization**

Reuse the existing 128 KiB philosophy but implement a Web-Request helper under the commercial router. Reject unsupported methods with 405 + `Allow`, reject bodies above the route limit, return stable `{ok:false,error:{code,message}}`, and add `Cache-Control: no-store` to identity/key responses.

- [ ] **Step 4: Implement readiness without fake green defaults**

Identity, database and key-pepper checks are `blocked` when absent. Billing/legal/support/provider-budget remain `blocked` until later plans install and configure them. The endpoint must clearly distinguish `implemented` from `configured`.

- [ ] **Step 5: Run targeted tests and complete regression gate**

Run:

```bash
node --test tests/commercial-router.test.js tests/commercial-readiness.test.js
npm run check
```

Expected: all targeted tests PASS and existing KATA suite/build/static security checks remain PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/commercial/router.js lib/commercial/readiness.js tests/commercial-router.test.js tests/commercial-readiness.test.js
git commit -m "feat: expose commercial management foundation"
```

## Plan A Completion Gate

Plan A is complete only when the commercial business layer is provider-neutral, account provisioning is idempotent, tenant isolation tests pass, final-owner invariants are transactional, raw API keys are never persisted, the management router is authenticated, readiness fails closed when external configuration is absent, and the complete pre-existing `npm run check` gate remains green.
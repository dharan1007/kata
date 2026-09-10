# KATA Commercial Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the provider-neutral commercial identity, tenant, project, invitation, credential, CSRF, and readiness foundation needed by every paid KATA feature.

**Architecture:** Keep KATA's existing semantic/protocol engine unchanged. Add focused `lib/commercial/*` services that accept explicit identity/database adapters, with Netlify-specific code isolated under `lib/platform/*`. Commercial HTTP business logic uses Web `Request`/`Response`, identity sessions are verified server-side, cookie-authenticated mutations require exact same-origin Origin checks, and API/CI credentials remain separate service principals.

**Tech Stack:** Node.js 24 ESM, built-in `node:crypto`, `@netlify/identity`, `@netlify/database`, PostgreSQL migrations, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-10-monetization-ready-control-plane-design.md`

## Global Constraints

- Node.js 24.x remains the release/runtime contract.
- Keep the canonical KATA semantic/tool registry as the single source of truth for HTTP, MCP, WebMCP and model-tool projections.
- Do not weaken existing cancellation, preview binding, origin controls, CSP, Permissions Policy, authentication or explicit-failure semantics.
- Heavy browser/model/API execution remains BYOK, local, customer-CI or customer-funded.
- Commercial authorization never trusts browser plan names, mutable profile metadata, request-supplied user IDs, or Netlify user metadata roles.
- Raw API keys, invitation tokens and provider secrets are never persisted or logged.
- Browser Identity sessions are cookie-backed; unsafe session-authenticated requests require exact same-origin Origin validation.
- Every commercial change follows RED -> GREEN and ends with `npm run check` before merge.

---

## File Structure

- `lib/commercial/errors.js` — typed commercial errors and status mapping.
- `lib/commercial/store.js` — storage/transaction contract used by services.
- `lib/commercial/identity.js` — verified principal abstraction and idempotent personal-account provisioning.
- `lib/commercial/authz.js` — organization/project/role/scope authorization plus CSRF boundary.
- `lib/commercial/organizations.js` — organizations, owner invariant and invitations.
- `lib/commercial/projects.js` — projects and environments.
- `lib/commercial/keys.js` — one-time-reveal API-key issue/verify/revoke primitives.
- `lib/commercial/router.js` — authenticated management API router.
- `lib/commercial/readiness.js` — machine-readable commercial readiness evaluator.
- `lib/platform/netlify-identity.js` — adapter around current `@netlify/identity` server-side `getUser()` behavior.
- `lib/platform/netlify-database.js` — adapter around `@netlify/database`, including same-connection transactions.
- `netlify/database/migrations/001_commercial_foundation.sql` — initial commercial schema.
- `tests/helpers/commercial-store.js` — deterministic test store implementing the same service contract.
- `tests/commercial-*.test.js` — unit and HTTP contract coverage.

### Task 1: Establish provider-neutral platform interfaces

**Files:**
- Modify: `package.json`
- Create: `lib/commercial/errors.js`
- Create: `lib/commercial/store.js`
- Create: `lib/platform/netlify-identity.js`
- Create: `lib/platform/netlify-database.js`
- Create: `tests/commercial-platform.test.js`

**Interfaces:**
- `CommercialStore.query(text, params)` returns `{rows}`.
- `CommercialStore.transaction(fn)` runs `fn(tx)` using one database connection.
- `IdentityProvider.getPrincipal()` returns `{type:'user',subject,email,authn:'identity-session'} | null`.
- `commercialError(code,status,details?)` creates stable public error metadata.

- [ ] **Step 1: Write failing platform tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {commercialError} from '../lib/commercial/errors.js';
import {createNetlifyIdentityAdapter} from '../lib/platform/netlify-identity.js';

test('commercial errors expose stable code and status',()=>{
  const error=commercialError('AUTH_REQUIRED',401);
  assert.equal(error.code,'AUTH_REQUIRED');
  assert.equal(error.status,401);
});

test('identity subject comes only from verified provider result',async()=>{
  const adapter=createNetlifyIdentityAdapter({getUser:async()=>({id:'verified-user',email:'a@example.com'})});
  const principal=await adapter.getPrincipal();
  assert.deepEqual(principal,{type:'user',subject:'verified-user',email:'a@example.com',authn:'identity-session'});
});
```

- [ ] **Step 2: Run targeted test and confirm RED**

Run: `node --test tests/commercial-platform.test.js`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Install current provider packages with exact lockfile versions**

Run:

```bash
npm install --save-exact @netlify/identity @netlify/database
```

Commit the generated/updated `package-lock.json`; never rely on an unpinned production install.

- [ ] **Step 4: Implement the interfaces**

```js
export function commercialError(code,status=400,details){
  const error=new Error(code);
  error.code=code;
  error.status=status;
  if(details!==undefined) error.details=details;
  return error;
}
```

`createNetlifyIdentityAdapter` must call the runtime-aware `getUser()` from `@netlify/identity`; it does not trust request JSON, query parameters or user metadata for tenant authorization. `createNetlifyDatabaseStore` uses `getDatabase().pool.connect()` for transactions and always releases the client after COMMIT/ROLLBACK.

- [ ] **Step 5: Run targeted tests**

Run: `node --test tests/commercial-platform.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/commercial/errors.js lib/commercial/store.js lib/platform/netlify-identity.js lib/platform/netlify-database.js tests/commercial-platform.test.js
git commit -m "feat: add commercial platform interfaces"
```

### Task 2: Create tenant schema and relational invariants

**Files:**
- Create: `netlify/database/migrations/001_commercial_foundation.sql`
- Create: `tests/commercial-schema.test.js`

**Interfaces:**
- Membership uniqueness: `(organization_id,user_id)`.
- Invitation lookup uses a digest; raw invitation token never persists.
- Project slug uniqueness: `(organization_id,slug)`.
- Environment name uniqueness: `(project_id,name)`.
- API-key persistence contains prefix/hash/scopes but not raw key material.

- [ ] **Step 1: Write RED migration contract tests**

```js
const sql=await readFile('netlify/database/migrations/001_commercial_foundation.sql','utf8');
assert.match(sql,/unique\s*\(organization_id,\s*user_id\)/i);
assert.match(sql,/organization_invitations/i);
assert.match(sql,/token_hash/i);
assert.match(sql,/unique\s*\(organization_id,\s*slug\)/i);
assert.match(sql,/secret_hash/i);
assert.doesNotMatch(sql,/\braw_secret\b|\braw_token\b/i);
```

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-schema.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement migration**

Create `users`, `organizations`, `organization_members`, `organization_invitations`, `projects`, `project_environments`, `api_keys`, and `audit_events`. Use explicit foreign keys, `timestamptz`, required tenant indexes, and CHECK constraints for `OWNER|ADMIN|MEMBER`. Invitation rows contain normalized email, role, `token_hash`, expiry, created/accepted/revoked timestamps and creator ID.

- [ ] **Step 4: Run schema tests and commit**

```bash
node --test tests/commercial-schema.test.js
git add netlify/database/migrations/001_commercial_foundation.sql tests/commercial-schema.test.js
git commit -m "feat: define commercial tenant schema"
```

### Task 3: Implement identity provisioning and tenant authorization

**Files:**
- Create: `lib/commercial/identity.js`
- Create: `lib/commercial/authz.js`
- Create: `tests/helpers/commercial-store.js`
- Create: `tests/commercial-identity-authz.test.js`

**Interfaces:**
- `provisionAccount({store,principal}) -> {user,personalOrganization}`.
- `requirePrincipal(principal)`.
- `requireOrgRole({store,principal,organizationId,allowedRoles})`.
- `requireProjectAccess({store,principal,projectId,allowedRoles})`.
- `requireSafeSessionMutation({request,principal,expectedOrigin})`.

- [ ] **Step 1: Write RED idempotency and isolation tests**

```js
const first=await provisionAccount({store,principal});
const second=await provisionAccount({store,principal});
assert.equal(first.personalOrganization.id,second.personalOrganization.id);
assert.equal(store.organizations.length,1);
await assert.rejects(
  ()=>requireProjectAccess({store,principal:userA,projectId:projectOwnedByB.id,allowedRoles:['OWNER','ADMIN','MEMBER']}),
  error=>error.code==='FORBIDDEN'
);
```

Also assert user metadata such as `{roles:['OWNER'],plan:'team'}` cannot grant KATA tenant permissions.

- [ ] **Step 2: Write RED CSRF tests**

For a principal with `authn:'identity-session'`, POST/PUT/PATCH/DELETE with a missing Origin or a cross-origin Origin must fail 403. Exact same-origin unsafe requests pass. `GET` remains safe. A valid `authn:'api-key'` or `authn:'ci-token'` service principal is not rejected solely because it lacks browser Origin.

- [ ] **Step 3: Confirm RED**

Run: `node --test tests/commercial-identity-authz.test.js`

Expected: FAIL.

- [ ] **Step 4: Implement provisioning and authorization**

Provision the user, one personal organization and OWNER membership inside one transaction using verified identity `subject`. Role checks use explicit allowed-role sets. Project authorization resolves organization from the stored project instead of trusting body/query organization IDs.

`requireSafeSessionMutation` parses the request URL and compares its exact origin with the `Origin` header for cookie-authenticated unsafe methods. No wildcard, suffix or substring matching is allowed.

- [ ] **Step 5: Run tests and commit**

```bash
node --test tests/commercial-identity-authz.test.js
git add lib/commercial/identity.js lib/commercial/authz.js tests/helpers/commercial-store.js tests/commercial-identity-authz.test.js
git commit -m "feat: provision identities and enforce tenant boundaries"
```

### Task 4: Implement organizations, secure invitations, projects and environments

**Files:**
- Create: `lib/commercial/organizations.js`
- Create: `lib/commercial/projects.js`
- Create: `tests/commercial-organizations-projects.test.js`

**Interfaces:**
- `createOrganization({store,actor,name})`.
- `createInvitation({store,actor,organizationId,email,role,expiresInSeconds}) -> {invitation,token}`.
- `acceptInvitation({store,principal,token})`.
- `revokeInvitation({store,actor,invitationId})`.
- `changeMemberRole(...)` and `removeMember(...)` preserve at least one OWNER.
- `createProject({store,actor,organizationId,name,slug,defaultTargetUrl,visibility})`.
- `createEnvironment({store,actor,projectId,name,targetUrl})`.

- [ ] **Step 1: Write RED owner/invitation/project tests**

Prove MEMBER cannot invite, invitation tokens are returned once and only digests persist, invitation acceptance requires verified principal email to equal normalized invitation email, expired/revoked/used tokens fail, ADMIN cannot remove the final OWNER, duplicate project slugs fail within one org, cross-tenant mutation is denied, and credential-bearing/non-HTTP(S) target URLs are rejected.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-organizations-projects.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement invitation and owner transactions**

Use `randomBytes(32)` invitation tokens and HMAC-SHA256 with `KATA_KEY_PEPPER` for token lookup. Acceptance, membership insertion and invitation consumption occur in one transaction. Final-owner validation and owner mutation occur under the same transaction/lock.

- [ ] **Step 4: Implement project/environment services without fetching targets**

`validateTargetUrl` accepts legitimate HTTP(S), rejects embedded credentials and unsupported schemes, and records the target only. Server-side arbitrary crawling is not introduced.

- [ ] **Step 5: Run and commit**

```bash
node --test tests/commercial-organizations-projects.test.js
git add lib/commercial/organizations.js lib/commercial/projects.js tests/commercial-organizations-projects.test.js
git commit -m "feat: add organizations invitations and projects"
```

### Task 5: Implement scoped one-time-reveal API keys

**Files:**
- Create: `lib/commercial/keys.js`
- Create: `tests/commercial-keys.test.js`

**Interfaces:**
- `issueApiKey({store,actor,organizationId,projectId,scopes,environment='live'}) -> {key,record}`.
- `verifyApiKey({store,presentedKey,requiredScope}) -> servicePrincipal`.
- `revokeApiKey({store,actor,keyId})`.

- [ ] **Step 1: Write RED key tests**

Prove keys begin `kata_live_`/`kata_test_`, raw key appears only in issuance result, store records omit it, requested scopes cannot exceed actor/plan authority, revoked keys fail immediately, and malformed prefixes fail without a broad database scan.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-keys.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement generation and verification**

Use `randomBytes(32)`, server-held `KATA_KEY_PEPPER`, HMAC-SHA256 lookup digest and `timingSafeEqual` after equal-length validation. Return service principals as `{type:'service',authn:'api-key',organizationId,projectId,scopes,keyId}`.

- [ ] **Step 4: Run and commit**

```bash
node --test tests/commercial-keys.test.js
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
- `createCommercialRouter(deps).handle(request) -> Response`.
- Initial routes: `GET /api/account`, `GET|POST /api/organizations`, `POST /api/organizations/:orgId/invitations`, `POST /api/invitations/accept`, `GET|POST /api/projects`, `GET|POST /api/keys`, `DELETE /api/keys/:id`, `GET /api/readiness/commercial`.
- `evaluateCommercialReadiness(config) -> {status:'ready'|'blocked',checks:[...]}`.

- [ ] **Step 1: Write RED HTTP contract tests**

Use real Web `Request` objects. Assert anonymous account access gets 401; account provisioning is idempotent; actor/user IDs in request JSON are ignored/rejected; session-authenticated unsafe cross-origin requests fail 403; service-principal requests use scopes instead of browser CSRF logic; key/invitation issuance returns `Cache-Control: no-store`; and readiness reports missing identity/database/key-pepper configuration explicitly.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-router.test.js tests/commercial-readiness.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement bounded request/error handling**

Use route-specific bounded body reads. Unsupported methods return 405 + `Allow`; error bodies are stable `{ok:false,error:{code,message}}`; identity/key/invitation responses are non-cacheable; mutating cookie-session routes call `requireSafeSessionMutation` before business logic.

- [ ] **Step 4: Implement readiness with no fake green state**

Identity, database and key-pepper are `blocked` when absent. Billing, legal, support, provider-budget, migration and release-governance checks remain blocked until later plans provide them. The endpoint distinguishes `implemented` from `configured` and never exposes secret values.

- [ ] **Step 5: Run complete Plan A gate**

```bash
node --test tests/commercial-platform.test.js tests/commercial-schema.test.js tests/commercial-identity-authz.test.js tests/commercial-organizations-projects.test.js tests/commercial-keys.test.js tests/commercial-router.test.js tests/commercial-readiness.test.js
npm run check
```

Expected: all new tests PASS and the existing KATA test/build/static-security gate remains PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/commercial/router.js lib/commercial/readiness.js tests/commercial-router.test.js tests/commercial-readiness.test.js
git commit -m "feat: expose commercial management foundation"
```

## Plan A Completion Gate

Plan A is complete only when verified Identity subjects provision exactly one personal tenant, cookie-session mutations are CSRF-protected, cross-tenant access is denied, team invitation tokens and API keys are one-time reveal and hash-only at rest, final-owner invariants are transactional, project creation does not become a generic URL-fetch primitive, readiness fails closed when external configuration is absent, and the complete existing `npm run check` gate remains green.
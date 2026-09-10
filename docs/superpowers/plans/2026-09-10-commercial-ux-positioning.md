# KATA Commercial UX, Positioning and Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition KATA as an agent interoperability product and provide a complete self-service commercial UI from signup through first compatibility result, project/CI setup, plan selection and account administration.

**Architecture:** Preserve KATA's lightweight static ESM application rather than replacing it with a framework. New commercial views live under `src/commercial/`; browser Identity uses Netlify's current cookie-backed `@netlify/identity` flows, while management API calls use same-origin cookies and server-side CSRF checks. Because the existing build only copies ESM files and bare package imports cannot run directly in-browser, the browser entry is bundled at build time while extension/runtime source modules remain separately integrity-bound.

**Tech Stack:** Browser ESM bundled with pinned `esbuild`, `@netlify/identity`, existing CSS/build pipeline, Web Fetch API, `node:test` contract tests.

**Spec:** `docs/superpowers/specs/2026-09-10-monetization-ready-control-plane-design.md`

## Global Constraints

- The UI never grants authorization or paid capability; it renders server-returned state only.
- Identity session cookies are sent only same-origin; client code does not invent/export bearer tokens from Identity state.
- No raw API/CI/invitation secret is stored in localStorage/sessionStorage after one-time reveal/acceptance.
- Mutating cookie-authenticated calls include exact same-origin Origin naturally through browser fetch and are rejected server-side if origin evidence is missing/mismatched.
- The primary workflow is target/evidence/extension/CLI integration, not raw HTML/CSS/JS paste boxes.
- Research/OpenAlex remains available but secondary to interoperability positioning.
- Do not claim SSO, SOC 2, uptime SLA, hosted browser automation or certification before those are actually available.
- Existing CSP and first-party script discipline remain intact; no CDN runtime script dependency is introduced.

---

## File Structure

- `src/commercial/api.js` — same-origin management API client using Identity cookies.
- `src/commercial/auth.js` — current Netlify Identity signup/login/logout/OAuth/confirmation/recovery callback lifecycle.
- `src/commercial/state.js` — in-memory commercial session/project state with no secret persistence.
- `src/commercial/views.js` — account/project/run/team/usage/billing/audit/support views.
- `src/commercial/onboarding.js` — first-run state machine.
- `src/commercial/pricing.js` — display mapper for server `/api/pricing` contract.
- Modify `src/app.js` — route integration and interoperability-first landing page.
- Modify `index.html` — load bundled `src/main.js` output only.
- Modify `style.css` — commercial layout/forms/status/report styling.
- Modify `scripts/build.mjs` — bundle browser app and integrity-bind output.
- Modify `package.json`/`package-lock.json` — exact `esbuild` dev dependency.
- Modify `README.md`, `llms.txt`, `ROADMAP.md`, `SUPPORT.md` — consistent product category and launch claims.
- Tests: `tests/commercial-ui-auth.test.js`, `tests/commercial-onboarding.test.js`, `tests/commercial-ui-management.test.js`, `tests/commercial-ui-pricing.test.js`, `tests/positioning.test.js`, `tests/commercial-docs.test.js`, `tests/browser-bundle.test.js`.

### Task 1: Add the cookie-session browser auth and management API client

**Files:**
- Create: `src/commercial/api.js`
- Create: `src/commercial/auth.js`
- Create: `tests/commercial-ui-auth.test.js`

**Interfaces:**
- `createCommercialApi({fetchImpl,baseUrl})` with `.request(path,{method,body,signal})`.
- `createCommercialAuth(identity)` exposes `initialize`, `signup`, `login`, `logout`, `oauthLogin`, `requestPasswordRecovery`, `setRecoveredPassword`, `getUser`, `getSettings`.

- [ ] **Step 1: Write RED client/security tests**

Prove the management client rejects absolute cross-origin URLs, uses `credentials:'same-origin'`, uses `redirect:'manual'`, respects AbortSignal, bounds JSON responses, and never persists/copies Identity session tokens into local/session storage or an Authorization header.

- [ ] **Step 2: Write RED Identity lifecycle tests**

Inject a fake module exposing `signup`, `login`, `logout`, `oauthLogin`, `handleAuthCallback`, `requestPasswordRecovery`, `updateUser`, `getUser`, `getSettings`. Assert `initialize()` calls `handleAuthCallback()` exactly once, a `recovery` callback enters password-reset state, `setRecoveredPassword(password)` calls `updateUser({password})`, and OAuth buttons are rendered only from `getSettings()` provider configuration.

- [ ] **Step 3: Confirm RED**

Run: `node --test tests/commercial-ui-auth.test.js`

Expected: FAIL.

- [ ] **Step 4: Implement same-origin cookie API requests**

Normalize requested paths with `new URL(path,baseUrl)` and require exact origin equality. Use `credentials:'same-origin'`; do not manually construct a session Authorization header. Only service/CI clients use API credentials outside this browser module.

- [ ] **Step 5: Implement current Identity flows**

Use `@netlify/identity` `signup`, `login`, `logout`, `oauthLogin`, `handleAuthCallback`, `requestPasswordRecovery`, `updateUser`, `getUser`, and `getSettings`. Callback handling covers OAuth, email confirmation and recovery; recovery sets the new password through `updateUser({password})` after the callback-authenticated session is established.

- [ ] **Step 6: Run tests and commit**

```bash
node --test tests/commercial-ui-auth.test.js
git add src/commercial/api.js src/commercial/auth.js tests/commercial-ui-auth.test.js
git commit -m "feat: add commercial browser identity client"
```

### Task 2: Build deterministic onboarding including team-invitation continuation

**Files:**
- Create: `src/commercial/onboarding.js`
- Create: `tests/commercial-onboarding.test.js`

**Interfaces:**
- Stages: `ACCOUNT`, `INVITATION`, `PROJECT`, `TARGET`, `COLLECT`, `RESULT`, `OPTIONAL_CI`.
- `nextOnboardingStep({account,pendingInvitation,projects,runs,entitlements})`.
- Target kinds: `website`, `api`, `mcp`, `authenticated-browser-app`.

- [ ] **Step 1: Write RED stage tests**

Prove an unauthenticated invitation link preserves only the non-sensitive invitation token in memory/URL until successful authentication; after login it calls the server acceptance route; new accounts with no project go to PROJECT; authenticated browser apps direct to extension/CLI rather than hosted crawling; completed first run goes to RESULT; CI setup appears only when server entitlement has `ciTokens:true`.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-onboarding.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement pure stage derivation**

Do not store a drifting `completedOnboarding` boolean. Derive the stage from authoritative account/project/run state and the current invitation continuation.

- [ ] **Step 4: Run tests and commit**

```bash
node --test tests/commercial-onboarding.test.js
git add src/commercial/onboarding.js tests/commercial-onboarding.test.js
git commit -m "feat: derive commercial onboarding from real state"
```

### Task 3: Reposition the landing page and product navigation

**Files:**
- Modify: `src/app.js`
- Create: `tests/positioning.test.js`

**Interfaces:**
- Primary headline: `Make your software work reliably with AI agents.`
- Primary CTA: `Test your application`.
- Public concepts: Compatibility, MCP/WebMCP/OpenAPI, CI, Developers, Pricing, Enterprise.
- Research remains available as a real reference/product capability.

- [ ] **Step 1: Write RED copy/navigation tests**

Assert the new headline/CTA/routes exist and forbid primary claims such as `AI research platform`, `unattended cloud scheduler`, `SOC 2 certified` and numeric uptime SLA.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/positioning.test.js`

Expected: FAIL against the current workflow/research-first landing.

- [ ] **Step 3: Implement landing hierarchy and routes**

Explain KATA in one paragraph as compatibility/diagnosis/enforcement across MCP, WebMCP, OpenAPI, browser constraints and model tool runtimes. Add `/pricing`, `/enterprise`, `/projects`, `/runs`, `/ci`, `/keys`, `/team`, `/usage`, `/billing`, `/audit`, `/support`, `/account`; keep `/research`, `/automations`, `/teach`, `/developers` functional.

- [ ] **Step 4: Run tests and commit**

```bash
node --test tests/positioning.test.js
git add src/app.js tests/positioning.test.js
git commit -m "feat: reposition KATA around agent interoperability"
```

### Task 4: Build management views with one-time secret handling

**Files:**
- Create: `src/commercial/state.js`
- Create: `src/commercial/views.js`
- Modify: `src/app.js`
- Modify: `style.css`
- Create: `tests/commercial-ui-management.test.js`

**Interfaces:**
- Views: Overview, Projects, Runs, Reports, CI, API Keys, Team, Usage, Billing, Audit, Support, Account.
- `renderFinding(finding)` displays severity, layer, evidence summary, possibility, blocked reason, compliant path, remediation and confidence.

- [ ] **Step 1: Write RED view tests**

Assert a BLOCKED finding renders as useful diagnosis; paid controls are based only on server entitlement state; API/CI key creation shows the full secret only in the immediate success surface; rerender from application state cannot reproduce it; secret values never enter KATA's existing `localStorage` workspace.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-ui-management.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement focused render/event functions**

Reuse safe text escaping; do not inject finding evidence as raw HTML. Mutations call commercial API and refresh authoritative state. Invitation create/accept and member management use the same one-time/role boundaries from Plan A.

- [ ] **Step 4: Implement one-time secret lifecycle**

Hold returned raw credentials only in a lexical variable and rendered modal node. Closing/navigating overwrites/removes the node and clears the reference; there is no copy in persisted app state.

- [ ] **Step 5: Run and commit**

```bash
node --test tests/commercial-ui-management.test.js
git add src/commercial/state.js src/commercial/views.js src/app.js style.css tests/commercial-ui-management.test.js
git commit -m "feat: add commercial project and account console"
```

### Task 5: Add server-derived pricing and safe checkout UX

**Files:**
- Create: `src/commercial/pricing.js`
- Modify: `src/commercial/views.js`
- Create: `tests/commercial-ui-pricing.test.js`

**Interfaces:**
- Pricing loads `GET /api/pricing` and does not hard-code authorization.
- Expected display: Free ₹0, Developer ₹999/month, Team ₹4,999/month, Enterprise contract/self-hosted.

- [ ] **Step 1: Write RED pricing tests**

Assert display values come from server response, billing CTA calls `/api/billing/checkout`, changing DOM/localStorage plan labels cannot change API authorization, and unavailable Enterprise capabilities remain explicitly unavailable/contact-sales.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-ui-pricing.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement pricing/checkout rendering**

After provider return, show `Verifying payment…`; refresh server subscription state through a bounded verification sequence and never locally set `ACTIVE`. Server reconciled subscription state determines displayed paid plan.

- [ ] **Step 4: Run and commit**

```bash
node --test tests/commercial-ui-pricing.test.js
git add src/commercial/pricing.js src/commercial/views.js tests/commercial-ui-pricing.test.js
git commit -m "feat: add safe commercial pricing and upgrade UX"
```

### Task 6: Bundle the browser application and preserve integrity/CSP

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/build.mjs`
- Modify: `index.html`
- Create: `tests/browser-bundle.test.js`

**Interfaces:**
- Browser entry remains `/src/main.js` in `dist`, but is a bundled first-party artifact containing its npm browser dependencies.
- Extension/runtime source assets remain emitted separately as required by the extension packaging path.

- [ ] **Step 1: Write RED build tests**

Run build and assert `dist/src/main.js` contains no unresolved bare import for `@netlify/identity`, `index.html` references only first-party script assets, integrity manifest hashes the actual bundled bytes, and current extension module outputs still exist.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/browser-bundle.test.js`

Expected: FAIL because the current builder only copies source modules.

- [ ] **Step 3: Install a pinned build-only bundler**

Run:

```bash
npm install --save-dev --save-exact esbuild
```

Commit the lockfile. No external CDN/import-map runtime dependency is permitted.

- [ ] **Step 4: Update build pipeline**

Use esbuild programmatically from `scripts/build.mjs` to bundle `src/main.js` for the website with `platform:'browser'`, `format:'esm'`, `bundle:true`, `minify:false`. Hash the emitted bundle bytes into `integrity.json`. Continue copying the unbundled source modules needed by extension packaging.

- [ ] **Step 5: Run build/static tests and commit**

```bash
node --test tests/browser-bundle.test.js
npm run build
npm run static-check
git add package.json package-lock.json scripts/build.mjs index.html tests/browser-bundle.test.js
git commit -m "build: bundle commercial browser dependencies"
```

### Task 7: Align public documentation with actual commercial state

**Files:**
- Modify: `README.md`
- Modify: `llms.txt`
- Modify: `ROADMAP.md`
- Modify: `SUPPORT.md`
- Create: `tests/commercial-docs.test.js`

**Interfaces:**
- Docs consistently describe KATA as agent interoperability/compatibility infrastructure.
- OpenAlex is described as a real reference connector, not the product category.

- [ ] **Step 1: Write RED docs tests**

Require interoperability positioning and Free/Developer/Team/Enterprise boundaries; forbid claims of live paid SLA, fully configured production billing, hosted browser farm, SSO or certification unless later readiness/configuration makes those statements true.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-docs.test.js`

Expected: FAIL.

- [ ] **Step 3: Update docs and support expectations**

Document BYOK/customer-run execution, safe restriction handling, `/api/readiness/commercial`, current support tiers, and accurate rollout state.

- [ ] **Step 4: Run complete Plan E gate**

```bash
node --test tests/commercial-ui-auth.test.js tests/commercial-onboarding.test.js tests/positioning.test.js tests/commercial-ui-management.test.js tests/commercial-ui-pricing.test.js tests/browser-bundle.test.js tests/commercial-docs.test.js
npm run check
```

Expected: PASS; the integrity asset count changes deterministically to reflect bundled/new artifacts.

- [ ] **Step 5: Commit**

```bash
git add README.md llms.txt ROADMAP.md SUPPORT.md tests/commercial-docs.test.js
git commit -m "docs: align KATA commercial product surfaces"
```

## Plan E Completion Gate

Plan E is complete only when a stranger can understand KATA as an agent interoperability product, current Netlify Identity confirmation/OAuth/recovery flows work, management requests use same-origin cookie sessions without exporting tokens, onboarding/project/run/report/CI/billing/account navigation is self-service, raw secrets remain one-time reveal, the browser bundle contains no unresolved package imports or external runtime script dependency, research remains functional but secondary, documentation matches reality, and the full KATA gate remains green.
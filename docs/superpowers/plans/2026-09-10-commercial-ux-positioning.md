# KATA Commercial UX, Positioning and Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition KATA as an agent interoperability product and provide a complete self-service commercial UI from signup through first compatibility result, project/CI setup, plan selection and account administration.

**Architecture:** Preserve the current lightweight static ESM application instead of replacing it with a framework. Split new commercial UI into focused modules under `src/commercial/`, use the management API as the source of truth, and keep the existing research/workflow UI available as a real reference capability rather than the category-defining landing experience.

**Tech Stack:** Browser ESM, `@netlify/identity`, existing CSS/build pipeline, Web Fetch API, `node:test` static/browser-contract tests.

**Spec:** `docs/superpowers/specs/2026-09-10-monetization-ready-control-plane-design.md`

## Global Constraints

- The UI never grants authorization or paid capability; it only renders server-returned state.
- No raw API key is stored in localStorage/sessionStorage after its one-time reveal flow.
- The primary workflow is real target/evidence/extension/CLI integration, not raw HTML/CSS/JS paste boxes.
- Research/OpenAlex remains available but is secondary to interoperability positioning.
- Do not claim SSO, SOC 2, uptime SLA, hosted browser automation or certification before those are actually available.
- Existing CSP and first-party script discipline remain intact.

---

## File Structure

- `src/commercial/api.js` — authenticated management API client.
- `src/commercial/auth.js` — Netlify Identity browser lifecycle/callback handling.
- `src/commercial/state.js` — in-memory commercial session/project state with no secret persistence.
- `src/commercial/views.js` — commercial account/project/run/team/billing views.
- `src/commercial/onboarding.js` — first-run state machine.
- `src/commercial/pricing.js` — render-only pricing metadata mirrored from public server pricing contract.
- Modify `src/app.js` — route integration and repositioned landing page.
- Modify `style.css` — commercial layout/forms/status/report styling only.
- Modify `scripts/build.mjs` — include new browser modules.
- Modify `README.md`, `llms.txt`, `ROADMAP.md`, `SUPPORT.md` — consistent product category and links.
- Tests: `tests/commercial-ui-*.test.js`, `tests/positioning.test.js`.

### Task 1: Add a safe authenticated browser API client

**Files:**
- Create: `src/commercial/api.js`
- Create: `src/commercial/auth.js`
- Create: `tests/commercial-ui-auth.test.js`

**Interfaces:**
- `createCommercialApi({getAccessToken,fetchImpl,baseUrl=''})`.
- `.request(path,{method,body,signal})` attaches verified session bearer only to same-origin management calls.
- `createCommercialAuth({identity})` exposes `initialize`, `signup`, `login`, `oauthLogin`, `logout`, `recover`, `getUser`.

- [ ] **Step 1: Write RED auth/client tests**

Prove the API client rejects absolute cross-origin management URLs, never follows redirects with authorization to another origin, respects AbortSignal, bounds response JSON, and does not log/return access tokens in error objects.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-ui-auth.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement the current Netlify Identity browser API**

Use `@netlify/identity` functions `signup`, `login`, `getUser`, `logout`, `oauthLogin`, `handleAuthCallback` through an injected adapter. `initialize()` must call callback handling once on page load so email confirmation/recovery/OAuth callbacks complete.

- [ ] **Step 4: Implement same-origin commercial API requests**

Normalize with `new URL(path,location.origin)` and require `url.origin===location.origin`. Use `redirect:'manual'`, `Cache-Control` semantics from server, and bearer credentials only for KATA's own commercial endpoint.

- [ ] **Step 5: Run tests and commit**

```bash
node --test tests/commercial-ui-auth.test.js
git add src/commercial/api.js src/commercial/auth.js tests/commercial-ui-auth.test.js
git commit -m "feat: add commercial browser identity client"
```

### Task 2: Build first-run onboarding as a deterministic state machine

**Files:**
- Create: `src/commercial/onboarding.js`
- Create: `tests/commercial-onboarding.test.js`

**Interfaces:**
- Stages: `ACCOUNT`, `PROJECT`, `TARGET`, `COLLECT`, `RESULT`, `OPTIONAL_CI`.
- `nextOnboardingStep({account,projects,runs,entitlements})` returns exactly one stage.
- Target kinds: `website`, `api`, `mcp`, `authenticated-browser-app`.

- [ ] **Step 1: Write RED stage tests**

Prove a new account with no project goes to PROJECT, a project with no environment/target goes to TARGET, authenticated-browser-app directs to extension/CLI collection rather than server fetch, completed first run goes to RESULT, and CI setup appears only when `ciTokens` entitlement is true.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-onboarding.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement pure state transition logic**

Do not persist an arbitrary `completedOnboarding` boolean that can drift from reality. Derive stage from authoritative account/project/run state.

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
- Public top-level concepts: Compatibility, MCP/WebMCP/OpenAPI, CI, Developers, Pricing, Enterprise.
- Research remains discoverable as an example/product capability.

- [ ] **Step 1: Write RED copy/navigation tests**

Read `src/app.js` and assert the new primary headline/CTA/routes exist, while tests forbid primary-category claims such as `AI research platform`, `unattended cloud scheduler`, `SOC 2 certified`, or numeric uptime SLA.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/positioning.test.js`

Expected: FAIL against current research/workflow-first landing.

- [ ] **Step 3: Implement the new landing hierarchy**

Hero explains KATA in one paragraph: test/diagnose/enforce interoperability across MCP, WebMCP, OpenAPI, browsers and model tool runtimes. Secondary sections show evidence/report semantics, safe restriction handling, customer-run CI and supported core protocols.

- [ ] **Step 4: Add routes**

Add `/pricing`, `/enterprise`, `/projects`, `/runs`, `/ci`, `/keys`, `/team`, `/usage`, `/billing`, `/audit`, `/support`, `/account`. Existing `/research`, `/automations`, `/teach`, `/developers` stay functional.

- [ ] **Step 5: Run tests and commit**

```bash
node --test tests/positioning.test.js
git add src/app.js tests/positioning.test.js
git commit -m "feat: reposition KATA around agent interoperability"
```

### Task 4: Build project/run/report/CI/account management views

**Files:**
- Create: `src/commercial/state.js`
- Create: `src/commercial/views.js`
- Modify: `src/app.js`
- Modify: `style.css`
- Create: `tests/commercial-ui-management.test.js`

**Interfaces:**
- Views render Overview, Projects, Runs, Reports, CI, API Keys, Team, Usage, Billing, Audit, Support, Account.
- `renderFinding(finding)` must show severity, layer, evidence summary, technical possibility, blocked reason, compliant path, remediation and confidence.

- [ ] **Step 1: Write RED view tests**

Use small fixture states and assert Free hides/disables paid actions based only on server entitlement object; a BLOCKED finding renders as valuable diagnosis rather than generic failure; API-key creation displays full key only in the immediate success modal; rerender from stored state cannot reproduce the secret.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-ui-management.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement focused rendering functions**

Keep HTML escaping through the existing `esc` approach; do not inject finding evidence as raw HTML. All mutating controls call the commercial API and then refresh authoritative state.

- [ ] **Step 4: Implement one-time secret reveal behavior**

Hold the returned raw API/CI key only in a local function variable/modal DOM node. On modal close/navigation, clear the variable and replace DOM content; never call the existing browser workspace persistence with the key.

- [ ] **Step 5: Run and commit**

```bash
node --test tests/commercial-ui-management.test.js
git add src/commercial/state.js src/commercial/views.js src/app.js style.css tests/commercial-ui-management.test.js
git commit -m "feat: add commercial project and account console"
```

### Task 5: Add pricing and upgrade UX without client-side authority

**Files:**
- Create: `src/commercial/pricing.js`
- Modify: `src/commercial/views.js`
- Create: `tests/commercial-ui-pricing.test.js`

**Interfaces:**
- Free: ₹0.
- Developer: ₹999/month.
- Team: ₹4,999/month.
- Enterprise: contact/contract, customer-funded/self-hosted capability.

- [ ] **Step 1: Write RED tests**

Assert pricing values/features render, unavailable Enterprise features are labelled not included/contact sales, billing CTA invokes `/api/billing/checkout`, and DOM/localStorage manipulation of visible plan labels cannot alter API authorization fixture outcomes.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-ui-pricing.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement pricing display and checkout transition**

After checkout provider redirect/callback, display `Verifying payment…` and poll only through explicit user navigation/refresh or a bounded short verification sequence; never locally set `ACTIVE`. The server subscription endpoint determines the displayed plan.

- [ ] **Step 4: Run and commit**

```bash
node --test tests/commercial-ui-pricing.test.js
git add src/commercial/pricing.js src/commercial/views.js tests/commercial-ui-pricing.test.js
git commit -m "feat: add safe commercial pricing and upgrade UX"
```

### Task 6: Align browser build and public documentation

**Files:**
- Modify: `scripts/build.mjs`
- Modify: `README.md`
- Modify: `llms.txt`
- Modify: `ROADMAP.md`
- Modify: `SUPPORT.md`
- Create: `tests/commercial-docs.test.js`

**Interfaces:**
- Browser build emits every imported `src/commercial/*.js` asset and integrity-binds them.
- Public docs consistently position KATA as agent interoperability/compatibility infrastructure.

- [ ] **Step 1: Write RED build/docs tests**

Assert build output contains the commercial browser modules and integrity entries; README/llms/roadmap/support all contain `interoperability` language and do not claim paid SLA or fully live billing until readiness config permits it.

- [ ] **Step 2: Confirm RED**

Run: `node --test tests/commercial-docs.test.js`

Expected: FAIL.

- [ ] **Step 3: Update build asset manifest and docs**

Keep existing OpenAlex documentation accurate but describe it as a production reference connector. Document Free/Developer/Team/Enterprise boundaries, BYOK/customer-run execution, restriction handling, and the exact readiness endpoint.

- [ ] **Step 4: Run full plan gate**

```bash
node --test tests/commercial-ui-*.test.js tests/commercial-onboarding.test.js tests/positioning.test.js tests/commercial-docs.test.js
npm run check
```

Expected: PASS and integrity asset count increases deterministically for new emitted modules.

- [ ] **Step 5: Commit**

```bash
git add scripts/build.mjs README.md llms.txt ROADMAP.md SUPPORT.md tests/commercial-docs.test.js
git commit -m "docs: align KATA commercial product surfaces"
```

## Plan E Completion Gate

Plan E is complete only when a stranger can understand KATA as an agent interoperability product, authentication/onboarding/project/run/report/CI/billing/account navigation is self-service, paid state always comes from the server, secrets are one-time reveal only, research remains functional but secondary, documentation matches the real implementation, and the full KATA gate remains green.
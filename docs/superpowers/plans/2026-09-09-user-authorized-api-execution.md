# User-authorized OpenAPI Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real, same-origin, explicitly approved OpenAPI execution path to KATA's active-tab bridge while preserving browser security controls and preview binding.

**Architecture:** Add a focused canonical `src/api-execution.js` module for deterministic request authorization metadata, SHA-256 preview fingerprints, and closure-free MAIN-world fetch execution. The extension service worker remains the orchestration boundary: rediscover the live OpenAPI contract for preview and execution, reject cross-origin/stale requests, and return local receipts. The popup adds a compile → select → preview → execute workflow. Build/static checks package and byte-compare the canonical execution module.

**Tech Stack:** Node.js 24.x, browser Fetch API, Web Crypto, Chrome MV3 `activeTab` + `scripting`, existing dependency-free OpenAPI discovery/compiler.

**Spec:** `docs/superpowers/specs/2026-09-09-user-authorized-api-execution-design.md`

## Global Constraints

- No arbitrary URL execution input.
- No credential extraction or model-controlled Authorization/Cookie headers.
- Same-origin active-tab execution only.
- MAIN-world fetch so the site's browser policy/session context remains authoritative.
- Exact SHA-256 preview fingerprint must be freshly re-derived before execution.
- Redirects rejected, no automatic retries, response <= 1 MiB, timeout <= 15 seconds.
- State-changing operations require explicit second approval.
- Keep `activeTab` + `scripting`; do not add broad host, cookies, webRequest or debugger permissions.

---

### Task 1: Define the execution contract with failing tests

**Files:**
- Create: `tests/browser-api-execution.test.js`

**Interfaces:**
- Consumes: `compileAuthorizedTabApiTools(tab, options, deps)`.
- Produces expected interfaces: `previewAuthorizedTabApiExecution`, `executeAuthorizedTabApiExecution`, `executePageApiRequest`.

- [x] Write integration tests for preview binding, explicit mutation approval, stale fingerprint rejection, cross-origin rejection, MAIN-world execution, same-origin browser-managed credentials, redirects and response bounds.
- [x] Run the PR release gate and verify the tests fail because the execution interfaces do not exist.
- [x] Preserve the failing commit as evidence before implementation.

### Task 2: Add canonical preview/fingerprint/page-execution primitives

**Files:**
- Create: `src/api-execution.js`
- Test: `tests/browser-api-execution.test.js`

**Interfaces:**
- Produces: `buildAuthorizedExecutionPreview(candidate,args,pageOrigin,options)`, `fingerprintExecutionPreview(preview,cryptoImpl)`, `executePageApiRequest(request,runtime)`.

- [ ] Implement canonical JSON serialization for a bounded plain JSON preview and SHA-256 hashing via Web Crypto.
- [ ] Derive `credentialMode='omit'` when no OpenAPI security is declared and `same-origin` when security is declared; never synthesize credentials.
- [ ] Mark GET/HEAD/OPTIONS as non-state-changing and all other methods as state-changing.
- [ ] Require request origin equality with active page origin before `readyToExecute=true`.
- [ ] Implement closure-free MAIN-world fetch with `redirect:'error'`, `cache:'no-store'`, bounded timeout and <=1 MiB response read.
- [ ] Run tests and keep the existing suite green.

### Task 3: Orchestrate fresh preview and execution in the extension worker

**Files:**
- Modify: `extension/service-worker.js`
- Test: `tests/browser-api-execution.test.js`

**Interfaces:**
- Produces: `previewAuthorizedTabApiExecution(tab,operationName,args,options,deps)` and `executeAuthorizedTabApiExecution(tab,operationName,args,expectedFingerprint,options,deps)`.

- [ ] Reuse `compileAuthorizedTabApiTools` to rediscover and compile the current active-tab contract.
- [ ] Resolve exactly one operation by canonical candidate name; reject missing/ambiguous names.
- [ ] Build and fingerprint preview.
- [ ] For execution, rediscover again, regenerate fingerprint, compare to expected, require explicit approval for state-changing work, then inject `executePageApiRequest` into MAIN world.
- [ ] Return a local receipt bound to the preview fingerprint and bounded response metadata.
- [ ] Add popup message handlers for preview and execute operations.

### Task 4: Add the operator workflow to the extension popup

**Files:**
- Modify: `extension/popup.html`
- Modify: `extension/popup.js`
- Modify: `extension/popup.css`
- Test: `tests/api-adapter-surface.test.js` or extension surface tests.

**Interfaces:**
- Consumes: compile/preview/execute extension messages.

- [ ] Add operation selector and JSON argument editor after local API compilation.
- [ ] Add `Preview request` control that renders method, exact URL, credential mode, mutation status and fingerprint.
- [ ] Keep Execute disabled until a valid preview exists.
- [ ] Add explicit approval control for state-changing operations.
- [ ] Execute only with the displayed fingerprint and render receipt/result using text nodes/textContent.
- [ ] Remove stale preview state after recompilation, argument edit, selection change, navigation-related errors or execution.

### Task 5: Publish and integrity-bind the new capability

**Files:**
- Modify: `api/capabilities.js`
- Modify: `scripts/build.mjs`
- Modify: `scripts/static-check.mjs`
- Modify: `extension/README.md`
- Modify: `README.md`
- Test: capability/static surface tests.

**Interfaces:**
- Publish `interop.browserExtension.apiExecution` and upgrade `webmcp.apiAgentAdapters` from `executesOperations:false` to a precise distinction between compiler-only WebMCP tools and user-authorized extension execution.

- [ ] Package `src/api-execution.js` in web and extension artifacts.
- [ ] Rewrite worker import to packaged module and enforce byte parity.
- [ ] Add integrity-manifest requirements and static permission/security assertions.
- [ ] Document same-origin, MAIN-world, preview-bound, explicit approval, credential and response-budget boundaries.
- [ ] Run the complete `npm run check` release gate and CodeQL.
- [ ] Merge only when both gates pass; then run mandatory post-merge release verification before any production promotion.

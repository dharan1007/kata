# Session Authorization Broker and MCP Task Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Chrome-session-only secret broker for protected OpenAPI/MCP execution and a session task vault that preserves manual MCP Task workflows across popup/service-worker restarts without exposing secrets/task handles to agents or KATA cloud services.

**Architecture:** `extension/session-vault.js` is the single storage boundary over `chrome.storage.session`. Redacted credential descriptors flow into OpenAPI/MCP preview builders and are SHA-256 bound; raw secrets are resolved only inside the trusted extension service worker immediately before network dispatch. MCP task state is stored in the same session-only module and recovered by opaque vault IDs, while all execution remains explicit/manual.

**Tech Stack:** Manifest V3, Chrome `storage.session`/`runtime`/`scripting`, browser Web Crypto, Node 24 test runner, existing KATA OpenAPI/MCP adapter modules and release-gate tooling.

**Spec:** `docs/superpowers/specs/2026-09-10-session-auth-task-vault-design.md`

## Global Constraints

- Use `chrome.storage.session`; do not persist credentials or task handles to disk/sync.
- Raise extension minimum Chrome to 102 and add only `storage` to existing permissions.
- No `<all_urls>`, cookies, identity, webRequest, debugger, alarms, or broad host permissions.
- No secret value or secret digest in tool/model arguments, previews, fingerprints, receipts, logs, cloud diagnosis payloads, or capability output.
- Protected execution remains same-origin HTTPS or loopback HTTP where existing MCP policy permits it.
- No autonomous OAuth flow, token refresh, background task polling, subscriptions, retries, or task continuation.
- All production code follows RED→GREEN TDD.

---

### Task 1: Session vault contract

**Files:**
- Create: `extension/session-vault.js`
- Create: `tests/browser-session-vault.test.js`
- Modify: `extension/manifest.json`

**Interfaces:**
- Produces `createSessionVault(storageArea, cryptoImpl?, now?)`.
- Vault methods: `putCredential(input)`, `listCredentialDescriptors(origin)`, `resolveCredential(binding)`, `removeCredential(id)`, `clearCredentials(origin?)`, `putTask(task)`, `listTaskDescriptors(origin?)`, `resolveTask(vaultTaskId)`, `removeTask(vaultTaskId)`.

- [ ] Write tests that require manifest `storage`, minimum Chrome `102`, secret redaction, exact-origin/revision enforcement, 16 KiB secret bound, bounded record counts, and task recovery from the same mocked session storage after a new vault instance is created.
- [ ] Run the complete release gate and capture the expected RED failure because `session-vault.js` does not exist / manifest contract is stale.
- [ ] Implement `session-vault.js` with one versioned session-storage object, random 128-bit IDs from `crypto.getRandomValues`, revision increments, redacted descriptors, and task records keyed by random vault IDs.
- [ ] Run targeted tests and full `npm run check` until GREEN.
- [ ] Commit.

### Task 2: OpenAPI brokered authorization

**Files:**
- Modify: `src/api-execution.js`
- Create: `tests/browser-api-session-auth.test.js`

**Interfaces:**
- `buildAuthorizedExecutionPreview(candidate,args,pageOrigin,{credentialInventory,...})` selects a fully satisfiable security alternative.
- `executionRequestFromPreview(preview)` returns redacted `credentialBindings` only.
- `executePageApiRequest(request,{resolveCredential,...})` resolves and injects secrets only at final dispatch.

- [ ] Write RED tests for header/query API keys, HTTP bearer, OAuth2/OIDC bearer-token descriptors, mixed OR/AND security alternatives, stale revision, wrong origin, and proof that preview/fingerprint/receipt JSON never contains the secret.
- [ ] Verify RED.
- [ ] Extend authorization planning so cookie `apiKey` remains browser-managed while brokered descriptors can satisfy header/query `apiKey`, HTTP bearer, OAuth2, and OpenID Connect; unsupported schemes remain setup-required.
- [ ] Add final-dispatch credential resolution/injection with no mutation of preview objects and no secret in returned execution metadata.
- [ ] Verify targeted and full gates GREEN.
- [ ] Commit.

### Task 3: MCP bearer authorization

**Files:**
- Modify: `src/mcp-adapter.js`
- Modify: `extension/service-worker.js`
- Create: `tests/browser-mcp-session-auth.test.js`

**Interfaces:**
- MCP transport accepts a trusted `authorizationHeader` only at dispatch; previews carry `authorizationBinding` only.
- Extension wrappers accept a redacted bearer descriptor, resolve it in the session vault, perform protected `server/discover`, `tools/list`, `tools/call`, MRTR, and Task lifecycle requests with the resolved Bearer header.

- [ ] Write RED tests proving protected MCP cannot run without a brokered bearer credential, public/default calls still send no Authorization header, stale/revised/deleted/wrong-origin credentials fail before fetch, and no secret appears in preview/receipt/cloud diagnosis.
- [ ] Verify RED.
- [ ] Add safe Authorization injection to the MCP transport and propagate only redacted binding metadata through preview/fingerprint structures.
- [ ] Integrate service-worker vault resolution before protected discovery/list/call/resume/task operations.
- [ ] Verify targeted and full gates GREEN.
- [ ] Commit.

### Task 4: Persist manual MCP Task state for the browser session

**Files:**
- Modify: `extension/service-worker.js`
- Modify: `extension/popup.js`
- Modify: `extension/popup.html`
- Create: `tests/browser-mcp-task-vault.test.js`

**Interfaces:**
- Tool/resume calls that return a task are stored before the popup response is sent.
- Popup uses `list-session-tasks`, `load-session-task`, `remove-session-task` messages and sends a `vaultTaskId` for refresh/update/cancel rather than relying on a popup-global raw task object.

- [ ] Write RED tests that create a task, construct a new service-worker/vault instance over the same mocked `chrome.storage.session`, recover the task by vault ID, refresh/update/cancel it, and verify no alarm/subscription/background polling path exists.
- [ ] Verify RED.
- [ ] Store task state after creation/get/update/cancel and expose only redacted descriptors to the popup list.
- [ ] Add session-task selector/recovery/removal controls while retaining explicit refresh/update/cancel approvals.
- [ ] Verify targeted and full gates GREEN.
- [ ] Commit.

### Task 5: Credential UX and machine-readable contract

**Files:**
- Modify: `extension/popup.html`
- Modify: `extension/popup.js`
- Modify: `extension/README.md`
- Modify: `SECURITY.md`
- Modify: `api/capabilities.js`
- Modify existing strict capability/extension tests as required.

**Interfaces:**
- Popup messages: `list-session-credentials`, `put-session-credential`, `remove-session-credential`, `clear-session-credentials`.
- Capability contract publishes `sessionCredentialBroker` and `sessionTaskVault` with explicit non-persistence/non-cloud visibility.

- [ ] Write RED capability/UI tests requiring the broker/task-vault contract, no secret-reveal action, no new broad permissions, and protected MCP execution=`explicit-session-bearer`.
- [ ] Verify RED.
- [ ] Add compact origin-scoped credential controls for API key / bearer token entry, redacted inventory, remove/clear; never repopulate secret fields from storage.
- [ ] Publish exact capability/security/docs boundaries.
- [ ] Verify complete `npm run check` GREEN.
- [ ] Commit.

### Task 6: Release verification and production promotion

**Files:** no production behavior changes unless verification finds a defect.

- [ ] Run/inspect PR Release Gate and CodeQL on the exact final branch SHA.
- [ ] Fix any failure test-first; rerun until both gates pass.
- [ ] Merge with expected head SHA only after green gates.
- [ ] Verify exact merged `main` SHA with post-merge Release Gate and CodeQL.
- [ ] Record source-bound artifact ID/digest.
- [ ] Allow existing guarded Vercel workflow to run only after the release gate.
- [ ] Verify whether the exact-main deployment was created; if deployment authority still fails, do not bypass it.
- [ ] Freshly verify canonical `/api/health`, `/release.json`, `/api/capabilities`, security headers, production logs, deployment ID/source SHA, and report source/live drift accurately.
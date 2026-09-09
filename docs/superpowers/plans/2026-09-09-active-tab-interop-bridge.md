# Active-Tab Interoperability Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let KATA inspect the real web app in the user's currently active browser tab through an explicit, temporary, read-only Manifest V3 authorization flow and feed the resulting bounded evidence into KATA's canonical interoperability graph.

**Architecture:** Refactor the canonical runtime probe into a closure-free exported function, then reuse that exact function from a Manifest V3 extension service worker via `chrome.scripting.executeScript({world:"MAIN"})`. The extension keeps URL/runtime details local and sends only the KATA interoperability environment plus user-selected intent to `/api/invoke`.

**Tech Stack:** Browser ES modules, Chrome Manifest V3, `activeTab`, `chrome.scripting`, Node.js 24.x, node:test, Vercel static/serverless deployment.

**Spec:** `docs/superpowers/specs/2026-09-09-active-tab-interop-bridge-design.md`

## Global Constraints

- No `<all_urls>` or arbitrary-site host permission.
- No cookies, webRequest, debugger, history, downloads, nativeMessaging, clipboard, or persistent content-script permission.
- Only HTTP(S) active tabs may be inspected.
- Only the bounded `environment` plus selected intent may leave the extension for KATA; page URL and runtime details remain local.
- No arbitrary remote code or eval/new Function.
- MAIN-world execution must use the exact canonical `inspectBrowserRuntime` implementation.
- Node.js 24.x remains the release/runtime contract.

---

### Task 1: Establish failing extension-security and bridge regressions

**Files:**
- Create: `tests/browser-extension.test.js`

**Interfaces:**
- Planned `inspectAuthorizedTab(tab, intent, deps)` in `extension/service-worker.js`.
- Planned source package at `extension/manifest.json`.

- [ ] Test manifest version 3, minimum Chrome 95, exact permissions `activeTab` and `scripting`, and exact host permission `https://kata-webmcp.vercel.app/*`.
- [ ] Test that no broad host pattern or sensitive permission is present.
- [ ] Test that active-tab inspection injects `inspectBrowserRuntime` into the top frame with `world: "MAIN"`.
- [ ] Test that only `environment` and intent are serialized into the `/api/invoke` request; the page URL/runtime snapshot must not appear in the network payload.
- [ ] Test rejection of non-HTTP(S) schemes before any injection.
- [ ] Test KATA API failure returns a structured diagnosis failure while preserving local runtime evidence.
- [ ] Commit these tests before production implementation and verify the release gate is RED for missing extension functionality.

### Task 2: Make the canonical runtime probe safely injectable

**Files:**
- Modify: `src/runtime-probe.js`
- Test: `tests/browser-extension.test.js`

**Interfaces:**
- Preserve `inspectBrowserRuntime(runtime={})` return schema exactly.
- The exported function must have no free references to file-scope helpers so Chrome can serialize it for `executeScript({func})`.

- [ ] Add a regression that evaluates `inspectBrowserRuntime.toString()` in an isolated VM context and obtains a valid result with synthetic `document/window/navigator` globals.
- [ ] Refactor helpers inside `inspectBrowserRuntime` without changing existing runtime-probe semantics.
- [ ] Run runtime/extension-focused tests until green.

### Task 3: Implement the active-tab bridge and local popup

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/service-worker.js`
- Create: `extension/popup.html`
- Create: `extension/popup.js`
- Create: `extension/popup.css`
- Create: `extension/README.md`

**Interfaces:**
- Export `inspectAuthorizedTab(tab, intent='read', deps={})` for testability.
- Message `{type:'inspect-active-tab', intent}` returns `{ok, runtime, evidence, diagnosis}` or `{ok:false, error, runtime?, evidence?}`.

- [ ] Validate selected intent against the canonical five interop intents.
- [ ] Validate active tab ID and HTTP(S) URL before injection.
- [ ] Execute the canonical probe in MAIN world with only the top-frame target.
- [ ] Set `userAuthorizedBrowserFlow: true` on the copied environment; do not mutate the returned local probe.
- [ ] POST only `{name:'kata_diagnose_web_interop',arguments:{intent,environment}}` to KATA.
- [ ] Render framework hints, frame/WebMCP/policy state, local URL, selected integration path/status, blockers and remediation with textContent-only DOM writes.
- [ ] Keep popup and worker free of inline/eval/remote-code behavior.

### Task 4: Advertise and integrity-bind the extension bridge

**Files:**
- Modify: `api/capabilities.js`
- Modify: `tests/webmcp-capabilities.test.js`
- Modify: `scripts/build.mjs`
- Modify: `scripts/static-check.mjs`
- Modify: `README.md`

**Interfaces:**
- Add `capabilities.interop.browserExtension` describing source path, permissions, host permission, user gesture, MAIN-world execution, supported intents and outbound disclosure boundary.
- Build `dist/extension/*` with service worker import resolving to a copied canonical `runtime-probe.js`.

- [ ] Add capability regression before capability implementation.
- [ ] Copy extension assets plus canonical runtime probe into `dist/extension` and integrity-bind every shipped file.
- [ ] Extend static checks to validate extension manifest permissions/hosts and reject inline event handlers/scripts/styles in extension HTML.
- [ ] Document load-unpacked usage and explicit security limitations.
- [ ] Run `npm run check`; require all tests, build, static/security, import closure, integrity and provenance checks to pass.
- [ ] Require PR CodeQL and release-gate success, merge, verify post-merge gates/artifact, and allow the existing guarded Vercel workflow to promote only if its authority and exact-source checks pass.
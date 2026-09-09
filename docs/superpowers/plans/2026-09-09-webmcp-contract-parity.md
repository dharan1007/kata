# WebMCP Contract Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every canonical KATA tool keep one schema and one semantic meaning across HTTP, MCP, model bridges, and WebMCP, while moving browser-owned stateful actions to explicit `kata_browser_*` tools.

**Architecture:** Move canonical tool metadata into a dependency-free shared module consumed by server and browser. WebMCP registers canonical definitions with `/api/invoke` execution and registers browser-state conveniences under separate names. Build/static checks package and integrity-bind the shared module.

**Tech Stack:** Node.js 24 ESM, vanilla browser JavaScript, Vercel Functions, Node test runner, WebMCP `document.modelContext.registerTool()`.

**Spec:** `docs/superpowers/specs/2026-09-09-webmcp-contract-parity-design.md`

## Global Constraints

- No new runtime npm dependencies.
- Preserve server HTTP/MCP/model tool schemas and semantics.
- Do not add arbitrary URL fetching or weaken browser security controls.
- Canonical WebMCP tools must execute through `/api/invoke` semantics.
- Browser-state actions must use `kata_browser_*` names.
- Preserve AbortSignal propagation and `exposedTo` behavior.
- Full `npm run check` and CodeQL must pass before merge.

---

### Task 1: Add failing cross-surface contract tests

**Files:**
- Create: `tests/webmcp-contract-parity.test.js`
- Read: `lib/server/tools.js`, `src/webmcp.js`

**Interfaces:**
- Consumes: existing `toolDefinitions`, `createWebMcpRegistry()`.
- Produces: regression expectations for canonical parity and browser-scoped names.

- [ ] Write a test that registers WebMCP tools and asserts every canonical `toolDefinitions` name exists with an identical description and input schema.
- [ ] Assert canonical `kata_search_research.annotations.readOnlyHint === true` in WebMCP.
- [ ] Assert canonical `kata_run_automation` exposes the server schema requiring `workspace`, `works`, `automation`, and `previewFingerprint`, not `{automationId}`.
- [ ] Assert browser-state tools include `kata_browser_search_and_load_research`, `kata_browser_run_saved_automation`, `kata_browser_workspace_summary`, `kata_browser_list_automations`, and `kata_browser_list_learned_tools`.
- [ ] Invoke canonical `kata_search_research` and prove it calls `runtime.invokeCanonical('kata_search_research', args, {signal})` rather than `runtime.search()`.
- [ ] Invoke `kata_browser_search_and_load_research` and prove it calls `runtime.search()` with the AbortSignal.
- [ ] Run `npm test -- tests/webmcp-contract-parity.test.js`; expected RED because current WebMCP definitions are independent and colliding.
- [ ] Commit the failing regression only.

### Task 2: Extract canonical metadata into a shared browser-safe module

**Files:**
- Create: `lib/shared/tool-contracts.js`
- Modify: `lib/server/tools.js`
- Test: `tests/tools.test.js`, `tests/openai-agent-schema.test.js`, `tests/webmcp-contract-parity.test.js`

**Interfaces:**
- Produces: `toolDefinitions` from `lib/shared/tool-contracts.js`.
- Server `createToolRegistry()` and all model projections continue consuming the same array.

- [ ] Move schema constants and the eight canonical definition objects from `lib/server/tools.js` into `lib/shared/tool-contracts.js` without changing serialized contents.
- [ ] Import and re-export `toolDefinitions` from `lib/server/tools.js` so existing imports remain compatible.
- [ ] Run server/model contract tests and confirm no schema diff.
- [ ] Commit the extraction separately.

### Task 3: Rebuild WebMCP registration around canonical definitions

**Files:**
- Modify: `src/webmcp.js`
- Modify: `src/app.js`
- Test: `tests/webmcp-contract-parity.test.js`, `tests/webmcp.test.js`, `tests/browser-cancellation.test.js`

**Interfaces:**
- `runtime.invokeCanonical(name,args,{signal}) -> Promise<any>` delegates to `/api/invoke`.
- Browser tools remain local runtime adapters.

- [ ] Import `toolDefinitions` into `src/webmcp.js`.
- [ ] Add a WebMCP-safe annotation projector that forwards only `readOnlyHint` and `untrustedContentHint`.
- [ ] Register each canonical definition with unchanged name/description/inputSchema and `execute` calling `runtime.invokeCanonical`.
- [ ] Add explicit browser tools named `kata_browser_search_and_load_research`, `kata_browser_workspace_summary`, `kata_browser_list_automations`, `kata_browser_run_saved_automation`, `kata_browser_list_learned_tools`.
- [ ] Add deterministic collision detection for learned tools against canonical/browser names; skip colliding learned programs and report their names in status `collisions`.
- [ ] In `src/app.js`, pass `invokeCanonical:(name,args,{signal}={})=>invoke(name,args,{signal})` into `createWebMcpRegistry`.
- [ ] Preserve generation abort, registration failure rollback, `exposedTo`, and invocation cancellation.
- [ ] Run WebMCP/cancellation tests; expected GREEN.
- [ ] Commit the implementation.

### Task 4: Package the shared browser module and prevent broken production imports

**Files:**
- Modify: `scripts/build.mjs`
- Modify: `scripts/static-check.mjs`
- Test: `tests/static.test.js`

**Interfaces:**
- Browser import `../lib/shared/tool-contracts.js` must exist in `dist/lib/shared/tool-contracts.js`.

- [ ] Add `lib/shared/tool-contracts.js` to canonical build assets and integrity manifest.
- [ ] Extend static validation to require that module and validate browser relative imports resolve inside `dist`.
- [ ] Add/adjust static regression proving build output contains the shared contract module.
- [ ] Run build/static tests; expected GREEN.
- [ ] Commit build packaging changes.

### Task 5: Update public contract documentation and verify release

**Files:**
- Modify: `README.md`
- Modify: `api/capabilities.js`
- Modify: `ROADMAP.md`
- Test: `tests/api.test.js`, `tests/static.test.js`

**Interfaces:**
- `/api/capabilities.webmcp` documents canonical parity plus browser-scoped state tools.

- [ ] Update WebMCP docs to distinguish canonical stateless tools from browser-owned `kata_browser_*` tools.
- [ ] Add machine-readable WebMCP capability fields for `canonicalToolParity:true` and the browser tool prefix.
- [ ] Remove/replace any claim that currently implies conflicting same-name browser behavior is acceptable.
- [ ] Run `npm run check`; expected all tests/build/static validation PASS.
- [ ] Open PR, require Release Gate + CodeQL, merge only when green.
- [ ] After merge, verify post-merge Release Gate and production deployment workflow. Deploy only if the guarded release workflow has valid authority and succeeds; otherwise leave production unchanged and report the exact blocker.

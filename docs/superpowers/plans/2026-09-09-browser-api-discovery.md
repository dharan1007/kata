# Browser API Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe browser-native API discovery subsystem that inventories standards-declared OpenAPI interfaces without invoking protected operations or guessing authorization.

**Architecture:** Create a dependency-free browser collector/parser module. `src/webmcp.js` exposes it as a browser-owned read-only WebMCP tool, `/api/capabilities` advertises it, and the static build integrity-binds the module. The collector accepts only current-document declarations plus the current-origin RFC 9727 well-known catalog and preserves browser CORS/CSP/auth boundaries.

**Tech Stack:** Browser ES modules, Node.js 24.x, node:test, Vercel static/serverless deployment.

**Spec:** `docs/superpowers/specs/2026-09-09-browser-api-discovery-design.md`

## Global Constraints

- No arbitrary URL parameter or site crawling.
- Same-origin description fetches use `credentials: "same-origin"`; cross-origin description fetches use `credentials: "omit"` and normal CORS.
- API catalog discovery is limited to the current origin's `/.well-known/api-catalog` and rejects cross-origin final redirects.
- Never invoke API operations or infer operation authorization/CORS/rate-limit/terms state.
- Parse JSON OpenAPI 3.0/3.1/3.2; report YAML/unknown formats as unsupported.
- Preserve AbortSignal through every fetch.
- Node.js 24.x remains the release/runtime contract.

---

### Task 1: Add failing API discovery regressions

**Files:**
- Create: `tests/api-discovery.test.js`

**Interfaces:**
- Consumes: planned `discoverBrowserApis(options, runtime)`.
- Produces: expected behavior for source restrictions, parsing, security boundaries and cancellation.

- [ ] Add a test proving a declared same-origin OpenAPI 3.2 JSON document is fetched with same-origin credentials and yields bounded operation/security/streaming metadata.
- [ ] Add a test proving cross-origin descriptions use omitted credentials and failed CORS remains a fetch outcome rather than a bypass.
- [ ] Add a test proving the well-known API catalog is fetched only from the current origin and cross-origin catalog redirects are rejected.
- [ ] Add a test proving YAML is reported unsupported rather than guessed.
- [ ] Add a test proving AbortSignal is forwarded and cancellation aborts discovery.
- [ ] Commit the tests and verify CI fails because `src/api-discovery.js` does not yet exist.

### Task 2: Implement the browser collector/parser

**Files:**
- Create: `src/api-discovery.js`

**Interfaces:**
- Produces: `discoverBrowserApis({declaredApiDescriptions, includeWellKnownCatalog=true, maxDescriptions=3, signal}, runtime?)`.
- Returns: `{sources, resources, descriptions, operations, securitySchemes, evidence, environmentPatch}`.

- [ ] Implement URL normalization and current-origin catalog construction.
- [ ] Implement browser-policy-respecting fetch with same-origin/omit credential selection and AbortSignal propagation.
- [ ] Parse JSON Linkset catalog `service-desc` links and deduplicate resolved targets.
- [ ] Parse bounded OpenAPI 3.0/3.1/3.2 metadata, operation inventory, security references and streaming response media.
- [ ] Return unsupported-format/resource errors as structured outcomes without executing any API operation.
- [ ] Run API discovery tests until green.

### Task 3: Expose discovery through WebMCP and capabilities

**Files:**
- Modify: `src/webmcp.js`
- Modify: `api/capabilities.js`
- Modify: `tests/webmcp-contract-parity.test.js`
- Modify: `tests/webmcp-capabilities.test.js`

**Interfaces:**
- WebMCP tool: `kata_browser_discover_api`.
- Input: `{includeWellKnownCatalog?: boolean, maxDescriptions?: integer}`.

- [ ] Add failing tests requiring WebMCP registration, read-only annotation, reserved-name collision protection, and capability discovery.
- [ ] Register `kata_browser_discover_api` using `inspectBrowserRuntime()` declarations plus `discoverBrowserApis()`.
- [ ] Advertise browser API discovery and supported OpenAPI versions in `/api/capabilities`.
- [ ] Run focused WebMCP tests until green.

### Task 4: Integrity-bind the new production module and release

**Files:**
- Modify: `scripts/build.mjs`
- Test: `tests/static.test.js`

**Interfaces:**
- Production artifact includes `/src/api-discovery.js` and its import closure resolves.

- [ ] Add `src/api-discovery.js` to canonical static assets.
- [ ] Run `npm run check`; require all tests, build, static/security, module closure, integrity, and provenance checks to pass.
- [ ] Open PR only after the complete gate passes.
- [ ] Require CodeQL and release-gate success before merge.
- [ ] Merge, verify post-merge release artifact/source binding, and allow the existing guarded Vercel workflow to deploy only if its authority and exact-source checks pass.
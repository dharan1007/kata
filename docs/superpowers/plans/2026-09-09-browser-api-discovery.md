# Browser API Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe browser-native API discovery subsystem that inventories standards-declared OpenAPI interfaces without invoking protected operations or guessing authorization.

**Architecture:** Create a dependency-free browser collector/parser module. `src/webmcp.js` exposes it as a browser-owned read-only WebMCP tool, `/api/capabilities` advertises it, and the static build integrity-binds the module. The collector accepts only current-document declarations plus the current-origin RFC 9727 well-known catalog and preserves browser CORS/CSP/auth boundaries.

**Tech Stack:** Browser ES modules, Node.js 24.x, node:test, Vercel static/serverless deployment.

**Spec:** `docs/superpowers/specs/2026-09-09-browser-api-discovery-design.md`

## Global Constraints

- No arbitrary URL parameter or site crawling.
- Same-origin description fetches use `credentials: "same-origin"`; cross-origin description fetches use `credentials: "omit"` and normal CORS.
- API catalog discovery starts only at the current origin's `/.well-known/api-catalog`; normal browser redirects and CORS remain authoritative, including RFC 9727 publisher redirects to controlled domains.
- Catalog `item` endpoints and nested `api-catalog` targets are evidence only: do not fetch them automatically.
- Never invoke API operations or infer operation authorization/CORS/rate-limit/terms state.
- Parse JSON OpenAPI 3.0/3.1/3.2, including OAS 3.2 `query` and `additionalOperations`; report YAML/unknown formats as unsupported.
- Preserve AbortSignal through every fetch.
- Node.js 24.x remains the release/runtime contract.

---

### Task 1: Add failing API discovery regressions

**Files:**
- Create: `tests/api-discovery.test.js`

**Interfaces:**
- Consumes: planned `discoverBrowserApis(options, runtime)`.
- Produces: expected behavior for source restrictions, parsing, security boundaries and cancellation.

- [x] Add a test proving a declared same-origin OpenAPI 3.2 JSON document is fetched with same-origin credentials and yields bounded operation/security/streaming metadata.
- [x] Add a test proving OAS 3.2 `additionalOperations` are inventoried rather than silently dropped.
- [x] Add a test proving cross-origin descriptions use omitted credentials and failed CORS remains a fetch outcome rather than a bypass.
- [x] Add a test proving the well-known API catalog request originates only at the current origin and normal browser-authorized RFC 9727 redirects can lead to publisher-controlled catalogs without creating an arbitrary URL input.
- [x] Add a test proving catalog API endpoints and nested catalogs are surfaced as evidence but not crawled.
- [x] Add a test proving YAML is reported unsupported rather than guessed.
- [x] Add a test proving AbortSignal is forwarded and cancellation aborts discovery.
- [x] Commit regressions and establish RED release-gate failures before implementing missing behavior.

### Task 2: Implement the browser collector/parser

**Files:**
- Create: `src/api-discovery.js`

**Interfaces:**
- Produces: `discoverBrowserApis({declaredApiDescriptions, includeWellKnownCatalog=true, maxDescriptions=3, signal}, runtime?)`.
- Returns: `{sources, catalog, resources, descriptions, operations, securitySchemes, evidence, environmentPatch}`.

- [x] Implement URL normalization and current-origin catalog construction.
- [x] Implement browser-policy-respecting fetch with same-origin/omit credential selection and AbortSignal propagation.
- [x] Parse JSON Linkset `service-desc`, `item`, and `api-catalog` relations with anchor-aware URL resolution and deduplication.
- [x] Parse bounded OpenAPI 3.0/3.1/3.2 metadata, fixed/query/additional operation inventory, security references and streaming response media.
- [x] Return unsupported-format/resource errors as structured outcomes without executing any API operation.
- [x] Run API discovery tests until green.

### Task 3: Expose discovery through WebMCP and capabilities

**Files:**
- Modify: `src/webmcp.js`
- Modify: `api/capabilities.js`
- Modify: `tests/webmcp-contract-parity.test.js`
- Modify: `tests/webmcp-capabilities.test.js`

**Interfaces:**
- WebMCP tool: `kata_browser_discover_api`.
- Input: `{includeWellKnownCatalog?: boolean, maxDescriptions?: integer}`.

- [x] Add regressions requiring WebMCP registration, read-only annotation, reserved-name collision protection, and capability discovery.
- [x] Register `kata_browser_discover_api` using `inspectBrowserRuntime()` declarations plus `discoverBrowserApis()`.
- [x] Advertise browser API discovery, supported OpenAPI versions, catalog evidence classes, and explicit non-execution/non-crawling behavior in `/api/capabilities`.
- [x] Run focused WebMCP tests until green.

### Task 4: Integrity-bind the new production module and release

**Files:**
- Modify: `scripts/build.mjs`
- Test: release static/module-closure checks

**Interfaces:**
- Production artifact includes `/src/api-discovery.js` and its import closure resolves.

- [x] Add `src/api-discovery.js` to canonical static assets.
- [ ] Run the final `npm run check`; require all tests, build, static/security, module closure, integrity, and provenance checks to pass on the final head.
- [ ] Require final-head CodeQL and release-gate success before merge.
- [ ] Merge, verify post-merge release artifact/source binding, and allow the existing guarded Vercel workflow to deploy only if its authority and exact-source checks pass.
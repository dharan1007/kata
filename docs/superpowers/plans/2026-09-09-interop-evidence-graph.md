# Interoperability Evidence Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace KATA's flat interoperability path selector with an explicit evidence graph and add a safe browser runtime probe that feeds the existing diagnostic tool.

**Architecture:** A new server graph evaluator computes independent path states and a deterministic preferred path. The existing diagnostic module keeps compatibility blocker/remediation output but delegates path/status selection to the graph. A dependency-free browser probe returns a compatible environment plus runtime evidence and is exposed through a browser-owned WebMCP tool.

**Tech Stack:** Node.js 24.x, browser ES modules, Node test runner, Vercel static/serverless deployment.

**Spec:** `docs/superpowers/specs/2026-09-09-interop-evidence-graph-design.md`

## Global Constraints

- Preserve the existing `kata_diagnose_web_interop` request schema and existing top-level response fields.
- Never infer authentication, anti-bot, rate-limit, terms, CORS, or header-only CSP state from browser heuristics.
- Never fetch arbitrary target URLs from the runtime probe.
- Preserve cross-origin WebMCP default-deny behavior.
- Node.js 24.x remains the release/runtime contract.

---

### Task 1: Evidence graph engine

**Files:**
- Create: `lib/server/interop-graph.js`
- Create: `tests/web-interop-graph.test.js`

**Interfaces:**
- Produces: `buildInteropGraph(environment)` returning `{paths,evidence,decision,decisionTrace}`.

- [ ] Add failing tests covering independent WebMCP/server/browser/user paths, browser-scoped constraints, CORS/CSP isolation, and unknown evidence.
- [ ] Implement deterministic path evaluation with statuses `possible|setup_required|blocked|unavailable|unknown`.
- [ ] Verify graph tests pass.

### Task 2: Diagnostic compatibility adapter

**Files:**
- Modify: `lib/server/interop.js`
- Test: existing `tests/web-interop-*.test.js`

**Interfaces:**
- Consumes: `buildInteropGraph(environment)`.
- Produces: the existing diagnostic response plus additive `paths`, `evidence`, and `decisionTrace`.

- [ ] Wire graph decision into `status` and `primaryPath` while preserving blocker codes/remediation.
- [ ] Run all existing web interoperability tests and correct graph semantics rather than reintroducing branch-specific path selection.

### Task 3: Browser runtime probe

**Files:**
- Create: `src/runtime-probe.js`
- Create: `tests/runtime-probe.test.js`
- Modify: `src/webmcp.js`
- Modify: `api/capabilities.js`

**Interfaces:**
- Produces: `inspectBrowserRuntime(runtime?)` returning `{environment,runtime,evidence}`.
- WebMCP tool: `kata_browser_inspect_runtime`.

- [ ] Add probe tests for top/same-origin/cross-origin frames, policy introspection, framework hints, open shadow roots and inaccessible frames.
- [ ] Implement only observable browser evidence; unknown remains unknown.
- [ ] Register read-only browser tool and advertise it in capabilities.

### Task 4: Production artifact closure and release verification

**Files:**
- Modify: `scripts/build.mjs` if the new browser module is not already transitively packaged.
- Test: `tests/static.test.js`, `tests/webmcp-capabilities.test.js`, `tests/webmcp-contract-parity.test.js`.

- [ ] Ensure every browser import is copied into `dist` and integrity-bound.
- [ ] Run complete release gate: `npm test`, build, static check and combined check through CI.
- [ ] Require CodeQL success.
- [ ] Merge only after gates pass; verify post-merge source-bound artifact.
- [ ] Allow the existing guarded Vercel workflow to deploy only if deployment authority and exact-source checks pass.
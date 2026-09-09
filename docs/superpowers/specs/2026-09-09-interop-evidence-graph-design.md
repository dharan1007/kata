# KATA Interoperability Evidence Graph Design

## Problem

KATA's interoperability diagnostic currently encodes path selection in one flat conditional tree. That makes WebMCP, documented browser APIs, server APIs, and user-authorized browser flows implicit competitors and encourages new restrictions to become new branches. It also requires callers to provide nearly every observation manually.

## Goal

Replace path selection with an explicit evidence/capability graph while preserving the existing `kata_diagnose_web_interop` request and legacy top-level response fields. Add a read-only browser runtime probe that derives only safely observable facts and returns unknown for facts it cannot establish.

## Architecture

`lib/server/interop-graph.js` owns path evaluation. It produces independent path records for `webmcp`, `server_api`, `browser_api`, and `user_authorized_browser`, each with availability, status, requirements, constraints, evidence and a deterministic priority. The graph selects a preferred path only after every path has been evaluated.

`lib/server/interop.js` remains the public compatibility adapter. It keeps existing blocker codes/remediation text, but uses the graph decision for `status` and `primaryPath` and adds `paths`, `evidence`, and `decisionTrace` so agents can inspect why alternatives were accepted or rejected.

`src/runtime-probe.js` is dependency-free browser code. It observes frame relationship, secure context, WebMCP presence, the `tools` Permissions Policy when an introspection API is actually available, open shadow roots, iframe accessibility, common framework/runtime markers, declared API description links, and CSP meta declarations. It does not infer authentication state, CAPTCHA/bot status, rate limits, service terms, CORS permission, or response-header CSP.

`src/webmcp.js` exposes the probe as `kata_browser_inspect_runtime`. The tool is read-only and browser-owned, and its returned `environment` is directly compatible with `kata_diagnose_web_interop` so agents can run inspect -> diagnose without rewriting fields.

## Decision semantics

A path can be `possible`, `setup_required`, `blocked`, `unavailable`, or `unknown`. Explicit security/policy denial always outranks availability. Browser-scoped restrictions affect WebMCP/browser paths but not an independently established server API. CORS and `connect-src` affect browser API execution, not server API execution. Cross-origin WebMCP requires positive evidence for `tools` delegation, producer exposure, and consumer `fromOrigins` discovery.

Path preference is deterministic: a `possible` WebMCP path is preferred, then a `possible` server API, then browser API, then user-authorized browser flow. If no path is immediately possible, setup-required paths use the same order except that an established server API is preferred over a blocked/unverified WebMCP path. Blocked paths are reported but never presented as usable.

## Security

The runtime probe never fetches arbitrary URLs, walks closed shadow roots, reads cross-origin frame contents, bypasses browser controls, or claims security state it cannot observe. Unknown is a first-class evidence state. Existing default-deny cross-origin WebMCP exposure remains unchanged.

## Compatibility

The existing diagnostic input schema remains valid. Existing top-level `status`, `primaryPath`, `blockers`, `recommendedAction`, and `observed` remain present. New graph fields are additive. Browser-owned tools remain under `kata_browser_*` and cannot shadow canonical tools.

## Verification

Add deterministic graph tests for independent path evaluation, browser-scoped constraints, CORS/CSP isolation, and unknown evidence. Add browser probe tests with mocked same-origin/cross-origin windows and policy objects. Extend WebMCP capability/parity tests to require the runtime-inspection tool. Run the complete Node 24 release gate, static module-closure verification, CodeQL, source-bound release verification, and guarded production deployment only after all checks pass.
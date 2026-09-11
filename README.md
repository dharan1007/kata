# KATA

**Teach repeatable research and web-interoperability workflows once, then expose them as deterministic tools for humans, CI and agents.**

KATA combines live scholarly search, a durable browser workspace, demonstration-derived workflow programs, browser/API interoperability diagnostics, and one canonical semantic engine exposed through HTTPS, MCP, WebMCP, model-native schemas and a dependency-free CLI.

[Try KATA](https://kata-webmcp.vercel.app/) · [Production contract](docs/PRODUCTION.md) · [Security](SECURITY.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

[![KATA Release Gate](https://github.com/dharan1007/kata/actions/workflows/release-gate.yml/badge.svg)](https://github.com/dharan1007/kata/actions/workflows/release-gate.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## What KATA does

```text
research / interoperability task
            ↓
real connector or caller-authorized browser evidence
            ↓
normalize + validate + preserve explicit blocked states
            ↓
save / prioritize / annotate / demonstrate workflow
            ↓
anti-unify repeatable demonstrations
            ↓
validated portable workflow program
            ↓
UI / HTTPS / MCP / WebMCP / model schemas / CLI
```

KATA does not hide nondeterminism behind an “agent” label. Connector failures remain failures. Browser controls such as authentication, CORS, CSP, rate limits, bot challenges and Permissions Policy are evidence to respect, not restrictions to bypass. Tool arguments are schema-validated. State-changing browser/API/MCP operations are preview-bound. Cancellation is propagated through execution/state commits.

## Public product

The canonical deployment is:

```text
https://kata-webmcp.vercel.app
```

Product routes include `/research`, `/dashboard`, `/automations`, `/teach`, `/tools`, `/developers`, `/activity`, `/learn`, and `/settings`.

The current scholarly production connector is **OpenAlex**. KATA never replaces a failed real connector request with synthetic success data.

## Canonical production API

```text
GET  /api/health
GET  /api/capabilities
GET  /api/search?query=web%20agents&limit=8
POST /api/invoke
POST /api/triage
POST /api/compile
POST /api/execute
GET  /api/agents
POST /api/mcp
GET  /api/openapi
GET  /api/pricing
GET  /api/readiness/commercial
GET  /release.json
GET  /integrity.json
```

Compatibility alias:

```text
/api/openalex/search -> /api/search
```

`/api/pricing` is public display metadata only. A client-supplied plan name or pricing response never grants authorization. `/api/readiness/commercial` is a fail-closed production matrix and can legitimately report `blocked` while the public KATA core remains healthy.

### Generic invocation

```http
POST /api/invoke
Content-Type: application/json
```

```json
{
  "name": "kata_search_research",
  "arguments": {
    "query": "web agents",
    "limit": 5
  }
}
```

## Production CLI

The repository ships an installable dependency-free CLI that talks to the same canonical HTTP surfaces.

```bash
node bin/kata.mjs health
node bin/kata.mjs capabilities
node bin/kata.mjs pricing
node bin/kata.mjs readiness
node bin/kata.mjs search "browser interoperability"
node bin/kata.mjs invoke kata_search_research --args '{"query":"MCP interoperability"}'
node bin/kata.mjs doctor
```

`doctor` checks health, exact release provenance, integrity, capabilities, OpenAPI, pricing and commercial readiness together.

Protected endpoints may use a bearer credential supplied only through:

```bash
export KATA_TOKEN='...'
```

The CLI rejects `--token` so credentials are not encouraged into shell history/process listings. Remote alternate bases must use HTTPS; cleartext HTTP is accepted only for loopback development.

## OpenAlex configuration

KATA works against the public OpenAlex API without a key. An operator can optionally configure:

```text
OPENALEX_API_KEY
```

The credential stays server-side and is sent only to `api.openalex.org`. Upstream rate-limit telemetry is normalized into non-secret response metadata. Explicit upstream rate limits, transient errors, cancellation and retry/backoff remain observable instead of being hidden.

## Remote MCP

KATA exposes MCP Streamable HTTP at:

```text
POST /api/mcp
```

The machine-readable current protocol contract is published by `/api/capabilities` and `/api/openapi`. KATA supports the checked-in modern protocol path plus tested compatibility semantics for the earlier handshake-era path. Header/body routing disagreement is rejected rather than guessed.

A valid tool call is:

```http
POST /api/mcp
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: kata_search_research
```

```json
{
  "jsonrpc": "2.0",
  "id": "research-1",
  "method": "tools/call",
  "params": {
    "name": "kata_search_research",
    "arguments": {
      "query": "web agents",
      "limit": 5
    },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

Optional server-side controls:

```text
MCP_BEARER_TOKEN
MCP_ALLOWED_ORIGINS
```

Browser-origin MCP is default-deny when an allowlist is required. Non-browser clients do not need to invent an `Origin` header. Authentication failures remain an authorization boundary; KATA does not fall through into broader discovery/execution.

## Browser WebMCP and active-tab interoperability

When available, KATA registers browser tools through `document.modelContext.registerTool()` and retains the tested transitional browser fallback. Registration generations are abortable. Invocation cancellation flows into browser requests and state transactions so cancelled work cannot commit a partial workspace update.

The browser extension uses temporary active-tab authority and session-only credential brokers. It does not expose raw credentials as model/tool arguments. Protected OpenAPI and MCP execution re-discovers the live contract and compares a preview-bound fingerprint before the final request. Stale or forged previews fail before dispatch.

KATA can diagnose cross-origin/browser restrictions but does not bypass CORS, CSP, authentication, bot controls, paywalls or CAPTCHA.

## Workflow engine

The canonical engine includes:

- versioned browser-owned workspace state;
- saved work, priorities, tags and notes;
- preview-bound automations;
- bounded nested tool calls;
- two-demonstration anti-unification into portable programs;
- schema-validated canonical tools projected into HTTPS/MCP/WebMCP/model-native schemas;
- explicit state snapshots for stateless server calls.

Browser triggers run while KATA is open. The public core does **not** pretend an unattended cloud runner exists when durable authenticated cloud execution is not configured.

## Commercial control plane

The repository contains a fail-closed commercial control plane for organizations/projects/environments, hash-only API/CI credentials, server-derived entitlements, transactional usage reservation, deterministic CI policy, billing state/reconciliation and Razorpay integration.

Authorization is server-derived:

```text
verified principal
 -> organization/service scope
 -> object ownership
 -> reconciled subscription state
 -> immutable effective entitlements
 -> operation role/scope
 -> bounded execution / usage accounting
```

Razorpay webhook evidence is authenticated over the exact raw request body before parsing. Duplicate provider events are idempotent. Older events cannot resurrect cancelled state. Ambiguous ordering becomes `RECONCILIATION_REQUIRED` rather than a guessed entitlement transition.

This code does **not** make a commercial deployment ready by itself. `/api/readiness/commercial` must remain blocked until real customer identity, commercial database/migrations, key material, merchant/webhook configuration, legal/support details, provider budgets and release governance are actually configured. KATA never fabricates those external prerequisites.

See [`docs/PRODUCTION.md`](docs/PRODUCTION.md) for the exact operator contract.

## Run and verify locally

Requirement: Node.js 24.x.

```bash
git clone https://github.com/dharan1007/kata.git
cd kata
npm ci --ignore-scripts
npm audit --audit-level=high
npm run check
npm run verify:package
npm run sbom
```

The current core has no third-party runtime npm dependencies. A committed lockfile and SPDX SBOM are still required release evidence.

## Release integrity

GitHub release verification requires an exact clean checkout. Vercel production provenance is provider-bound to Vercel Git metadata for repository `dharan1007/kata`, ref `main`, and the exact commit SHA; KATA does not pretend the Vercel build container necessarily has a normal local `.git` worktree.

A production release is accepted only after the canonical URL converges to the verified SHA and passes checks for:

- source-bound release metadata;
- SHA-256 integrity manifest binding;
- health;
- canonical capability names;
- OpenAPI/MCP surface;
- safe pricing output;
- source-bound commercial readiness evidence;
- CodeQL.

The release gate also installs from the exact lockfile, rejects high-severity dependency findings, verifies the package surface, and emits an SPDX 2.3 SBOM. Dependabot monitors npm and GitHub Actions dependencies.

A Vercel deployment marked `READY` is not sufficient production evidence if canonical source/API/integrity verification fails.

## Security principles

- no `eval`, `new Function`, arbitrary shell execution or generic arbitrary-URL agent fetcher;
- strict first-party CSP and bounded HTTP bodies/responses;
- external research content is untrusted content;
- unsupported workflow/transport inputs fail explicitly;
- cross-origin browser tool exposure is default-deny;
- secrets are not model/tool arguments;
- API/CI credentials are one-time reveal and hash-only at rest in the commercial design;
- browser/service restrictions are represented as evidence, not bypass opportunities.

See [`SECURITY.md`](SECURITY.md) before modifying connector, protocol, credential or execution boundaries.

## Production governance

Application tests cannot replace repository administration. An industry deployment should protect `main` with required pull requests, KATA Release Gate, CodeQL, blocked force-push/deletion and reviewed changes. The connected GitHub application does not currently have repository-administration authority to create those rules automatically.

## Contributing

High-value contributions include connector fixtures, workflow examples, protocol compatibility cases, interop evidence fixtures, security tests and carefully bounded integrations. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Related projects

- [PACT](https://github.com/dharan1007/pact) — transactional safety for consequential agent actions.
- [SPOOL](https://github.com/dharan1007/spool) — deterministic local-first data migration.
- [FAULTLINE](https://github.com/dharan1007/faultline) — causal browser-failure reduction.

## License

MIT — see [`LICENSE`](LICENSE).

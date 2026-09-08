# KATA

**Teach repeatable research workflows once, then expose them as deterministic tools for humans and agents.**

KATA combines a real scholarly-data connector, a durable browser workspace, demonstration-derived workflow programs and one canonical semantic engine exposed through HTTPS, remote MCP, browser WebMCP and model-native function schemas.

[**Try KATA**](https://kata-webmcp.vercel.app/) · [Developers](https://kata-webmcp.vercel.app/developers) · [Tools](https://kata-webmcp.vercel.app/tools) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Roadmap](ROADMAP.md)

[![KATA Release Gate](https://github.com/dharan1007/kata/actions/workflows/release-gate.yml/badge.svg)](https://github.com/dharan1007/kata/actions/workflows/release-gate.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## The idea in one minute

```text
research task
   ↓
search real scholarly data
   ↓
save / prioritize / tag / annotate
   ↓
demonstrate a workflow twice
   ↓
KATA anti-unifies the demonstrations
   ↓
portable validated workflow program
   ↓
invoke through UI / HTTPS / MCP / WebMCP / model tool schemas
```

KATA's goal is not to hide nondeterminism behind an "agent" label. Connector failures remain explicit. Tool arguments are schema-validated. Automations are preview-bound. Browser cancellation is propagated through fetch/state commits. The same semantic engine powers every surface.

## Try the real product

Open [kata-webmcp.vercel.app](https://kata-webmcp.vercel.app/) and use the product routes:

- `/research` — search live OpenAlex data and work with normalized results.
- `/dashboard` — inspect the durable browser workspace.
- `/automations` — create preview-bound automations.
- `/teach` — derive reusable programs from demonstrations.
- `/tools` — inspect the canonical tool surface.
- `/developers` — integration and protocol guidance.
- `/activity` — inspect recent workspace activity.

The production connector is **OpenAlex**. KATA does not replace a failed real connector request with synthetic success data.

## Why KATA exists

Agent workflows often fail in two opposite ways:

1. every new workflow becomes hand-written integration code, or
2. a model is given broad tools and expected to rediscover the procedure every time.

KATA explores a stricter middle layer: reusable workflow semantics derived from examples, represented as validated programs and invoked through a stable canonical tool registry.

| Problem | KATA's boundary |
|---|---|
| Scholarly discovery | Live OpenAlex search with typed upstream failures |
| Repeated human procedure | Two-demonstration anti-unification into portable programs |
| Agent integration | Canonical schemas projected into multiple tool protocols |
| Browser automation | Preview-bound triggers and bounded nested execution |
| Protocol drift | Explicit MCP compatibility paths rather than silent guessing |
| Cancellation | Abort propagated through browser requests/state commits |
| Cross-origin exposure | Default deny; explicit origin configuration required |
| State | Browser-owned durable workspace; no hidden cloud-workspace claims |

## What is implemented

- Live OpenAlex search with bounded retry, timeout, normalization, optional API-key authentication and rate-limit telemetry.
- Versioned durable browser workspace.
- Allowlisted semantic commands for saved work, priority, tags and notes.
- Preview-bound transactional automations with `AFTER_SEARCH`, `WORKSPACE_OPEN` and `MANUAL` triggers.
- Nested automation tool calls with a maximum execution depth of four.
- Two-demonstration anti-unification into portable JSON-Schema programs.
- Remote MCP with the protocol paths currently documented below.
- Browser WebMCP through `document.modelContext.registerTool()` with abortable registration generations and invocation cancellation.
- Generic `/api/invoke` plus OpenAI-, Anthropic- and Gemini-style schema projections from the same canonical registry.
- Bounded API bodies and canonical JSON-Schema argument validation.
- No runtime npm dependencies in the current package.

## Canonical API

Public HTTP surfaces:

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
```

Compatibility alias:

```text
/api/openalex/search → /api/search
```

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

## OpenAlex production configuration

KATA works without a key, but authenticated OpenAlex usage can provide a materially larger allowance and account-specific usage telemetry.

Optional server-side variable:

```text
OPENALEX_API_KEY
```

It is sent only to `api.openalex.org` as an authorization credential and is not returned to clients.

When the upstream provides rate-limit headers, KATA normalizes non-secret usage information under `meta.rateLimit` so callers can distinguish connector exhaustion from product failure.

## Remote MCP

KATA exposes remote MCP at:

```text
POST /api/mcp
```

The repository currently implements explicit paths for the protocol contracts documented by the checked-in release, including modern stateless request routing and compatibility with the earlier handshake-era path. See `GET /api/capabilities` for the machine-readable contract and the existing test suite for exact accepted/rejected envelopes.

A modern tool call routes an explicit method and tool name and includes protocol metadata; KATA rejects disagreement rather than guessing caller intent.

Optional server variables:

```text
MCP_BEARER_TOKEN
MCP_ALLOWED_ORIGINS
```

`MCP_BEARER_TOKEN` protects remote MCP with bearer authentication. Browser-origin remote MCP is default-deny when no origin allowlist is configured; non-browser MCP clients do not require an Origin header.

## WebMCP

KATA targets the current imperative browser producer API through `document.modelContext.registerTool()` when the browser provides it.

Registration generations share an `AbortController`; refreshing/disposal aborts stale registrations. Invocation `AbortSignal`s propagate into KATA's browser request path so cancelled search/automation/program executions do not commit partial workspace state.

Cross-origin exposure is opt-in. A deployment may provide exact trusted HTTPS origins through:

```html
<meta name="kata-webmcp-exposed-to" content="https://agent.example,https://partner.example">
```

Malformed origins, wildcards, credentials, paths, query strings and fragments are discarded. Stock deployment framing policy remains restrictive unless an operator deliberately changes it.

## Product boundary

KATA's browser triggers execute while KATA is open. The current release does **not** claim unattended cloud scheduling because it intentionally has no durable authenticated cloud workspace/runner.

Modern protocol calls are stateless: callers provide workspace snapshots and receive validated next snapshots. KATA does not hide a server-side session merely to make demos look stateful.

## Run locally

Requirement: Node.js 24.x.

```bash
git clone https://github.com/dharan1007/kata.git
cd kata
npm install
npm run check
```

The current package declares no runtime dependencies.

## Verification

```bash
npm test
npm run build
npm run static-check
npm run check
```

Production promotion should be treated separately from code verification: a green release gate does not turn a failed deployment into a successful one. Verify the canonical deployment and live APIs after promotion.

## Security principles

- No `eval`, `new Function`, arbitrary shell execution or generic URL-fetch agent tool.
- Strict CSP with first-party scripts/styles/connections only.
- Scholarly output is untrusted content and must be escaped before rendering.
- External result links accept only HTTP(S).
- API bodies are bounded.
- Canonical JSON Schema validates tool arguments before handler execution.
- Unsupported automation triggers are rejected rather than silently downgraded.
- Cross-origin browser tool exposure is default-deny.

See [`SECURITY.md`](SECURITY.md) before changing protocol, connector or execution boundaries.

## Contributing

KATA needs connector fixtures, workflow examples, protocol compatibility tests, documentation and carefully bounded integrations. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md), [`good first issue`](https://github.com/dharan1007/kata/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22), or [`help wanted`](https://github.com/dharan1007/kata/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).

## Roadmap

See [`ROADMAP.md`](ROADMAP.md). The priority is to prove reusable workflow generalization and integration reliability before expanding into a catalogue of shallow connectors.

## Related projects

- [PACT](https://github.com/dharan1007/pact) — transactional safety for consequential agent actions.
- [SPOOL](https://github.com/dharan1007/spool) — deterministic local-first data migration.
- [FAULTLINE](https://github.com/dharan1007/faultline) — causal browser-failure reduction.

## License

MIT — see [`LICENSE`](LICENSE).

If KATA solves a workflow/research-automation problem you care about, star the repository to follow development and help other agent-tool builders discover it.
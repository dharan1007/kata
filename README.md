# KATA v3

KATA is a deterministic research-automation substrate for humans and agents. One canonical semantic engine is exposed through the web UI, generic HTTPS, remote MCP, browser WebMCP, OpenAI-style function schemas, Anthropic-style tool schemas, and Gemini function-tool schemas.

KATA does not substitute synthetic connector output when a real integration fails. The production connector is OpenAlex; upstream failures are explicit and typed.

## What is real

- Live OpenAlex search with bounded retry, timeout, normalization, optional API-key authentication, upstream rate-limit telemetry, and no mock fallback.
- Browser-owned durable workspace using versioned local storage.
- Allowlisted semantic commands: save work, priority, tags, and notes.
- Preview-bound, transactional automations with `AFTER_SEARCH`, `WORKSPACE_OPEN`, and `MANUAL` triggers.
- Nested automation tool calls with a maximum execution depth of four.
- Two-demonstration anti-unification into portable JSON-Schema programs.
- Remote MCP with native `2026-07-28` stateless `server/discover`, `tools/list`, `tools/call`, `Mcp-Method`, `Mcp-Name`, list TTL/cache scope, optional bearer auth, and Origin allowlisting.
- Backward-compatible MCP `2025-11-25` handshake-era support for `initialize`, `notifications/initialized`, `ping`, `tools/list`, and `tools/call`, without requiring 2026 routing headers.
- Browser WebMCP through `document.modelContext.registerTool()` with abortable registration generations, invocation cancellation propagated through browser fetches/state commits, and opt-in secure-origin cross-frame exposure.
- Generic `/api/invoke` plus `/api/agents` OpenAI, Anthropic, and Gemini schema bridges derived from the same canonical registry.

## Product boundary

KATA's browser triggers execute while KATA is open. It does not claim unattended cloud scheduling because this release intentionally has no durable authenticated cloud workspace/runner. Protocol state is stateless: callers send workspace snapshots and receive validated next snapshots. Legacy MCP compatibility is also served without hidden server session state.

## Run and verify

Requirement: Node.js 24.x, matching the production Vercel runtime and release gate.

```bash
npm test
npm run build
npm run static-check
npm run check
```

No runtime npm dependencies are required.

## Public routes

`/`, `/dashboard`, `/research`, `/automations`, `/teach`, `/tools`, `/developers`, `/activity`, `/learn`, `/settings`.

## HTTP/API surfaces

- `GET /api/health`
- `GET /api/capabilities`
- `GET /api/search?query=web%20agents&limit=8`
- `POST /api/invoke`
- `POST /api/triage`
- `POST /api/compile`
- `POST /api/execute`
- `GET /api/agents`
- `POST /api/mcp`
- `GET /api/openapi`
- Compatibility alias: `/api/openalex/search` → `/api/search`

### Generic tool invocation

```json
POST /api/invoke
{
  "name": "kata_search_research",
  "arguments": {"query":"web agents","limit":5}
}
```

### OpenAlex production configuration

KATA works without an OpenAlex key, but OpenAlex's current production guidance recommends using a free API key for real-scale applications because authenticated usage receives a materially larger daily allowance and exposes account-specific usage tracking.

Optional environment variable:

- `OPENALEX_API_KEY`: sent only server-side as `Authorization: Bearer ...` to `api.openalex.org`. It is never returned to KATA clients.

When OpenAlex returns rate-limit headers, KATA exposes the non-secret usage telemetry under `meta.rateLimit`:

```json
{
  "limit": 10000,
  "remaining": 8766,
  "creditsUsed": 1,
  "resetSeconds": 43200
}
```

This allows operators and agent integrations to distinguish healthy connector capacity from an approaching upstream budget/rate-limit boundary without exposing credentials.

## Remote MCP

Endpoint: `POST /api/mcp`.

### MCP 2026-07-28

Modern requests are stateless and self-describing. Every modern request must include the `MCP-Protocol-Version` and `Mcp-Method` routing headers. A `tools/call` request must additionally include `Mcp-Name`, and that value must exactly match `params.name`.

Every modern request must also include `params._meta` with:

- `io.modelcontextprotocol/protocolVersion`: exactly `2026-07-28`. It must match the `MCP-Protocol-Version` header.
- `io.modelcontextprotocol/clientCapabilities`: an object. Use `{}` when the client has no additional capabilities to declare.
- `io.modelcontextprotocol/clientInfo`: optional client information object.

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
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "kata_search_research",
    "arguments": {
      "query": "web agents",
      "limit": 3
    },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

KATA rejects missing modern metadata, protocol header/body disagreement, `Mcp-Method` disagreement, and `Mcp-Name`/tool-name disagreement rather than silently guessing the caller's intent. `GET /api/capabilities` publishes these required headers and metadata keys so clients can discover the request contract programmatically.

### MCP 2025-11-25 compatibility

Handshake-era clients using `2025-11-25` are accepted on the same endpoint. They may initialize with the standard `initialize` request, acknowledge with `notifications/initialized`, and then call `tools/list`, `tools/call`, or `ping` using `MCP-Protocol-Version: 2025-11-25`. They do not need the 2026 `Mcp-Method`, `Mcp-Name`, or 2026 `_meta` request envelope.

`GET /api/capabilities` exposes both supported versions so agents and integrations can choose the correct path explicitly.

Optional environment variables:

- `MCP_BEARER_TOKEN`: require `Authorization: Bearer ...` for remote MCP.
- `MCP_ALLOWED_ORIGINS`: comma-separated browser Origins allowed to call remote MCP. Browser-origin MCP is denied by default when no allowlist is configured; non-browser MCP clients do not need an Origin header.

## WebMCP

KATA targets the current `document.modelContext` producer API. A registration generation uses a shared `AbortController`; refreshing or disposing aborts old registrations. Browsers without WebMCP remain usable through HTTP/MCP and show compatibility status instead of pretending WebMCP is connected. Invocation `AbortSignal`s are propagated through KATA's browser request path; cancelled search/automation/program executions do not commit partial browser workspace state.

Cross-origin tool discovery is default-deny. To intentionally expose an embedded KATA instance to specific parent/agent origins, add a trusted static configuration meta tag before KATA's module script:

```html
<meta name="kata-webmcp-exposed-to" content="https://agent.example,https://partner.example">
```

KATA validates this list and forwards only exact HTTPS origins through `registerTool(..., { exposedTo })`. Wildcards, HTTP origins, credentials, paths, query strings, fragments, and malformed values are discarded. If the meta tag is absent or no valid origins remain, KATA omits `exposedTo` entirely and retains WebMCP's same-origin default.

Chrome's cross-origin WebMCP model has two additional gates outside KATA. The parent page must delegate the `tools` Permissions Policy to the iframe:

```html
<iframe src="https://kata.example" allow="tools"></iframe>
```

The parent/agent must then explicitly request KATA's origin when discovering tools:

```js
const tools = await document.modelContext.getTools({
  fromOrigins: ['https://kata.example']
});
```

All three WebMCP conditions are required: parent `allow="tools"`, KATA `exposedTo`, and caller `fromOrigins`. KATA does not bypass any of these browser security boundaries.

Framing policy is a separate browser boundary. The stock `vercel.json` intentionally ships `frame-ancestors 'none'` and `X-Frame-Options: DENY`, so the public KATA deployment cannot be embedded by another origin. Operators who intentionally enable cross-origin iframe use must change their deployment's framing policy to an explicit trusted-parent allowlist; do not use wildcard framing. The hosted KATA deployment remains non-embeddable unless that policy is deliberately changed.

## Security/release policy

- No `eval`, `new Function`, arbitrary shell execution, or generic URL-fetch agent tool.
- Strict CSP with first-party scripts/styles/connections only.
- External scholarly output is treated as untrusted content and escaped before rendering.
- External result links accept only HTTP(S).
- API bodies are bounded.
- Tool arguments are validated against canonical JSON Schema before handler execution.
- Unsupported automation triggers are rejected, never silently downgraded.
- Production is not promoted unless tests, build, integrity/security checks, Vercel build status, live routes, APIs, OpenAlex, and runtime-error checks pass.

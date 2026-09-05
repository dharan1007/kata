# KATA v3

KATA is a deterministic research-automation substrate for humans and agents. One canonical semantic engine is exposed through the web UI, generic HTTPS, remote MCP, browser WebMCP, OpenAI-style function schemas, and Anthropic-style tool schemas.

KATA does not substitute synthetic connector output when a real integration fails. The production connector is OpenAlex; upstream failures are explicit and typed.

## What is real

- Live OpenAlex search with bounded retry, timeout, normalization, and no mock fallback.
- Browser-owned durable workspace using versioned local storage.
- Allowlisted semantic commands: save work, priority, tags, and notes.
- Preview-bound, transactional automations with `AFTER_SEARCH`, `WORKSPACE_OPEN`, and `MANUAL` triggers.
- Nested automation tool calls with a maximum execution depth of four.
- Two-demonstration anti-unification into portable JSON-Schema programs.
- Remote MCP with native `2026-07-28` stateless `server/discover`, `tools/list`, `tools/call`, `Mcp-Method`, `Mcp-Name`, list TTL/cache scope, optional bearer auth, and Origin allowlisting.
- Backward-compatible MCP `2025-11-25` handshake-era support for `initialize`, `notifications/initialized`, `ping`, `tools/list`, and `tools/call`, without requiring 2026 routing headers.
- Browser WebMCP through `document.modelContext.registerTool()` with abortable registration generations.
- Generic `/api/invoke` plus `/api/agents` OpenAI/Anthropic schema bridges derived from the same registry.

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

KATA targets the current `document.modelContext` producer API. A registration generation uses a shared `AbortController`; refreshing or disposing aborts old registrations. Browsers without WebMCP remain usable through HTTP/MCP and show compatibility status instead of pretending WebMCP is connected.

## Security/release policy

- No `eval`, `new Function`, arbitrary shell execution, or generic URL-fetch agent tool.
- Strict CSP with first-party scripts/styles/connections only.
- External scholarly output is treated as untrusted content and escaped before rendering.
- External result links accept only HTTP(S).
- API bodies are bounded.
- Tool arguments are validated against canonical JSON Schema before handler execution.
- Unsupported automation triggers are rejected, never silently downgraded.
- Production is not promoted unless tests, build, integrity/security checks, Vercel build status, live routes, APIs, OpenAlex, and runtime-error checks pass.

# KATA v3

KATA is a deterministic research-automation substrate for humans and agents. One canonical semantic engine is exposed through the web UI, generic HTTPS, remote MCP `2026-07-28`, browser WebMCP, OpenAI-style function schemas, and Anthropic-style tool schemas.

KATA does not substitute synthetic connector output when a real integration fails. The production connector is OpenAlex; upstream failures are explicit and typed.

## What is real

- Live OpenAlex search with bounded retry, timeout, normalization, and no mock fallback.
- Browser-owned durable workspace using versioned local storage.
- Allowlisted semantic commands: save work, priority, tags, and notes.
- Preview-bound, transactional automations with `AFTER_SEARCH`, `WORKSPACE_OPEN`, and `MANUAL` triggers.
- Nested automation tool calls with a maximum execution depth of four.
- Two-demonstration anti-unification into portable JSON-Schema programs.
- Remote MCP `2026-07-28` with `server/discover`, `tools/list`, `tools/call`, `Mcp-Method`, `Mcp-Name`, list TTL/cache scope, optional bearer auth, and Origin allowlisting.
- Browser WebMCP through `document.modelContext.registerTool()` with abortable registration generations.
- Generic `/api/invoke` plus `/api/agents` OpenAI/Anthropic schema bridges derived from the same registry.

## Product boundary

KATA's browser triggers execute while KATA is open. It does not claim unattended cloud scheduling because this release intentionally has no durable authenticated cloud workspace/runner. Protocol state is stateless: callers send workspace snapshots and receive validated next snapshots.

## Run and verify

Requirement: Node.js 22+.

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

Modern requests use protocol `2026-07-28` and include `MCP-Protocol-Version` plus `Mcp-Method`; `tools/call` additionally includes `Mcp-Name` matching `params.name`.

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

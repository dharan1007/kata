# AGENTS.md — KATA

## Product

KATA is a deterministic research-automation substrate. A canonical semantic registry powers the human UI, HTTPS, remote MCP, browser WebMCP and model-specific tool-schema projections. The production scholarly connector is OpenAlex; failures are explicit rather than replaced with synthetic success.

## Non-negotiable invariants

- Never add fake connector fallback data that can be mistaken for a successful real integration.
- Keep one canonical command/tool registry; protocol surfaces are projections, not separate business logic.
- Validate tool arguments against canonical JSON Schema before execution.
- Preserve abort/cancellation semantics so cancelled work cannot commit partial browser workspace state.
- Keep cross-origin WebMCP exposure default-deny unless exact trusted origins are configured.
- Reject unsupported automation/program behavior instead of silently degrading it.
- Do not describe KATA as an unattended cloud scheduler without an authenticated durable cloud runner.
- Protocol-version claims must be backed by conformance tests and current specification review.

## Read first

1. `README.md`
2. `SECURITY.md`
3. `lib/server/engine.js`
4. `lib/server/schema.js`
5. `lib/server/tools.js`
6. `lib/server/mcp.js` for MCP work
7. `src/webmcp.js` for browser WebMCP work
8. `ROADMAP.md`

## Verification

```bash
npm install
npm test
npm run build
npm run static-check
npm run check
```

Node.js 24.x is the release/runtime contract.

## Change discipline

- Add accepted and rejected protocol fixtures together.
- Add deterministic unit fixtures for connector normalization.
- Keep client-specific examples outside the canonical business-logic layer.
- Never put API keys/tokens in fixtures, docs or client-visible responses.
- Update `server.json`, capabilities/docs and tests together when the public MCP contract changes.
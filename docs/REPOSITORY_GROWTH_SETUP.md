# KATA GitHub Discovery Setup

## About panel

**Description**

> Teach agents repeatable research workflows by demonstration. KATA turns them into deterministic reusable tools exposed through MCP, WebMCP, HTTPS and model-native schemas.

**Homepage**

`https://kata-webmcp.vercel.app/`

**Topics**

`ai-agents`, `agent-tools`, `research-automation`, `research-tools`, `workflow-automation`, `model-context-protocol`, `mcp`, `webmcp`, `tool-use`, `function-calling`, `openalex`, `developer-tools`, `agentic-ai`, `javascript`

## Repository features

Enable Issues and Discussions. Maintain a public Project only if roadmap issues are kept current. Disable an empty Wiki rather than presenting an unused tab.

Discussion categories:

1. Announcements
2. Q&A
3. Ideas
4. Show and tell
5. RFC / design
6. Connectors and clients

Pin a welcome post, roadmap post and a "share a workflow you taught KATA" Show & Tell prompt.

## Social preview

Use a 1280×640 high-contrast card built around:

```text
DEMONSTRATE TWICE
       ↓
      KATA
       ↓
REUSABLE AGENT WORKFLOW

One semantic engine.
MCP + WebMCP + HTTPS.
```

Do not fill the card with protocol versions; those change faster than the product thesis.

## MCP Registry

`server.json` is prepared for the official MCP Registry using the public remote Streamable HTTP endpoint.

Before publishing:

1. Confirm the canonical production deployment is healthy.
2. Confirm `/api/mcp` behavior matches the server metadata and checked-in tests.
3. Validate `server.json` against the current official schema/registry tooling.
4. Authenticate publisher ownership through GitHub.
5. Publish with the current official `mcp-publisher` flow.
6. Verify `io.github.dharan1007/kata` is discoverable in the official registry.

Registry publishing requires publisher credentials and should never be automated by embedding a GitHub token in this repository.

## Main branch policy

Recommended:

- require `KATA Release Gate`,
- block force pushes/deletion,
- require conversation resolution,
- prefer squash merging external contributions,
- delete merged branches,
- treat production deployment success as a separate release signal rather than assuming green code CI means production is live.

## Security / analysis

Enable where available:

- dependency graph,
- Dependabot alerts/security updates,
- secret scanning,
- push protection,
- CodeQL/default code scanning.

Add OpenSSF Scorecard only when its findings are actively maintained.

## Contributor discovery

Maintain a bounded set of real workflow, connector and protocol tasks under `good first issue` / `help wanted`.

Contributor landing page:

`https://github.com/dharan1007/kata/contribute`

## Launch gate

Before a major external launch:

- local release gate green,
- production deployment workflow green,
- canonical domain healthy,
- OpenAlex live search verified,
- `/api/capabilities` and `/api/openapi` healthy,
- remote MCP exercised from at least one real client,
- README quickstart verified from a clean clone,
- no protocol claims that exceed checked-in tests.

## Narrative

Lead with the workflow problem, not protocol revision numbers:

> KATA lets you demonstrate a repeatable research workflow, represent it as a validated reusable program and invoke the same semantics through human UI or agent tools. Its production research connector is real OpenAlex data, and upstream failure stays explicit.

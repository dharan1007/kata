# KATA Interoperability Inspector

This Manifest V3 companion extension inspects the web app in the user's currently active tab and evaluates observed evidence through KATA's canonical interoperability engine.

## Build and load

Run `npm run build`, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/extension`.

The source `extension/` directory is not itself the load-unpacked artifact. The build copies KATA's canonical runtime probe, API discovery parser, API agent-contract compiler, API execution module, and modern MCP adapter into the extension package and rewrites service-worker imports to those packaged copies. The release integrity manifest covers the packaged modules so browser/API/MCP behavior cannot silently drift.

## Permission and security model

The extension requests only `activeTab`, `scripting`, and host access to `https://kata-webmcp.vercel.app/*`. It does not request `<all_urls>`, cookies, webRequest, debugger, history, downloads, native messaging, clipboard access, or persistent content scripts.

Target application access is bound to the explicitly authorized active tab. Remote MCP endpoints must be same-origin HTTPS; loopback HTTP is allowed only for local development. KATA does not bypass authentication, CAPTCHAs, bot defenses, CSP, CORS, Permissions Policy, rate limits, paywalls, or service terms.

## Runtime and API interoperability

**Inspect current tab** runs KATA's canonical runtime probe in the authorized top-level page. It observes only browser/runtime interoperability evidence exposed by the page, such as WebMCP availability, frame relationship, framework hints, open shadow-root topology, iframe topology, and declared machine-readable API descriptions.

**Compile discovered API tools** turns standards-declared OpenAPI operations into local model-ready candidate contracts. A same-origin operation can execute only after a fresh request preview and explicit execution action. The exact request contract is SHA-256 bound; redirects are rejected; requests and response bodies are bounded; there are no automatic retries; and credentials are never accepted as model arguments. Browser-managed same-origin credentials are eligible only when the declaring OpenAPI security scheme actually describes compatible cookie authentication.

Compiled API contracts, previews, bounded responses, and receipts stay local to the extension.

## MCP endpoint inspection

**Inspect MCP endpoint** sends a credential-free `server/discover` request for MCP `2026-07-28`. HTTP 401 remains an authorization boundary. KATA may inspect same-origin RFC 9728 Protected Resource Metadata, but it does not contact the authorization server or begin OAuth. Legacy method-not-found is classified as a legacy candidate without performing a hidden `initialize` handshake.

When the endpoint is same-origin, modern, public, and advertises tools, **List public modern MCP tools** performs bounded `tools/list` pagination. KATA validates executable input schemas, `x-mcp-header` routing contracts, response limits, and transport policy. Tool annotations are treated as untrusted metadata.

Every `tools/call` is separately previewed, SHA-256 fingerprinted, explicitly approved, and preceded by fresh discovery/listing so contract drift invalidates stale approval. Credentials remain `omit`, redirects remain manual, and calls are never automatically retried.

## Multi-round input

Synchronous MCP `input_required` is supported through explicit user-driven rounds. Only `elicitation/create` is auto-renderable by this driver; URL elicitation, sampling, and roots are not auto-fulfilled. Each round gets a fresh preview and approval, the server's `requestState` remains opaque, only current-round `inputResponses` are sent, and the process is bounded to 10 rounds, 16 requests per round, and 64 KiB of opaque request state.

## MCP Tasks extension

KATA supports the MCP `2026-07-28` Tasks extension identifier `io.modelcontextprotocol/tasks` for tools whose `execution.taskSupport` is `optional` or `required`.

Task support is deliberately explicit and bounded:

- the Tasks client capability is advertised only on task-capable tool calls and task lifecycle requests;
- a `resultType: "task"` response is surfaced as a local opaque task handle instead of being treated as a tool failure;
- `tasks/get` is a one-shot, user-triggered refresh; KATA never polls in the background;
- Streamable HTTP `tasks/get`, `tasks/update`, and `tasks/cancel` set `Mcp-Name` to the exact validated task ID and `Mcp-Method` to the task method;
- task IDs are bounded to 4096 bytes and must be header-safe ASCII. They are never silently encoded or uploaded to KATA;
- `tasks/update` accepts only responses for currently outstanding task `inputRequests`, and only bounded `elicitation/create` requests are user-fillable;
- task input updates and cancellations each receive their own SHA-256-bound preview and explicit approval;
- `tasks/cancel` is treated as cooperative cancellation intent. KATA does not claim the task is terminal until a later `tasks/get` establishes terminal state;
- task requests use `credentials: omit`, manual redirects, the same 1 MiB response ceiling, and the same 15-second request-plus-body deadline as other MCP adapter traffic;
- no `tasks/list` exists or is emulated;
- task notifications/subscriptions are not enabled in this bounded driver;
- completed task results are validated against the originating tool's supported `outputSchema` subset when available;
- task handles, task input, previews, results, and receipts remain local to the extension.

The popup intentionally requires **Refresh task state** for every observation. If a task reaches `input_required`, the user must preview and approve the exact `tasks/update`. Cancellation likewise requires a separate preview and approval. This avoids turning a long-running server task into an unattended automation channel.

Task handles are currently ephemeral extension state rather than a durable cloud queue. Closing the active popup can lose the local handle; KATA therefore does not claim crash-resumable or unattended task driving yet.

## What leaves the browser

Only the normalized interoperability `environment` accepted by `kata_diagnose_web_interop` and the selected intent are sent to KATA. URL/origin details, framework hints, DOM topology, declared API-description URLs, compiled API contracts, API receipts, MCP endpoint/server identity, authorization metadata, MCP tool contracts, tool previews, `input_required` continuations, MCP task IDs/handles, task input, task previews, task results, and execution receipts remain local.

## Deliberate non-goals

The extension is not a generic remote URL executor, credential extractor, hidden OAuth client, background task scheduler, or security-control bypass. Protected MCP servers remain setup-required, legacy MCP remains inspection-only, and unknown evidence remains unknown.

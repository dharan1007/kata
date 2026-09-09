# KATA Interoperability Inspector

This is a Manifest V3 companion extension for inspecting the real web app in the user's currently active tab and evaluating observed evidence through KATA's canonical interoperability engine.

## Build and load

Run `npm run build`, then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/extension`.

The source `extension/` directory is not itself the load-unpacked artifact because the build copies KATA's canonical runtime probe, API discovery parser, API agent-contract compiler, API execution module, and modern MCP adapter into the extension package and rewrites the service-worker imports to those packaged copies. The release integrity manifest covers all of them so browser, API, and MCP behavior cannot silently drift through an incomplete production artifact.

## Permission model

The extension requests only:

- `activeTab` — temporary access to the current tab after the user invokes the extension;
- `scripting` — execute canonical KATA inspection and bounded API execution functions in the authorized tab;
- host access to `https://kata-webmcp.vercel.app/*` — send the bounded interoperability environment to KATA's diagnostic API.

It does not request `<all_urls>`, cookies, webRequest, debugger, history, downloads, native messaging, clipboard access, or persistent content scripts.

## Runtime inspection

**Inspect current tab** runs KATA's canonical runtime probe in the explicitly authorized top-level page. It observes only runtime interoperability evidence the page/browser exposes, such as WebMCP availability, frame relationship, framework hints, open shadow-root topology, iframe topology and declared machine-readable API descriptions.

## API discovery, compilation and execution

**Compile discovered API tools** takes standards-declared OpenAPI descriptions visible from the authorized tab and converts supported operations into local, model-ready candidate tool contracts. Compilation itself executes nothing and never accepts cookies, bearer tokens, API keys or `Authorization` as model-controlled input.

A compiled operation can enter KATA's execution path only through **Preview exact request** followed by a separate **Execute previewed request** action. Before both preview and execution, KATA re-runs runtime/API discovery and recompiles the operation from the current page. The exact method, URL, declared non-sensitive headers, body, credential mode, redirect policy, timeout and response budget are SHA-256 fingerprinted. If the operation contract, arguments, page origin or preview changes, execution fails before the target request starts.

Execution is deliberately narrower than discovery:

- the final API URL must be same-origin with the explicitly authorized active tab;
- target requests run in the page MAIN world so the site's browser session, CSP, CORS and Fetch behavior remain authoritative;
- a contract with no declared OpenAPI security uses `credentials: omit`;
- a contract declaring security may use only browser-managed `credentials: same-origin`; KATA never reads or returns those credentials and never creates an `Authorization` or `Cookie` header;
- redirects are rejected;
- there are no automatic retries, because KATA does not assume an operation is idempotent;
- the default and hard timeout ceiling is 15 seconds;
- response snapshots are bounded to 1 MiB and may be marked truncated; a truncated response is not falsely reported as a failed mutation because the server may already have committed it;
- state-changing requests require an explicit approval checkbox after the fresh preview;
- every execution action returns a local receipt bound to the preview fingerprint and target response metadata.

If a protected API requires a bearer token, CSRF value or other application-managed credential that the browser does not automatically attach, KATA does not extract it from page/browser storage. The request will remain unauthorized until the service provides a supported integration/authorization mechanism.

Compiled contracts, execution previews, response snapshots and receipts remain local to the extension. They are not uploaded to KATA by this workflow.

## MCP endpoint inspection

**Inspect MCP endpoint** tests a developer-supplied path on the active tab's own origin. Remote endpoints must use HTTPS; cleartext HTTP is allowed only on loopback hosts for local development.

The inspector:

- sends one credential-free MCP `server/discover` request for protocol `2026-07-28`;
- uses `credentials: omit`, `cache: no-store`, and manual redirect handling;
- treats HTTP 401 as an authorization boundary rather than trying to defeat it;
- may read only same-origin RFC 9728 Protected Resource Metadata named by the challenge;
- records authorization-server identifiers as metadata but does not contact them or begin OAuth;
- classifies JSON-RPC method-not-found as a legacy MCP candidate without performing an `initialize` handshake;
- does not call tools, resources, prompts or another server capability during the inspection action;
- never supplies cookies, bearer tokens, API keys or browser-storage credentials.

## Public modern MCP tool adapters

When inspection establishes all of the following — same-origin endpoint, protocol `2026-07-28`, no required authorization, and an advertised `tools` capability — KATA can enter a separate, explicit MCP tool workflow.

**List public modern MCP tools** sends bounded credential-free `tools/list` requests. Pagination is capped, tool count is capped, cache evidence is retained locally, JSON and request-scoped SSE responses are supported, and malformed tool definitions are rejected independently instead of poisoning the entire inventory. KATA treats tool annotations as untrusted metadata.

For Streamable HTTP tool definitions that use `x-mcp-header`, KATA validates the header-name contract, requires statically reachable supported primitive parameters, mirrors the value into `Mcp-Param-*`, and applies the MCP Base64 sentinel encoding when a string cannot be represented safely as a plain HTTP header value. Integer mirrored values must remain within the JavaScript safe-integer range.

The executable adapter intentionally supports a bounded input-schema subset rather than pretending to implement all of JSON Schema 2020-12. Tools whose required input contract cannot be validated by that subset are excluded from executable inventory. Complex `outputSchema` values can remain visible, but receipts say explicitly when KATA could not validate them with its supported subset. Tools that require the MCP Tasks extension are excluded because this adapter does not negotiate or execute Tasks.

Every tool call uses **Preview exact MCP call** followed by a separate approval and **Execute previewed MCP call**. Previewing creates a SHA-256 fingerprint over the endpoint, tool identity, arguments, input/output contract, mirrored routing headers and execution policy. Immediately before execution KATA re-runs `server/discover`, re-lists the live tool inventory, recompiles the tool, and regenerates the fingerprint. Any contract or argument drift fails before `tools/call` starts.

MCP execution remains deliberately narrow:

- only public modern same-origin endpoints can execute;
- `credentials: omit` is mandatory for `server/discover`, `tools/list`, and `tools/call`;
- no cookie, bearer token, API key, browser-storage value or ambient session credential is borrowed;
- every tool invocation requires explicit approval, regardless of tool annotations;
- redirects are not automatically followed and calls are never automatically retried;
- response bodies are bounded to 1 MiB for both JSON and SSE transport responses;
- supported structured outputs are validated against KATA's declared validator subset and the receipt states the exact validation status;
- `input_required` is surfaced as unresolved input, not silently fulfilled or retried;
- OAuth-protected servers remain setup-required; this path does not start OAuth;
- legacy MCP remains inspection-only;
- Tasks-extension-required tools remain non-executable;
- tool contracts, previews, responses and receipts remain local to the extension.

This design intentionally avoids a generic KATA server-side URL probe or arbitrary remote MCP executor, which would create SSRF, credential-forwarding and confused-deputy surfaces. The active-tab permission supplies the user authorization and confines discovery/execution to the website the user is currently viewing.

## What leaves the browser

Only the normalized interoperability `environment` accepted by `kata_diagnose_web_interop` and the user-selected intent are sent to KATA. The current URL, framework hints, DOM topology, declared description URLs, compiled API tool contracts, API execution previews and receipts, MCP endpoint URL, MCP server identity/capabilities, authorization-server identifiers, MCP tool contracts/previews/receipts, page text, form values, cookies, browser storage and credentials remain local to the extension.

## Restrictions

Only top-level HTTP(S) tabs are inspected. Browser-internal pages and non-web schemes are rejected before injection. KATA does not use the extension to bypass authentication, CAPTCHAs, anti-automation controls, CSP, CORS, Permissions Policy, service terms, paywalls or rate limits. Unknown evidence remains unknown.

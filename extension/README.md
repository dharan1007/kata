# KATA Interoperability Inspector

This is a Manifest V3 companion extension for inspecting the real web app in the user's currently active tab and evaluating observed evidence through KATA's canonical interoperability engine.

## Build and load

Run `npm run build`, then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/extension`.

The source `extension/` directory is not itself the load-unpacked artifact because the build copies KATA's canonical runtime probe, API discovery parser, API agent-contract compiler, and API execution module into the extension package and rewrites the service-worker imports to those packaged copies. The release integrity manifest covers all of them so browser and WebMCP behavior cannot silently drift through an incomplete production artifact.

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

- sends one credential-free MCP `server/discover` request for the current `2026-07-28` protocol;
- uses `credentials: omit`, `cache: no-store`, and manual redirect handling;
- treats HTTP 401 as an authorization boundary rather than trying to defeat it;
- may read only same-origin RFC 9728 Protected Resource Metadata named by the challenge;
- records authorization-server identifiers as metadata but does not contact them or begin OAuth;
- classifies JSON-RPC method-not-found as a legacy MCP candidate without performing an `initialize` handshake;
- never calls `tools/list`, `tools/call`, resources, prompts or any other server capability during inspection;
- never supplies cookies, bearer tokens, API keys or browser-storage credentials.

This design intentionally avoids a generic KATA server-side URL probe, which would create an SSRF/rebinding surface. The active-tab permission supplies the user authorization and confines inspection to the website the user is currently viewing.

## What leaves the browser

Only the normalized interoperability `environment` accepted by `kata_diagnose_web_interop` and the user-selected intent are sent to KATA. The current URL, framework hints, DOM topology, declared description URLs, compiled API tool contracts, API execution previews and receipts, MCP endpoint URL, MCP server identity/capabilities, authorization-server identifiers, page text, form values, cookies, browser storage and credentials remain local to the extension.

## Restrictions

Only top-level HTTP(S) tabs are inspected. Browser-internal pages and non-web schemes are rejected before injection. KATA does not use the extension to bypass authentication, CAPTCHAs, anti-automation controls, CSP, CORS, Permissions Policy, service terms, paywalls or rate limits. Unknown evidence remains unknown.

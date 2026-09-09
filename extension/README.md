# KATA Interoperability Inspector

This is a Manifest V3 companion extension for inspecting the real web app in the user's currently active tab and evaluating observed evidence through KATA's canonical interoperability engine.

## Build and load

Run `npm run build`, then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/extension`.

The source `extension/` directory is not itself the load-unpacked artifact because the build copies KATA's canonical runtime probe, API discovery parser, and API agent-contract compiler into the extension package and rewrites the service-worker imports to those packaged copies. The release integrity manifest covers all of them so browser and WebMCP behavior cannot silently drift through an incomplete production artifact.

## Permission model

The extension requests only:

- `activeTab` — temporary access to the current tab after the user invokes the extension;
- `scripting` — execute the canonical KATA probe in the authorized tab;
- host access to `https://kata-webmcp.vercel.app/*` — send the bounded interoperability environment to KATA's diagnostic API.

It does not request `<all_urls>`, cookies, webRequest, debugger, history, downloads, native messaging, clipboard access, or persistent content scripts.

## Runtime inspection

**Inspect current tab** runs KATA's canonical runtime probe in the explicitly authorized top-level page. It observes only runtime interoperability evidence the page/browser exposes, such as WebMCP availability, frame relationship, framework hints, open shadow-root topology, iframe topology and declared machine-readable API descriptions.

## API agent-contract compilation

**Compile discovered API tools** takes standards-declared OpenAPI descriptions visible from the authorized tab and converts supported operations into local, model-ready candidate tool contracts.

The compiler is deliberately preview-only:

- it does not invoke target API operations;
- it does not extract or accept API keys, bearer tokens, cookies, `Authorization`, or other credential/transport headers as model tool arguments;
- it keeps declared security requirements as explicit metadata instead of treating discovery as authorization;
- it preserves supported path, query, non-sensitive header and JSON request-body shapes;
- it resolves bounded local `#/components/...` references needed for those inputs;
- it never follows external OpenAPI `$ref` URLs;
- unresolved required inputs, cyclic required schema references, unsafe/unresolved servers and invalid/duplicate agent names are rejected rather than guessed;
- request previews remain `readyToExecute: false` until a future explicitly authorized execution layer establishes authentication, consent and service-policy prerequisites.

Compiled contracts remain local to the extension. They are not uploaded to KATA by this workflow.

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

Only the normalized interoperability `environment` accepted by `kata_diagnose_web_interop` and the user-selected intent are sent to KATA. The current URL, framework hints, DOM topology, declared description URLs, compiled API tool contracts, MCP endpoint URL, MCP server identity/capabilities, authorization-server identifiers, page text, form values, cookies, browser storage and credentials remain local to the extension.

## Restrictions

Only top-level HTTP(S) tabs are inspected. Browser-internal pages and non-web schemes are rejected before injection. KATA does not use the extension to bypass authentication, CAPTCHAs, anti-automation controls, CSP, CORS, Permissions Policy, service terms, paywalls or rate limits. Unknown evidence remains unknown.

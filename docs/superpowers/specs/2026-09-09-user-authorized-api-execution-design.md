# User-authorized OpenAPI execution design

## Goal

Turn KATA's standards-discovered OpenAPI candidate contracts into a constrained real execution path for the web app the user explicitly authorized, without creating a generic URL fetcher, extracting credentials, bypassing browser policy, or allowing a stale preview to authorize a changed request.

## Decision

Execute only through the authorized tab's page MAIN world. The extension service worker must rediscover the OpenAPI contract from the current tab before preview and again immediately before execution. It compiles the operation through the canonical API adapter, builds the exact request, checks that the final request origin equals the active page origin, and binds the exact request to a SHA-256 preview fingerprint. Execution requires a second explicit approval and the expected fingerprint. A mismatch fails closed before any page fetch.

This is preferred over extension-worker fetch because MAIN-world fetch preserves the website's own same-origin/CORS/CSP/session behavior instead of giving KATA a stronger extension-origin network path. It is preferred over server-side proxy execution because a proxy would require new secret custody and authorization semantics and would bypass the user's browser policy context.

## Security boundary

KATA never accepts an arbitrary execution URL. The operation must be re-derived from a standards-discovered OpenAPI description on the active tab and compiled through `compileOpenApiCandidates`. Cross-origin candidate URLs remain inspectable but are not executable in this path. Redirects are rejected. Remote cleartext HTTP remains subject to the existing page/extension inspection rules; this feature does not add new host permissions.

The request preview excludes forbidden credential and transport headers already blocked by `api-adapter.js`. For operations without declared OpenAPI security, execution uses `credentials: omit`. When the contract declares security, KATA may use only browser-managed same-origin credentials with `credentials: same-origin`; it does not read cookies, localStorage, sessionStorage, password stores, or bearer/API-key material and does not synthesize authorization headers. If the site's authenticated API requires JavaScript-managed bearer headers or anti-CSRF material not declared as safe operation input, the request fails normally and KATA reports that authorization/setup is not established.

Execution validates generated arguments against KATA's canonical shared JSON Schema validator before fingerprinting. Only a bounded schema vocabulary KATA can enforce precisely is executable; unsupported union/composition/schema constructs remain discoverable/compilable but fail closed at the execution boundary. Request size is bounded independently of schema metadata: 16 KiB URL, 32 KiB aggregate declared headers, and 256 KiB body.

All methods require an explicit second execution action after preview. State-changing methods (`POST`, `PUT`, `PATCH`, `DELETE` and non-safe custom methods) are marked as such in the preview and cannot execute without `approved: true`. No automatic retries are allowed because the operation's idempotency cannot be assumed.

## Preview binding

The preview fingerprint is SHA-256 over a canonical JSON serialization of the current page origin and exact execution request: method, URL, declared non-sensitive headers, body, credential mode, redirect policy, timeout, response budget and state-changing classification. Immediately before execution KATA repeats runtime inspection, OpenAPI discovery and candidate compilation, regenerates the exact preview, and compares the fingerprint using exact string equality. Any navigation, contract drift, argument change, server URL change or policy change invalidates the preview.

## Page execution

`executePageApiRequest(request, runtime)` is a closure-free function suitable for `chrome.scripting.executeScript({world:'MAIN'})`. It validates the request URL against `location.origin`, permits only HTTP(S), enforces `redirect:'error'`, applies a bounded timeout, uses no-store cache semantics, reads at most the configured response byte budget, and returns a bounded result containing status, final URL, content type, byte count, truncation state and response text. It never returns cookies or browser credential material.

The first release caps response snapshots at 1 MiB and timeouts at 15 seconds by default, with hard bounds below those values when callers request tighter limits. Streaming API media remains discoverable but this execution slice returns a bounded response snapshot rather than claiming durable streaming support.

## Receipt and uncertain mutation semantics

A target response produces a local execution receipt containing preview fingerprint, operation name, method, status, byte count, content type, state-changing classification and outcome. HTTP error statuses are still completed transport outcomes and remain visible as target failures.

A timeout, aborted network path or equivalent failure after the request has been handed to Fetch is different: KATA cannot prove whether the remote service committed a mutation. Such attempts return `ok:false`, `attempted:true`, `outcome:'unknown'` and a preview-bound attempt receipt. The UX explicitly warns not to retry automatically. KATA never converts an indeterminate mutation into either a successful receipt or a definite failure. Receipts are local to the extension in this release and are not uploaded to KATA.

## UX

The popup keeps API discovery/compilation local. After compilation the user selects an operation, supplies JSON arguments, and requests a preview. The UI shows method, exact URL, authorization mode, state-changing status and fingerprint. Only then is the Execute control enabled. Execution uses the same operation name and arguments and requires the displayed fingerprint. The UI renders results and receipts with `textContent`; no remote HTML is injected. An unknown execution outcome remains visible together with its attempt receipt after the preview is consumed.

## Verification

Release tests must prove: RED before implementation; same-origin preview and mutation approval; generated-schema validation and request-size limits; fresh rediscovery and stale-fingerprint rejection; cross-origin non-executability; MAIN-world execution; no Authorization/Cookie argument injection; same-origin browser-managed credential mode only when security is declared; redirect/timeout/response bounds; indeterminate mutation outcome/receipt semantics; exact receipt binding; UI presence of preview/execute controls; and build/static integrity parity for the canonical execution module packaged into the extension.

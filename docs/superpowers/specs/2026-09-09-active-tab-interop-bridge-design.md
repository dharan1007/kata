# KATA Active-Tab Interoperability Bridge Design

## Problem

KATA can inspect browser runtime and standards-declared API evidence only when its own web application is the executing document. That leaves a critical product gap: a developer cannot point KATA at the real modern web app currently open in their browser and obtain evidence from that app's actual page runtime. Asking for permanent broad host access would create an unacceptable security boundary, and server-side crawling would not reproduce browser-local state, WebMCP availability, framework globals, iframe relationships, or Permissions Policy.

## Goal

Add a production-quality Manifest V3 browser extension bridge that inspects only the currently active HTTP(S) tab after an explicit user gesture, executes KATA's canonical runtime probe in the page MAIN world, sends only the bounded interoperability environment to KATA's existing diagnostic engine, and presents the result locally without transmitting page content, cookies, storage, credentials, or the visited URL.

## Architecture

The extension uses only `activeTab`, `scripting`, and the exact KATA production origin as host permission. `activeTab` supplies temporary host access only after the user invokes the extension. The service worker injects the canonical `inspectBrowserRuntime` function with `world: "MAIN"` into the top frame. To make that safe and drift-free, `src/runtime-probe.js` is refactored so the exported function is closure-free/self-contained and can be serialized by `chrome.scripting.executeScript` while remaining the exact implementation used by KATA WebMCP.

The returned probe has two classes of data. `environment` is the bounded schema consumed by `kata_diagnose_web_interop`; before sending it, the extension sets `userAuthorizedBrowserFlow: true` because the current inspection is explicitly active-tab authorized. `runtime` and detailed evidence remain local to the popup. Only `environment` plus the selected intent are POSTed to `https://kata-webmcp.vercel.app/api/invoke`.

## User flow

1. User opens a website or web app.
2. User clicks the KATA extension action, which grants temporary `activeTab` access.
3. Popup lets the user choose `read`, `act`, `automate`, `expose_webmcp`, or `call_api` and requests inspection.
4. Service worker verifies the tab is `http:` or `https:` and injects the canonical probe into the MAIN world of only the top frame.
5. Probe returns local runtime evidence.
6. Service worker sends only the bounded environment to KATA's canonical `kata_diagnose_web_interop` tool.
7. Popup shows the local runtime summary and server-produced integration-path diagnosis.

## Security boundary

- No `<all_urls>` or persistent access to arbitrary sites.
- No cookies permission, webRequest permission, debugger permission, history permission, downloads permission, native messaging, or clipboard permission.
- No page text, form values, cookies, localStorage/sessionStorage, IndexedDB, authorization headers, CSRF tokens, or DOM serialization.
- No arbitrary remote code; all injected logic ships inside the extension bundle.
- No bypass of CSP, CORS, Permissions Policy, bot protection, authentication, paywalls, service terms, or rate limits.
- No injection into `chrome:`, `chrome-extension:`, `file:`, `data:`, `about:`, or other non-HTTP(S) schemes.
- Cross-origin iframe contents remain inaccessible unless the page itself exposes legitimately accessible DOM state; the extension injects only into the top frame.
- The visited URL remains local to the popup. Tests must prove it is absent from the network payload sent to KATA.
- The extension host permission is limited to `https://kata-webmcp.vercel.app/*` solely so its service worker can call KATA's diagnostic API.

## Compatibility

Use Manifest V3 with minimum Chrome version 95 because MAIN-world `chrome.scripting` execution is required. The implementation deliberately avoids persistent content scripts so SPA navigation does not create hidden background observation. Each inspection is a fresh explicit user-authorized snapshot and therefore works with React/Next.js, Vue/Nuxt, Angular, Svelte/SvelteKit, SSR/hydrated SPAs, streamed interfaces, open shadow DOM and iframe topology to the extent already supported by KATA's canonical runtime probe.

## Product/API contract

`/api/capabilities` advertises an `interop.browserExtension` capability with its permission model, user-gesture requirement, execution world, canonical probe source, network disclosure boundary, supported intents, and repository path. This makes the bridge discoverable to agents and developer tooling without claiming Chrome Web Store publication.

## Release verification

Tests must prove: minimal manifest permissions; no broad host access; canonical probe serializes without closure dependencies; active-tab inspection injects in MAIN world/top frame; restricted schemes are rejected before injection; only the environment is transmitted; selected intent is preserved; network failure returns a structured local failure without losing the runtime snapshot; capability discovery describes the exact security model; and the build contains an integrity-bound loadable extension package whose relative module imports resolve. The complete release gate and CodeQL must pass before merge or deployment.
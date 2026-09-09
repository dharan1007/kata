# KATA Interoperability Inspector

This is a Manifest V3 companion extension for inspecting the real web app in the user's currently active tab and evaluating the observed evidence through KATA's canonical interoperability engine.

## Build and load

Run `npm run build`, then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/extension`.

The source `extension/` directory is not itself the load-unpacked artifact because the build copies KATA's canonical runtime probe into the extension package and rewrites the service-worker import to that packaged copy. This prevents a separate extension-only probe implementation from drifting away from WebMCP runtime behavior.

## Permission model

The extension requests only:

- `activeTab` — temporary access to the current tab after the user invokes the extension;
- `scripting` — execute the canonical KATA probe in the authorized tab;
- host access to `https://kata-webmcp.vercel.app/*` — send the bounded interoperability environment to KATA's diagnostic API.

It does not request `<all_urls>`, cookies, webRequest, debugger, history, downloads, native messaging, clipboard access, or persistent content scripts.

## What leaves the browser

Only the normalized interoperability `environment` accepted by `kata_diagnose_web_interop` and the user-selected intent are sent to KATA. The current URL, framework hints, DOM topology, declared description URLs, page text, form values, cookies, browser storage and credentials remain local to the extension.

## Restrictions

Only top-level HTTP(S) tabs are inspected. Browser-internal pages and non-web schemes are rejected before injection. KATA does not use the extension to bypass authentication, CAPTCHAs, anti-automation controls, CSP, CORS, Permissions Policy, service terms, paywalls or rate limits. Unknown evidence remains unknown.

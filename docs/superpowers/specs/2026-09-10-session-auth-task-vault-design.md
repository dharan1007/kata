# Session Authorization Broker and MCP Task Vault Design

## Goal

Close two production gaps in KATA's user-authorized browser interoperability layer without weakening its security model:

1. unlock protected OpenAPI and modern MCP operations through explicit user-provided session credentials that never become model/tool arguments, cloud payloads, previews, receipts, or persistent browser storage;
2. preserve MCP task handles and continuation state across popup closure and extension service-worker suspension for the current browser session, without background polling or unattended execution.

## Product boundary

This work does **not** implement autonomous OAuth login, token refresh, Dynamic Client Registration, browser-cookie extraction, password capture, CAPTCHA automation, bot-defense bypass, persistent secret storage, cross-origin API/MCP execution, background task polling, task subscriptions, or automatic task continuation.

Chrome `storage.session` is the storage boundary. It is memory-backed for the browser session, cleared on browser restart/extension reload/update, and by default is not exposed to content scripts. KATA will require the `storage` extension permission and raise `minimum_chrome_version` from 95 to 102 because `chrome.storage.session` is Chrome 102+ MV3.

## Architecture

### 1. Session credential broker

Create `extension/session-vault.js` as an extension-context-only module. The vault stores JSON-serializable records in `chrome.storage.session` under a versioned KATA namespace.

A credential record contains only:

- random `credentialId` generated with Web Crypto;
- monotonically increasing `revision`;
- `origin`;
- `kind`: `api-key` or `bearer-token`;
- OpenAPI/MCP binding metadata (`schemeName`, `location`, `parameterName`, optional requested scopes);
- creation/update timestamps;
- the secret value.

The secret is never returned by list/status APIs. Public inventory returns a redacted descriptor containing `credentialId`, `revision`, origin/kind/binding metadata, and timestamps.

The vault supports create/update, list descriptors for an origin, resolve an exact credential by ID+revision+origin, and delete/clear. Resolution is callable only inside the service worker's execution path. Popup UI may send a secret to the service worker to create/update a session credential, but the service worker never echoes it.

### 2. OpenAPI credential binding

`src/api-execution.js` will distinguish authorization states:

- anonymous: no credential;
- browser-cookie: existing explicitly declared same-origin cookie `apiKey` behavior;
- brokered: every scheme in one OpenAPI Security Requirement alternative is satisfiable from a credential inventory;
- setup required: no complete alternative is satisfiable.

Supported brokered OpenAPI schemes for this release:

- `apiKey` in `header`;
- `apiKey` in `query`;
- HTTP `bearer`;
- OAuth2/OpenID Connect via an explicitly supplied bearer access token stored as `bearer-token` (KATA does not run the OAuth flow yet).

Unsupported schemes remain fail-closed, including HTTP Basic/Digest and mutual TLS.

Preview generation receives **redacted credential descriptors only**. A selected requirement binds `credentialId` + `revision` + scheme metadata into the SHA-256 preview. No secret or secret digest is fingerprinted.

`executionRequestFromPreview()` emits `credentialBindings`, never actual credentials. `executePageApiRequest()` accepts a trusted runtime `resolveCredential(binding)` callback. Only immediately before fetch does it resolve each binding and inject the declared API-key header/query parameter or `Authorization: Bearer ...`. The executor revalidates origin, kind, scheme, location/name, and revision before injection. Secrets never appear in returned response/receipt objects.

### 3. MCP bearer authorization

Protected modern MCP servers remain discovered with credential-free `server/discover`. A user may add a session `bearer-token` credential bound to that exact MCP origin.

The extension's MCP list/preview/execute/task/MRTR paths accept a redacted bearer descriptor. The descriptor is preview-bound by ID+revision. Immediately before each MCP HTTP request the service worker resolves it and supplies `Authorization: Bearer <secret>` through a dedicated trusted transport-header path.

The canonical `src/mcp-adapter.js` may accept an `authorizationHeader` option only from trusted callers; previews and receipts contain only `authorizationBinding`, never the header value. Existing credential omission remains the default. Protected-server execution is still same-origin HTTPS (or loopback HTTP) only, with redirects manual, deadlines/response limits unchanged, fresh discover/list before execution, and no automatic retry.

### 4. Session MCP task vault

The same storage module holds task records separately from credentials. Task records may contain bearer-like task IDs, endpoint, originating tool name, schema/preview binding, current task state, MRTR/input-required continuation state, and timestamps. They are session-only and are never returned to KATA cloud diagnosis.

Task records are keyed by random `vaultTaskId`, not by the raw remote task ID. Popup-facing inventory shows only bounded descriptors (vault ID, origin, tool, status, timestamps). Fetch/update/cancel execution resolves the full task only inside the service worker.

Whenever a tool call or resumed MCP call returns a task, the service worker stores/updates it before replying to the popup. `tasks/get`, `tasks/update`, and `tasks/cancel` update the vault with the latest server state. Terminal tasks remain visible for explicit removal during the session; KATA does not automatically delete evidence.

There is no alarm, background polling, task subscription, or automatic resume. The user still explicitly invokes refresh/update/cancel.

### 5. Extension UX

Add a compact session-authorization section to the existing popup rather than a new page:

- current-origin credential inventory;
- add/update/remove session API key or bearer token;
- clear session credentials;
- no reveal/copy-secret action after storage.

The MCP task section gains a `Session tasks` selector backed by the task vault. Reopening the popup within the same browser session can recover a task and continue manual refresh/update/cancel flows.

### 6. Machine-readable capabilities and documentation

`/api/capabilities` will publish:

- browser extension minimum Chrome 102 and `storage` permission;
- `sessionCredentialBroker` with storage=`chrome.storage.session`, persistent=false, modelVisible=false, cloudVisible=false;
- supported OpenAPI broker schemes;
- MCP bearer-token broker support;
- protected-server execution status updated from false to explicit-session-bearer;
- task vault storage/session/resume semantics;
- no OAuth flow/token refresh, no background task polling.

`SECURITY.md` and `extension/README.md` will document these boundaries.

## Failure and safety behavior

- Missing/stale credential descriptor -> `authorization_setup_required` before network execution.
- Wrong origin/scheme/revision -> fail closed before network execution.
- Vault unavailable -> protected execution disabled; public/anonymous paths remain usable.
- Secret values are capped (16 KiB each) and credential/task counts are bounded.
- Credential records never cross `diagnoseMcpEvidence` or any `/api/invoke` payload.
- Popup error rendering must not include raw secret values.
- Removing/clearing a credential invalidates previews bound to its ID/revision.
- Browser restart/reload/update intentionally clears all session secrets/tasks.

## Verification

Use RED→GREEN tests before production code. Required regressions:

1. manifest requires `storage` and Chrome 102+, without adding broad host permissions;
2. session vault redacts secrets, enforces origin/revision/count/size bounds, and uses `chrome.storage.session`;
3. OpenAPI header/query API keys and bearer/OAuth/OIDC token bindings become executable only with a complete credential requirement;
4. secrets are injected only at trusted final dispatch and never appear in previews/fingerprints/receipts;
5. AND/OR OpenAPI Security Requirement semantics remain correct with mixed cookie/brokered schemes;
6. MCP protected discovery/list/call/task/MRTR can use an explicitly bound bearer token while public/default execution remains credential-free;
7. stale/deleted/revised credentials invalidate execution before fetch;
8. MCP tasks survive popup/service-worker recreation within a mocked browser session and remain local-only;
9. no background polling/alarms/subscriptions are introduced;
10. full `npm run check`, build integrity/parity, CodeQL, exact-main release gate, guarded production deploy, and live provenance checks.
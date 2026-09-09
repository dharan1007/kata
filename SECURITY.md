# Security model

KATA treats external scholarly data, discovered integration contracts, MCP task handles, and agent inputs as untrusted. The engine exposes only a finite semantic command vocabulary and validates tool inputs before execution.

Release invariants:

- no arbitrary JavaScript evaluation or shell execution;
- no generic remote URL-fetch tool;
- no silent fallback from unsupported automation triggers;
- automation activation and execution are bound to fresh preview fingerprints;
- nested tool execution is capped at four levels;
- MCP browser Origins are denied unless explicitly allowlisted;
- optional remote MCP bearer authentication is enforced before dispatch;
- third-party MCP execution never borrows cookies, bearer tokens, API keys, or browser-storage credentials;
- MCP `input_required` responses are user-driven, bounded, and separately previewed for each round;
- MCP Tasks are opt-in per request; task IDs are treated as local bearer-like opaque handles, task refresh is manual, and `tasks/update` / `tasks/cancel` require fresh SHA-256-bound explicit approval;
- task cancellation is cooperative and is never reported as terminal until task state establishes a terminal status;
- there is no fabricated `tasks/list`, background task polling, hidden task-input answering, or automatic task retry;
- strict CSP, clickjacking protection, HSTS, MIME sniffing protection, origin keying, and restrictive Permissions Policy remain configured;
- OpenAlex failures remain explicit and never become synthetic success data.

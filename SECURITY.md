# Security model

KATA treats external scholarly data and agent inputs as untrusted. The engine exposes only a finite semantic command vocabulary and validates tool inputs before execution.

Release invariants:

- no arbitrary JavaScript evaluation or shell execution;
- no generic remote URL-fetch tool;
- no silent fallback from unsupported automation triggers;
- automation activation and execution are bound to fresh preview fingerprints;
- nested tool execution is capped at four levels;
- MCP browser Origins are denied unless explicitly allowlisted;
- optional remote MCP bearer authentication is enforced before dispatch;
- strict CSP, clickjacking protection, HSTS, MIME sniffing protection, origin keying, and restrictive Permissions Policy remain configured;
- OpenAlex failures remain explicit and never become synthetic success data.

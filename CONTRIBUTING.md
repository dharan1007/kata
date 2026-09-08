# Contributing to KATA

KATA is research-automation infrastructure. Contributions should make workflows more reproducible, integrations more truthful or protocol behavior easier to verify.

The project deliberately avoids "connector theater": a real integration that fails explicitly is preferable to a mock fallback that appears successful.

## High-value contributions

- OpenAlex normalization/retry/rate-limit regression cases.
- New workflow examples that demonstrate reusable semantic structure.
- Tests for anti-unification/generalization behavior.
- MCP/WebMCP compatibility and cancellation tests.
- Model-schema projection examples for real clients.
- Accessibility, documentation and developer-experience improvements.
- New connectors only when upstream failure, authentication, rate limits and normalization are specified and tested.

Look for [`good first issue`](https://github.com/dharan1007/kata/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) and [`help wanted`](https://github.com/dharan1007/kata/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).

## Development setup

KATA's production/release contract uses Node.js 24.x.

```bash
git clone https://github.com/dharan1007/kata.git
cd kata
npm install
npm run check
```

## Engineering invariants

1. **No fake connector success.** Do not substitute synthetic output when a production integration fails.
2. **One canonical semantic registry.** HTTP, MCP, WebMCP and model-specific schemas should project the same underlying commands rather than drift into separate implementations.
3. **Validate tool arguments.** All tool execution must pass canonical schema validation.
4. **Cancellation is meaningful.** Cancelled browser operations must not commit partial workspace state.
5. **Cross-origin exposure is opt-in.** Do not weaken the default-deny WebMCP/browser boundary for convenience.
6. **Automation is bounded.** Unsupported triggers and invalid programs fail explicitly.
7. **Product boundaries stay honest.** The browser product is not an unattended cloud scheduler unless a real authenticated durable cloud runner is implemented.
8. **Protocol claims must match tests and current specs.** Never update protocol-version marketing without corresponding acceptance/rejection coverage.

## Testing

Run the complete local contract:

```bash
npm test
npm run build
npm run static-check
npm run check
```

For live-connector changes, include a deterministic unit fixture plus a clear description of what was verified against OpenAlex or another real upstream. Tests must not depend on silently replacing the upstream with synthetic "success" behavior.

## Protocol changes

For MCP/WebMCP changes, document:

- protocol/version affected,
- required headers/envelope fields,
- backward-compatibility behavior,
- negative cases that must be rejected,
- browser Origin/exposure implications,
- cancellation behavior.

Add tests for both accepted and rejected envelopes. Do not infer permissive behavior from undocumented assumptions.

## Pull requests

A strong PR contains:

- the concrete workflow/integration problem,
- the canonical semantic change,
- tests proving behavior,
- compatibility/security implications,
- a real example or fixture when user-facing,
- docs updates if external behavior changed.

Keep PRs focused. Separate unrelated refactors from protocol or connector changes.

## Security

Do not file public issues for vulnerabilities involving authentication, origin controls, tool validation or state integrity. Follow `SECURITY.md`.

## Contributor recognition

Substantive contributors are credited through the Git history, GitHub contributor graph and release notes. Workflow/example contributions are especially valuable when they are small enough for future users to reproduce.
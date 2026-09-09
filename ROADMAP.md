# KATA Roadmap

KATA's roadmap is ordered around a simple question: **can a research workflow be represented once, invoked through multiple agent surfaces and still behave predictably?**

The project will prove that before growing into a long list of shallow integrations.

## Now — make the canonical workflow substrate boringly reliable

- Keep the production deployment workflow as strict as the local release gate; a failed promotion is a failed release even when tests are green.
- Keep one semantic contract for every canonical tool across HTTP, MCP, WebMCP and model-native projections; browser-owned stateful conveniences must use explicit browser-scoped names rather than overload canonical names.
- Expand OpenAlex normalization, timeout, retry, rate-limit and explicit-failure coverage.
- Add more two-demonstration anti-unification fixtures, including negative/generalization-boundary cases.
- Keep HTTP, OpenAI-style, Anthropic-style, Gemini-style, MCP and WebMCP schemas derived from one canonical registry.
- Expand cancellation tests so aborted browser work cannot commit partial workspace state.
- Improve protocol conformance tests around accepted/rejected routing metadata and compatibility paths.
- Add reproducible workflow examples that can become first-contribution tasks.

## Next — become discoverable agent infrastructure

- Validate and publish the checked-in `server.json` to the official MCP Registry once the canonical remote endpoint and release deployment are green.
- Add client configuration examples for major MCP hosts without creating client-specific business logic.
- Create a public workflow-generalization benchmark that separates semantic compilation quality from connector availability.
- Add a controlled corpus of real research workflows with expected semantic programs.
- Evaluate a second scholarly connector only after its authentication, normalization, rate-limit and failure contract is explicit; candidate ecosystems include Crossref or Semantic Scholar, subject to their current APIs/terms.
- Add import/export for reusable workflow programs with schema/version validation.

## Later — durable execution beyond an open browser

Unattended execution is deliberately not claimed today. A future cloud runner is only acceptable with:

- authenticated durable workspaces,
- explicit ownership/authorization,
- trigger deduplication and idempotency,
- bounded retry/dead-letter semantics,
- durable execution receipts/audit history,
- secret isolation,
- cancellation and resource budgets.

Only after those boundaries exist should KATA advertise unattended scheduled research automation.

## Non-goals

KATA will not:

- return mock/synthetic connector output when a real upstream failed,
- create separate divergent implementations for each agent protocol,
- expose arbitrary URL fetch or shell execution merely to appear more capable,
- weaken cross-origin browser defaults to simplify demos,
- claim a cloud scheduler before a real authenticated durable runner exists,
- call protocol support complete without acceptance and rejection tests.

## Contributing to roadmap work

Roadmap items should be broken into GitHub issues with observable acceptance criteria. New connector/protocol proposals should begin as an issue or RFC discussion. Approachable pieces should be labeled `good first issue` only when a contributor can complete them without reverse-engineering the entire architecture.

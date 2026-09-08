## Problem

<!-- What concrete research-workflow, connector or protocol problem does this solve? -->

## Change

<!-- Explain the canonical semantic change and why this approach is bounded. -->

## Verification

- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] `npm run static-check` passes.
- [ ] `npm run check` passes.
- [ ] Accepted and rejected protocol cases were added/updated if protocol behavior changed.
- [ ] A deterministic connector fixture was added/updated if normalization/upstream behavior changed.

## Invariants

- [ ] No synthetic connector success fallback was introduced.
- [ ] All external tool surfaces still derive from the canonical registry.
- [ ] Tool arguments remain schema-validated.
- [ ] Cancellation/origin boundaries were not weakened.
- [ ] The change does not imply unattended cloud execution unless that infrastructure is actually implemented.

## Compatibility

<!-- MCP/WebMCP/API/model-schema versions or clients affected. -->

## User-facing proof

<!-- Reproducible workflow, request/response sample, screenshot, or fixture. -->

## Documentation

<!-- Docs/capabilities/server.json changed, or explain why not. -->
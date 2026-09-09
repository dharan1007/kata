# WebMCP Contract Parity Design

## Problem

KATA currently exposes two incompatible meanings for the same tool names. The server canonical registry defines `kata_search_research` as read-only and `kata_run_automation` as a stateless preview-bound automation executor that accepts workspace/works/automation/fingerprint inputs. Browser WebMCP independently defines `kata_search_research` as a stateful workspace-loading operation and `kata_run_automation` as a saved-automation lookup that accepts only `automationId`. This creates schema, side-effect, annotation, and behavioral drift across HTTP/MCP/model bridges versus WebMCP.

That violates KATA's stated interoperability contract and is dangerous for agent hosts that cache tool schemas or assume a tool name has stable semantics across surfaces.

## Goal

Make tool names semantically stable across HTTP, MCP, model-native bridges, and browser WebMCP while preserving browser-specific workspace actions under explicit browser-scoped names.

## Chosen architecture

Introduce a browser projection of the canonical server tool registry rather than maintaining independent definitions for colliding names. Browser WebMCP will register every canonical server tool using the exact canonical name, description, input schema, and MCP-style safety annotations. Their `execute` handlers will call KATA's existing `/api/invoke` path through a runtime adapter, so semantics are identical to HTTP/MCP/model calls.

Browser-owned stateful conveniences remain first-class WebMCP tools, but all are named with a `kata_browser_` prefix. `kata_browser_search_and_load_research` will deliberately mutate the visible workspace. `kata_browser_run_saved_automation` will invoke an automation by its browser-owned ID. Existing non-colliding convenience functions also move to explicit browser names. Learned local programs remain dynamically registered because they are user-defined browser state, not canonical server tools.

To avoid duplicating the canonical metadata in `src/webmcp.js`, the canonical tool definition objects move into a dependency-free shared module that both server and browser code import. Server handlers stay in `lib/server/tools.js`; the shared module contains schemas/metadata only and therefore remains safe to ship as a static browser asset.

## Compatibility strategy

The server HTTP/MCP/model contracts do not change. Canonical tool names keep their current semantics and schemas.

WebMCP deliberately removes the two ambiguous legacy browser meanings that collided with canonical names. They are replaced by explicit browser-scoped names. This is a breaking correction to an internally contradictory surface, but WebMCP discovery is schema-driven and the product is still pre-stable on an experimental browser API. Keeping the collision would be more harmful than preserving it.

To soften migration, the WebMCP status payload will expose a `renamed` map documenting the old browser meanings and their new names. The Developers page can display that status without inventing a second registry.

## Components

### `lib/shared/tool-contracts.js`

Owns canonical input schemas, descriptions, annotations, and `toolDefinitions`. It has no Node-only imports and no handlers.

### `lib/server/tools.js`

Imports `toolDefinitions` from the shared module and retains only handler wiring plus model-schema projections.

### `src/webmcp.js`

Imports canonical definitions and registers them with an execution adapter `runtime.invokeCanonical(name, args, {signal})`. It separately registers explicit browser-context tools and learned programs. Canonical tool annotations are translated conservatively for WebMCP: only annotation keys supported by the browser producer API are forwarded (`readOnlyHint`, `untrustedContentHint`). Server-only hints such as idempotence/destructiveness remain in MCP/model metadata but are not fabricated into unsupported browser fields.

### `src/app.js`

Provides `invokeCanonical` by delegating to the existing `/api/invoke` helper. Browser-specific runtime methods remain unchanged.

### build/static validation

The new shared module is copied into `dist/lib/shared/tool-contracts.js` and included in integrity/static checks so production does not emit a module import that was not packaged.

## Required behavior

1. Every canonical server tool is registered through WebMCP with the same canonical name, description, and input schema.
2. `kata_search_research` through WebMCP is read-only with respect to browser workspace state and executes through `/api/invoke` semantics.
3. Stateful search-and-load behavior is available as `kata_browser_search_and_load_research` and is marked non-read-only.
4. `kata_run_automation` through WebMCP uses the canonical stateless schema and semantics.
5. Saved-browser automation execution is available as `kata_browser_run_saved_automation` with `{automationId}`.
6. Browser-only summary/list tools use `kata_browser_*` names.
7. Learned local tools continue to register dynamically without colliding with canonical or browser built-ins; collisions are rejected deterministically instead of allowing browser registration order to decide behavior.
8. Cancellation continues to propagate into canonical network calls, browser searches, saved automation execution, and learned program execution.
9. Cross-origin `exposedTo` behavior and abortable registration generations remain unchanged.
10. The static build packages every imported browser module and preserves the release integrity manifest.

## Error handling

If any tool registration fails, the generation aborts and KATA reports no partially-active generation, matching current behavior. Duplicate learned-program names that collide with built-ins are skipped and surfaced through a deterministic `collisions` list in WebMCP status rather than causing registration order to create an accidental API.

Canonical invocation failures remain server-typed errors returned through `/api/invoke`; WebMCP does not convert failed real operations into synthetic success.

## Testing

TDD coverage will first prove the current defect: browser `kata_search_research` and `kata_run_automation` differ from canonical definitions. New tests will then require parity, explicit browser-scoped tools, collision handling, cancellation propagation, and static packaging. Existing WebMCP cross-origin and lifecycle tests remain green.

The complete release gate (`npm run check`) and CodeQL must pass before merge. A production deployment is allowed only if the post-merge release gate passes and deployment authority is available; otherwise production remains untouched.

## Non-goals

This change does not add arbitrary URL fetching, DOM scraping, CAPTCHAs/bot-defense bypasses, cloud scheduling, new authentication mechanisms, or framework-specific wrappers. It fixes the cross-surface tool contract substrate first, so later React/Vue/Svelte/Angular adapters can project one stable semantic tool definition rather than each inventing a separate API.

# KATA Browser API Discovery Design

## Problem

KATA now has an interoperability evidence graph and a safe browser runtime probe, but declared API descriptions are only recorded as URLs. The product cannot yet inspect a declared machine interface, inventory its operations, identify declared authentication schemes, or distinguish a fetchable description from an executable API. Agents still need to leave KATA and manually interpret OpenAPI documents.

## Goal

Add a browser-native, read-only API discovery subsystem that turns standards-declared API descriptions into structured interoperability evidence without invoking API operations, bypassing browser controls, sending ambient credentials cross-origin, or pretending that a readable description proves API authorization.

## Discovery sources

1. `link[rel="service-desc"]` and OpenAPI-specific link declarations already observed by `inspectBrowserRuntime()`.
2. The current origin's RFC 9727 API catalog at `/.well-known/api-catalog`, when requested by the caller. KATA may inspect only this standards-defined URL for the current origin; it does not scan arbitrary paths or hosts.

Cross-origin description URLs may be fetched only through normal browser `fetch` with CORS enforcement and `credentials: "omit"`. Same-origin description URLs use `credentials: "same-origin"`. CSP and other browser restrictions remain effective.

## Description support

KATA will parse JSON OpenAPI descriptions for OAS 3.0, 3.1, and 3.2. OpenAPI 3.2.0 is the current published OAS release. YAML or unknown formats are reported as unsupported rather than guessed or partially parsed.

For valid JSON OAS documents KATA extracts only bounded metadata needed for interoperability planning:

- OpenAPI version, title, and description URL;
- declared server URLs;
- operation inventory (`method`, `path`, `operationId`, summary, tags);
- declared security scheme names and types;
- top-level and operation-level security references;
- whether an operation declares streaming response media such as `text/event-stream`, `application/jsonl`, or `application/json-seq`.

It does not dereference `$ref`, execute operations, submit credentials, infer authorization, or claim operation-level CORS.

## API catalog support

The browser collector may fetch `/.well-known/api-catalog` from the current origin. For `application/linkset+json` / JSON Linkset responses it extracts `service-desc` targets and resolves relative targets against the catalog entry's `anchor` when provided, otherwise against the final catalog URL. The collector ignores unrelated link relations and deduplicates discovered descriptions. RFC 9727 permits a publisher to redirect its well-known catalog to another controlled domain, so KATA follows normal browser redirects and CORS rather than rejecting a cross-origin final URL. Ambient credentials are not deliberately supplied to independently discovered cross-origin description resources; normal browser redirect credential rules and CSP/CORS remain authoritative.

## WebMCP surface

Expose `kata_browser_discover_api` as a read-only browser-owned tool. Input is limited to `includeWellKnownCatalog` and `maxDescriptions`; there is no arbitrary target URL parameter. The tool returns discovery sources, per-resource fetch outcomes, parsed descriptions, an operation inventory, security metadata, and evidence. It also returns an `environmentPatch` containing only facts legitimately established by discovery, initially `api: "documented"` when at least one OpenAPI description is successfully parsed.

The tool name is reserved against learned-tool shadowing and is advertised through `/api/capabilities`.

## Security and evidence boundaries

A readable description proves only that the description resource was readable in the current browser context. It does not prove that API operations allow CORS, that the user is authenticated/authorized, that rate limits permit execution, that service terms permit automation, or that anti-automation controls are absent. Those states remain unknown unless independently established.

The collector never follows arbitrary crawl links, never reads closed shadow roots or protected frames, never requests API operations, never retries around rate limits, and never weakens CSP/CORS/Permissions Policy.

## Verification

Use test-first development. Tests must establish source restrictions, credential handling, RFC 9727 catalog discovery and browser-governed redirects, OpenAPI 3.x parsing, bounded operation inventory, security/streaming extraction, unsupported YAML behavior, AbortSignal propagation, WebMCP registration, capability advertising, and production artifact closure. Run the complete release gate and CodeQL before merge.
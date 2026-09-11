# KATA Support

## Usage and integration questions

After GitHub Discussions is enabled, use **Discussions → Q&A** for setup, OpenAlex, workflow and MCP/WebMCP integration questions that are not confirmed defects.

Before asking, check:

- `README.md`
- `/developers` on the live product
- `GET /api/capabilities`
- existing issues/discussions

## Bugs

Use the structured bug issue form. Include the surface involved (UI, OpenAlex, HTTPS, MCP, WebMCP, automation or taught program), exact request/workflow, expected behavior and observed typed error/result.

For protocol bugs, include protocol version and relevant headers/envelope with credentials removed.

## Paid workflow engagements

KATA offers scoped paid engagements for workflow audits, workflow builds, team deployments and customer-specific integrations through `/services.html`. Start through the published intake form and do not submit API secrets, passwords, private keys, session tokens or production credentials there.

A paid SLA begins only after the request is reviewed, scope and integration boundaries are accepted in writing, and payment or invoice terms are confirmed. A public form submission does not create a guaranteed response or delivery commitment. Each accepted engagement states its own delivery target, supported systems, authentication boundary, customer responsibilities, acceptance tests and handoff artifacts.

## Integration requests

Use the feature/integration form for public product requests and describe the real upstream/service contract: authentication, rate limits, required normalization, error semantics and why the integration belongs in KATA's research-automation scope. Customer-specific paid integrations should use the commercial intake instead.

## Security

Do not publicly disclose vulnerabilities involving auth, origin controls, tool validation, state integrity or injection. Follow `SECURITY.md`.

## Response expectations

Public GitHub support remains best-effort and has no guaranteed-response SLA. Guaranteed terms exist only inside an accepted paid engagement after payment or invoice confirmation.

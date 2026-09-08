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

## Integration requests

Use the feature/integration form and describe the real upstream/service contract: authentication, rate limits, required normalization, error semantics and why the integration belongs in KATA's research-automation scope.

## Security

Do not publicly disclose vulnerabilities involving auth, origin controls, tool validation, state integrity or injection. Follow `SECURITY.md`.

## Response expectations

KATA currently has no paid or guaranteed-response support SLA. Public GitHub channels are the canonical support path.
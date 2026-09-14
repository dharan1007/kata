# KATA Enterprise Hardening Checklist (kata-only)

Enterprises reject products without these controls. Track each item as
done, partial, or missing before any global competitive claim. KATA already
has exact-source provenance, SBOM, and fail-closed release acceptance;
extend the same discipline below.

## Identity and access

- OIDC and SAML for human sign-in, SCIM for lifecycle, RBAC plus ABAC where
  useful, service principals for workers, short-lived tokens, session
  revocation, MFA delegated to the identity provider.

## Secrets

- Brokers supported: AWS Secrets Manager, Azure Key Vault, GCP Secret
  Manager, HashiCorp Vault, Kubernetes secrets and external-secrets.
- Compiled workflows carry credential references, scopes, and required
  permissions only. Raw secrets never enter prompts, logs, or stored
  programs. `SEMANTIC_EMBEDDED_CREDENTIAL` fails validation.

## Encryption

- Modern TLS for transit, encryption at rest, customer-managed keys for the
  enterprise tier, rotation runbooks.

## Isolation

- Adversarial tenant-escape tests: tenant A cannot read or mutate tenant B,
  cross-org identifiers rejected, cache keys, jobs, object storage, and audit
  logs scoped per tenant.

## Observability

- OpenTelemetry traces, metrics, and logs exported to common enterprise
  systems. No proprietary telemetry island.

## Supply chain

- Lockfiles, SPDX SBOM, dependency scanning, CodeQL and static analysis,
  signed artifacts, source-commit provenance, integrity manifest, container
  digest pinning, documented rollback.

## Backup and restore

- Create state, back up, destroy, restore, verify hashes and invariants,
  resume operation. A backup existing is not qualification.

## Chaos

- Kill process, worker, database primary, network, DNS, connector, and
  browser paths. Inject latency, loss, duplicates, skew, reordering, stale
  reads, retry storms, full disks, and exhausted quotas. Verify invariants.

## API compatibility

- Semantic versioning for every public protocol with compatibility tests.
  Breaking releases ship migration guidance.

## Accessibility and data lifecycle

- Consoles target WCAG 2.2 AA. Customers get data inventory, retention
  configuration, export, deletion, legal hold where required, and audit
  retention.

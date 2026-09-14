const CONNECTOR_IDS = Object.freeze(['servicenow', 'github', 'google-workspace', 'microsoft-graph', 'postgres', 'slack', 'teams', 'openapi-generic']);

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  throw error;
}

function plain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function validateConnector(manifest) {
  if (!plain(manifest)) fail('CONNECTOR_MANIFEST_INVALID');
  const required = ['identity', 'version', 'authentication', 'capabilities', 'readOperations', 'writeOperations', 'schemas', 'idempotency', 'transactionBehavior', 'verification', 'consequentiality'];
  for (const key of required) {
    if (manifest[key] === undefined) fail('CONNECTOR_FIELD_REQUIRED', key);
  }
  if (!CONNECTOR_IDS.includes(manifest.identity) && manifest.identity !== 'custom') {
    fail('CONNECTOR_IDENTITY_UNKNOWN', String(manifest.identity));
  }
  if (!Array.isArray(manifest.readOperations) || !Array.isArray(manifest.writeOperations)) fail('CONNECTOR_OPERATIONS_INVALID');
  return true;
}

export function connectorRegistry() {
  return [...CONNECTOR_IDS].map((identity) => ({ identity, depth: 'deep-first', status: identity === 'openapi-generic' ? 'generic' : 'prioritized' }));
}

export const PRIORITIZED_CONNECTORS = Object.freeze(['servicenow', 'github', 'postgres', 'slack', 'openapi-generic']);

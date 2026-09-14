const WRITE_EFFECTS = new Set(['IDEMPOTENT_WRITE', 'CONDITIONALLY_IDEMPOTENT_WRITE', 'REVERSIBLE_WRITE', 'NON_IDEMPOTENT_WRITE', 'DESTRUCTIVE_WRITE', 'IRREVERSIBLE_EXTERNAL_EFFECT']);

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

export function isConsequentialKirNode(node) {
  if (!plain(node) || !plain(node.effect)) return false;
  return WRITE_EFFECTS.has(node.effect.class);
}

export function buildKirPactRequest(node, { workflowId, runId, principal = null } = {}) {
  if (!isConsequentialKirNode(node)) fail('PACT_KIR_NODE_NOT_CONSEQUENTIAL', node?.id || '?');
  if (!workflowId) fail('PACT_KIR_WORKFLOW_ID_REQUIRED');
  return {
    workflowId,
    runId: runId || null,
    nodeId: node.id,
    effectClass: node.effect.class,
    idempotency: node.effect.idempotency,
    scopes: [...(node.authorization?.scopes || [])],
    principal
  };
}

export async function executeKirWithPact(node, context, pactClient) {
  if (!isConsequentialKirNode(node)) fail('PACT_KIR_NODE_NOT_CONSEQUENTIAL', node?.id || '?');
  if (!pactClient || typeof pactClient.authorize !== 'function' || typeof pactClient.execute !== 'function') {
    fail('PACT_KIR_CLIENT_REQUIRED');
  }
  const decision = await pactClient.authorize(buildKirPactRequest(node, context));
  if (!decision || decision.allowed !== true) {
    const error = new Error(`PACT_DENIED: ${decision?.reason || 'consequential operation not authorized now'}`);
    error.code = 'PACT_DENIED';
    error.decision = decision || null;
    throw error;
  }
  const result = await pactClient.execute(node, { ...context, authorization: decision });
  if (!result || result.verified !== true) {
    const error = new Error('PACT_VERIFICATION_FAILED: consequential execution lacks verified receipt');
    error.code = 'PACT_VERIFICATION_FAILED';
    throw error;
  }
  return { ...result, pactReceipt: result.receipt || null };
}

export function localAuthorizationPolicy(node, { approvals = {} } = {}) {
  if (!isConsequentialKirNode(node)) return { allowed: true, mode: 'read-only' };
  if (approvals[node.id] === true) return { allowed: true, mode: 'local-explicit-approval' };
  return { allowed: false, mode: 'local-approval-required', reason: 'High-risk state change requires explicit local authorization when PACT is not configured.' };
}

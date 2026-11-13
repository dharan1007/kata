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

export function splitConsequential(nodes) {
  if (!Array.isArray(nodes)) fail('PACT_SPLIT_INPUT_INVALID');
  const direct = [];
  const consequential = [];
  for (const node of nodes) {
    if (node?.kind === 'ConsequentialAction') consequential.push(node);
    else direct.push(node);
  }
  return { direct, consequential };
}

export function buildPactRequest(node, { workflowId, runId, principal = null } = {}) {
  if (!plain(node) || node.kind !== 'ConsequentialAction') fail('PACT_NODE_NOT_CONSEQUENTIAL');
  if (typeof workflowId !== 'string' || !workflowId) fail('PACT_WORKFLOW_ID_REQUIRED');
  return {
    workflowId,
    runId: runId || null,
    nodeId: node.id,
    operation: {
      inputs: structuredClone(node.inputs),
      sideEffectClass: node.sideEffectClass,
      credentialReference: node.credentialRequirements?.reference || null,
      scopes: [...(node.credentialRequirements?.scopes || [])]
    },
    principal,
    verification: structuredClone(node.verification)
  };
}

export async function executeWithPact(node, context, pactClient) {
  if (!plain(node)) fail('PACT_NODE_INVALID');
  if (node.kind !== 'ConsequentialAction') {
    if (typeof context?.executeDirect !== 'function') fail('PACT_DIRECT_EXECUTOR_REQUIRED');
    return context.executeDirect(node);
  }
  if (!pactClient || typeof pactClient.authorize !== 'function' || typeof pactClient.execute !== 'function') {
    fail('PACT_CLIENT_REQUIRED');
  }
  const decision = await pactClient.authorize(buildPactRequest(node, context));
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
  return { ...result, pactReceipt: result.receipt || null, pactDecision: decision };
}

export function isPactDenied(error) {
  return error?.code === 'PACT_DENIED';
}

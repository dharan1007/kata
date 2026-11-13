const HIGH_RISK_HINTS = ['payment', 'refund', 'delete', 'destructive', 'transfer', 'access-grant', 'production-deploy'];

export function classifyHumanNeed(step) {
  const text = JSON.stringify(step || {}).toLowerCase();
  if (HIGH_RISK_HINTS.some((hint) => text.includes(hint))) return 'approval-required';
  if (/(judgment|review|decide|triage)/.test(text)) return 'judgment-required';
  return 'automatable';
}

export function humanApprovalNode({ id, reason, approver = 'workflow-owner' } = {}) {
  if (!id) {
    const error = new Error('HUMAN_NODE_ID_REQUIRED');
    error.code = 'HUMAN_NODE_ID_REQUIRED';
    throw error;
  }
  return {
    id,
    kind: 'HumanApproval',
    inputs: { reason },
    outputs: { approved: true },
    types: { reason: 'string' },
    preconditions: [],
    postconditions: ['approved'],
    sideEffectClass: 'none',
    credentialRequirements: { scopes: ['kata:approve'] },
    retryPolicy: { maxAttempts: 1, strategy: 'none' },
    timeoutMs: 86400000,
    verification: { kind: 'human-attestation' },
    provenance: { source: 'human-policy' },
    approver
  };
}

export function humanDecisionNode({ id, question, options = [] } = {}) {
  if (!id) {
    const error = new Error('HUMAN_NODE_ID_REQUIRED');
    error.code = 'HUMAN_NODE_ID_REQUIRED';
    throw error;
  }
  return {
    id,
    kind: 'HumanDecision',
    inputs: { question },
    outputs: { decision: true },
    types: { question: 'string' },
    preconditions: [],
    postconditions: ['decided'],
    sideEffectClass: 'none',
    credentialRequirements: { scopes: ['kata:decide'] },
    retryPolicy: { maxAttempts: 1, strategy: 'none' },
    timeoutMs: 86400000,
    verification: { kind: 'human-attestation' },
    provenance: { source: 'human-policy' },
    options
  };
}

export function aiDecisionNode({ id, modelPolicy, inputSchema, outputSchema, confidencePolicy, evaluation, humanEscalation } = {}) {
  if (!id || !modelPolicy || !inputSchema || !outputSchema || !confidencePolicy || !evaluation || !humanEscalation) {
    const error = new Error('AI_DECISION_POLICY_REQUIRED');
    error.code = 'AI_DECISION_POLICY_REQUIRED';
    throw error;
  }
  return {
    id,
    kind: 'HumanDecision',
    inputs: {},
    outputs: {},
    types: {},
    preconditions: [],
    postconditions: [],
    sideEffectClass: 'none',
    credentialRequirements: { scopes: ['kata:ai-decide'] },
    retryPolicy: { maxAttempts: 1, strategy: 'none' },
    timeoutMs: 60000,
    verification: { kind: 'model-evaluation', evaluation },
    provenance: { source: 'ai-decision-policy', modelPolicy, confidencePolicy, humanEscalation },
    ai: { modelPolicy, inputSchema, outputSchema, confidencePolicy, evaluation, humanEscalation }
  };
}

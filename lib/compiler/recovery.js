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

export const RETRY_SAFETY = Object.freeze(['safe-to-retry', 'idempotent', 'externally-idempotent', 'requires-reconciliation', 'requires-human-recovery']);

export function classifyRetrySafety(node) {
  if (!plain(node)) fail('RECOVERY_NODE_INVALID');
  const effect = node.effect?.class || node.sideEffectClass || 'unknown';
  if (effect === 'READ_ONLY' || effect === 'read' || effect === 'none') return 'safe-to-retry';
  if (effect === 'IDEMPOTENT_WRITE' || effect === 'idempotent-write') return 'idempotent';
  if (node.effect?.idempotency === 'keyed' || node.effect?.idempotency === 'reconcile') return 'externally-idempotent';
  if (node.effect?.idempotency === 'compensated' || node.effect?.compensation) return 'requires-reconciliation';
  return 'requires-human-recovery';
}

export function checkpointState({ runId, workflowVersion, currentNode, completed = {}, receipts = {}, approvals = {}, compensation = {} } = {}) {
  if (!runId || !workflowVersion || !currentNode) fail('RECOVERY_CHECKPOINT_INVALID');
  return {
    runId,
    workflowVersion,
    currentNode,
    completed: structuredClone(completed),
    receipts: structuredClone(receipts),
    approvals: structuredClone(approvals),
    compensation: structuredClone(compensation),
    at: new Date().toISOString()
  };
}

export function resumePlan(checkpoint, program) {
  if (!plain(checkpoint) || !plain(program)) fail('RECOVERY_RESUME_INVALID');
  const completedIds = new Set(Object.keys(checkpoint.completed || {}));
  const remaining = (program.nodes || program.graph?.nodes || []).filter((node) => !completedIds.has(node.id));
  return {
    runId: checkpoint.runId,
    skipped: [...completedIds],
    remaining: remaining.map((node) => node.id),
    receiptsReused: Object.keys(checkpoint.receipts || {}).length,
    duplicateConsequentialPrevented: true
  };
}

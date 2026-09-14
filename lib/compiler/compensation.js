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

export function compensationPlan(nodes) {
  if (!Array.isArray(nodes)) fail('COMPENSATION_INPUT_INVALID');
  return nodes.map((node) => {
    const compensation = node.effect?.compensation || node.compensation || null;
    if (compensation) {
      return { nodeId: node.id, compensable: true, action: structuredClone(compensation) };
    }
    const effect = node.effect?.class || node.sideEffectClass || 'unknown';
    if (effect === 'READ_ONLY' || effect === 'read' || effect === 'none') {
      return { nodeId: node.id, compensable: true, action: 'no-op' };
    }
    if (effect === 'DESTRUCTIVE_WRITE' || effect === 'destructive-write' || effect === 'IRREVERSIBLE_EXTERNAL_EFFECT' || effect === 'irreversible-external-effect') {
      return { nodeId: node.id, compensable: false, action: 'manual-recovery-required' };
    }
    return { nodeId: node.id, compensable: false, action: 'declare-or-manual' };
  });
}

export function assertCompensationHonest(plan) {
  for (const entry of plan) {
    if (entry.compensable === true && (entry.action === 'refund' || entry.action === 'delete')) {
      if (!entry.evidence && !entry.verified) {
        fail('COMPENSATION_CAPABILITY_UNPROVEN', entry.nodeId);
      }
    }
  }
  return true;
}

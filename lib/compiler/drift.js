export const DRIFT_SIGNALS = Object.freeze([
  'openapi-schema-changed',
  'graphql-schema-changed',
  'browser-locator-missing',
  'accessibility-role-changed',
  'page-flow-changed',
  'api-permission-changed',
  'result-schema-changed',
  'policy-changed'
]);

const SIGNALS = new Set(DRIFT_SIGNALS);

function plain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function detectDrift({ baseline, observed } = {}) {
  if (!plain(baseline) || !plain(observed)) {
    const error = new Error('DRIFT_INPUT_INVALID');
    error.code = 'DRIFT_INPUT_INVALID';
    throw error;
  }
  const findings = [];
  for (const signal of SIGNALS) {
    const before = baseline[signal];
    const after = observed[signal];
    if (JSON.stringify(before) !== JSON.stringify(after) && after !== undefined) {
      findings.push({
        signal,
        before: before ?? null,
        after,
        semantic: isSemanticDrift(signal, before, after)
      });
    }
  }
  return findings;
}

function isSemanticDrift(signal, before, after) {
  if (signal === 'openapi-schema-changed' || signal === 'graphql-schema-changed' || signal === 'result-schema-changed') {
    return true;
  }
  if (signal === 'api-permission-changed' || signal === 'policy-changed') return true;
  if (signal === 'page-flow-changed') return true;
  if (typeof before === 'string' && typeof after === 'string' && before !== after) return false;
  return false;
}

export function dispositionForDrift(findings) {
  if (!Array.isArray(findings) || findings.length === 0) return { action: 'none', reason: 'No drift detected.' };
  const semantic = findings.filter((finding) => finding.semantic);
  if (semantic.length > 0) {
    return {
      action: 'block',
      nextState: 'BLOCKED',
      reason: `Semantic drift requires owner review: ${semantic.map((finding) => finding.signal).join(', ')}. Automatic repair is not permitted for consequential workflows.`,
      findings
    };
  }
  return {
    action: 'repair-and-requalify',
    nextState: 'DRIFTED',
    reason: `Non-semantic drift detected: ${findings.map((finding) => finding.signal).join(', ')}. Attempt automatic repair, replay qualification, deploy only when fully qualified.`,
    findings
  };
}

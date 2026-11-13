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

export function createNeedsLabel({ position = null, observed = [], hypotheses = [], evidence = {} } = {}) {
  if (!Array.isArray(observed) || !Array.isArray(hypotheses) || hypotheses.length < 2) {
    fail('NEEDS_LABEL_HYPOTHESES_REQUIRED');
  }
  return {
    status: 'NEEDS_LABEL',
    position,
    observed: structuredClone(observed),
    hypotheses: hypotheses.map((hypothesis, index) => ({
      id: hypothesis.id || `hypothesis-${index + 1}`,
      label: hypothesis.label,
      description: hypothesis.description || '',
      test: hypothesis.test || null
    })),
    evidence: plain(evidence) ? structuredClone(evidence) : {},
    resolution: null,
    createdAt: new Date().toISOString()
  };
}

export function resolveNeedsLabel(request, { hypothesisId, label, labeledBy = 'workflow-owner', note = '' } = {}) {
  if (!plain(request) || request.status !== 'NEEDS_LABEL') fail('NEEDS_LABEL_STATE_INVALID');
  const match = request.hypotheses.find((hypothesis) => hypothesis.id === hypothesisId);
  if (!match) fail('NEEDS_LABEL_HYPOTHESIS_UNKNOWN', String(hypothesisId));
  return {
    ...structuredClone(request),
    status: 'LABELED',
    resolution: {
      hypothesisId: match.id,
      label: label || match.label,
      labeledBy,
      note,
      resolvedAt: new Date().toISOString()
    }
  };
}

export function isNeedsLabel(value) {
  return plain(value) && value.status === 'NEEDS_LABEL';
}

export function assertNoUnlabeledBranches(items) {
  const pending = (Array.isArray(items) ? items : []).filter(isNeedsLabel);
  if (pending.length > 0) {
    fail('UNLABELED_AMBIGUOUS_BRANCH', `${pending.length} ambiguous branch(es) require owner labeling before production`);
  }
  return true;
}

export function ambiguityForDivergentStep({ position, variants } = {}) {
  const observed = Array.isArray(variants) ? variants : [];
  return createNeedsLabel({
    position,
    observed,
    hypotheses: [
      { id: 'optional-step', label: 'optional-step', description: 'Step is optional and may be skipped without changing outcome.' },
      { id: 'conditional-branch', label: 'conditional-branch', description: 'Step depends on account type, predicate, or prior outcome; owner must supply the branch condition.' },
      { id: 'operator-variance', label: 'operator-variance', description: 'Operator skipped or added the step once; canonical workflow excludes it.' }
    ],
    evidence: { variantCount: observed.length }
  });
}

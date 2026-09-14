export const QUALIFICATION_STATES = Object.freeze([
  'CAPTURED',
  'INFERRED',
  'NEEDS_LABEL',
  'REVIEW_REQUIRED',
  'QUALIFYING',
  'QUALIFIED',
  'STAGED',
  'PRODUCTION',
  'DRIFTED',
  'BLOCKED',
  'RETIRED'
]);

const STATES = new Set(QUALIFICATION_STATES);

const ALLOWED_TRANSITIONS = Object.freeze({
  CAPTURED: ['INFERRED', 'BLOCKED'],
  INFERRED: ['NEEDS_LABEL', 'REVIEW_REQUIRED', 'BLOCKED'],
  NEEDS_LABEL: ['REVIEW_REQUIRED', 'BLOCKED'],
  REVIEW_REQUIRED: ['QUALIFYING', 'QUALIFIED', 'BLOCKED'],
  QUALIFYING: ['QUALIFIED', 'BLOCKED'],
  QUALIFIED: ['STAGED', 'BLOCKED'],
  STAGED: ['PRODUCTION', 'BLOCKED'],
  PRODUCTION: ['DRIFTED', 'BLOCKED', 'RETIRED'],
  DRIFTED: ['REVIEW_REQUIRED', 'BLOCKED'],
  BLOCKED: ['REVIEW_REQUIRED'],
  RETIRED: []
});

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

export function createQualification({ workflowId, sha = null } = {}) {
  if (typeof workflowId !== 'string' || !workflowId) fail('QUALIFICATION_WORKFLOW_ID_REQUIRED');
  return {
    workflowId,
    state: 'CAPTURED',
    history: [{ state: 'CAPTURED', at: new Date().toISOString(), sha }],
    evidence: {},
    blockedReason: null
  };
}

export function transitionQualification(record, next, { evidence = {}, reason = '' } = {}) {
  if (!plain(record) || !STATES.has(record.state)) fail('QUALIFICATION_RECORD_INVALID');
  if (!STATES.has(next)) fail('QUALIFICATION_STATE_UNKNOWN', String(next));
  const allowed = ALLOWED_TRANSITIONS[record.state] || [];
  if (!allowed.includes(next)) fail('QUALIFICATION_TRANSITION_INVALID', `${record.state}->${next}`);
  if (next === 'QUALIFIED' && !evidence.replayedAgainstSandbox) {
    fail('QUALIFICATION_REQUIRES_SANDBOX_REPLAY');
  }
  if (next === 'PRODUCTION' && evidence.unlabeledBranches > 0) {
    fail('QUALIFICATION_UNLABELED_BRANCH');
  }
  if (next === 'PRODUCTION' && evidence.embeddedCredentials > 0) {
    fail('QUALIFICATION_EMBEDDED_CREDENTIAL');
  }
  const updated = structuredClone(record);
  updated.state = next;
  updated.history.push({ state: next, at: new Date().toISOString(), reason, evidence: structuredClone(evidence) });
  updated.evidence = { ...updated.evidence, ...structuredClone(evidence) };
  updated.blockedReason = next === 'BLOCKED' ? reason : null;
  return updated;
}

export function isProductionQualified(record) {
  return plain(record) && record.state === 'PRODUCTION';
}

export function qualificationReport(record) {
  if (!plain(record)) fail('QUALIFICATION_RECORD_INVALID');
  return {
    workflowId: record.workflowId,
    state: record.state,
    transitions: record.history.length,
    blockedReason: record.blockedReason,
    history: structuredClone(record.history)
  };
}

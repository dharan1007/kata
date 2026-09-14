import { validateSemanticProgram } from './semantic-kir.js';
import { assertNoUnlabeledBranches } from './needs-label.js';
import { createQualification, transitionQualification } from './qualification.js';

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

const REQUIRED_TARGETS = Object.freeze({
  stableApiReplaySuccess: 0.99,
  browserApiQualificationSuccess: 0.95,
  maxHumanCorrectionHours: 2,
  authoringLaborReduction: 0.75,
  maxApiOverheadRatio: 0.20,
  driftAutoRecovery: 0.90
});

export const KATA_RELEASE_TARGETS = REQUIRED_TARGETS;

export function qualifyWorkflow({ workflowId, semanticProgram, sandboxReplay, needsLabelItems = [], credentialScan = { embedded: 0 } } = {}) {
  if (typeof workflowId !== 'string' || !workflowId) fail('QUALIFY_WORKFLOW_ID_REQUIRED');
  validateSemanticProgram(semanticProgram);
  assertNoUnlabeledBranches(needsLabelItems);
  if (credentialScan.embedded > 0) fail('QUALIFY_EMBEDDED_CREDENTIAL');
  let record = createQualification({ workflowId });
  record = transitionQualification(record, 'INFERRED', { evidence: { nodeCount: semanticProgram.nodes.length } });
  record = transitionQualification(record, 'REVIEW_REQUIRED', { evidence: { ownerReview: 'pending' } });
  if (!plain(sandboxReplay) || sandboxReplay.success !== true) {
    return transitionQualification(record, 'BLOCKED', { reason: 'Sandbox replay against a real test system is required before QUALIFIED.' });
  }
  record = transitionQualification(record, 'QUALIFIED', {
    evidence: {
      replayedAgainstSandbox: true,
      sandbox: sandboxReplay.name || 'sandbox',
      unlabeledBranches: 0,
      embeddedCredentials: 0
    }
  });
  return record;
}

export function checkReleaseTargets(metrics) {
  if (!plain(metrics)) fail('TARGET_METRICS_INVALID');
  const failures = [];
  if ((metrics.stableApiReplaySuccess ?? 0) < REQUIRED_TARGETS.stableApiReplaySuccess) {
    failures.push(`Benchmark gate failed: stable API replay ${metrics.stableApiReplaySuccess} < ${REQUIRED_TARGETS.stableApiReplaySuccess}.`);
  }
  if ((metrics.browserApiQualificationSuccess ?? 0) < REQUIRED_TARGETS.browserApiQualificationSuccess) {
    failures.push(`Benchmark gate failed: browser/API qualification ${metrics.browserApiQualificationSuccess} < ${REQUIRED_TARGETS.browserApiQualificationSuccess}.`);
  }
  if ((metrics.humanCorrectionHours ?? Number.POSITIVE_INFINITY) > REQUIRED_TARGETS.maxHumanCorrectionHours) {
    failures.push(`Benchmark gate failed: human correction ${metrics.humanCorrectionHours}h > ${REQUIRED_TARGETS.maxHumanCorrectionHours}h.`);
  }
  if ((metrics.authoringLaborReduction ?? 0) < REQUIRED_TARGETS.authoringLaborReduction) {
    failures.push(`Benchmark gate failed: labor reduction ${metrics.authoringLaborReduction} < ${REQUIRED_TARGETS.authoringLaborReduction}.`);
  }
  if ((metrics.apiOverheadRatio ?? Number.POSITIVE_INFINITY) > REQUIRED_TARGETS.maxApiOverheadRatio) {
    failures.push(`Benchmark gate failed: API overhead ${metrics.apiOverheadRatio} > ${REQUIRED_TARGETS.maxApiOverheadRatio}.`);
  }
  if ((metrics.driftAutoRecovery ?? 0) < REQUIRED_TARGETS.driftAutoRecovery) {
    failures.push(`Benchmark gate failed: drift recovery ${metrics.driftAutoRecovery} < ${REQUIRED_TARGETS.driftAutoRecovery}.`);
  }
  if ((metrics.embeddedCredentials ?? 0) !== 0) failures.push('Benchmark gate failed: embedded plaintext credentials must be zero.');
  if ((metrics.unlabeledBranches ?? 0) !== 0) failures.push('Benchmark gate failed: unlabeled ambiguous branches must be zero.');
  return { ok: failures.length === 0, failures, targets: { ...REQUIRED_TARGETS } };
}

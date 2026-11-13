import { createHash } from 'node:crypto';
import { validateCaptureEvent, environmentFingerprint, demonstrationId } from './events.js';
import { redactCaptureEvent, assertNoSecrets } from './redact.js';

const ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,191}$/;

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

export function createDemonstration({ workflowCandidateId, source, environment = {}, startedAt = new Date().toISOString() } = {}) {
  if (typeof workflowCandidateId !== 'string' || !ID.test(workflowCandidateId)) fail('DEMO_CANDIDATE_ID_INVALID');
  if (!plain(source) || typeof source.kind !== 'string' || typeof source.authority !== 'string') fail('DEMO_SOURCE_INVALID');
  if (typeof startedAt !== 'string' || Number.isNaN(Date.parse(startedAt))) fail('DEMO_START_TIME_INVALID');
  const fingerprint = environmentFingerprint(environment);
  const id = demonstrationId(workflowCandidateId, startedAt, fingerprint);
  return {
    captureVersion: 1,
    id,
    workflowCandidateId,
    source: structuredClone(source),
    environment: structuredClone(environment),
    environmentFingerprint: fingerprint,
    startedAt,
    events: [],
    status: 'recording'
  };
}

export function appendDemonstrationEvent(demonstration, rawEvent) {
  if (!plain(demonstration) || demonstration.status !== 'recording') fail('DEMO_NOT_RECORDING');
  const { event, redactedCount } = redactCaptureEvent(rawEvent);
  validateCaptureEvent(event);
  assertNoSecrets(event);
  const next = structuredClone(demonstration);
  next.events.push(event);
  next.redactedFields = (next.redactedFields || 0) + redactedCount;
  return next;
}

export function finalizeDemonstration(demonstration, { outcome, verifiedAt = new Date().toISOString() } = {}) {
  if (!plain(demonstration) || demonstration.status !== 'recording') fail('DEMO_NOT_RECORDING');
  if (!plain(outcome) || typeof outcome.status !== 'string') fail('DEMO_OUTCOME_REQUIRED');
  const next = structuredClone(demonstration);
  next.events.push({
    id: `evt_${String(next.events.length + 1).padStart(6, '0')}`,
    kind: 'outcome-verification',
    at: verifiedAt,
    outcome: structuredClone(outcome)
  });
  validateCaptureEvent(next.events[next.events.length - 1]);
  next.status = 'captured';
  next.eventCount = next.events.length;
  next.digest = `sha256:${createHash('sha256').update(JSON.stringify(next.events)).digest('hex')}`;
  return next;
}

export function demonstrationToTraceEvents(demonstration) {
  if (!plain(demonstration) || !Array.isArray(demonstration.events)) fail('DEMO_INVALID');
  return demonstration.events.map((event, index) => ({
    index,
    kind: event.kind,
    operationType: event.operationType || event.kind,
    semanticTarget: event.semanticTarget || event.locator?.stableId || event.network?.endpointPattern || event.kind,
    endpointPattern: event.network?.endpointPattern || null,
    role: event.locator?.role || null,
    attributes: event.locator?.attributes || {},
    beforeState: event.beforeState || null,
    afterState: event.afterState || null,
    input: event.fields || event.network?.requestFields || {}
  }));
}

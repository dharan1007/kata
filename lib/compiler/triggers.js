import { randomBytes } from 'node:crypto';

const TRIGGER_KINDS = Object.freeze(['manual', 'schedule', 'webhook', 'api-invocation', 'event', 'queue', 'polling']);

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

export function createRun({ workflowId, workflowVersion, trigger, input = {}, idempotencyKey = null } = {}) {
  if (!workflowId || !workflowVersion || !plain(trigger) || !TRIGGER_KINDS.includes(trigger.kind)) {
    fail('TRIGGER_RUN_INVALID');
  }
  if (trigger.kind === 'polling' && !trigger.approved) fail('TRIGGER_POLLING_REQUIRES_APPROVAL');
  return {
    runId: idempotencyKey || `run_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`,
    workflowId,
    workflowVersion,
    trigger: structuredClone(trigger),
    input: structuredClone(input),
    createdAt: new Date().toISOString()
  };
}

export const TRIGGER_KINDS_LIST = TRIGGER_KINDS;

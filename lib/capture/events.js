import { createHash } from 'node:crypto';

export const CAPTURE_VERSION = 1;

export const CAPTURE_EVENT_KINDS = Object.freeze([
  'navigation',
  'url-transition',
  'dom-click',
  'form-fill',
  'select-change',
  'keyboard',
  'network-request',
  'page-state',
  'timing-dependency',
  'file-download',
  'file-upload',
  'auth-boundary',
  'operation-error',
  'operation-retry',
  'user-correction',
  'explicit-approval',
  'outcome-verification'
]);

const KINDS = new Set(CAPTURE_EVENT_KINDS);
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

function assertJson(value, depth = 0) {
  if (depth > 32) fail('CAPTURE_JSON_DEPTH_EXCEEDED');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('CAPTURE_NON_FINITE_NUMBER');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 10000) fail('CAPTURE_ARRAY_TOO_LARGE');
    for (const item of value) assertJson(item, depth + 1);
    return;
  }
  if (!plain(value)) fail('CAPTURE_NON_PLAIN_OBJECT');
  for (const item of Object.values(value)) assertJson(item, depth + 1);
}

export function validateCaptureEvent(event) {
  if (!plain(event)) fail('CAPTURE_EVENT_INVALID');
  if (typeof event.id !== 'string' || !ID.test(event.id)) fail('CAPTURE_EVENT_ID_INVALID');
  if (!KINDS.has(event.kind)) fail('CAPTURE_EVENT_KIND_UNKNOWN', String(event.kind));
  if (typeof event.at !== 'string' || Number.isNaN(Date.parse(event.at))) fail('CAPTURE_EVENT_TIME_INVALID');
  if (event.operationType !== undefined && (typeof event.operationType !== 'string' || !event.operationType)) fail('CAPTURE_OPERATION_TYPE_INVALID');
  if (event.semanticTarget !== undefined && (typeof event.semanticTarget !== 'string' || !event.semanticTarget)) fail('CAPTURE_SEMANTIC_TARGET_INVALID');
  if (event.beforeState !== undefined) assertJson(event.beforeState);
  if (event.afterState !== undefined) assertJson(event.afterState);
  if (event.locator !== undefined) validateLocator(event.locator);
  if (event.network !== undefined) validateNetwork(event.network);
  if (event.debugCoordinates !== undefined) {
    if (!plain(event.debugCoordinates) || typeof event.debugCoordinates.x !== 'number' || typeof event.debugCoordinates.y !== 'number') {
      fail('CAPTURE_DEBUG_COORDINATES_INVALID');
    }
  }
  if (event.coordinatePrimary === true) fail('CAPTURE_COORDINATES_NOT_PRIMARY');
  return true;
}

function validateLocator(locator) {
  if (!plain(locator)) fail('CAPTURE_LOCATOR_INVALID');
  if (locator.role !== undefined && typeof locator.role !== 'string') fail('CAPTURE_LOCATOR_ROLE_INVALID');
  if (locator.accessibleName !== undefined && typeof locator.accessibleName !== 'string') fail('CAPTURE_LOCATOR_NAME_INVALID');
  if (locator.stableId !== undefined && typeof locator.stableId !== 'string') fail('CAPTURE_LOCATOR_ID_INVALID');
  if (locator.attributes !== undefined && !plain(locator.attributes)) fail('CAPTURE_LOCATOR_ATTRIBUTES_INVALID');
  if (locator.visibleText !== undefined && typeof locator.visibleText !== 'string') fail('CAPTURE_LOCATOR_TEXT_INVALID');
}

function validateNetwork(network) {
  if (!plain(network)) fail('CAPTURE_NETWORK_INVALID');
  if (network.method !== undefined && typeof network.method !== 'string') fail('CAPTURE_NETWORK_METHOD_INVALID');
  if (network.endpointPattern !== undefined && typeof network.endpointPattern !== 'string') fail('CAPTURE_NETWORK_ENDPOINT_INVALID');
  if (network.requestSchema !== undefined) assertJson(network.requestSchema);
  if (network.responseSchema !== undefined) assertJson(network.responseSchema);
}

export function environmentFingerprint(environment) {
  const normalized = {
    userAgent: environment?.userAgent || 'unknown',
    viewport: environment?.viewport || 'unknown',
    locale: environment?.locale || 'unknown',
    applicationVersion: environment?.applicationVersion || 'unknown'
  };
  const raw = JSON.stringify(normalized);
  return `sha256:${createHash('sha256').update(raw).digest('hex')}`;
}

export function demonstrationId(workflowCandidateId, startedAt, fingerprint) {
  const raw = `${workflowCandidateId}\u0000${startedAt}\u0000${fingerprint}`;
  return `demo_${createHash('sha256').update(raw).digest('hex').slice(0, 32)}`;
}

const SECRET_FIELD = /(password|passwd|secret|token|session|authorization|api[_-]?key|client[_-]?secret|otp|mfa[_-]?code|card[_-]?number|cvv)/i;
const BEARER = /bearer\s+[A-Za-z0-9._~+/-]+=*/i;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

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

function isSecretKey(key) {
  return SECRET_FIELD.test(key);
}

function isSecretValue(value) {
  if (typeof value !== 'string') return false;
  return BEARER.test(value) || PRIVATE_KEY.test(value);
}

export function redactValue(key, value, { credentialPrefix = 'cred' } = {}) {
  if (value === null || value === undefined) return { value, redacted: false };
  if (isSecretKey(key) && typeof value === 'string' && value.length > 0) {
    return {
      value: { credentialReference: `${credentialPrefix}/${key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` },
      redacted: true
    };
  }
  if (isSecretValue(value)) {
    return { value: { credentialReference: `${credentialPrefix}/captured-secret` }, redacted: true };
  }
  return { value, redacted: false };
}

export function redactCaptureEvent(event, options = {}) {
  if (!plain(event)) fail('REDACT_EVENT_INVALID');
  const next = structuredClone(event);
  let redactedCount = 0;
  if (plain(next.fields)) {
    for (const [key, value] of Object.entries(next.fields)) {
      const result = redactValue(key, value, options);
      next.fields[key] = result.value;
      if (result.redacted) redactedCount++;
    }
  }
  if (plain(next.network)) {
    if (plain(next.network.headers)) {
      for (const [key, value] of Object.entries(next.network.headers)) {
        if (isSecretKey(key)) {
          next.network.headers[key] = { credentialReference: `cred/header-${key.toLowerCase()}` };
          redactedCount++;
        }
      }
    }
    if (typeof next.network.requestBody === 'string' && isSecretValue(next.network.requestBody)) {
      next.network.requestBody = { credentialReference: 'cred/request-body' };
      redactedCount++;
    }
  }
  if (plain(next.authBoundary)) {
    next.authBoundary = {
      mechanism: next.authBoundary.mechanism || 'unknown',
      scope: next.authBoundary.scope || null,
      credentialReference: next.authBoundary.credentialReference || 'cred/auth-boundary'
    };
    delete next.authBoundary.rawToken;
    delete next.authBoundary.rawPassword;
    delete next.authBoundary.rawSecret;
  }
  return { event: next, redactedCount };
}

export function assertNoSecrets(event) {
  const text = JSON.stringify(event);
  if (BEARER.test(text)) fail('CAPTURE_SECRET_LEAK_BEARER');
  if (PRIVATE_KEY.test(text)) fail('CAPTURE_SECRET_LEAK_KEY');
  if (plain(event.fields)) {
    for (const [key, value] of Object.entries(event.fields)) {
      if (isSecretKey(key) && typeof value === 'string' && value.length > 0) {
        fail('CAPTURE_SECRET_FIELD_UNREDACTED', key);
      }
    }
  }
  return true;
}

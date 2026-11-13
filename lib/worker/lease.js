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

export function acquireLease({ runId, workerId, ttlMs = 30000, leases = new Map(), now = Date.now() } = {}) {
  if (!runId || !workerId) fail('LEASE_IDENTITY_REQUIRED');
  const existing = leases.get(runId);
  if (existing && existing.expiresAt > now && existing.workerId !== workerId) {
    return { acquired: false, owner: existing.workerId, reason: 'lease-held' };
  }
  const lease = { runId, workerId, acquiredAt: now, expiresAt: now + ttlMs, fencing: (existing?.fencing || 0) + 1 };
  leases.set(runId, lease);
  return { acquired: true, lease };
}

export function heartbeatLease({ runId, workerId, leases = new Map(), ttlMs = 30000, now = Date.now() } = {}) {
  const existing = leases.get(runId);
  if (!existing || existing.workerId !== workerId) fail('LEASE_NOT_OWNER', runId);
  existing.expiresAt = now + ttlMs;
  return existing;
}

export function releaseLease({ runId, workerId, leases = new Map() } = {}) {
  const existing = leases.get(runId);
  if (existing && existing.workerId === workerId) leases.delete(runId);
  return true;
}

export function workerReport({ runId, workerId, status, nodeId = null, errorClass = null, durations = {} } = {}) {
  if (!runId || !workerId || !status) fail('WORKER_REPORT_INVALID');
  return {
    runId,
    workerId,
    status,
    nodeId,
    errorClass,
    durations: plain(durations) ? structuredClone(durations) : {},
    reportedAt: new Date().toISOString()
  };
}

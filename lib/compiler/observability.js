function plain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const SECRET_KEY = /(password|secret|token|authorization|cookie|api[_-]?key|client[_-]?secret)/i;

function scrub(value) {
  if (typeof value === 'string') {
    return SECRET_KEY.test(value) ? '[redacted]' : value.slice(0, 512);
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (plain(value)) {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? '[redacted]' : scrub(item);
    }
    return out;
  }
  return value;
}

export function startSpan({ workflowId, workflowVersion, runId, nodeId, backend } = {}) {
  const startedAt = Date.now();
  return {
    workflowId,
    workflowVersion,
    runId,
    nodeId,
    backend: backend || 'unknown',
    startedAt,
    end({ status = 'ok', retries = 0, verification = null, errorClass = null, latencies = {} } = {}) {
      return {
        workflowId,
        workflowVersion,
        runId,
        nodeId,
        backend: backend || 'unknown',
        durationMs: Date.now() - startedAt,
        retryCount: retries,
        status,
        verificationStatus: verification,
        errorClass,
        externalLatency: latencies.external || 0,
        approvalLatency: latencies.approval || 0
      };
    }
  };
}

export function runEvent(event) {
  return scrub(structuredClone(event));
}

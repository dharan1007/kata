function fail(code, detail = '') {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  throw error;
}

export async function repeatedReplay({ repetitions = 100, execute, classifyUpstream = () => false } = {}) {
  if (typeof execute !== 'function') fail('RELIABILITY_EXECUTOR_REQUIRED');
  if (!Number.isInteger(repetitions) || repetitions < 1) fail('RELIABILITY_REPETITIONS_INVALID');
  let success = 0;
  let kataFailures = 0;
  let upstreamFailures = 0;
  const failures = [];
  for (let index = 0; index < repetitions; index++) {
    try {
      await execute(index);
      success++;
    } catch (error) {
      if (classifyUpstream(error)) {
        upstreamFailures++;
      } else {
        kataFailures++;
        if (failures.length < 20) failures.push({ index, code: error?.code || 'unknown', message: String(error?.message || error).slice(0, 256) });
      }
    }
  }
  const total = repetitions;
  const healthy = total - upstreamFailures;
  const rate = healthy ? success / healthy : 0;
  return {
    repetitions: total,
    success,
    kataFailures,
    upstreamFailures,
    rateExcludingUpstream: rate,
    failures,
    targets: { api: 0.99, browser: 0.95 }
  };
}

export function reliabilityGate(result, { kind = 'api' } = {}) {
  const target = kind === 'browser' ? 0.95 : 0.99;
  if (result.rateExcludingUpstream < target) {
    return { ok: false, reason: `Reliability gate failed: ${result.rateExcludingUpstream} < ${target} (${kind}).` };
  }
  return { ok: true };
}

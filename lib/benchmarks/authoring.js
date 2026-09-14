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

export function authoringComparison({ manualHours, manualLines, kataDemonstrations, kataCorrectionHours, kataQualificationHours, successRate, maintenanceHours = 0 } = {}) {
  for (const [key, value] of Object.entries({ manualHours, kataCorrectionHours, kataQualificationHours, successRate })) {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail('AUTHORING_METRIC_INVALID', key);
  }
  if (!Number.isInteger(kataDemonstrations) || kataDemonstrations < 2) fail('AUTHORING_DEMO_COUNT_INVALID');
  const kataHours = kataCorrectionHours + kataQualificationHours;
  const reduction = manualHours > 0 ? (manualHours - kataHours) / manualHours : 0;
  return {
    manualHours,
    manualLines: manualLines || null,
    kataDemonstrations,
    kataCorrectionHours,
    kataQualificationHours,
    kataHours,
    successRate,
    maintenanceHours,
    laborReduction: reduction,
    meetsTarget: reduction >= 0.75,
    gate: reduction >= 0.75 ? 'PASS' : 'Benchmark gate failed: authoring labor reduction below 75%.'
  };
}

export function perfComparison({ handcraftedMs, kataMs, safetyKept = true } = {}) {
  if (typeof handcraftedMs !== 'number' || typeof kataMs !== 'number' || handcraftedMs <= 0) fail('PERF_METRIC_INVALID');
  const overhead = (kataMs - handcraftedMs) / handcraftedMs;
  const ok = overhead <= 0.2 && safetyKept === true;
  return {
    handcraftedMs,
    kataMs,
    overhead,
    safetyKept,
    ok,
    gate: ok ? 'PASS' : 'Benchmark gate failed: API-first overhead above 20% or safety removed.'
  };
}

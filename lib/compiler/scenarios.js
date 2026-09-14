export const QUALIFICATION_SCENARIOS = Object.freeze([
  'demonstrated-paths',
  'each-branch',
  'loop-bounds',
  'optional-paths',
  'invalid-inputs',
  'api-failure',
  'browser-failure',
  'timeout',
  'authentication-failure',
  'rate-limit',
  'retry-behavior',
  'partial-completion',
  'compensation-path',
  'verification-failure',
  'cancellation',
  'restart-resume'
]);

export function generateScenarios({ branches = [], loops = [], optionalSteps = [] } = {}) {
  const scenarios = [...QUALIFICATION_SCENARIOS];
  for (const branch of branches) scenarios.push(`branch:${branch.position ?? branch.nodeId ?? 'unknown'}`);
  for (const loop of loops) scenarios.push(`loop:${loop.pattern?.join('+') || 'collection'}`);
  for (const step of optionalSteps) scenarios.push(`optional:${step}`);
  return [...new Set(scenarios)];
}

export function scenarioReport(results) {
  const failed = results.filter((result) => result.passed !== true);
  return {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.map((result) => result.scenario),
    ok: failed.length === 0
  };
}

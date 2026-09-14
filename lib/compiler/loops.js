const MAX_ITERATIONS = 1000000;

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  throw error;
}

function stepSignature(step) {
  if (typeof step === 'string') return step;
  if (step && typeof step === 'object') {
    return String(step.operationType || step.semanticTarget || step.kind || JSON.stringify(step));
  }
  return String(step);
}

function findRepeatedRuns(signatures, { minRepeat = 2, minLength = 1, maxLength = 8 } = {}) {
  const runs = [];
  for (let length = minLength; length <= Math.min(maxLength, Math.floor(signatures.length / minRepeat)); length++) {
    for (let start = 0; start + length * minRepeat <= signatures.length; start++) {
      const pattern = signatures.slice(start, start + length);
      let repeats = 1;
      while (start + repeats * length + length <= signatures.length) {
        const next = signatures.slice(start + repeats * length, start + (repeats + 1) * length);
        if (next.join('\u0000') !== pattern.join('\u0000')) break;
        repeats++;
      }
      if (repeats >= minRepeat) {
        runs.push({ start, length, repeats, pattern });
      }
    }
  }
  return runs.sort((a, b) => (b.repeats * b.length) - (a.repeats * a.length));
}

export function inferLoops(demonstrations, { minDemonstrationsWithLoop = 2 } = {}) {
  const perDemo = demonstrations.map((demo) => {
    const steps = demo.steps ?? demo.actions ?? [];
    return findRepeatedRuns(steps.map(stepSignature));
  });
  const candidates = new Map();
  perDemo.forEach((runs, demoIndex) => {
    for (const run of runs) {
      const key = run.pattern.join('\u0000');
      if (!candidates.has(key)) candidates.set(key, { pattern: run.pattern, length: run.length, demos: new Set(), maxRepeats: 0 });
      const entry = candidates.get(key);
      entry.demos.add(demoIndex);
      entry.maxRepeats = Math.max(entry.maxRepeats, run.repeats);
    }
  });
  const loops = [];
  for (const entry of candidates.values()) {
    if (entry.demos.size < minDemonstrationsWithLoop) continue;
    if (entry.maxRepeats < 2) continue;
    loops.push({
      status: 'LOOP_CANDIDATE',
      pattern: entry.pattern,
      collectionSource: 'inferred-collection',
      iterationVariable: 'item',
      terminationCondition: { kind: 'exhaust-collection' },
      maxIterations: Math.min(Math.max(entry.maxRepeats * 2, 10), MAX_ITERATIONS),
      failurePolicy: 'stop-and-escalate',
      concurrencyPolicy: { mode: 'sequential', maxConcurrency: 1 },
      outputAggregation: 'collect',
      evidence: { demonstrations: entry.demos.size, maxRepeats: entry.maxRepeats }
    });
  }
  return loops;
}

export function validateLoop(loop) {
  if (!loop || typeof loop !== 'object') fail('LOOP_INVALID');
  if (!Number.isInteger(loop.maxIterations) || loop.maxIterations < 1 || loop.maxIterations > MAX_ITERATIONS) {
    fail('LOOP_BOUND_REQUIRED');
  }
  if (!loop.collectionSource) fail('LOOP_COLLECTION_REQUIRED');
  if (!loop.terminationCondition) fail('LOOP_TERMINATION_REQUIRED');
  if (!loop.failurePolicy) fail('LOOP_FAILURE_POLICY_REQUIRED');
  return true;
}

export const LOOP_BOUNDS = Object.freeze({ maxIterations: MAX_ITERATIONS });

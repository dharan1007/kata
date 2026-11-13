import { alignSemanticSequences } from './alignment.js';

function plain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function signalSimilarity(left, right) {
  if (!plain(left) || !plain(right)) return 0;
  let matches = 0;
  let total = 0;
  const signals = [
    ['operationType', 3],
    ['semanticTarget', 3],
    ['endpointPattern', 2],
    ['role', 1]
  ];
  for (const [key, weight] of signals) {
    const leftValue = left[key] ?? null;
    const rightValue = right[key] ?? null;
    if (leftValue === null && rightValue === null) continue;
    total += weight;
    if (leftValue !== null && leftValue === rightValue) matches += weight;
  }
  if (plain(left.attributes) && plain(right.attributes)) {
    const keys = new Set([...Object.keys(left.attributes), ...Object.keys(right.attributes)]);
    for (const key of keys) {
      total += 1;
      if (left.attributes[key] === right.attributes[key]) matches += 1;
    }
  }
  if (JSON.stringify(left.beforeState ?? null) === JSON.stringify(right.beforeState ?? null)) {
    total += 1;
    matches += 1;
  }
  if (JSON.stringify(left.afterState ?? null) === JSON.stringify(right.afterState ?? null)) {
    total += 1;
    matches += 1;
  }
  if (total === 0) return 0;
  return matches / total;
}

function stepKey(step) {
  if (typeof step === 'string') return step;
  if (plain(step)) return String(step.semanticTarget || step.operationType || step.kind || JSON.stringify(step));
  return String(step);
}

export function alignDemonstrations(leftSteps, rightSteps, { confidenceThreshold = 0.6 } = {}) {
  if (!Array.isArray(leftSteps) || !Array.isArray(rightSteps)) {
    const error = new Error('ALIGNMENT_INPUT_INVALID');
    error.code = 'ALIGNMENT_INPUT_INVALID';
    throw error;
  }
  const leftKeys = leftSteps.map(stepKey);
  const rightKeys = rightSteps.map(stepKey);
  const base = alignSemanticSequences(leftKeys, rightKeys);
  const columns = base.columns.map((column) => {
    if (column.kind === 'MATCH') {
      const leftStep = leftSteps[column.left];
      const rightStep = rightSteps[column.right];
      const confidence = plain(leftStep) && plain(rightStep) ? signalSimilarity(leftStep, rightStep) : 1;
      return {
        ...column,
        confidence,
        lowConfidence: confidence < confidenceThreshold,
        leftStep,
        rightStep
      };
    }
    if (column.kind === 'SUBSTITUTION') {
      const leftStep = leftSteps[column.left];
      const rightStep = rightSteps[column.right];
      const confidence = plain(leftStep) && plain(rightStep) ? signalSimilarity(leftStep, rightStep) : 0;
      return { ...column, confidence, lowConfidence: true, leftStep, rightStep };
    }
    const step = column.kind === 'LEFT_ONLY' ? leftSteps[column.left] : rightSteps[column.right];
    return { ...column, confidence: 0, lowConfidence: true, leftStep: column.kind === 'LEFT_ONLY' ? step : null, rightStep: column.kind === 'RIGHT_ONLY' ? step : null };
  });
  const confident = columns.filter((column) => !column.lowConfidence).length;
  const confidence = columns.length ? confident / columns.length : 1;
  const presentEverywhere = columns.filter((column) => column.kind === 'MATCH' && !column.lowConfidence);
  const presentSometimes = columns.filter((column) => column.kind !== 'MATCH' || column.lowConfidence);
  return {
    score: base.score,
    ambiguous: base.ambiguous,
    confidence,
    lowConfidence: confidence < confidenceThreshold,
    columns,
    presentEverywhere: presentEverywhere.map((column) => column.left),
    presentSometimes: presentSometimes.map((column) => ({ kind: column.kind, left: column.left, right: column.right, confidence: column.confidence }))
  };
}

export function alignmentSummary(alignment) {
  return {
    confidence: alignment.confidence,
    lowConfidence: alignment.lowConfidence,
    everywhere: alignment.presentEverywhere.length,
    sometimes: alignment.presentSometimes.length
  };
}

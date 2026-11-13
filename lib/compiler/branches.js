import { createNeedsLabel } from './needs-label.js';

function plain(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function observableEvidence(demonstrations, position) {
  const values = [];
  for (const demo of demonstrations) {
    const steps = demo.steps ?? demo.actions ?? [];
    if (position < steps.length) values.push(steps[position]);
  }
  return values;
}

function differingPaths(variants) {
  if (variants.length < 2) return [];
  const keys = new Set();
  for (const variant of variants) {
    if (plain(variant)) for (const key of Object.keys(variant)) keys.add(key);
  }
  const differing = [];
  for (const key of keys) {
    const seen = new Set(variants.map((variant) => JSON.stringify(plain(variant) ? variant[key] ?? null : variant)));
    if (seen.size > 1) differing.push(key);
  }
  return differing;
}

export function inferBranch({ position, variants, priorStates = [] } = {}) {
  if (!Array.isArray(variants) || variants.length < 2) {
    const error = new Error('BRANCH_EVIDENCE_INSUFFICIENT');
    error.code = 'BRANCH_EVIDENCE_INSUFFICIENT';
    throw error;
  }
  const paths = differingPaths(variants);
  const predicate = derivePredicate(priorStates, variants);
  if (predicate) {
    return {
      status: 'BRANCHED',
      position,
      predicate,
      paths,
      evidence: { variantCount: variants.length }
    };
  }
  return createNeedsLabel({
    position,
    observed: variants,
    hypotheses: [
      { id: 'business-condition', label: 'business-condition', description: `Divergence depends on observable prior data (${paths.join(', ') || 'unknown fields'}); owner must name the condition.` },
      { id: 'optional-step', label: 'optional-step', description: 'One path is optional and the other is the full path.' },
      { id: 'operator-variance', label: 'operator-variance', description: 'Divergence is accidental demonstration noise; canonical path excludes it.' }
    ],
    evidence: { differingPaths: paths, priorSample: priorStates.slice(0, 3) }
  });
}

function derivePredicate(priorStates, variants) {
  if (priorStates.length !== variants.length || priorStates.length < 2) return null;
  const candidateKeys = new Set();
  for (const state of priorStates) {
    if (plain(state)) for (const key of Object.keys(state)) candidateKeys.add(key);
  }
  for (const key of candidateKeys) {
    const groups = new Map();
    let consistent = true;
    for (let index = 0; index < priorStates.length; index++) {
      const priorValue = plain(priorStates[index]) ? JSON.stringify(priorStates[index][key] ?? null) : 'null';
      const variantValue = JSON.stringify(variants[index]);
      if (!groups.has(priorValue)) groups.set(priorValue, new Set());
      groups.get(priorValue).add(variantValue);
    }
    for (const variantSet of groups.values()) {
      if (variantSet.size !== 1) {
        consistent = false;
        break;
      }
    }
    if (consistent && groups.size >= 2) {
      return { field: key, kind: 'equality', evidence: [...groups.keys()].slice(0, 5) };
    }
    const numeric = priorStates.map((state) => (plain(state) ? state[key] : null)).filter((value) => typeof value === 'number');
    if (numeric.length === priorStates.length) {
      const threshold = numericThreshold(numeric, variants);
      if (threshold !== null) return { field: key, kind: 'threshold', threshold };
    }
  }
  return null;
}

function numericThreshold(numbers, variants) {
  const paired = numbers.map((value, index) => ({ value, variant: JSON.stringify(variants[index]) })).sort((a, b) => a.value - b.value);
  for (let index = 1; index < paired.length; index++) {
    const leftVariants = new Set(paired.slice(0, index).map((entry) => entry.variant));
    const rightVariants = new Set(paired.slice(index).map((entry) => entry.variant));
    if (leftVariants.size === 1 && rightVariants.size === 1 && [...leftVariants][0] !== [...rightVariants][0]) {
      return (paired[index - 1].value + paired[index].value) / 2;
    }
  }
  return null;
}

export function inferBranchesFromDemonstrations(demonstrations, divergentPositions) {
  return divergentPositions.map((position) => {
    const variants = observableEvidence(demonstrations, position);
    const priorStates = demonstrations.map((demo) => {
      const steps = demo.steps ?? demo.actions ?? [];
      return position > 0 ? steps[position - 1] : {};
    });
    return inferBranch({ position, variants, priorStates });
  });
}

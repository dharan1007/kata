const MIN_DEMONSTRATIONS = 2;
const RECOMMENDED_MIN = 3;
const RECOMMENDED_MAX = 5;
const MAX_DEMONSTRATIONS = 64;

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

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (plain(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
    return out;
  }
  return value;
}

function demonstrationSignature(demo) {
  return JSON.stringify(stable(demo.steps ?? demo.actions ?? demo));
}

export function validateDemonstrationSet(demonstrations, { workflowKind = 'general' } = {}) {
  if (!Array.isArray(demonstrations)) fail('DEMO_SET_INVALID');
  const count = demonstrations.length;
  if (count < MIN_DEMONSTRATIONS) {
    return {
      ok: false,
      status: 'NEED_MORE_EVIDENCE',
      reason: 'DEMO_COUNT_BELOW_MINIMUM',
      detail: `At least ${MIN_DEMONSTRATIONS} demonstrations are required; received ${count}.`,
      recommended: `${RECOMMENDED_MIN}-${RECOMMENDED_MAX}`
    };
  }
  if (count > MAX_DEMONSTRATIONS) fail('DEMO_COUNT_EXCEEDED', String(count));
  const signatures = demonstrations.map(demonstrationSignature);
  if (new Set(signatures).size !== signatures.length) {
    return {
      ok: false,
      status: 'NEED_MORE_EVIDENCE',
      reason: 'DUPLICATE_DEMONSTRATION',
      detail: 'Each demonstration must contribute distinct evidence; duplicates were rejected.'
    };
  }
  const simple = workflowKind === 'simple';
  const recommended = simple ? count >= 2 : count >= RECOMMENDED_MIN && count <= RECOMMENDED_MAX;
  const distinctValues = hasDistinctValues(demonstrations);
  if (!distinctValues) {
    return {
      ok: false,
      status: 'NEEDS_LABEL',
      reason: 'NO_DISTINCT_VALUES',
      detail: 'Demonstrations use identical values throughout; supply distinct values (for example distinct customer ids and amounts) so variables can be inferred.',
      options: ['supply-distinct-values', 'confirm-all-constants']
    };
  }
  return {
    ok: true,
    count,
    recommended,
    guidance: recommended
      ? 'Demonstration count satisfies the recommended range.'
      : `Recommended ${RECOMMENDED_MIN}-${RECOMMENDED_MAX} demonstrations; minimum 2 accepted only for extremely simple workflows. Current count ${count} proceeds but review is required.`
  };
}

function collectLeafValues(demonstrations) {
  const perPosition = new Map();
  for (const demo of demonstrations) {
    const steps = demo.steps ?? demo.actions ?? [];
    steps.forEach((step, index) => {
      const flat = flattenValues(step);
      if (!perPosition.has(index)) perPosition.set(index, []);
      perPosition.get(index).push(flat);
    });
  }
  return perPosition;
}

function flattenValues(value, prefix = '$', out = {}) {
  if (value === null || typeof value !== 'object') {
    out[prefix] = value;
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenValues(item, `${prefix}[${index}]`, out));
    return out;
  }
  for (const [key, item] of Object.entries(value)) flattenValues(item, `${prefix}.${key}`, out);
  return out;
}

function hasDistinctValues(demonstrations) {
  const perPosition = collectLeafValues(demonstrations);
  for (const flats of perPosition.values()) {
    const keys = new Set(flats.flatMap((flat) => Object.keys(flat)));
    for (const key of keys) {
      const values = flats.map((flat) => JSON.stringify(flat[key] ?? null));
      if (new Set(values).size > 1) return true;
    }
  }
  return false;
}

export function inferVariablesFromDemonstrations(demonstrations) {
  const perPosition = collectLeafValues(demonstrations);
  const variables = [];
  const constants = [];
  for (const [index, flats] of perPosition) {
    const keys = new Set(flats.flatMap((flat) => Object.keys(flat)));
    for (const key of keys) {
      const values = flats.map((flat) => flat[key] ?? null);
      const unique = [...new Set(values.map((value) => JSON.stringify(value)))].map((raw) => JSON.parse(raw));
      if (unique.length > 1) variables.push({ position: index, path: key, values: unique });
      else constants.push({ position: index, path: key, value: unique[0] });
    }
  }
  return { variables, constants };
}

export const DEMO_POLICY = Object.freeze({
  min: MIN_DEMONSTRATIONS,
  recommendedMin: RECOMMENDED_MIN,
  recommendedMax: RECOMMENDED_MAX,
  max: MAX_DEMONSTRATIONS
});

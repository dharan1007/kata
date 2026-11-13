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

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (plain(value)) return 'object';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'string' || typeof value === 'boolean') return typeof value;
  return 'unknown';
}

function looksSessionOrNoise(path, values) {
  const joined = path.join('.').toLowerCase();
  if (/(session|csrf|nonce|timestamp|_ts|trace[_-]?id|request[_-]?id)/.test(joined)) return true;
  if (values.every((value) => typeof value === 'string' && /^[a-f0-9]{16,}$/.test(value))) return true;
  return false;
}

function looksGeneratedId(path, values) {
  const joined = path.join('.').toLowerCase();
  if (/(^|\.)id$|_id$|uuid|guid/.test(joined) && new Set(values.map((value) => JSON.stringify(value))).size === values.length) {
    return true;
  }
  return false;
}

export function inferVariableRecords(positionedValues) {
  const records = [];
  for (const { position, path, values } of positionedValues) {
    const unique = [...new Set(values.map((value) => JSON.stringify(value)))].map((raw) => JSON.parse(raw));
    const types = [...new Set(values.map(valueType))];
    if (unique.length === 1) {
      records.push({
        position,
        path,
        kind: 'constant',
        type: types[0],
        value: unique[0],
        source: 'demonstration-invariant',
        evidence: { occurrences: values.length },
        userSupplied: false,
        derived: false,
        secret: false,
        optional: false,
        validation: { allowedValues: unique }
      });
      continue;
    }
    if (looksSessionOrNoise(path, values)) {
      records.push({
        position,
        path,
        kind: 'environment-noise',
        type: types.length === 1 ? types[0] : 'union',
        source: 'session-or-noise',
        evidence: { occurrences: values.length, distinct: unique.length },
        userSupplied: false,
        derived: false,
        secret: false,
        optional: true,
        validation: { ignoreForSemantics: true }
      });
      continue;
    }
    if (looksGeneratedId(path, values)) {
      records.push({
        position,
        path,
        kind: 'generated-id',
        type: types[0],
        source: 'api-generated',
        evidence: { occurrences: values.length, distinct: unique.length },
        userSupplied: false,
        derived: true,
        secret: false,
        optional: false,
        validation: { format: 'opaque-identifier' }
      });
      continue;
    }
    records.push({
      position,
      path,
      kind: 'input-variable',
      type: types.length === 1 ? types[0] : 'union',
      source: 'demonstration-variation',
      evidence: { occurrences: values.length, distinct: unique.length, sample: unique.slice(0, 5) },
      userSupplied: true,
      derived: false,
      secret: false,
      optional: false,
      validation: { minOccurrences: 2 }
    });
  }
  return records;
}

export function collectPositionedValues(demonstrations) {
  const perKey = new Map();
  demonstrations.forEach((demo) => {
    const steps = demo.steps ?? demo.actions ?? [];
    steps.forEach((step, position) => {
      const flat = flatten(step);
      for (const [pathKey, value] of Object.entries(flat)) {
        const key = `${position}\u0000${pathKey}`;
        if (!perKey.has(key)) perKey.set(key, { position, path: pathKey.split('.'), values: [] });
        perKey.get(key).values.push(value);
      }
    });
  });
  return [...perKey.values()];
}

function flatten(value, prefix = '$', out = {}) {
  if (value === null || typeof value !== 'object') {
    out[prefix] = value;
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${prefix}[${index}]`, out));
    return out;
  }
  for (const [key, item] of Object.entries(value)) flatten(item, prefix === '$' ? key : `${prefix}.${key}`, out);
  return out;
}

export function markSecretVariables(records, secretPaths) {
  const secrets = new Set(secretPaths);
  return records.map((record) => {
    const key = record.path.join('.');
    if (secrets.has(key)) return { ...record, secret: true, source: 'credential-reference', value: undefined, validation: { credentialReference: true } };
    return record;
  });
}

export function validateVariableRecords(records) {
  for (const record of records) {
    if (!record.path || !record.kind || !record.type) fail('VARIABLE_RECORD_INVALID');
    if (record.kind === 'input-variable' && (record.evidence?.distinct ?? 0) < 2) {
      fail('VARIABLE_EVIDENCE_INSUFFICIENT', record.path.join('.'));
    }
  }
  return true;
}

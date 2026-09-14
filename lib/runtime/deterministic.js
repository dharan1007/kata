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

function resolveValue(value, input, completed) {
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, input, completed));
  if (!plain(value)) return value;
  if (typeof value.$param === 'string' && Object.keys(value).length === 1) {
    if (!Object.prototype.hasOwnProperty.call(input, value.$param)) fail('DETERMINISTIC_PARAMETER_MISSING', value.$param);
    return structuredClone(input[value.$param]);
  }
  if (plain(value.$from) && Object.keys(value).length === 1) {
    const source = completed[value.$from.node];
    if (source === undefined) fail('DETERMINISTIC_SOURCE_MISSING', value.$from.node);
    let current = source;
    for (const segment of value.$from.path || []) {
      if (Array.isArray(current)) {
        if (!Number.isInteger(segment) || segment < 0 || segment >= current.length) fail('DETERMINISTIC_PATH_MISSING');
        current = current[segment];
        continue;
      }
      if (!plain(current) || !Object.prototype.hasOwnProperty.call(current, segment)) fail('DETERMINISTIC_PATH_MISSING');
      current = current[segment];
    }
    return structuredClone(current);
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = resolveValue(item, input, completed);
  return out;
}

const TRANSFORM_OPS = new Set(['copy', 'rename', 'project', 'concat', 'coerce', 'constant', 'lookup']);

function runTransform(spec, args) {
  const steps = spec?.transform?.steps || spec?.steps || null;
  if (!steps) return structuredClone(args);
  let state = structuredClone(args);
  for (const step of steps) {
    if (!TRANSFORM_OPS.has(step.op)) fail('DETERMINISTIC_TRANSFORM_OP_UNKNOWN', step.op);
    if (step.op === 'constant') state[step.into] = structuredClone(step.value);
    else if (step.op === 'copy') state[step.into] = structuredClone(state[step.from]);
    else if (step.op === 'rename') {
      state[step.into] = structuredClone(state[step.from]);
      delete state[step.from];
    } else if (step.op === 'project') {
      const next = {};
      for (const key of step.keys || []) next[key] = structuredClone(state[key]);
      state = next;
    } else if (step.op === 'concat') {
      state[step.into] = (step.parts || []).map((part) => String(state[part] ?? part)).join(step.separator || '');
    } else if (step.op === 'coerce') {
      const raw = state[step.field];
      state[step.into || step.field] = step.to === 'number' ? Number(raw) : step.to === 'string' ? String(raw) : raw;
    } else if (step.op === 'lookup') {
      const table = step.table || {};
      state[step.into] = table[String(state[step.field])] ?? step.default ?? null;
    }
  }
  return state;
}

export function executeDeterministicNode(node, { input = {}, completed = {}, approvals = {}, maxWaitMs = 0 } = {}) {
  if (!plain(node) || typeof node.id !== 'string') fail('DETERMINISTIC_NODE_INVALID');
  const args = resolveValue(node.spec?.arguments || {}, input, completed);
  switch (node.kind) {
    case 'transform':
      return runTransform(node.spec || {}, args);
    case 'assert': {
      const condition = node.spec?.condition;
      const pass = condition === undefined ? true : JSON.stringify(condition) === JSON.stringify(args) || condition === true;
      if (!pass) fail('DETERMINISTIC_ASSERT_FAILED', node.id);
      return { asserted: true };
    }
    case 'branch': {
      const branches = node.spec?.branches;
      if (conditionMet(node.spec?.condition, args)) return { taken: 0 };
      if (Array.isArray(branches)) return { taken: 1 };
      return { taken: 0 };
    }
    case 'wait': {
      const ms = Number(node.spec?.waitMs || 0);
      if (ms > maxWaitMs) fail('DETERMINISTIC_WAIT_BOUND_EXCEEDED', node.id);
      return { waitedMs: ms };
    }
    case 'approval': {
      const grant = approvals[node.id];
      if (grant !== true) fail('DETERMINISTIC_APPROVAL_REQUIRED', node.id);
      return { approved: true };
    }
    case 'emit':
      return { emitted: args };
    case 'checkpoint':
      return { checkpoint: node.id };
    default:
      fail('DETERMINISTIC_KIND_UNSUPPORTED', `${node.id}:${node.kind}`);
  }
}

function conditionMet(condition, args) {
  if (condition === undefined || condition === null) return true;
  if (condition === true || condition === false) return condition;
  if (plain(condition) && condition.field !== undefined) {
    return JSON.stringify(args[condition.field]) === JSON.stringify(condition.equals);
  }
  return true;
}

export function executeDeterministicGraph(nodes, { input = {}, approvals = {}, maxWaitMs = 0, maxSteps = 10000 } = {}) {
  if (!Array.isArray(nodes) || nodes.length > maxSteps) fail('DETERMINISTIC_GRAPH_INVALID');
  const completed = {};
  for (const node of nodes) {
    completed[node.id] = executeDeterministicNode(node, { input, completed, approvals, maxWaitMs });
  }
  return completed;
}

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
const MAX_LOOP_ITERATIONS = 1000000;

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
    case 'loop': {
      const body = node.spec?.body || [];
      const maxIterations = Math.min(Number(node.spec?.maxIterations || 100), MAX_LOOP_ITERATIONS);
      const collection = args.collection || [];
      const iterationVar = node.spec?.iterationVariable || 'item';
      const results = [];
      for (let i = 0; i < Math.min(collection.length, maxIterations); i++) {
        const iterInput = { ...input, [iterationVar]: collection[i], index: i };
        const completedCopy = { ...completed };
        const iterCompleted = executeDeterministicGraph(body, { input: iterInput, approvals, maxWaitMs });
        results.push(iterCompleted);
      }
      return { iterations: results.length, results };
    }
    case 'subworkflow': {
      const subProgram = node.spec?.program;
      if (!subProgram) fail('DETERMINISTIC_SUBWORKFLOW_PROGRAM_REQUIRED', node.id);
      return executeDeterministicGraph(subProgram.nodes, { input: args, approvals, maxWaitMs });
    }
    case 'verify': {
      const strategy = node.spec?.strategy || 'schema';
      if (strategy === 'schema') {
        const pass = true;
        return { verified: pass, strategy };
      }
      if (strategy === 'equality') {
        const expected = node.spec?.expected;
        const pass = JSON.stringify(args) === JSON.stringify(expected);
        return { verified: pass, strategy };
      }
      return { verified: true, strategy: 'none' };
    }
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
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const indegree = new Map(nodes.map((n) => [n.id, 0]));
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const node of nodes) {
    for (const edge of node.spec?.edges || []) {
      if (nodeMap.has(edge.from) && nodeMap.has(edge.to)) {
        adj.get(edge.from).push(edge.to);
        indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
      }
    }
  }
  const queue = nodes.filter((n) => indegree.get(n.id) === 0);
  for (const node of queue) {
    completed[node.id] = executeDeterministicNode(node, { input, completed, approvals, maxWaitMs });
  }
  while (queue.length) {
    const current = queue.shift();
    for (const next of adj.get(current.id) || []) {
      const deg = indegree.get(next) - 1;
      indegree.set(next, deg);
      if (deg === 0) {
        queue.push(next);
        completed[next.id] = executeDeterministicNode(next, { input, completed, approvals, maxWaitMs });
      }
    }
  }
  return completed;
}

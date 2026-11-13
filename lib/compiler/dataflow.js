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

function collectRefs(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, out);
    return out;
  }
  if (!plain(value)) return out;
  if (typeof value.$param === 'string' && Object.keys(value).length === 1) {
    out.push({ kind: 'param', name: value.$param });
    return out;
  }
  if (plain(value.$from) && typeof value.$from.node === 'string') {
    out.push({ kind: 'from', node: value.$from.node, path: value.$from.path || [] });
    return out;
  }
  for (const item of Object.values(value)) collectRefs(item, out);
  return out;
}

export function buildDataflowGraph(nodes, { workflowInputs = {}, credentialRefs = new Set() } = {}) {
  const ids = new Set(nodes.map((node) => node.id));
  const graph = new Map(nodes.map((node) => [node.id, { node, dependsOn: new Set(), sources: [] }]));
  const errors = [];
  for (const node of nodes) {
    const refs = collectRefs(node.inputs || {});
    for (const ref of refs) {
      if (ref.kind === 'param') {
        if (!(ref.name in workflowInputs) && ![...credentialRefs].includes(ref.name)) {
          errors.push({ code: 'DATAFLOW_UNDEFINED_VARIABLE', nodeId: node.id, name: ref.name });
        }
        graph.get(node.id).sources.push({ kind: 'workflow-input', name: ref.name });
      }
      if (ref.kind === 'from') {
        if (!ids.has(ref.node)) {
          errors.push({ code: 'DATAFLOW_UNKNOWN_PRODUCER', nodeId: node.id, producer: ref.node });
          continue;
        }
        if (ref.node === node.id) errors.push({ code: 'DATAFLOW_SELF_DEPENDENCY', nodeId: node.id });
        graph.get(node.id).dependsOn.add(ref.node);
        graph.get(node.id).sources.push({ kind: 'node-output', node: ref.node, path: ref.path });
      }
    }
    if (node.credentialRequirements?.reference) {
      graph.get(node.id).sources.push({ kind: 'credential-reference', name: node.credentialRequirements.reference });
    }
  }
  const cycle = findCycle(graph);
  if (cycle) errors.push({ code: 'DATAFLOW_CYCLIC_DEPENDENCY', cycle });
  return { graph, errors, ok: errors.length === 0 };
}

function findCycle(graph) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  function visit(id) {
    if (visited.has(id)) return null;
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    visiting.add(id);
    stack.push(id);
    for (const dep of graph.get(id)?.dependsOn || []) {
      const found = visit(dep);
      if (found) return found;
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  }
  for (const id of graph.keys()) {
    const found = visit(id);
    if (found) return found;
  }
  return null;
}

export function checkSecretSinks(nodes, { unsafeSinks = ['browser-log', 'public-output', 'external-url'] } = {}) {
  const findings = [];
  for (const node of nodes) {
    const secretInputs = secretPaths(node.inputs);
    if (secretInputs.length && node.observability?.logInputs === 'raw') {
      findings.push({ code: 'SECRET_FLOW_TO_UNSAFE_SINK', nodeId: node.id, sink: 'browser-log' });
    }
    if (secretInputs.length && unsafeSinks.includes(node.executionBackend?.target)) {
      findings.push({ code: 'SECRET_FLOW_TO_UNSAFE_SINK', nodeId: node.id, sink: node.executionBackend.target });
    }
  }
  return findings;
}

function secretPaths(value, prefix = '$', out = []) {
  if (value === null || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => secretPaths(item, `${prefix}[${index}]`, out));
    return out;
  }
  for (const [key, item] of Object.entries(value)) {
    if (/secret|credential/i.test(key)) out.push(`${prefix}.${key}`);
    secretPaths(item, `${prefix}.${key}`, out);
  }
  return out;
}

export function checkUntrustedSources(nodes, { untrustedOrigins = new Set() } = {}) {
  const findings = [];
  for (const node of nodes) {
    const origin = node.provenance?.origin;
    if (origin && untrustedOrigins.has(origin)) {
      findings.push({ code: 'UNTRUSTED_EXTERNAL_CONTENT', nodeId: node.id, origin });
    }
  }
  return findings;
}

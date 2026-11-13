import { validateKirProgram } from '../kir/index.js';

export const SEMANTIC_NODE_KINDS = Object.freeze([
  'ReadResource',
  'CallAPI',
  'BrowserNavigate',
  'BrowserInteract',
  'Extract',
  'Transform',
  'Branch',
  'Loop',
  'Wait',
  'HumanApproval',
  'HumanDecision',
  'ConsequentialAction',
  'Verify',
  'Compensate',
  'Emit',
  'Escalate',
  'Subworkflow'
]);

export const SEMANTIC_KINDS = new Set(SEMANTIC_NODE_KINDS);

export const SIDE_EFFECT_CLASSES = Object.freeze([
  'none',
  'read',
  'idempotent-write',
  'reversible-write',
  'non-idempotent-write',
  'destructive-write',
  'irreversible-external-effect'
]);

const SIDE_EFFECTS = new Set(SIDE_EFFECT_CLASSES);

const KIR_KIND_FOR_SEMANTIC = Object.freeze({
  ReadResource: 'invoke',
  CallAPI: 'invoke',
  BrowserNavigate: 'invoke',
  BrowserInteract: 'invoke',
  Extract: 'transform',
  Transform: 'transform',
  Branch: 'branch',
  Loop: 'loop',
  Wait: 'wait',
  HumanApproval: 'approval',
  HumanDecision: 'approval',
  ConsequentialAction: 'invoke',
  Verify: 'assert',
  Compensate: 'compensate',
  Emit: 'emit',
  Escalate: 'fail',
  Subworkflow: 'subworkflow'
});

const SECRET_REF = /^[A-Za-z][A-Za-z0-9_./:-]{0,191}$/;
const CREDENTIAL_PATTERNS = [
  /authorization\s*:\s*bearer\s+[A-Za-z0-9._~+/-]+=* /i,
  /authorization\s*:\s*bearer\s+[A-Za-z0-9._~+/-]+=*\s*$/im,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /xox[bap]-/,
  /gh[pousr]_[A-Za-z0-9]+/,
  /sk-(live|test)-[A-Za-z0-9]+/
];

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

function assertJson(value, depth = 0) {
  if (depth > 64) fail('SEMANTIC_JSON_DEPTH_EXCEEDED');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('SEMANTIC_NON_FINITE_NUMBER');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 100000) fail('SEMANTIC_ARRAY_TOO_LARGE');
    for (const item of value) assertJson(item, depth + 1);
    return;
  }
  if (!plain(value)) fail('SEMANTIC_NON_PLAIN_OBJECT');
  for (const [key, item] of Object.entries(value)) {
    if (typeof key !== 'string' || !key) fail('SEMANTIC_KEY_INVALID');
    assertJson(item, depth + 1);
  }
}

function containsEmbeddedCredential(value) {
  if (typeof value === 'string') {
    for (const pattern of CREDENTIAL_PATTERNS) {
      if (pattern.test(value)) return true;
    }
    return false;
  }
  if (Array.isArray(value)) return value.some(containsEmbeddedCredential);
  if (plain(value)) {
    for (const [key, item] of Object.entries(value)) {
      const lowered = key.toLowerCase();
      if ((lowered === 'authorization' || lowered === 'api_key' || lowered === 'apikey' || lowered === 'client_secret') && typeof item === 'string' && item.length >= 8) {
        if (/bearer\s+/i.test(item) || /^[A-Za-z0-9._~+/-]{16,}={0,2}$/.test(item)) return true;
      }
      if (containsEmbeddedCredential(item)) return true;
    }
  }
  return false;
}

export function validateSemanticNode(node) {
  if (!plain(node)) fail('SEMANTIC_NODE_INVALID');
  const required = ['id', 'kind', 'inputs', 'outputs', 'types', 'preconditions', 'postconditions', 'sideEffectClass', 'credentialRequirements', 'retryPolicy', 'timeoutMs', 'verification', 'provenance'];
  for (const key of required) {
    if (node[key] === undefined) fail('SEMANTIC_NODE_FIELD_REQUIRED', `${node.id || '?'}:${key}`);
  }
  if (typeof node.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(node.id)) fail('SEMANTIC_NODE_ID_INVALID');
  if (!SEMANTIC_KINDS.has(node.kind)) fail('SEMANTIC_NODE_KIND_UNKNOWN', String(node.kind));
  if (!plain(node.inputs)) fail('SEMANTIC_INPUTS_INVALID', node.id);
  if (!plain(node.outputs)) fail('SEMANTIC_OUTPUTS_INVALID', node.id);
  if (!plain(node.types)) fail('SEMANTIC_TYPES_INVALID', node.id);
  if (!Array.isArray(node.preconditions)) fail('SEMANTIC_PRECONDITIONS_INVALID', node.id);
  if (!Array.isArray(node.postconditions)) fail('SEMANTIC_POSTCONDITIONS_INVALID', node.id);
  if (!SIDE_EFFECTS.has(node.sideEffectClass)) fail('SEMANTIC_SIDE_EFFECT_UNKNOWN', node.id);
  if (!plain(node.credentialRequirements)) fail('SEMANTIC_CREDENTIAL_REQUIREMENTS_INVALID', node.id);
  if (node.credentialRequirements.reference !== undefined && (typeof node.credentialRequirements.reference !== 'string' || !SECRET_REF.test(node.credentialRequirements.reference))) {
    fail('SEMANTIC_CREDENTIAL_REFERENCE_INVALID', node.id);
  }
  if (!plain(node.retryPolicy)) fail('SEMANTIC_RETRY_POLICY_INVALID', node.id);
  if (!Number.isInteger(node.timeoutMs) || node.timeoutMs < 1 || node.timeoutMs > 31536000000) fail('SEMANTIC_TIMEOUT_INVALID', node.id);
  if (!plain(node.verification)) fail('SEMANTIC_VERIFICATION_INVALID', node.id);
  if (!plain(node.provenance)) fail('SEMANTIC_PROVENANCE_INVALID', node.id);
  assertJson(node.inputs);
  assertJson(node.outputs);
  if (containsEmbeddedCredential(node.inputs) || containsEmbeddedCredential(node.outputs)) {
    fail('SEMANTIC_EMBEDDED_CREDENTIAL', node.id);
  }
  if (node.kind === 'ConsequentialAction' && node.sideEffectClass !== 'non-idempotent-write' && node.sideEffectClass !== 'destructive-write' && node.sideEffectClass !== 'irreversible-external-effect' && node.sideEffectClass !== 'reversible-write') {
    fail('SEMANTIC_CONSEQUENTIAL_SIDE_EFFECT_INVALID', node.id);
  }
  return true;
}

export function semanticNodeToKir(node) {
  validateSemanticNode(node);
  const kind = KIR_KIND_FOR_SEMANTIC[node.kind];
  const isWrite = node.sideEffectClass !== 'none' && node.sideEffectClass !== 'read';
  const destructive = node.sideEffectClass === 'destructive-write' || node.sideEffectClass === 'irreversible-external-effect';
  const effectClass = !isWrite ? 'READ_ONLY' : destructive ? 'DESTRUCTIVE_WRITE' : node.sideEffectClass === 'idempotent-write' ? 'IDEMPOTENT_WRITE' : node.sideEffectClass === 'reversible-write' ? 'REVERSIBLE_WRITE' : 'NON_IDEMPOTENT_WRITE';
  const maxAttempts = node.retryPolicy.maxAttempts ?? 1;
  const strategy = node.retryPolicy.strategy ?? 'none';
  if (node.kind === 'Transform' && node.transform !== undefined) {
    validateConstrainedTransform(node.transform, node.id);
  }
  return {
    id: node.id,
    kind,
    inputSchema: { type: 'object' },
    outputSchema: true,
    effect: { class: effectClass, idempotency: effectClass === 'READ_ONLY' ? 'none' : 'none' },
    capabilities: [...(node.credentialRequirements.scopes || ['kata:execute'])],
    authorization: { scopes: [...(node.credentialRequirements.scopes || ['kata:execute'])] },
    timeoutMs: node.timeoutMs,
    retry: { maxAttempts, strategy },
    budget: {},
    spec: {
      target: { transport: node.executionBackend?.transport || 'semantic', name: node.executionBackend?.target || `kata.semantic.${node.kind}` },
      semanticKind: node.kind,
      semanticVersion: node.version || 1,
      sideEffectClass: node.sideEffectClass,
      verification: node.verification,
      verificationStrategy: node.verificationStrategy || node.verification,
      failureTransitions: node.failureTransitions || { onFailure: 'fail', onTimeout: 'fail' },
      provenance: node.provenance,
      observability: node.observability || { logInputs: 'redacted', logOutputs: 'redacted' },
      transform: node.transform || null
    }
  };
}

const TRANSFORM_OPS = new Set(['copy', 'rename', 'project', 'concat', 'coerce', 'constant', 'lookup']);

export function validateConstrainedTransform(transform, nodeId = '?') {
  if (!transform || typeof transform !== 'object' || Array.isArray(transform)) fail('SEMANTIC_TRANSFORM_INVALID', nodeId);
  if (!Array.isArray(transform.steps) || transform.steps.length < 1) fail('SEMANTIC_TRANSFORM_STEPS_REQUIRED', nodeId);
  for (const step of transform.steps) {
    if (!step || typeof step !== 'object' || !TRANSFORM_OPS.has(step.op)) fail('SEMANTIC_TRANSFORM_OP_UNKNOWN', nodeId);
  }
  const text = JSON.stringify(transform);
  if (/__proto__|constructor|prototype|Function|eval/.test(text)) fail('SEMANTIC_TRANSFORM_UNSAFE', nodeId);
  return true;
}

export function validateSemanticProgram(program) {
  if (!plain(program)) fail('SEMANTIC_PROGRAM_INVALID');
  if (!Array.isArray(program.nodes) || program.nodes.length < 1) fail('SEMANTIC_PROGRAM_NODES_INVALID');
  const ids = new Set();
  for (const node of program.nodes) {
    validateSemanticNode(node);
    if (ids.has(node.id)) fail('SEMANTIC_DUPLICATE_NODE_ID', node.id);
    ids.add(node.id);
  }
  if (program.edges !== undefined) {
    if (!Array.isArray(program.edges)) fail('SEMANTIC_EDGES_INVALID');
    for (const edge of program.edges) {
      if (!plain(edge) || !ids.has(edge.from) || !ids.has(edge.to)) fail('SEMANTIC_EDGE_INVALID');
    }
  }
  return true;
}

export function semanticProgramToKir(program, { id = 'compiled_semantic_workflow', name = 'Semantic workflow', description = 'KATA semantic program compiled to KIR.' } = {}) {
  validateSemanticProgram(program);
  const nodes = program.nodes.map(semanticNodeToKir);
  const edges = program.edges ?? nodes.slice(0, -1).map((node, index) => ({ from: node.id, to: nodes[index + 1].id }));
  const entry = [nodes[0].id];
  const kir = {
    irVersion: 2,
    id,
    name,
    description,
    inputSchema: { type: 'object' },
    outputSchema: true,
    graph: { entry, nodes, edges },
    invariants: [{ kind: 'semantic', value: 'kata-semantic-kir-v1' }],
    policies: { failClosed: true },
    metadata: { compiler: 'kata-semantic-kir-v1' }
  };
  validateKirProgram(kir);
  return kir;
}

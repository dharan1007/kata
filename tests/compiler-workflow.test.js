import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSemanticNode, semanticNodeToKir, validateSemanticProgram, semanticProgramToKir, SEMANTIC_NODE_KINDS } from '../lib/compiler/semantic-kir.js';
import { validateDemonstrationSet, inferVariablesFromDemonstrations } from '../lib/compiler/demonstrations.js';
import { createNeedsLabel, resolveNeedsLabel, assertNoUnlabeledBranches, ambiguityForDivergentStep } from '../lib/compiler/needs-label.js';
import { planExecution } from '../lib/compiler/api-first.js';
import { createQualification, transitionQualification } from '../lib/compiler/qualification.js';
import { detectDrift, dispositionForDrift } from '../lib/compiler/drift.js';
import { splitConsequential, buildPactRequest } from '../lib/compiler/pact.js';
import { compileToTarget, compileAllTargets } from '../lib/compiler/targets.js';
import { qualifyWorkflow, checkReleaseTargets } from '../lib/compiler/qualify-runner.js';

function node(overrides = {}) {
  return {
    id: 'step_0001',
    kind: 'CallAPI',
    inputs: { customerId: '123' },
    outputs: { ok: true },
    types: { customerId: 'string' },
    preconditions: [],
    postconditions: [],
    sideEffectClass: 'read',
    credentialRequirements: { reference: 'kata/prod/read', scopes: ['kata:execute'] },
    retryPolicy: { maxAttempts: 1, strategy: 'none' },
    timeoutMs: 15000,
    verification: { kind: 'schema' },
    provenance: { demo: 'demo-1' },
    ...overrides
  };
}

test('semantic KIR defines the 17 canonical node kinds', () => {
  assert.equal(SEMANTIC_NODE_KINDS.length, 17);
  assert.ok(SEMANTIC_NODE_KINDS.includes('ConsequentialAction'));
  assert.ok(SEMANTIC_NODE_KINDS.includes('HumanApproval'));
  assert.ok(SEMANTIC_NODE_KINDS.includes('HumanDecision'));
  assert.ok(SEMANTIC_NODE_KINDS.includes('Subworkflow'));
});

test('refund example infers variables from distinct demonstrations', () => {
  const demos = [
    { steps: [{ open: 'customer 123' }, { balance: 'check' }, { refund: 500 }, { email: 'send' }] },
    { steps: [{ open: 'customer 845' }, { balance: 'check' }, { refund: 800 }, { email: 'send' }] }
  ];
  const result = validateDemonstrationSet(demos);
  assert.equal(result.ok, true);
  const inferred = inferVariablesFromDemonstrations(demos);
  assert.ok(inferred.variables.length >= 1);
});

test('duplicate demonstrations need more evidence', () => {
  const demo = { steps: [{ open: 'customer 123' }] };
  const result = validateDemonstrationSet([demo, structuredClone(demo)]);
  assert.equal(result.ok, false);
});

test('single demonstration is below minimum', () => {
  const result = validateDemonstrationSet([{ steps: [{ a: 1 }] }]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'DEMO_COUNT_BELOW_MINIMUM');
});

test('embedded credentials fail semantic validation', () => {
  assert.throws(() => validateSemanticNode(node({ inputs: { Authorization: 'Bearer abc12345678901234567890' } })), /SEMANTIC_EMBEDDED_CREDENTIAL/);
});

test('consequential nodes require a write side effect', () => {
  assert.throws(() => validateSemanticNode(node({ id: 'c1', kind: 'ConsequentialAction', sideEffectClass: 'read' })), /SEMANTIC_CONSEQUENTIAL_SIDE_EFFECT_INVALID/);
});

test('semantic program maps onto fail-closed KIR', () => {
  const program = { name: 'refund', nodes: [node({ id: 'a' }), node({ id: 'b', kind: 'Emit' })], edges: [{ from: 'a', to: 'b' }] };
  validateSemanticProgram(program);
  const kir = semanticProgramToKir(program, { id: 'compiled_refund', name: 'refund', description: 'refund workflow' });
  assert.equal(kir.irVersion, 2);
  assert.equal(kir.policies.failClosed, true);
});

test('divergent step 8 becomes NEEDS_LABEL rather than an invented branch', () => {
  const request = ambiguityForDivergentStep({ position: 8, variants: ['a', 'b', 'c'] });
  assert.equal(request.status, 'NEEDS_LABEL');
  assert.equal(request.hypotheses.length, 3);
  const labeled = resolveNeedsLabel(request, { hypothesisId: 'conditional-branch' });
  assert.equal(labeled.status, 'LABELED');
  assert.throws(() => assertNoUnlabeledBranches([request]), /UNLABELED_AMBIGUOUS_BRANCH/);
  assert.equal(assertNoUnlabeledBranches([labeled]), true);
});

test('API-first prefers authorized stable APIs and keeps browser path otherwise', () => {
  const nodes = [node({ id: 'search' }), node({ id: 'approve' })];
  const plan = planExecution(nodes, {
    discoveredApis: [{ operationId: 'updateCustomer', method: 'PATCH', path: '/customers/{id}' }],
    authorization: { scopes: [] }
  });
  assert.equal(plan[0].strategy, 'browser-path');
  const direct = planExecution([{ ...nodes[0], provenance: { apiOperationId: 'updateCustomer' } }], {
    discoveredApis: [{ operationId: 'updateCustomer', method: 'PATCH', path: '/customers/{id}' }],
    authorization: { scopes: [] }
  });
  assert.equal(direct[0].strategy, 'api-first');
});

test('qualification requires sandbox replay and blocks unlabeled production', () => {
  const program = { name: 'refund', nodes: [node({ id: 'a' })] };
  const blocked = qualifyWorkflow({ workflowId: 'refund', semanticProgram: program, sandboxReplay: { success: false } });
  assert.equal(blocked.state, 'BLOCKED');
  const qualified = qualifyWorkflow({ workflowId: 'refund', semanticProgram: program, sandboxReplay: { success: true, name: 'sandbox' } });
  assert.equal(qualified.state, 'QUALIFIED');
  let record = createQualification({ workflowId: 'refund' });
  record = transitionQualification(record, 'INFERRED', {});
  assert.throws(() => transitionQualification(record, 'PRODUCTION', {}), /QUALIFICATION_TRANSITION_INVALID/);
});

test('semantic drift blocks while non-semantic drift repairs and requalifies', () => {
  const semantic = detectDrift({ baseline: { 'api-permission-changed': 'read' }, observed: { 'api-permission-changed': 'denied' } });
  assert.equal(dispositionForDrift(semantic).action, 'block');
  const cosmetic = detectDrift({ baseline: { 'browser-locator-missing': 'a' }, observed: { 'browser-locator-missing': 'b' } });
  assert.equal(dispositionForDrift(cosmetic).action, 'repair-and-requalify');
});

test('PACT boundary splits consequential work and builds scoped requests', () => {
  const direct = node({ id: 'read-1', kind: 'ReadResource' });
  const consequential = node({ id: 'pay-1', kind: 'ConsequentialAction', sideEffectClass: 'non-idempotent-write' });
  const split = splitConsequential([direct, consequential]);
  assert.deepEqual(split.direct.map((entry) => entry.id), ['read-1']);
  assert.deepEqual(split.consequential.map((entry) => entry.id), ['pay-1']);
  const request = buildPactRequest(consequential, { workflowId: 'refund', runId: 'run-1' });
  assert.equal(request.workflowId, 'refund');
  assert.equal(request.nodeId, 'pay-1');
});

test('compiler emits all five runtime targets', () => {
  const program = { name: 'refund-flow', description: 'refund', nodes: [node({ id: 'a' })] };
  const all = compileAllTargets(program);
  assert.deepEqual(Object.keys(all).sort(), ['agent-skill', 'kata-runtime', 'mcp-tool', 'openapi-workflow', 'scheduled-worker']);
  assert.equal(compileToTarget(program, 'mcp-tool').transport, 'streamable-http');
});

test('release targets fail closed instead of lowering the bar', () => {
  const result = checkReleaseTargets({
    stableApiReplaySuccess: 0.91,
    browserApiQualificationSuccess: 0.9,
    humanCorrectionHours: 5,
    authoringLaborReduction: 0.2,
    apiOverheadRatio: 0.5,
    driftAutoRecovery: 0.1,
    embeddedCredentials: 0,
    unlabeledBranches: 0
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.includes('91') || failure.includes('0.91')));
  const passing = checkReleaseTargets({
    stableApiReplaySuccess: 0.995,
    browserApiQualificationSuccess: 0.97,
    humanCorrectionHours: 1,
    authoringLaborReduction: 0.8,
    apiOverheadRatio: 0.1,
    driftAutoRecovery: 0.95,
    embeddedCredentials: 0,
    unlabeledBranches: 0
  });
  assert.equal(passing.ok, true);
});

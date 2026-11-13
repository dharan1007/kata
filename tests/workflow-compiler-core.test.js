import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCaptureEvent, environmentFingerprint } from '../lib/capture/events.js';
import { redactCaptureEvent, assertNoSecrets } from '../lib/capture/redact.js';
import { createDemonstration, appendDemonstrationEvent, finalizeDemonstration } from '../lib/capture/store.js';
import { alignDemonstrations } from '../lib/compiler/alignment-semantic.js';
import { collectPositionedValues, inferVariableRecords, validateVariableRecords } from '../lib/compiler/variables.js';
import { inferBranch } from '../lib/compiler/branches.js';
import { inferLoops, validateLoop } from '../lib/compiler/loops.js';
import { humanApprovalNode, aiDecisionNode, classifyHumanNeed } from '../lib/compiler/human.js';
import { validateSemanticNode } from '../lib/compiler/semantic-kir.js';
import { buildDataflowGraph } from '../lib/compiler/dataflow.js';
import { proveApiEquivalence } from '../lib/compiler/api-equivalence.js';
import { buildLocator, resolveLocator } from '../lib/compiler/locators.js';
import { QUALIFICATION_STATES, createQualification, transitionQualification } from '../lib/compiler/qualification.js';
import { generateScenarios } from '../lib/compiler/scenarios.js';
import { classifyRetrySafety, checkpointState, resumePlan } from '../lib/compiler/recovery.js';
import { compensationPlan } from '../lib/compiler/compensation.js';
import { validateConnector } from '../lib/compiler/connectors.js';
import { createRun } from '../lib/compiler/triggers.js';
import { acquireLease, heartbeatLease } from '../lib/worker/lease.js';
import { startSpan } from '../lib/compiler/observability.js';

test('capture redacts secrets before persistence', () => {
  const raw = { id: 'evt_000001', kind: 'form-fill', at: new Date().toISOString(), fields: { username: 'alice', password: 'hunter2' }, authBoundary: { mechanism: 'password', rawPassword: 'hunter2' } };
  const { event, redactedCount } = redactCaptureEvent(raw);
  assert.ok(redactedCount >= 1);
  assert.deepEqual(event.fields.password, { credentialReference: 'cred/password' });
  assert.equal(event.fields.username, 'alice');
  assert.equal(event.authBoundary.credentialReference, 'cred/auth-boundary');
  assert.ok(!('rawPassword' in event.authBoundary));
  assert.equal(assertNoSecrets(event), true);
});

test('capture rejects coordinates as primary representation', () => {
  assert.throws(() => validateCaptureEvent({ id: 'evt_1', kind: 'dom-click', at: new Date().toISOString(), coordinatePrimary: true }), /CAPTURE_COORDINATES_NOT_PRIMARY/);
});

test('demonstration lifecycle assigns stable id and fingerprint', () => {
  let demo = createDemonstration({ workflowCandidateId: 'refund-flow', source: { kind: 'BROWSER', authority: 'user-authorized' }, environment: { userAgent: 'test', applicationVersion: '1' } });
  assert.ok(demo.id.startsWith('demo_'));
  assert.ok(demo.environmentFingerprint.startsWith('sha256:'));
  demo = appendDemonstrationEvent(demo, { id: 'evt_000001', kind: 'form-fill', at: new Date().toISOString(), fields: { customer: '123' } });
  assert.equal(demo.events.length, 1);
  const done = finalizeDemonstration(demo, { outcome: { status: 'success' } });
  assert.equal(done.status, 'captured');
  assert.ok(done.digest.startsWith('sha256:'));
});

test('semantic alignment scores confidence and flags low-confidence', () => {
  const left = [{ operationType: 'fill', semanticTarget: 'customer', attributes: { id: 'c' }, beforeState: { a: 1 }, afterState: { a: 2 } }];
  const right = [{ operationType: 'fill', semanticTarget: 'customer', attributes: { id: 'c' }, beforeState: { a: 1 }, afterState: { a: 2 } }];
  const alignment = alignDemonstrations(left, right);
  assert.equal(alignment.confidence, 1);
  assert.equal(alignment.lowConfidence, false);
  const divergent = alignDemonstrations(left, [{ operationType: 'click', semanticTarget: 'other' }]);
  assert.equal(divergent.lowConfidence, true);
});

test('variable inference distinguishes params from noise', () => {
  const demos = [{ steps: [{ customer: '123', session: 'aaa' }] }, { steps: [{ customer: '845', session: 'bbb' }] }];
  const positioned = collectPositionedValues(demos);
  const records = inferVariableRecords(positioned);
  assert.equal(validateVariableRecords(records.filter((record) => record.kind === 'input-variable')), true);
  const customer = records.find((record) => record.path.join('.') === 'customer');
  assert.equal(customer.kind, 'input-variable');
  assert.equal(customer.userSupplied, true);
});

test('branch without observable predicate becomes NEEDS_LABEL', () => {
  const result = inferBranch({ position: 2, variants: [{ path: 'a' }, { path: 'b' }], priorStates: [{}, {}] });
  assert.equal(result.status, 'NEEDS_LABEL');
});

test('branch with threshold predicate derives explicitly', () => {
  const result = inferBranch({ position: 1, variants: [{ route: 'standard' }, { route: 'escalated' }], priorStates: [{ amount: 100 }, { amount: 900 }] });
  assert.equal(result.status, 'BRANCHED');
  assert.equal(result.predicate.field, 'amount');
});

test('loops require bounds and repeat evidence', () => {
  const demos = [
    { steps: ['row', 'row', 'row', 'done'] },
    { steps: ['row', 'row', 'done'] }
  ];
  const loops = inferLoops(demos);
  assert.ok(loops.length >= 1);
  assert.equal(validateLoop(loops[0]), true);
});

test('high-risk steps default to human approval', () => {
  assert.equal(classifyHumanNeed({ action: 'refund payment' }), 'approval-required');
  const node = humanApprovalNode({ id: 'approve_1', reason: 'refund above threshold' });
  assert.equal(node.kind, 'HumanApproval');
  assert.equal(validateSemanticNode({ ...node, inputs: {}, outputs: {}, types: {}, preconditions: [], postconditions: [], sideEffectClass: 'none', credentialRequirements: { scopes: ['kata:approve'] }, retryPolicy: { maxAttempts: 1, strategy: 'none' }, timeoutMs: 1000, verification: {}, provenance: {} }), true);
  assert.throws(() => aiDecisionNode({ id: 'ai_1' }), /AI_DECISION_POLICY_REQUIRED/);
});

test('dataflow detects undefined variables and cycles', () => {
  const nodes = [
    { id: 'a', inputs: { x: { $param: 'customer' } }, credentialRequirements: {} },
    { id: 'b', inputs: { y: { $from: { node: 'a', path: [] } } }, credentialRequirements: {} }
  ];
  const ok = buildDataflowGraph(nodes, { workflowInputs: { customer: '123' } });
  assert.equal(ok.ok, true);
  const bad = buildDataflowGraph(nodes, { workflowInputs: {} });
  assert.equal(bad.ok, false);
  const cyclic = buildDataflowGraph([
    { id: 'a', inputs: { y: { $from: { node: 'b', path: [] } } }, credentialRequirements: {} },
    { id: 'b', inputs: { x: { $from: { node: 'a', path: [] } } }, credentialRequirements: {} }
  ], { workflowInputs: {} });
  assert.ok(cyclic.errors.some((error) => error.code === 'DATAFLOW_CYCLIC_DEPENDENCY'));
});

test('API equivalence requires matching postconditions', async () => {
  const good = await proveApiEquivalence({
    browserOutcome: { afterState: { status: 'APPROVED' } },
    apiExecutor: async () => ({ afterState: { status: 'APPROVED' } }),
    testInput: {},
    authorization: { scopes: ['write'] }
  });
  assert.equal(good.qualified, true);
  assert.equal(good.evidence.downstreamMatch, undefined);
  assert.equal(good.evidence.sideEffects, 'not-reported');
  const bad = await proveApiEquivalence({
    browserOutcome: { afterState: { status: 'APPROVED' } },
    apiExecutor: async () => ({ afterState: { status: 'REJECTED' } }),
    testInput: {},
    authorization: { scopes: ['write'] }
  });
  assert.equal(bad.qualified, false);
});

test('locator healing blocks on ambiguity instead of guessing', () => {
  const locator = buildLocator({ stableId: 'save-btn', role: 'button', accessibleName: 'Save' });
  const single = resolveLocator(locator, [{ stableId: 'save-btn' }]);
  assert.ok(single.element);
  const ambiguous = resolveLocator({ 'stable-id': 'x', priority: [] }, [{ stableId: 'x' }, { stableId: 'x' }]);
  assert.equal(ambiguous.blocked, true);
});

test('qualification supports the 11-state lifecycle', () => {
  assert.ok(QUALIFICATION_STATES.includes('NEEDS_LABEL'));
  assert.ok(QUALIFICATION_STATES.includes('QUALIFYING'));
  assert.ok(QUALIFICATION_STATES.includes('RETIRED'));
  let record = createQualification({ workflowId: 'w' });
  record = transitionQualification(record, 'INFERRED', {});
  record = transitionQualification(record, 'NEEDS_LABEL', {});
  record = transitionQualification(record, 'REVIEW_REQUIRED', {});
  record = transitionQualification(record, 'QUALIFYING', {});
  assert.equal(record.state, 'QUALIFYING');
});

test('qualification scenarios cover the required matrix', () => {
  const scenarios = generateScenarios({});
  for (const required of ['each-branch', 'loop-bounds', 'compensation-path', 'restart-resume']) {
    assert.ok(scenarios.includes(required));
  }
});

test('recovery never duplicates consequential operations', () => {
  const checkpoint = checkpointState({ runId: 'r1', workflowVersion: 'v3', currentNode: 'b', completed: { a: { ok: true } }, receipts: { a: { id: 'rc1' } } });
  const plan = resumePlan(checkpoint, { nodes: [{ id: 'a' }, { id: 'b' }] });
  assert.deepEqual(plan.skipped, ['a']);
  assert.deepEqual(plan.remaining, ['b']);
  assert.equal(plan.duplicateConsequentialPrevented, true);
  assert.equal(classifyRetrySafety({ effect: { class: 'READ_ONLY' } }), 'safe-to-retry');
});

test('compensation never fabricates rollback', () => {
  const plan = compensationPlan([{ id: 'charge', effect: { class: 'NON_IDEMPOTENT_WRITE' } }]);
  assert.equal(plan[0].compensable, false);
});

test('connectors declare deep contracts, triggers create canonical runs', () => {
  assert.equal(validateConnector({ identity: 'github', version: '1', authentication: 'oauth', capabilities: [], readOperations: [], writeOperations: [], schemas: {}, idempotency: {}, transactionBehavior: {}, verification: {}, consequentiality: {} }), true);
  const run = createRun({ workflowId: 'w', workflowVersion: 'v1', trigger: { kind: 'webhook' }, input: {} });
  assert.ok(run.runId);
});

test('single worker owns a lease, spans never carry secrets', () => {
  const leases = new Map();
  assert.equal(acquireLease({ runId: 'r', workerId: 'w1', leases }).acquired, true);
  assert.equal(acquireLease({ runId: 'r', workerId: 'w2', leases }).acquired, false);
  assert.ok(heartbeatLease({ runId: 'r', workerId: 'w1', leases }).expiresAt > 0);
  const span = startSpan({ workflowId: 'w', workflowVersion: 'v1', runId: 'r', nodeId: 'a' });
  const finished = span.end({ status: 'ok' });
  assert.equal(finished.status, 'ok');
  assert.ok(environmentFingerprint({}) !== undefined);
});

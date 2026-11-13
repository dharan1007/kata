import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTraces, compileTracesWithLabels } from '../lib/compiler/index.js';
import { compilePipeline } from '../lib/compiler/pipeline.js';
import { createDemonstration, appendDemonstrationEvent, finalizeDemonstration } from '../lib/capture/store.js';
import { createTrace, appendTraceEvent } from '../lib/trace/model.js';
import { executeDeterministicNode, executeDeterministicGraph } from '../lib/runtime/deterministic.js';
import { isConsequentialKirNode, buildKirPactRequest, localAuthorizationPolicy } from '../lib/compiler/pact-kir.js';
import { authoringComparison, perfComparison } from '../lib/benchmarks/authoring.js';

function traceWithActions(id, semanticIds, inputPrefix = 'val') {
  let trace = createTrace({ id, source: { kind: 'BROWSER', authority: 'user-authorized' }, startedAt: new Date().toISOString() });
  trace = appendTraceEvent(trace, { id: `${id}-start`, kind: 'TRACE_STARTED', at: new Date().toISOString(), parents: [], payload: {} });
  for (let index = 0; index < semanticIds.length; index++) {
    trace = appendTraceEvent(trace, {
      id: `${id}-a${index}`,
      kind: 'ACTION_COMPLETED',
      at: new Date().toISOString(),
      parents: [index === 0 ? `${id}-start` : `${id}-a${index - 1}`],
      payload: {
        operation: {
          semanticId: semanticIds[index],
          input: { field: `${inputPrefix}-${index}` },
          effect: { class: 'PURE', idempotency: 'none' },
          capabilities: ['kata:execute'],
          authorizationScopes: ['kata:execute']
        }
      }
    });
  }
  trace = appendTraceEvent(trace, { id: `${id}-end`, kind: 'TRACE_COMPLETED', at: new Date().toISOString(), parents: [`${id}-a${semanticIds.length - 1}`], payload: { status: 'success' } });
  return trace;
}

test('labeled compiler keeps consensus but labels single-step variation', () => {
  const base = ['open', 'check', 'send'];
  const traces = [traceWithActions('traceA', base, 'A'), traceWithActions('traceB', base, 'B')];
  const compiled = compileTraces('refund', traces);
  assert.equal(compiled.status, 'COMPILED');
  const varied = [traceWithActions('traceC', base, 'C'), traceWithActions('traceD', [...base, 'extra'], 'D')];
  const plain = compileTraces('refund', varied);
  assert.equal(plain.status, 'NEED_MORE_EVIDENCE');
  const labeled = compileTracesWithLabels('refund', varied);
  assert.equal(labeled.status, 'NEEDS_LABEL');
  assert.ok(labeled.hypotheses.length >= 3);
});

test('API-first compilation falls back without captured evidence and an executor', async () => {
  const step = { id: 'approve', provenance: { apiOperationId: 'updateCustomer' } };
  const result = await compilePipeline({
    demonstrations: [{ steps: [step] }, { steps: [step] }],
    discoveredApis: [{ operationId: 'updateCustomer', method: 'PATCH', path: '/customers/{id}' }]
  });
  assert.equal(result.plan[0].strategy, 'browser-path');
  assert.equal(result.plan[0].browserPathUsed, true);
  assert.equal(result.plan[0].api, undefined);
  assert.equal(result.equivalence.approve.qualified, false);
});

test('API equivalence executes the supplied API against captured postconditions', async () => {
  const at = '2026-11-13T00:00:00.000Z';
  let browserEvidence = createDemonstration({
    workflowCandidateId: 'customer-approval',
    source: { kind: 'BROWSER', authority: 'user-authorized' },
    startedAt: at
  });
  browserEvidence = appendDemonstrationEvent(browserEvidence, {
    id: 'page-state-1',
    kind: 'page-state',
    at,
    operationType: 'updateCustomer',
    afterState: { status: 'APPROVED' }
  });
  browserEvidence = finalizeDemonstration(browserEvidence, { outcome: { status: 'success' }, verifiedAt: at });
  const testInput = { customerId: '123' };
  const calls = [];
  const step = { id: 'approve', provenance: { apiOperationId: 'updateCustomer' } };
  const result = await compilePipeline({
    demonstrations: [{ steps: [step] }, { steps: [step] }],
    discoveredApis: [{
      operationId: 'updateCustomer',
      method: 'PATCH',
      path: '/customers/{id}',
      browserEvidence,
      testInput,
      executor: async (input) => {
        calls.push(input);
        return { afterState: { status: 'APPROVED' } };
      }
    }]
  });
  assert.deepEqual(calls, [testInput]);
  assert.equal(result.plan[0].strategy, 'api-first');
  assert.equal(result.equivalence.approve.proof.postconditionMatch, true);
});

test('deterministic executor runs pure nodes without LLM', () => {
  const nodes = [
    { id: 't1', kind: 'transform', spec: { transform: { steps: [{ op: 'constant', into: 'status', value: 'APPROVED' }] } } },
    { id: 'a1', kind: 'assert', spec: { condition: true } },
    { id: 'e1', kind: 'emit', spec: { arguments: { status: { $from: { node: 't1', path: ['status'] } } } } }
  ];
  const completed = executeDeterministicGraph(nodes, { input: {} });
  assert.equal(completed.t1.status, 'APPROVED');
  assert.equal(completed.a1.asserted, true);
  assert.equal(completed.e1.emitted.status, 'APPROVED');
  assert.throws(() => executeDeterministicNode({ id: 'x', kind: 'invoke', spec: {} }, {}), /DETERMINISTIC_KIND_UNSUPPORTED/);
  assert.throws(() => executeDeterministicNode({ id: 'w', kind: 'wait', spec: { waitMs: 5000 } }, { maxWaitMs: 100 }), /DETERMINISTIC_WAIT_BOUND_EXCEEDED/);
});

test('KIR PACT boundary works on effect classes', async () => {
  const consequential = { id: 'pay', effect: { class: 'NON_IDEMPOTENT_WRITE', idempotency: 'none' }, authorization: { scopes: ['pay:write'] } };
  const read = { id: 'get', effect: { class: 'READ_ONLY', idempotency: 'none' } };
  assert.equal(isConsequentialKirNode(consequential), true);
  assert.equal(isConsequentialKirNode(read), false);
  const request = buildKirPactRequest(consequential, { workflowId: 'w', runId: 'r' });
  assert.equal(request.nodeId, 'pay');
  assert.equal(localAuthorizationPolicy(consequential, { approvals: {} }).allowed, false);
  assert.equal(localAuthorizationPolicy(consequential, { approvals: { pay: true } }).allowed, true);
  const denied = { authorize: async () => ({ allowed: false, reason: 'policy' }), execute: async () => ({}) };
  const { executeKirWithPact } = await import('../lib/compiler/pact-kir.js');
  await assert.rejects(() => executeKirWithPact(consequential, { workflowId: 'w' }, denied), /PACT_DENIED/);
});

test('authoring and perf gates fail closed', () => {
  const good = authoringComparison({ manualHours: 30, kataDemonstrations: 3, kataCorrectionHours: 1, kataQualificationHours: 2, successRate: 0.97 });
  assert.equal(good.meetsTarget, true);
  const bad = authoringComparison({ manualHours: 30, kataDemonstrations: 3, kataCorrectionHours: 20, kataQualificationHours: 10, successRate: 0.9 });
  assert.equal(bad.meetsTarget, false);
  assert.equal(perfComparison({ handcraftedMs: 1000, kataMs: 1100, safetyKept: true }).ok, true);
  assert.equal(perfComparison({ handcraftedMs: 1000, kataMs: 1500, safetyKept: true }).ok, false);
  assert.equal(perfComparison({ handcraftedMs: 1000, kataMs: 1100, safetyKept: false }).ok, false);
});

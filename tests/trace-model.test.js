import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACE_VERSION,
  TRACE_EVENT_KINDS,
  TRACE_SOURCES,
  createTrace,
  appendTraceEvent,
  validateTrace,
  canonicalizeTrace,
  hashTrace,
  normalizeOperationEvent,
} from '../lib/trace/index.js';

const now='2026-09-13T07:45:00.000Z';

function baseTrace(){
  return createTrace({
    id:'trace_demo',
    source:{kind:'HTTP',authority:'user-authorized'},
    startedAt:now,
    metadata:{workflowHint:'research'},
  });
}

test('normalized trace declares source and event vocabulary',()=>{
  assert.equal(TRACE_VERSION,1);
  for(const source of ['BROWSER','HTTP','MCP','KATA_COMMAND','USER','SYSTEM'])assert.equal(TRACE_SOURCES.has(source),true,source);
  for(const kind of ['TRACE_STARTED','OBSERVATION','ACTION_REQUESTED','ACTION_STARTED','ACTION_COMPLETED','ACTION_FAILED','EFFECT_PREPARED','EFFECT_CONFIRMED','EFFECT_UNCERTAIN','CHECKPOINT','TRACE_COMPLETED'])assert.equal(TRACE_EVENT_KINDS.has(kind),true,kind);
});

test('append-only traces enforce sequence, causal parents and terminal state',()=>{
  let trace=baseTrace();
  trace=appendTraceEvent(trace,{id:'e1',kind:'OBSERVATION',at:now,parents:[],payload:{state:{page:'results'}}});
  trace=appendTraceEvent(trace,{id:'e2',kind:'ACTION_REQUESTED',at:now,parents:['e1'],payload:{operation:{semanticId:'search.open',transport:'browser',target:'result-card',input:{index:0}}}});
  trace=appendTraceEvent(trace,{id:'e3',kind:'ACTION_COMPLETED',at:now,parents:['e2'],payload:{operation:{semanticId:'search.open',transport:'browser',target:'result-card'},output:{url:'https://example.test/paper'}}});
  assert.deepEqual(trace.events.map(event=>event.seq),[1,2,3]);
  assert.doesNotThrow(()=>validateTrace(trace));

  assert.throws(()=>appendTraceEvent(trace,{id:'e4',kind:'ACTION_STARTED',at:now,parents:['missing'],payload:{}}),/TRACE_UNKNOWN_PARENT/);

  trace=appendTraceEvent(trace,{id:'e4',kind:'TRACE_COMPLETED',at:now,parents:['e3'],payload:{status:'success'}});
  assert.throws(()=>appendTraceEvent(trace,{id:'e5',kind:'OBSERVATION',at:now,parents:['e4'],payload:{}}),/TRACE_TERMINAL/);
});

test('trace validation rejects causal cycles, duplicate ids and non-monotonic sequence numbers',()=>{
  const trace=baseTrace();
  trace.events=[
    {id:'a',seq:1,kind:'OBSERVATION',at:now,parents:['b'],payload:{}},
    {id:'b',seq:2,kind:'OBSERVATION',at:now,parents:['a'],payload:{}},
  ];
  assert.throws(()=>validateTrace(trace),/TRACE_CAUSAL_CYCLE/);

  trace.events=[
    {id:'a',seq:1,kind:'OBSERVATION',at:now,parents:[],payload:{}},
    {id:'a',seq:2,kind:'OBSERVATION',at:now,parents:['a'],payload:{}},
  ];
  assert.throws(()=>validateTrace(trace),/TRACE_DUPLICATE_EVENT_ID/);

  trace.events=[
    {id:'a',seq:2,kind:'OBSERVATION',at:now,parents:[],payload:{}},
  ];
  assert.throws(()=>validateTrace(trace),/TRACE_SEQUENCE_INVALID/);
});

test('effect events require explicit outcome semantics and never collapse uncertainty into success',()=>{
  let trace=baseTrace();
  trace=appendTraceEvent(trace,{id:'e1',kind:'EFFECT_PREPARED',at:now,parents:[],payload:{effect:{class:'NON_IDEMPOTENT_WRITE',operationId:'op-1',targetIdentity:'payments/customer-7',inputDigest:'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}}});
  trace=appendTraceEvent(trace,{id:'e2',kind:'EFFECT_UNCERTAIN',at:now,parents:['e1'],payload:{effect:{class:'NON_IDEMPOTENT_WRITE',operationId:'op-1',targetIdentity:'payments/customer-7',reason:'transport-lost-after-dispatch'}}});
  assert.doesNotThrow(()=>validateTrace(trace));

  const invalid=baseTrace();
  invalid.events=[{id:'e1',seq:1,kind:'EFFECT_CONFIRMED',at:now,parents:[],payload:{effect:{class:'NON_IDEMPOTENT_WRITE'}}}];
  assert.throws(()=>validateTrace(invalid),/TRACE_EFFECT_IDENTITY_REQUIRED/);
});

test('operation normalization produces the same semantic shape across browser, HTTP and MCP transports',()=>{
  const browser=normalizeOperationEvent({source:'BROWSER',semanticId:'crm.contact.create',target:'crm',input:{name:'Ada'},evidence:{role:'button'}});
  const http=normalizeOperationEvent({source:'HTTP',semanticId:'crm.contact.create',target:'crm',input:{name:'Ada'},evidence:{method:'POST'}});
  const mcp=normalizeOperationEvent({source:'MCP',semanticId:'crm.contact.create',target:'crm',input:{name:'Ada'},evidence:{tool:'create_contact'}});
  assert.deepEqual(browser.operation,http.operation);
  assert.deepEqual(http.operation,mcp.operation);
  assert.equal(browser.source.kind,'BROWSER');
  assert.equal(http.source.kind,'HTTP');
  assert.equal(mcp.source.kind,'MCP');
});

test('trace canonicalization is stable for metadata key order but preserves event order as semantics',()=>{
  let a=baseTrace();
  a=appendTraceEvent(a,{id:'e1',kind:'OBSERVATION',at:now,parents:[],payload:{state:{b:2,a:1}}});
  const b={metadata:{workflowHint:'research'},startedAt:now,source:{authority:'user-authorized',kind:'HTTP'},id:'trace_demo',traceVersion:1,events:structuredClone(a.events)};
  assert.deepEqual(canonicalizeTrace(a),canonicalizeTrace(b));
  assert.equal(hashTrace(a),hashTrace(b));
  b.events[0].payload.state.a=9;
  assert.notEqual(hashTrace(a),hashTrace(b));
});

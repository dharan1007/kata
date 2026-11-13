import test from 'node:test';
import assert from 'node:assert/strict';
import {compileTraces} from '../lib/compiler/index.js';
import {createTrace,appendTraceEvent} from '../lib/trace/index.js';

const at='2026-09-13T09:00:00.000Z';

function op(semanticId,input,{effect='READ_ONLY',idempotency='intrinsic',capabilities=['research:read'],scopes=['research:read']}={}){
  return {semanticId,target:semanticId,input,effect:{class:effect,idempotency},capabilities,authorizationScopes:scopes,outputSchema:true};
}

function demo(id,steps){
  let trace=createTrace({id,source:{kind:'HTTP',authority:'user-authorized'},startedAt:at,metadata:{}});
  let parents=[];
  for(let i=0;i<steps.length;i++){
    const eventId=`${id}_e${i+1}`;
    trace=appendTraceEvent(trace,{id:eventId,kind:'ACTION_COMPLETED',at,parents,payload:{operation:steps[i].operation,output:steps[i].output}});
    parents=[eventId];
  }
  trace=appendTraceEvent(trace,{id:`${id}_done`,kind:'TRACE_COMPLETED',at,parents,payload:{status:'success'}});
  return trace;
}

test('compiler infers prior-step output lineage instead of exposing generated values as workflow inputs',()=>{
  const traces=[
    demo('d1',[
      {operation:op('research.create',{query:'agents'}),output:{record:{id:'W1',title:'Agents'}}},
      {operation:op('research.save',{workId:'W1',tag:'core'},{effect:'REVERSIBLE_WRITE',capabilities:['workspace:write'],scopes:['workspace:write']}),output:{saved:true}},
    ]),
    demo('d2',[
      {operation:op('research.create',{query:'mcp'}),output:{record:{id:'W2',title:'MCP'}}},
      {operation:op('research.save',{workId:'W2',tag:'core'},{effect:'REVERSIBLE_WRITE',capabilities:['workspace:write'],scopes:['workspace:write']}),output:{saved:true}},
    ]),
    demo('d3',[
      {operation:op('research.create',{query:'webmcp'}),output:{record:{id:'W3',title:'WebMCP'}}},
      {operation:op('research.save',{workId:'W3',tag:'core'},{effect:'REVERSIBLE_WRITE',capabilities:['workspace:write'],scopes:['workspace:write']}),output:{saved:true}},
    ]),
  ];
  const result=compileTraces('Create and save',traces);
  assert.equal(result.status,'COMPILED');
  const save=result.program.graph.nodes[1];
  assert.deepEqual(save.spec.arguments.workId,{$from:{node:'step_0001',path:['record','id']}});
  assert.equal(save.spec.arguments.tag,'core');
  assert.deepEqual(Object.keys(result.program.inputSchema.properties),['step_0001__query']);
  assert.equal(result.evidence.dataflowBindingCount,1);
  assert.deepEqual(result.evidence.dataflowBindings,[{consumerNode:'step_0002',consumerPath:['workId'],producerNode:'step_0001',producerPath:['record','id']}]);
});

test('compiler can infer an entire structured value from a prior output',()=>{
  const traces=[
    demo('a',[
      {operation:op('records.fetch',{id:'1'}),output:{record:{id:'1',score:10}}},
      {operation:op('records.index',{record:{id:'1',score:10}},{effect:'IDEMPOTENT_WRITE',idempotency:'keyed',capabilities:['index:write'],scopes:['index:write']}),output:{ok:true}},
    ]),
    demo('b',[
      {operation:op('records.fetch',{id:'2'}),output:{record:{id:'2',score:20}}},
      {operation:op('records.index',{record:{id:'2',score:20}},{effect:'IDEMPOTENT_WRITE',idempotency:'keyed',capabilities:['index:write'],scopes:['index:write']}),output:{ok:true}},
    ]),
  ];
  const result=compileTraces('Fetch then index',traces);
  assert.equal(result.status,'COMPILED');
  assert.deepEqual(result.program.graph.nodes[1].spec.arguments.record,{$from:{node:'step_0001',path:['record']}});
  assert.deepEqual(Object.keys(result.program.inputSchema.properties),['step_0001__id']);
});

test('compiler abstains when the same downstream value has multiple equally valid producer paths',()=>{
  const traces=[
    demo('a',[
      {operation:op('source.read',{id:'1'}),output:{primary:{id:'R1'},duplicate:{id:'R1'}}},
      {operation:op('target.write',{id:'R1'},{effect:'IDEMPOTENT_WRITE',idempotency:'keyed',capabilities:['target:write'],scopes:['target:write']}),output:{ok:true}},
    ]),
    demo('b',[
      {operation:op('source.read',{id:'2'}),output:{primary:{id:'R2'},duplicate:{id:'R2'}}},
      {operation:op('target.write',{id:'R2'},{effect:'IDEMPOTENT_WRITE',idempotency:'keyed',capabilities:['target:write'],scopes:['target:write']}),output:{ok:true}},
    ]),
  ];
  const result=compileTraces('Ambiguous lineage',traces);
  assert.equal(result.status,'NEED_MORE_EVIDENCE');
  assert.equal(result.reason,'DATAFLOW_AMBIGUOUS');
  assert.equal(result.program,undefined);
  assert.equal(result.candidates.length,2);
});

test('constant downstream values remain constants even when a prior output happens to contain the same value',()=>{
  const traces=[
    demo('a',[
      {operation:op('source.read',{id:'1'}),output:{category:'core'}},
      {operation:op('target.write',{tag:'core',id:'A'},{effect:'IDEMPOTENT_WRITE',idempotency:'keyed',capabilities:['target:write'],scopes:['target:write']}),output:{ok:true}},
    ]),
    demo('b',[
      {operation:op('source.read',{id:'2'}),output:{category:'core'}},
      {operation:op('target.write',{tag:'core',id:'B'},{effect:'IDEMPOTENT_WRITE',idempotency:'keyed',capabilities:['target:write'],scopes:['target:write']}),output:{ok:true}},
    ]),
  ];
  const result=compileTraces('Keep constants',traces);
  assert.equal(result.status,'COMPILED');
  assert.equal(result.program.graph.nodes[1].spec.arguments.tag,'core');
  assert.deepEqual(result.program.graph.nodes[1].spec.arguments.id,{$param:'step_0002__id'});
});

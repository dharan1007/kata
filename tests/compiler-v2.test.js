import test from 'node:test';
import assert from 'node:assert/strict';
import {compileTraces} from '../lib/compiler/index.js';
import {createTrace,appendTraceEvent} from '../lib/trace/index.js';
import {hashKirProgram,validateKirProgram} from '../lib/kir/index.js';

const at='2026-09-13T08:00:00.000Z';

function op(semanticId,input,{effect='READ_ONLY',idempotency='intrinsic',capabilities=['research:read'],scopes=['research:read']}={}){
  return {semanticId,target:semanticId,input,effect:{class:effect,idempotency},capabilities,authorization:{scopes},outputSchema:true};
}

function demo(id,source,operations){
  let trace=createTrace({id,source:{kind:source,authority:'user-authorized'},startedAt:at,metadata:{}});
  let parent=[];
  for(let i=0;i<operations.length;i++){
    const eventId=`${id}_e${i+1}`;
    trace=appendTraceEvent(trace,{id:eventId,kind:'ACTION_COMPLETED',at,parents:parent,payload:{operation:operations[i],output:{ok:true}}});
    parent=[eventId];
  }
  return trace;
}

test('compiler v2 generalizes N demonstrations with nested typed parameters into validated KIR',()=>{
  const traces=[
    demo('d1','HTTP',[op('research.search',{query:'agents',filters:{year:2024,openAccess:true}}),op('research.save',{workId:'W1',tag:'core'},{effect:'REVERSIBLE_WRITE',idempotency:'intrinsic',capabilities:['workspace:write'],scopes:['workspace:write']})]),
    demo('d2','MCP',[op('research.search',{query:'mcp',filters:{year:2025,openAccess:true}}),op('research.save',{workId:'W2',tag:'core'},{effect:'REVERSIBLE_WRITE',idempotency:'intrinsic',capabilities:['workspace:write'],scopes:['workspace:write']})]),
    demo('d3','BROWSER',[op('research.search',{query:'webmcp',filters:{year:2026,openAccess:true}}),op('research.save',{workId:'W3',tag:'core'},{effect:'REVERSIBLE_WRITE',idempotency:'intrinsic',capabilities:['workspace:write'],scopes:['workspace:write']})]),
  ];
  const result=compileTraces('Research workflow',traces);
  assert.equal(result.status,'COMPILED');
  assert.doesNotThrow(()=>validateKirProgram(result.program));
  assert.equal(result.program.graph.nodes.length,2);
  assert.deepEqual(result.program.graph.edges,[{from:'step_0001',to:'step_0002'}]);
  assert.deepEqual(result.program.graph.nodes[0].spec.target,{transport:'semantic',name:'research.search'});
  assert.equal(result.program.graph.nodes[0].spec.arguments.filters.openAccess,true);
  assert.deepEqual(result.program.graph.nodes[0].spec.arguments.query,{$param:'step_0001__query'});
  assert.deepEqual(result.program.graph.nodes[0].spec.arguments.filters.year,{$param:'step_0001__filters__year'});
  assert.deepEqual(result.program.graph.nodes[1].spec.arguments.tag,'core');
  assert.deepEqual(result.program.inputSchema.properties.step_0001__query,{type:'string'});
  assert.deepEqual(result.program.inputSchema.properties.step_0001__filters__year,{type:'integer'});
  assert.deepEqual(result.program.inputSchema.properties.step_0002__workId,{type:'string'});
  assert.deepEqual(result.program.inputSchema.required,['step_0001__filters__year','step_0001__query','step_0002__workId']);
  assert.equal(result.evidence.demonstrationCount,3);
});

test('compiler semantics are transport-independent and deterministic across demonstration order',()=>{
  const operationsA=[op('research.search',{query:'agents'}),op('research.save',{workId:'W1'},{effect:'REVERSIBLE_WRITE',capabilities:['workspace:write'],scopes:['workspace:write']})];
  const operationsB=[op('research.search',{query:'mcp'}),op('research.save',{workId:'W2'},{effect:'REVERSIBLE_WRITE',capabilities:['workspace:write'],scopes:['workspace:write']})];
  const a=demo('a','BROWSER',operationsA),b=demo('b','HTTP',operationsB),c=demo('c','MCP',[op('research.search',{query:'web'}),op('research.save',{workId:'W3'},{effect:'REVERSIBLE_WRITE',capabilities:['workspace:write'],scopes:['workspace:write']})]);
  const first=compileTraces('Portable workflow',[a,b,c]);
  const second=compileTraces('Portable workflow',[c,a,b]);
  assert.equal(first.status,'COMPILED');
  assert.equal(second.status,'COMPILED');
  assert.equal(hashKirProgram(first.program),hashKirProgram(second.program));
  assert.deepEqual(first.program.graph.nodes.map(node=>node.spec.target.transport),['semantic','semantic']);
});

test('compiler aligns structural differences but abstains instead of inventing an optional branch predicate',()=>{
  const a=demo('a','HTTP',[op('a.read',{}),op('b.enrich',{}),op('c.save',{}, {effect:'REVERSIBLE_WRITE',capabilities:['workspace:write'],scopes:['workspace:write']})]);
  const b=demo('b','HTTP',[op('a.read',{}),op('c.save',{}, {effect:'REVERSIBLE_WRITE',capabilities:['workspace:write'],scopes:['workspace:write']})]);
  const result=compileTraces('Optional evidence',[a,b]);
  assert.equal(result.status,'NEED_MORE_EVIDENCE');
  assert.equal(result.reason,'STRUCTURAL_VARIATION');
  assert.equal(result.variation.kind,'OPTIONAL_ACTION');
  assert.equal(result.variation.semanticId,'b.enrich');
  assert.equal(result.program,undefined);
});

test('compiler detects ambiguous optimal alignments and abstains',()=>{
  const a=demo('a','HTTP',[op('a.read',{}),op('a.read',{})]);
  const b=demo('b','HTTP',[op('a.read',{})]);
  const result=compileTraces('Ambiguous alignment',[a,b]);
  assert.equal(result.status,'NEED_MORE_EVIDENCE');
  assert.equal(result.reason,'ALIGNMENT_AMBIGUOUS');
  assert.equal(result.program,undefined);
});

test('compiler refuses to infer across incompatible value types or drifting operation authority',()=>{
  const typeA=demo('typeA','HTTP',[op('research.search',{query:'agents'})]);
  const typeB=demo('typeB','HTTP',[op('research.search',{query:7})]);
  const typeResult=compileTraces('Type conflict',[typeA,typeB]);
  assert.equal(typeResult.status,'NEED_MORE_EVIDENCE');
  assert.equal(typeResult.reason,'VALUE_TYPE_CONFLICT');

  const authA=demo('authA','HTTP',[op('research.search',{query:'a'},{capabilities:['research:read'],scopes:['research:read']})]);
  const authB=demo('authB','HTTP',[op('research.search',{query:'b'},{capabilities:['research:read','admin'],scopes:['research:read','admin']})]);
  const authResult=compileTraces('Authority conflict',[authA,authB]);
  assert.equal(authResult.status,'NEED_MORE_EVIDENCE');
  assert.equal(authResult.reason,'OPERATION_CONTRACT_VARIATION');
});

test('compiler requires explicit effect and authorization evidence and enforces bounded input',()=>{
  const missing=demo('missing','HTTP',[{semanticId:'unsafe.write',target:'unsafe.write',input:{x:1},outputSchema:true}]);
  const good=demo('good','HTTP',[op('unsafe.write',{x:2},{effect:'NON_IDEMPOTENT_WRITE',idempotency:'none',capabilities:['unsafe:write'],scopes:['unsafe:write']})]);
  const result=compileTraces('Unsafe unknown',[missing,good]);
  assert.equal(result.status,'NEED_MORE_EVIDENCE');
  assert.equal(result.reason,'OPERATION_CONTRACT_MISSING');

  assert.throws(()=>compileTraces('Too few',[good]),/COMPILER_DEMO_COUNT_INVALID/);
  assert.throws(()=>compileTraces('Too many',Array.from({length:65},(_,i)=>demo(`d${i}`,'HTTP',[op('x.read',{i})]))),/COMPILER_DEMO_COUNT_INVALID/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyKirProgram} from '../lib/verifier/index.js';

function node(id,{kind='invoke',effect='READ_ONLY',idempotency='intrinsic',capabilities=['records:read'],scopes=['records:read'],retry={maxAttempts:1,strategy:'none'},spec}={}){
  return {
    id,kind,inputSchema:true,outputSchema:true,
    effect:{class:effect,idempotency},capabilities,authorization:{scopes},timeoutMs:1000,retry,budget:{maxDurationMs:1000},
    spec:spec??(kind==='invoke'?{target:{transport:'semantic',name:`records.${id}`},arguments:{}}:{}),
  };
}
function program(nodes,edges=[],entry=['a']){
  return {irVersion:2,id:'verified_flow',name:'Verified flow',description:'',inputSchema:{type:'object',properties:{},required:[],additionalProperties:false},outputSchema:true,graph:{entry,nodes,edges},invariants:[],policies:{failClosed:true},metadata:{}};
}

test('verifier accepts a bounded read-only workflow and returns deterministic evidence',()=>{
  const result=verifyKirProgram(program([node('a'),node('b')],[{from:'a',to:'b'}]));
  assert.equal(result.ok,true);
  assert.deepEqual(result.errors,[]);
  assert.equal(result.summary.nodeCount,2);
  assert.match(result.evidenceHash,/^sha256:[a-f0-9]{64}$/);
});

test('non-idempotent external writes cannot be retried without reconciliation or compensation',()=>{
  const unsafe=node('a',{effect:'NON_IDEMPOTENT_WRITE',idempotency:'none',capabilities:['records:write'],scopes:['records:write'],retry:{maxAttempts:3,strategy:'exponential',baseDelayMs:10,maxDelayMs:100}});
  const result=verifyKirProgram(program([unsafe]));
  assert.equal(result.ok,false);
  assert.equal(result.errors.some(error=>error.code==='UNSAFE_RETRY_EFFECT'),true);
});

test('retry safety requires concrete keyed, reconciliation, or compensation evidence',()=>{
  const retry={maxAttempts:3,strategy:'exponential',baseDelayMs:10,maxDelayMs:100};
  const cases=[
    {idempotency:'keyed',effect:'IDEMPOTENT_WRITE',field:'keyBinding',value:{source:'request.id'}},
    {idempotency:'reconcile',effect:'NON_IDEMPOTENT_WRITE',field:'reconciliation',value:{strategy:'read-after-write'}},
    {idempotency:'compensated',effect:'REVERSIBLE_WRITE',field:'compensation',value:{operation:'records.undo'}},
  ];
  for(const item of cases){
    const candidate=node('a',{effect:item.effect,idempotency:item.idempotency,capabilities:['records:write'],scopes:['records:write'],retry});
    let result=verifyKirProgram(program([candidate]));
    assert.equal(result.errors.some(error=>error.code==='UNSAFE_RETRY_EFFECT'),true,`${item.idempotency} without evidence must fail closed`);
    candidate.effect[item.field]={};
    result=verifyKirProgram(program([candidate]));
    assert.equal(result.errors.some(error=>error.code==='UNSAFE_RETRY_EFFECT'),true,`${item.idempotency} with empty evidence must fail closed`);
    candidate.effect[item.field]=item.value;
    result=verifyKirProgram(program([candidate]));
    assert.equal(result.errors.some(error=>error.code==='UNSAFE_RETRY_EFFECT'),false,`${item.idempotency} with concrete evidence may retry`);
  }
});

test('destructive effects require an approval node on every path before mutation',()=>{
  const destructive=node('destroy',{effect:'DESTRUCTIVE_WRITE',idempotency:'keyed',capabilities:['records:delete'],scopes:['records:delete']});
  let result=verifyKirProgram(program([node('a'),destructive],[{from:'a',to:'destroy'}]));
  assert.equal(result.errors.some(error=>error.code==='DESTRUCTIVE_EFFECT_WITHOUT_APPROVAL'),true);

  const approval=node('approve',{kind:'approval',effect:'PURE',idempotency:'none',capabilities:[],scopes:[],spec:{approvalClass:'destructive',binding:{targetNode:'destroy'}}});
  result=verifyKirProgram(program([node('a'),approval,destructive],[{from:'a',to:'approve'},{from:'approve',to:'destroy'}]));
  assert.equal(result.ok,true);
});

test('capability authority cannot exceed declared authorization scopes',()=>{
  const elevated=node('a',{capabilities:['records:read','records:admin'],scopes:['records:read']});
  const result=verifyKirProgram(program([elevated]));
  assert.equal(result.errors.some(error=>error.code==='CAPABILITY_SCOPE_MISMATCH'),true);
});

test('dataflow references must point to an upstream node and cannot reference future output',()=>{
  const a=node('a',{spec:{target:{transport:'semantic',name:'records.a'},arguments:{id:{$from:{node:'b',path:['id']}}}}});
  const b=node('b');
  const result=verifyKirProgram(program([a,b],[{from:'a',to:'b'}]));
  assert.equal(result.errors.some(error=>error.code==='INVALID_DATAFLOW_DEPENDENCY'),true);
});

test('secret-tainted workflow inputs cannot flow into model-visible semantic arguments',()=>{
  const p=program([node('a',{spec:{target:{transport:'semantic',name:'records.a'},arguments:{token:{$param:'secretToken'}}}})]);
  p.inputSchema={type:'object',properties:{secretToken:{type:'string','x-kata-secret':true}},required:['secretToken'],additionalProperties:false};
  const result=verifyKirProgram(p);
  assert.equal(result.errors.some(error=>error.code==='SECRET_FLOW_TO_MODEL_ARGUMENT'),true);
});

test('parallel branches containing writes to the same resource require an explicit serialization policy',()=>{
  const writeA=node('writeA',{effect:'IDEMPOTENT_WRITE',idempotency:'keyed',capabilities:['records:write'],scopes:['records:write'],spec:{target:{transport:'semantic',name:'records.write'},arguments:{},resourceKey:'records'}});
  const writeB=node('writeB',{effect:'IDEMPOTENT_WRITE',idempotency:'keyed',capabilities:['records:write'],scopes:['records:write'],spec:{target:{transport:'semantic',name:'records.write'},arguments:{},resourceKey:'records'}});
  const branchA={entry:['writeA'],nodes:[writeA],edges:[]};
  const branchB={entry:['writeB'],nodes:[writeB],edges:[]};
  const parallel=node('a',{kind:'parallel',effect:'PURE',idempotency:'none',capabilities:[],scopes:[],spec:{branches:[branchA,branchB]}});
  const result=verifyKirProgram(program([parallel]));
  assert.equal(result.errors.some(error=>error.code==='PARALLEL_WRITE_CONFLICT'),true);
});

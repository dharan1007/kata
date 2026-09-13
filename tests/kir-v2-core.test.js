import test from 'node:test';
import assert from 'node:assert/strict';
import {KIR_VERSION,NODE_KINDS,EFFECT_CLASSES,validateKirProgram,serializeKirProgram,hashKirProgram,migrateLegacyProgram} from '../lib/kir/index.js';

const objectSchema=()=>({type:'object',properties:{},additionalProperties:false});
const node=(id,kind='emit')=>({id,kind,inputSchema:objectSchema(),outputSchema:objectSchema(),effect:{class:'PURE',idempotency:'intrinsic'},capabilities:[],authorization:{scopes:[]},timeoutMs:1000,retry:{maxAttempts:1,strategy:'none'},budget:{},spec:kind==='emit'?{value:null}:{}});
const program=()=>({irVersion:2,id:'wf_demo',name:'Demo',description:'fixture',inputSchema:objectSchema(),outputSchema:objectSchema(),graph:{entry:['a'],nodes:[node('a'),node('b')],edges:[{from:'a',to:'b'}]},invariants:[],policies:{failClosed:true},metadata:{createdAt:'2026-09-13T00:00:00.000Z'}});

test('KIR v2 declares workflow and effect vocabulary',()=>{
  assert.equal(KIR_VERSION,2);
  for(const kind of ['invoke','transform','assert','branch','switch','map','loop','parallel','join','wait','event','approval','checkpoint','subworkflow','compensate','emit','fail']) assert.equal(NODE_KINDS.has(kind),true,kind);
  for(const effect of ['PURE','READ_ONLY','IDEMPOTENT_WRITE','CONDITIONALLY_IDEMPOTENT_WRITE','REVERSIBLE_WRITE','NON_IDEMPOTENT_WRITE','DESTRUCTIVE_WRITE','IRREVERSIBLE_EXTERNAL_EFFECT']) assert.equal(EFFECT_CLASSES.has(effect),true,effect);
});

test('validates DAG structure and fails closed on malformed control flow',()=>{
  assert.doesNotThrow(()=>validateKirProgram(program()));
  const duplicate=program(); duplicate.graph.nodes.push(node('a')); assert.throws(()=>validateKirProgram(duplicate),/KIR_DUPLICATE_NODE_ID/);
  const dangling=program(); dangling.graph.edges.push({from:'b',to:'missing'}); assert.throws(()=>validateKirProgram(dangling),/KIR_DANGLING_EDGE/);
  const cycle=program(); cycle.graph.edges.push({from:'b',to:'a'}); assert.throws(()=>validateKirProgram(cycle),/KIR_IMPLICIT_CYCLE/);
  const unknown=program(); unknown.graph.nodes[0].kind='shell'; assert.throws(()=>validateKirProgram(unknown),/KIR_UNKNOWN_NODE_KIND/);
});

test('loops are explicit and bounded rather than implicit graph cycles',()=>{
  const p=program();
  const body={entry:['emit_item'],nodes:[node('emit_item')],edges:[]};
  p.graph={entry:['loop'],nodes:[{...node('loop','loop'),spec:{mode:'forEach',maxIterations:100,body}}],edges:[]};
  assert.doesNotThrow(()=>validateKirProgram(p));
  p.graph.nodes[0].spec.maxIterations=0;
  assert.throws(()=>validateKirProgram(p),/KIR_LOOP_BOUND_REQUIRED/);
});

test('canonical serialization ignores ordering of graph collections and descriptive metadata does not change semantic hash',()=>{
  const a=program();
  const b=structuredClone(a); b.graph.nodes.reverse(); b.graph.edges.reverse();
  assert.equal(serializeKirProgram(a),serializeKirProgram(b));
  b.id='wf_other'; b.name='Renamed'; b.description='different prose'; b.metadata={createdAt:'2099-01-01T00:00:00.000Z'};
  assert.equal(hashKirProgram(a),hashKirProgram(b));
  b.graph.nodes.find(n=>n.id==='a').timeoutMs=2000;
  assert.notEqual(hashKirProgram(a),hashKirProgram(b));
});

test('legacy step programs migrate deterministically to sequential KIR invoke nodes',()=>{
  const legacy={id:'legacy-1',name:'tag_research',description:'legacy',inputSchema:{type:'object',properties:{workId:{type:'string'},tag:{type:'string'}},required:['workId','tag'],additionalProperties:false},steps:[{kind:'SAVE_WORK',args:{workId:{$param:'workId'}}},{kind:'ADD_TAG',args:{workId:{$param:'workId'},tag:{$param:'tag'}}}],createdAt:'2026-09-13T00:00:00.000Z'};
  const a=migrateLegacyProgram(legacy),b=migrateLegacyProgram(structuredClone(legacy));
  validateKirProgram(a);
  assert.equal(a.irVersion,2);
  assert.deepEqual(a.graph.entry,['step_0001']);
  assert.deepEqual(a.graph.edges,[{from:'step_0001',to:'step_0002'}]);
  assert.equal(a.graph.nodes[0].kind,'invoke');
  assert.deepEqual(a.graph.nodes[0].spec.target,{transport:'kata-command',name:'SAVE_WORK'});
  assert.equal(a.graph.nodes[0].effect.class,'REVERSIBLE_WRITE');
  assert.deepEqual(a.graph.nodes[1].spec.arguments.tag,{$param:'tag'});
  assert.equal(hashKirProgram(a),hashKirProgram(b));
});

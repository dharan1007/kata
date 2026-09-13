import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteRunStore,createDurableRunner} from '../lib/runtime/index.js';

function node(id,args={}){
  return {id,kind:'invoke',inputSchema:true,outputSchema:true,effect:{class:'READ_ONLY',idempotency:'intrinsic'},capabilities:['records:read'],authorization:{scopes:['records:read']},timeoutMs:1000,retry:{maxAttempts:1,strategy:'none'},budget:{maxDurationMs:1000},spec:{target:{transport:'semantic',name:`records.${id}`},arguments:args}};
}
function program(){
  return {irVersion:2,id:'durable_flow',name:'Durable flow',description:'',inputSchema:{type:'object',properties:{recordId:{type:'string'}},required:['recordId'],additionalProperties:false},outputSchema:true,graph:{entry:['a'],nodes:[node('a',{id:{$param:'recordId'}}),node('b',{record:{$from:{node:'a',path:['record']}}})],edges:[{from:'a',to:'b'}]},invariants:[],policies:{failClosed:true},metadata:{}};
}
function tempFile(){const dir=mkdtempSync(join(tmpdir(),'kata-runtime-'));return {dir,file:join(dir,'runs.sqlite')}};

test('SQLite run store persists append-only history and enforces optimistic revisions across reopen',()=>{
  const {dir,file}=tempFile();
  try{
    let store=new SqliteRunStore({filename:file});
    const first=store.append('run_1',0,[{type:'WorkflowStarted',payload:{x:1},at:'2026-09-13T09:30:00.000Z'}]);
    assert.equal(first.revision,1);
    assert.throws(()=>store.append('run_1',0,[{type:'BadWriter',payload:{},at:'2026-09-13T09:30:01.000Z'}]),/RUN_REVISION_CONFLICT/);
    store.close();
    store=new SqliteRunStore({filename:file});
    const loaded=store.load('run_1');
    assert.equal(loaded.revision,1);
    assert.equal(loaded.events[0].type,'WorkflowStarted');
    assert.deepEqual(loaded.events[0].payload,{x:1});
    store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('durable runner resumes a bounded execution slice without re-invoking completed steps',async()=>{
  const {dir,file}=tempFile();
  try{
    const calls=[];
    let store=new SqliteRunStore({filename:file});
    let runner=createDurableRunner({store,invoke:async ({node,args})=>{calls.push(node.id);return node.id==='a'?{record:{id:args.id,name:'Ada'}}:{saved:args.record.id};}});
    const first=await runner.execute({runId:'run_resume',program:program(),input:{recordId:'R1'},stepLimit:1});
    assert.equal(first.status,'SUSPENDED');
    assert.deepEqual(calls,['a']);
    store.close();

    store=new SqliteRunStore({filename:file});
    runner=createDurableRunner({store,invoke:async ({node,args})=>{calls.push(node.id);return {saved:args.record.id};}});
    const second=await runner.execute({runId:'run_resume',program:program()});
    assert.equal(second.status,'COMPLETED');
    assert.deepEqual(calls,['a','b']);
    const history=store.load('run_resume').events;
    assert.equal(history.filter(event=>event.type==='StepCompleted'&&event.payload.nodeId==='a').length,1);
    assert.equal(history.filter(event=>event.type==='WorkflowCompleted').length,1);
    store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('runner checkpoints output state durably and resolves upstream dataflow after restart',async()=>{
  const {dir,file}=tempFile();
  try{
    const store=new SqliteRunStore({filename:file});
    const seen=[];
    const runner=createDurableRunner({store,invoke:async ({node,args})=>{seen.push({id:node.id,args});return node.id==='a'?{record:{id:args.id}}:{ok:true};}});
    await runner.execute({runId:'run_checkpoint',program:program(),input:{recordId:'X'},stepLimit:1});
    const snapshot=store.loadSnapshot('run_checkpoint');
    assert.equal(snapshot.state.completed.a.record.id,'X');
    await runner.execute({runId:'run_checkpoint',program:program()});
    assert.deepEqual(seen[1],{id:'b',args:{record:{id:'X'}}});
    store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('runtime refuses consequential writes before an effect engine is installed',async()=>{
  const {dir,file}=tempFile();
  try{
    const p=program();
    p.graph.nodes[0].effect={class:'NON_IDEMPOTENT_WRITE',idempotency:'none'};
    p.graph.nodes[0].capabilities=['records:write'];p.graph.nodes[0].authorization={scopes:['records:write']};
    let invoked=false;
    const store=new SqliteRunStore({filename:file});
    const runner=createDurableRunner({store,invoke:async ()=>{invoked=true;return {};}});
    const result=await runner.execute({runId:'run_write',program:p,input:{recordId:'R1'}});
    assert.equal(result.status,'BLOCKED');
    assert.equal(result.reason,'EFFECT_ENGINE_REQUIRED');
    assert.equal(invoked,false);
    store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

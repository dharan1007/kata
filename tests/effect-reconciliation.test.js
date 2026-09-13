import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteRunStore,createDurableRunner} from '../lib/runtime/index.js';
import {createEffectEngine,SqliteTransactionalEffectTarget} from '../lib/effects/index.js';

function tempFiles(){const dir=mkdtempSync(join(tmpdir(),'kata-effects-'));return {dir,runFile:join(dir,'runs.sqlite'),targetFile:join(dir,'target.sqlite')}};
function writeNode({id='write',effect='IDEMPOTENT_WRITE',idempotency='keyed'}={}){return {id,kind:'invoke',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false},outputSchema:true,effect:{class:effect,idempotency},capabilities:['records:write'],authorization:{scopes:['records:write']},timeoutMs:1000,retry:{maxAttempts:1,strategy:'none'},budget:{},spec:{target:{transport:'semantic',name:'records.write'},arguments:{id:{$param:'id'}},resourceKey:'records'}};}
function writeProgram(node=writeNode()){return {irVersion:2,id:'effect_flow',name:'Effect flow',description:'',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false},outputSchema:true,graph:{entry:[node.id],nodes:[node],edges:[]},invariants:[],policies:{failClosed:true},metadata:{}};}

test('SQLite effect target writes mutation and idempotency receipt in one transaction',()=>{
  const {dir,targetFile}=tempFiles();
  try{
    const target=new SqliteTransactionalEffectTarget({filename:targetFile});
    target.exec('CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;');
    const context={operationId:'eff_1',inputDigest:'sha256:'+'1'.repeat(64),targetIdentity:'records.write'};
    const first=target.commit({...context,apply:db=>{db.prepare('INSERT INTO records(id,value) VALUES(?,?)').run('R1','first');return {output:{id:'R1'},receipt:{row:'R1'}};}});
    const second=target.commit({...context,apply:()=>{throw new Error('must not execute twice');}});
    assert.equal(first.status,'COMMITTED');
    assert.equal(second.status,'COMMITTED');
    assert.equal(second.replayed,true);
    const db=new DatabaseSync(targetFile,{readOnly:true});
    assert.equal(db.prepare('SELECT count(*) AS n FROM records').get().n,1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM kata_effect_ledger').get().n,1);
    db.close();target.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('effect engine reconciles commit-before-checkpoint after restart without duplicating target mutation',async()=>{
  const {dir,runFile,targetFile}=tempFiles();
  try{
    const store=new SqliteRunStore({filename:runFile});
    store.append('run_reconcile',0,[{type:'WorkflowStarted',payload:{programHash:'sha256:'+'a'.repeat(64),input:{id:'R1'}},at:'2026-09-13T10:00:00.000Z'}]);
    const target=new SqliteTransactionalEffectTarget({filename:targetFile});
    target.exec('CREATE TABLE records(id TEXT PRIMARY KEY) STRICT;');
    let crash=true,mutations=0;
    const execute=async ctx=>{
      const result=target.commit({...ctx,apply:db=>{mutations++;db.prepare('INSERT INTO records(id) VALUES(?)').run('R1');return {output:{id:'R1'},receipt:{target:'records',id:'R1'}};}});
      if(crash){crash=false;const error=new Error('connection lost after commit');error.code='CONNECTION_LOST';throw error;}
      return result;
    };
    let engine=createEffectEngine({store,execute,reconcile:async ctx=>target.reconcile(ctx),clock:()=> '2026-09-13T10:00:01.000Z'});
    let revision=store.load('run_reconcile').revision;
    const first=await engine.perform({runId:'run_reconcile',revision,node:writeNode(),args:{id:'R1'},programHash:'sha256:'+'a'.repeat(64)});
    assert.equal(first.status,'BLOCKED');
    assert.equal(first.reason,'EFFECT_OUTCOME_UNCERTAIN');
    revision=store.load('run_reconcile').revision;
    engine=createEffectEngine({store,execute,reconcile:async ctx=>target.reconcile(ctx),clock:()=> '2026-09-13T10:00:02.000Z'});
    const second=await engine.perform({runId:'run_reconcile',revision,node:writeNode(),args:{id:'R1'},programHash:'sha256:'+'a'.repeat(64)});
    assert.equal(second.status,'COMPLETED');
    assert.deepEqual(second.output,{id:'R1'});
    assert.equal(mutations,1);
    const history=store.load('run_reconcile').events;
    assert.equal(history.filter(event=>event.type==='EffectPrepared').length,1);
    assert.equal(history.filter(event=>event.type==='EffectConfirmed').length,1);
    target.close();store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('non-idempotent unknown effect without reconciliation blocks forever instead of executing twice',async()=>{
  const {dir,runFile}=tempFiles();
  try{
    const store=new SqliteRunStore({filename:runFile});
    store.append('run_unknown',0,[{type:'WorkflowStarted',payload:{programHash:'sha256:'+'b'.repeat(64),input:{id:'R1'}},at:'2026-09-13T10:10:00.000Z'}]);
    let calls=0;
    const execute=async()=>{calls++;const error=new Error('unknown after dispatch');error.code='NETWORK_UNKNOWN';throw error;};
    const engine=createEffectEngine({store,execute,clock:()=> '2026-09-13T10:10:01.000Z'});
    const node=writeNode({effect:'NON_IDEMPOTENT_WRITE',idempotency:'none'});
    let result=await engine.perform({runId:'run_unknown',revision:1,node,args:{id:'R1'},programHash:'sha256:'+'b'.repeat(64)});
    assert.equal(result.status,'BLOCKED');
    result=await engine.perform({runId:'run_unknown',revision:store.load('run_unknown').revision,node,args:{id:'R1'},programHash:'sha256:'+'b'.repeat(64)});
    assert.equal(result.status,'BLOCKED');
    assert.equal(result.reason,'EFFECT_OUTCOME_UNKNOWN');
    assert.equal(calls,1);
    store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('durable runner completes a write through the effect engine and records one StepCompleted',async()=>{
  const {dir,runFile,targetFile}=tempFiles();
  try{
    const store=new SqliteRunStore({filename:runFile});
    const target=new SqliteTransactionalEffectTarget({filename:targetFile});
    target.exec('CREATE TABLE records(id TEXT PRIMARY KEY) STRICT;');
    const effectEngine=createEffectEngine({store,execute:async ctx=>target.commit({...ctx,apply:db=>{db.prepare('INSERT INTO records(id) VALUES(?)').run(ctx.args.id);return {output:{id:ctx.args.id},receipt:{id:ctx.args.id}};}}),reconcile:async ctx=>target.reconcile(ctx)});
    const runner=createDurableRunner({store,invoke:async()=>{throw new Error('write must use effect engine');},effectEngine});
    const result=await runner.execute({runId:'run_write_ok',program:writeProgram(),input:{id:'R9'}});
    assert.equal(result.status,'COMPLETED');
    const history=store.load('run_write_ok').events;
    assert.equal(history.filter(event=>event.type==='EffectConfirmed').length,1);
    assert.equal(history.filter(event=>event.type==='StepCompleted').length,1);
    const db=new DatabaseSync(targetFile,{readOnly:true});assert.equal(db.prepare('SELECT count(*) AS n FROM records').get().n,1);db.close();
    target.close();store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

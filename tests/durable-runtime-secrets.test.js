import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteRunStore,createDurableRunner} from '../lib/runtime/index.js';

function workflow(){return {irVersion:2,id:'secret_flow',name:'Secret flow',description:'',inputSchema:{type:'object',properties:{recordId:{type:'string'},secretToken:{type:'string','x-kata-secret':true}},required:['recordId','secretToken'],additionalProperties:false},outputSchema:true,graph:{entry:['a'],nodes:[{id:'a',kind:'invoke',inputSchema:true,outputSchema:true,effect:{class:'READ_ONLY',idempotency:'intrinsic'},capabilities:['records:read'],authorization:{scopes:['records:read']},timeoutMs:1000,retry:{maxAttempts:1,strategy:'none'},budget:{},spec:{target:{transport:'semantic',name:'records.read'},arguments:{id:{$param:'recordId'}}}}],edges:[]},invariants:[],policies:{failClosed:true},metadata:{}};}

test('durable runner refuses secret-valued workflow input until credential brokering exists and persists nothing',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kata-secret-runtime-')),file=join(dir,'runs.sqlite');
  try{
    const store=new SqliteRunStore({filename:file});
    let invoked=false;
    const runner=createDurableRunner({store,invoke:async()=>{invoked=true;return {};}});
    const result=await runner.execute({runId:'secret_run',program:workflow(),input:{recordId:'R1',secretToken:'must-not-persist'}});
    assert.equal(result.status,'BLOCKED');
    assert.equal(result.reason,'SECRET_INPUT_REQUIRES_CREDENTIAL_BROKER');
    assert.equal(invoked,false);
    assert.deepEqual(store.load('secret_run'),{runId:'secret_run',revision:0,events:[]});
    store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

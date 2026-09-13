import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteRunStore,createDurableRunner} from '../lib/runtime/index.js';

function secretOutputWorkflow(){return {irVersion:2,id:'secret_output_resume_flow',name:'Secret output resume flow',description:'',inputSchema:{type:'object',properties:{recordId:{type:'string'}},required:['recordId'],additionalProperties:false},outputSchema:true,graph:{entry:['a'],nodes:[{id:'a',kind:'invoke',inputSchema:true,outputSchema:{type:'object',properties:{recordId:{type:'string'},accessToken:{type:'string','x-kata-secret':true}},required:['recordId','accessToken'],additionalProperties:false},effect:{class:'READ_ONLY',idempotency:'intrinsic'},capabilities:['records:read'],authorization:{scopes:['records:read']},timeoutMs:1000,retry:{maxAttempts:1,strategy:'none'},budget:{},spec:{target:{transport:'semantic',name:'records.read'},arguments:{id:{$param:'recordId'}}}}],edges:[]},invariants:[],policies:{failClosed:true},metadata:{}};}

test('a persisted safety-blocked run stays blocked without repeating the external invocation',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kata-blocked-resume-runtime-')),file=join(dir,'runs.sqlite');
  try{
    const store=new SqliteRunStore({filename:file});
    let invocations=0;
    const runner=createDurableRunner({store,invoke:async()=>{invocations++;return {recordId:'R1',accessToken:'must-not-persist'};}});
    const first=await runner.execute({runId:'blocked_resume_run',program:secretOutputWorkflow(),input:{recordId:'R1'}});
    assert.equal(first.status,'BLOCKED');
    assert.equal(first.reason,'SECRET_OUTPUT_REQUIRES_CREDENTIAL_BROKER');
    assert.equal(invocations,1);
    const revisionAfterBlock=store.load('blocked_resume_run').revision;

    const second=await runner.execute({runId:'blocked_resume_run',program:secretOutputWorkflow(),input:{recordId:'R1'}});
    assert.equal(second.status,'BLOCKED');
    assert.equal(second.reason,'SECRET_OUTPUT_REQUIRES_CREDENTIAL_BROKER');
    assert.equal(invocations,1,'a blocked run must not silently re-enter execution');
    assert.equal(store.load('blocked_resume_run').revision,revisionAfterBlock,'reading a terminal blocked run must not mutate durable history');
    store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

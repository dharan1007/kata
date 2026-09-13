import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteRunStore,createDurableRunner} from '../lib/runtime/index.js';

function program(){
  return {
    irVersion:2,
    id:'durable_output_contract',
    name:'Durable output contract',
    description:'',
    inputSchema:{type:'object',additionalProperties:false},
    outputSchema:true,
    graph:{
      entry:['read'],
      nodes:[{
        id:'read',
        kind:'invoke',
        inputSchema:true,
        outputSchema:{
          type:'object',
          properties:{ok:{type:'boolean'}},
          required:['ok'],
          additionalProperties:false,
        },
        effect:{class:'READ_ONLY',idempotency:'intrinsic'},
        capabilities:['records:read'],
        authorization:{scopes:['records:read']},
        timeoutMs:1000,
        retry:{maxAttempts:3,strategy:'fixed',baseDelayMs:0,maxDelayMs:0,jitter:false},
        budget:{maxDurationMs:1000},
        spec:{target:{transport:'semantic',name:'records.read'},arguments:{}},
      }],
      edges:[],
    },
    invariants:[],
    policies:{failClosed:true},
    metadata:{},
  };
}

function tempFile(){
  const dir=mkdtempSync(join(tmpdir(),'kata-runtime-output-contract-'));
  return {dir,file:join(dir,'runs.sqlite')};
}

test('invalid tool output fails terminally without consuming retry budget on repeated contract violations',async()=>{
  const {dir,file}=tempFile();
  try{
    const store=new SqliteRunStore({filename:file});
    let calls=0;
    const runner=createDurableRunner({
      store,
      invoke:async()=>{
        calls++;
        return {unexpected:true};
      },
    });

    const result=await runner.execute({runId:'run_output_contract',program:program(),input:{}});
    assert.equal(result.status,'FAILED');
    assert.equal(result.nodeId,'read');
    assert.equal(calls,1,'a deterministic output contract violation must not be retried');

    const events=store.load('run_output_contract').events;
    const starts=events.filter(event=>event.type==='StepStarted');
    const failed=events.filter(event=>event.type==='StepFailed');
    const attemptsFailed=events.filter(event=>event.type==='StepAttemptFailed');
    assert.deepEqual(starts.map(event=>event.payload.attempt),[1]);
    assert.equal(attemptsFailed.length,0);
    assert.equal(failed.length,1);
    assert.equal(failed[0].payload.errorCode,'RUNTIME_OUTPUT_SCHEMA_MISMATCH');
    assert.equal(events.some(event=>event.type==='StepCompleted'),false);
    store.close();
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});

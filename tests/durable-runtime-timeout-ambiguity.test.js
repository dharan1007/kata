import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteRunStore,createDurableRunner} from '../lib/runtime/index.js';

function timeoutProgram(){
  return {
    irVersion:2,
    id:'durable_timeout_ambiguity',
    name:'Durable timeout ambiguity',
    description:'',
    inputSchema:{type:'object',additionalProperties:false},
    outputSchema:true,
    graph:{
      entry:['read'],
      nodes:[{
        id:'read',
        kind:'invoke',
        inputSchema:true,
        outputSchema:true,
        effect:{class:'READ_ONLY',idempotency:'intrinsic'},
        capabilities:['records:read'],
        authorization:{scopes:['records:read']},
        timeoutMs:20,
        retry:{maxAttempts:2,strategy:'fixed',baseDelayMs:0,maxDelayMs:0,jitter:false},
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
  const dir=mkdtempSync(join(tmpdir(),'kata-runtime-timeout-ambiguity-'));
  return {dir,file:join(dir,'runs.sqlite')};
}

test('a timed-out invocation with unconfirmed cancellation is terminal and never overlaps a retry',async()=>{
  const {dir,file}=tempFile();
  try{
    const store=new SqliteRunStore({filename:file});
    let calls=0;
    let active=0;
    let maxActive=0;
    const runner=createDurableRunner({
      store,
      invoke:async()=>{
        calls++;
        active++;
        maxActive=Math.max(maxActive,active);
        try{
          // Intentionally ignore AbortSignal to model an adapter/provider that
          // cannot prove cancellation after KATA's local deadline fires.
          await new Promise(resolve=>setTimeout(resolve,100));
          return {ok:true};
        }finally{
          active--;
        }
      },
    });

    const result=await runner.execute({runId:'run_timeout_ambiguity',program:timeoutProgram(),input:{}});
    assert.equal(result.status,'FAILED');
    assert.equal(result.nodeId,'read');
    assert.equal(calls,1,'an unconfirmed timed-out invocation must not be retried');
    assert.equal(maxActive,1,'KATA must not overlap a retry with work that may still be running');

    const events=store.load('run_timeout_ambiguity').events;
    const starts=events.filter(event=>event.type==='StepStarted');
    const attemptsFailed=events.filter(event=>event.type==='StepAttemptFailed');
    const failed=events.filter(event=>event.type==='StepFailed');
    assert.deepEqual(starts.map(event=>event.payload.attempt),[1]);
    assert.equal(attemptsFailed.length,0);
    assert.equal(failed.length,1);
    assert.equal(failed[0].payload.errorCode,'RUNTIME_STEP_TIMEOUT_OUTCOME_UNKNOWN');
    assert.equal(events.some(event=>event.type==='StepCompleted'),false);
    store.close();
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});

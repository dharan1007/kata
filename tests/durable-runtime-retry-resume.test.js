import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteRunStore,createDurableRunner} from '../lib/runtime/index.js';

function retryProgram(){
  return {
    irVersion:2,
    id:'durable_retry_budget',
    name:'Durable retry budget',
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
        timeoutMs:1000,
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
  const dir=mkdtempSync(join(tmpdir(),'kata-runtime-retry-'));
  return {dir,file:join(dir,'runs.sqlite')};
}

test('durable retry budget survives a crash after a persisted failed attempt',async()=>{
  const {dir,file}=tempFile();
  try{
    let calls=0;
    let store=new SqliteRunStore({filename:file});
    const realAppend=store.append.bind(store);
    let crashed=false;
    store.append=(runId,expectedRevision,events)=>{
      const result=realAppend(runId,expectedRevision,events);
      if(!crashed&&events.some(event=>event.type==='StepAttemptFailed')){
        crashed=true;
        throw Object.assign(new Error('simulated process crash'),{code:'SIMULATED_CRASH'});
      }
      return result;
    };
    let runner=createDurableRunner({
      store,
      invoke:async ()=>{
        calls++;
        throw Object.assign(new Error('upstream unavailable'),{code:'UPSTREAM_UNAVAILABLE'});
      },
    });
    await assert.rejects(
      runner.execute({runId:'run_retry_resume',program:retryProgram(),input:{}}),
      /simulated process crash/,
    );
    assert.equal(calls,1);
    store.close();

    store=new SqliteRunStore({filename:file});
    runner=createDurableRunner({
      store,
      invoke:async ()=>{
        calls++;
        throw Object.assign(new Error('upstream unavailable'),{code:'UPSTREAM_UNAVAILABLE'});
      },
    });
    const resumed=await runner.execute({runId:'run_retry_resume',program:retryProgram()});
    assert.equal(resumed.status,'FAILED');
    assert.equal(calls,2,'maxAttempts=2 must cap attempts across crash/restart, not per process call');
    const starts=store.load('run_retry_resume').events.filter(event=>event.type==='StepStarted');
    assert.deepEqual(starts.map(event=>event.payload.attempt),[1,2]);
    store.close();
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});

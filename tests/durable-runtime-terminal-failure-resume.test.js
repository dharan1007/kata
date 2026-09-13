import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteRunStore,createDurableRunner} from '../lib/runtime/index.js';

function retryProgram(){
  return {
    irVersion:2,
    id:'durable_terminal_failure',
    name:'Durable terminal failure',
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
  const dir=mkdtempSync(join(tmpdir(),'kata-runtime-terminal-failure-'));
  return {dir,file:join(dir,'runs.sqlite')};
}

test('persisted final StepFailed remains terminal after a crash before WorkflowFailed',async()=>{
  const {dir,file}=tempFile();
  try{
    let calls=0;
    let store=new SqliteRunStore({filename:file});
    const realAppend=store.append.bind(store);
    let crashed=false;
    store.append=(runId,expectedRevision,events)=>{
      const result=realAppend(runId,expectedRevision,events);
      if(!crashed&&events.some(event=>event.type==='StepFailed')){
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
      runner.execute({runId:'run_terminal_failure_resume',program:retryProgram(),input:{}}),
      /simulated process crash/,
    );
    assert.equal(calls,2);
    const beforeRestart=store.load('run_terminal_failure_resume').events;
    assert.equal(beforeRestart.at(-1)?.type,'StepFailed');
    store.close();

    store=new SqliteRunStore({filename:file});
    runner=createDurableRunner({
      store,
      invoke:async ()=>{
        calls++;
        return {ok:true};
      },
    });
    const resumed=await runner.execute({runId:'run_terminal_failure_resume',program:retryProgram()});
    assert.equal(resumed.status,'FAILED');
    assert.equal(resumed.nodeId,'read');
    assert.equal(calls,2,'a durably failed terminal attempt must never be invoked again after restart');
    assert.equal(store.load('run_terminal_failure_resume').events.at(-1)?.type,'StepFailed');
    store.close();
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteRunStore,createDurableRunner} from '../lib/runtime/index.js';

function workflow(){return {irVersion:2,id:'secret_flow',name:'Secret flow',description:'',inputSchema:{type:'object',properties:{recordId:{type:'string'},secretToken:{type:'string','x-kata-secret':true}},required:['recordId','secretToken'],additionalProperties:false},outputSchema:true,graph:{entry:['a'],nodes:[{id:'a',kind:'invoke',inputSchema:true,outputSchema:true,effect:{class:'READ_ONLY',idempotency:'intrinsic'},capabilities:['records:read'],authorization:{scopes:['records:read']},timeoutMs:1000,retry:{maxAttempts:1,strategy:'none'},budget:{},spec:{target:{transport:'semantic',name:'records.read'},arguments:{id:{$param:'recordId'}}}}],edges:[]},invariants:[],policies:{failClosed:true},metadata:{}};}

function dynamicSecretMapWorkflow(){return {irVersion:2,id:'dynamic_secret_flow',name:'Dynamic secret flow',description:'',inputSchema:{type:'object',properties:{recordId:{type:'string'},credentials:{type:'object',additionalProperties:{type:'string','x-kata-secret':true}}},required:['recordId','credentials'],additionalProperties:false},outputSchema:true,graph:{entry:['a'],nodes:[{id:'a',kind:'invoke',inputSchema:true,outputSchema:true,effect:{class:'READ_ONLY',idempotency:'intrinsic'},capabilities:['records:read'],authorization:{scopes:['records:read']},timeoutMs:1000,retry:{maxAttempts:1,strategy:'none'},budget:{},spec:{target:{transport:'semantic',name:'records.read'},arguments:{id:{$param:'recordId'}}}}],edges:[]},invariants:[],policies:{failClosed:true},metadata:{}};}

function combinatorSecretWorkflow(){return {irVersion:2,id:'combinator_secret_flow',name:'Combinator secret flow',description:'',inputSchema:{type:'object',properties:{recordId:{type:'string'},credential:{anyOf:[{type:'string','x-kata-secret':true},{type:'object',properties:{publicId:{type:'string'}},required:['publicId'],additionalProperties:false}]}},required:['recordId','credential'],additionalProperties:false},outputSchema:true,graph:{entry:['a'],nodes:[{id:'a',kind:'invoke',inputSchema:true,outputSchema:true,effect:{class:'READ_ONLY',idempotency:'intrinsic'},capabilities:['records:read'],authorization:{scopes:['records:read']},timeoutMs:1000,retry:{maxAttempts:1,strategy:'none'},budget:{},spec:{target:{transport:'semantic',name:'records.read'},arguments:{id:{$param:'recordId'}}}}],edges:[]},invariants:[],policies:{failClosed:true},metadata:{}};}

function secretOutputWorkflow(){return {irVersion:2,id:'secret_output_flow',name:'Secret output flow',description:'',inputSchema:{type:'object',properties:{recordId:{type:'string'}},required:['recordId'],additionalProperties:false},outputSchema:true,graph:{entry:['a'],nodes:[{id:'a',kind:'invoke',inputSchema:true,outputSchema:{type:'object',properties:{recordId:{type:'string'},accessToken:{type:'string','x-kata-secret':true}},required:['recordId','accessToken'],additionalProperties:false},effect:{class:'READ_ONLY',idempotency:'intrinsic'},capabilities:['records:read'],authorization:{scopes:['records:read']},timeoutMs:1000,retry:{maxAttempts:1,strategy:'none'},budget:{},spec:{target:{transport:'semantic',name:'records.read'},arguments:{id:{$param:'recordId'}}}}],edges:[]},invariants:[],policies:{failClosed:true},metadata:{}};}

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

test('durable runner refuses secret-valued dynamic map entries before persistence',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kata-secret-map-runtime-')),file=join(dir,'runs.sqlite');
  try{
    const store=new SqliteRunStore({filename:file});
    let invoked=false;
    const runner=createDurableRunner({store,invoke:async()=>{invoked=true;return {};}});
    const result=await runner.execute({runId:'secret_map_run',program:dynamicSecretMapWorkflow(),input:{recordId:'R1',credentials:{primary:'must-not-persist'}}});
    assert.equal(result.status,'BLOCKED');
    assert.equal(result.reason,'SECRET_INPUT_REQUIRES_CREDENTIAL_BROKER');
    assert.equal(invoked,false);
    assert.deepEqual(store.load('secret_map_run'),{runId:'secret_map_run',revision:0,events:[]});
    store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('durable runner refuses a secret annotation in the matching anyOf branch before persistence',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kata-secret-combinator-runtime-')),file=join(dir,'runs.sqlite');
  try{
    const store=new SqliteRunStore({filename:file});
    let invoked=false;
    const runner=createDurableRunner({store,invoke:async()=>{invoked=true;return {};}});
    const result=await runner.execute({runId:'secret_combinator_run',program:combinatorSecretWorkflow(),input:{recordId:'R1',credential:'must-not-persist'}});
    assert.equal(result.status,'BLOCKED');
    assert.equal(result.reason,'SECRET_INPUT_REQUIRES_CREDENTIAL_BROKER');
    assert.equal(invoked,false);
    assert.deepEqual(store.load('secret_combinator_run'),{runId:'secret_combinator_run',revision:0,events:[]});
    store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('durable runner does not treat a non-matching secret anyOf branch as active secret input',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kata-public-combinator-runtime-')),file=join(dir,'runs.sqlite');
  try{
    const store=new SqliteRunStore({filename:file});
    let invoked=false;
    const runner=createDurableRunner({store,invoke:async()=>{invoked=true;return {ok:true};}});
    const result=await runner.execute({runId:'public_combinator_run',program:combinatorSecretWorkflow(),input:{recordId:'R1',credential:{publicId:'P1'}}});
    assert.equal(result.status,'COMPLETED');
    assert.equal(invoked,true);
    assert.equal(store.load('public_combinator_run').revision>0,true);
    store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('durable runner never persists a secret-bearing tool output while credential brokering is unavailable',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kata-secret-output-runtime-')),file=join(dir,'runs.sqlite');
  try{
    const store=new SqliteRunStore({filename:file});
    const runner=createDurableRunner({store,invoke:async()=>({recordId:'R1',accessToken:'must-not-persist'})});
    const result=await runner.execute({runId:'secret_output_run',program:secretOutputWorkflow(),input:{recordId:'R1'}});
    assert.equal(result.status,'BLOCKED');
    assert.equal(result.reason,'SECRET_OUTPUT_REQUIRES_CREDENTIAL_BROKER');
    const history=store.load('secret_output_run');
    assert.equal(history.events.some(event=>JSON.stringify(event).includes('must-not-persist')),false);
    assert.equal(history.events.some(event=>event.type==='StepCompleted'),false);
    store.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});

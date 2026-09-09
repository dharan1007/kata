import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAuthorizedTabMcpTask,
  previewAuthorizedTabMcpTaskUpdate,
  executeAuthorizedTabMcpTaskUpdate,
  previewAuthorizedTabMcpTaskCancel,
  executeAuthorizedTabMcpTaskCancel,
} from '../extension/service-worker.js';

const tab={id:7,url:'https://example.com/app'};
const endpoint='/mcp';
const task={
  taskId:'task_01J9ABCDEF',
  endpoint:'https://example.com/mcp',
  toolName:'reports.generate',
  status:'input_required',
  previewFingerprint:'origin-preview',
  inputRequests:{
    confirm:{method:'elicitation/create',params:{message:'Proceed?',requestedSchema:{type:'object',properties:{approved:{type:'boolean'}},required:['approved'],additionalProperties:false}}},
  },
};

function response(id,result){return{ok:true,status:200,headers:{get:()=> 'application/json'},body:null,text:async()=>JSON.stringify({jsonrpc:'2.0',id,result})};}

test('active-tab task polling remains same-origin, credential-free, and manual',async()=>{
  const calls=[];
  const result=await getAuthorizedTabMcpTask(tab,endpoint,task,{}, {fetchImpl:async(url,init)=>{calls.push({url,init,body:JSON.parse(init.body)});return response('kata-task-get',{resultType:'complete',taskId:task.taskId,status:'working',createdAt:'2026-09-10T00:00:00Z',lastUpdatedAt:'2026-09-10T00:00:05Z',pollIntervalMs:5000});}});
  assert.equal(result.status,'working');
  assert.equal(result.automaticPolling,false);
  assert.equal(calls.length,1);
  assert.equal(calls[0].init.credentials,'omit');
  assert.equal(calls[0].init.headers['Mcp-Name'],task.taskId);
});

test('active-tab task update requires a fresh preview fingerprint and does not re-use stale approval',async()=>{
  const responses={confirm:{action:'accept',content:{approved:true}}};
  const preview=await previewAuthorizedTabMcpTaskUpdate(tab,endpoint,task,responses,{},{});
  assert.match(preview.previewFingerprint,/^[a-f0-9]{64}$/);
  const calls=[];
  const result=await executeAuthorizedTabMcpTaskUpdate(tab,endpoint,task,responses,preview.previewFingerprint,{approved:true},{fetchImpl:async(url,init)=>{calls.push(JSON.parse(init.body));return response('kata-task-update',{});}});
  assert.equal(result.updateAccepted,true);
  assert.equal(calls.length,1);
  await assert.rejects(()=>executeAuthorizedTabMcpTaskUpdate(tab,endpoint,task,responses,'0'.repeat(64),{approved:true},{fetchImpl:async()=>{throw new Error('must not execute');}}),/stale|match/i);
});

test('active-tab task cancellation is separately previewed and remains cooperative',async()=>{
  const working={...task,status:'working',inputRequests:null};
  const preview=await previewAuthorizedTabMcpTaskCancel(tab,endpoint,working,{},{});
  const calls=[];
  const result=await executeAuthorizedTabMcpTaskCancel(tab,endpoint,working,preview.previewFingerprint,{approved:true},{fetchImpl:async(url,init)=>{calls.push(JSON.parse(init.body));return response('kata-task-cancel',{});}});
  assert.equal(result.cancelRequested,true);
  assert.equal(result.terminalStateClaimed,false);
  assert.equal(calls.length,1);
});

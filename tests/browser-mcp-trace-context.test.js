import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listAuthorizedTabMcpTools,
  previewAuthorizedTabMcpTool,
  executeAuthorizedTabMcpTool,
  previewAuthorizedTabMcpResume,
  executeAuthorizedTabMcpResume,
  getAuthorizedTabMcpTask,
  previewAuthorizedTabMcpTaskUpdate,
  executeAuthorizedTabMcpTaskUpdate,
  previewAuthorizedTabMcpTaskCancel,
  executeAuthorizedTabMcpTaskCancel,
} from '../extension/service-worker.js';

const tab={id:7,url:'https://example.com/app'};
const endpoint='/mcp';
const traceContext={
  traceparent:'00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
  tracestate:'rojo=00f067aa0ba902b7',
  baggage:'userId=alice;property=value',
};
const tool={
  name:'reports.generate',
  description:'Generate a report',
  inputSchema:{type:'object',properties:{topic:{type:'string'}},required:['topic'],additionalProperties:false},
  execution:{taskSupport:'required'},
};

function response(id,result){
  return {ok:true,status:200,headers:{get:()=> 'application/json'},body:null,text:async()=>JSON.stringify({jsonrpc:'2.0',id,result}),json:async()=>({jsonrpc:'2.0',id,result})};
}

function assertTrace(body){
  assert.equal(body.params._meta.traceparent,traceContext.traceparent);
  assert.equal(body.params._meta.tracestate,traceContext.tracestate);
  assert.equal(body.params._meta.baggage,traceContext.baggage);
}

test('active-tab orchestration propagates one validated trace context through discovery and paginated tools/list',async()=>{
  const calls=[];
  let listPage=0;
  const fetchImpl=async(url,init)=>{
    const body=JSON.parse(init.body);calls.push(body);
    if(body.method==='server/discover')return response('kata-mcp-discover',{resultType:'complete',supportedVersions:['2026-07-28'],capabilities:{tools:{}},_meta:{'io.modelcontextprotocol/serverInfo':{name:'Example MCP',version:'1.0.0'}}});
    if(body.method==='tools/list'){
      listPage+=1;
      return response(body.id,{resultType:'complete',tools:listPage===1?[tool]:[],...(listPage===1?{nextCursor:'page-2'}:{})});
    }
    throw new Error(`Unexpected MCP method ${body.method}`);
  };
  const listed=await listAuthorizedTabMcpTools(tab,endpoint,{traceContext},{fetchImpl});
  assert.equal(listed.ok,true);
  assert.deepEqual(calls.map(body=>body.method),['server/discover','tools/list','tools/list']);
  for(const body of calls)assertTrace(body);
});

test('active-tab tools/call and MRTR resume keep trace context preview-bound and out of transport authority',async()=>{
  const calls=[];
  let toolCalls=0;
  const fetchImpl=async(url,init)=>{
    const body=JSON.parse(init.body);calls.push({body,headers:init.headers});
    if(body.method==='server/discover')return response('kata-mcp-discover',{resultType:'complete',supportedVersions:['2026-07-28'],capabilities:{tools:{}},_meta:{'io.modelcontextprotocol/serverInfo':{name:'Example MCP',version:'1.0.0'}}});
    if(body.method==='tools/list')return response(body.id,{resultType:'complete',tools:[{...tool,execution:{taskSupport:'forbidden'}}]});
    if(body.method==='tools/call'){
      toolCalls+=1;
      if(toolCalls===1)return response(body.id,{resultType:'input_required',inputRequests:{confirm:{method:'elicitation/create',params:{message:'Proceed?',requestedSchema:{type:'object',properties:{approved:{type:'boolean'}},required:['approved'],additionalProperties:false}}}},requestState:'opaque-state'});
      return response(body.id,{resultType:'complete',structuredContent:{ok:true},isError:false});
    }
    throw new Error(`Unexpected MCP method ${body.method}`);
  };
  const options={traceContext};
  const preview=await previewAuthorizedTabMcpTool(tab,endpoint,'reports.generate',{topic:'interop'},options,{fetchImpl});
  assert.deepEqual(preview.preview.traceContext,traceContext);
  const pending=await executeAuthorizedTabMcpTool(tab,endpoint,'reports.generate',{topic:'interop'},preview.previewFingerprint,{...options,approved:true},{fetchImpl});
  const resumePreview=await previewAuthorizedTabMcpResume(tab,endpoint,'reports.generate',{topic:'interop'},pending.continuation,{confirm:{action:'accept',content:{approved:true}}},options,{fetchImpl});
  assert.deepEqual(resumePreview.preview.traceContext,traceContext);
  await executeAuthorizedTabMcpResume(tab,endpoint,'reports.generate',{topic:'interop'},pending.continuation,{confirm:{action:'accept',content:{approved:true}}},resumePreview.previewFingerprint,{...options,approved:true},{fetchImpl});
  for(const call of calls){
    assertTrace(call.body);
    assert.equal(call.headers.traceparent,undefined);
    assert.equal(call.headers.tracestate,undefined);
    assert.equal(call.headers.baggage,undefined);
  }
});

test('active-tab task lifecycle inherits trace context from the originating task handle',async()=>{
  const calls=[];
  const fetchImpl=async(url,init)=>{
    const body=JSON.parse(init.body);calls.push(body);
    if(body.method==='server/discover')return response('kata-mcp-discover',{resultType:'complete',supportedVersions:['2026-07-28'],capabilities:{tools:{},extensions:{'io.modelcontextprotocol/tasks':{}}},_meta:{'io.modelcontextprotocol/serverInfo':{name:'Example MCP',version:'1.0.0'}}});
    if(body.method==='tools/list')return response(body.id,{resultType:'complete',tools:[tool]});
    if(body.method==='tools/call')return response(body.id,{resultType:'task',taskId:'task_trace_1',status:'input_required',inputRequests:{confirm:{method:'elicitation/create',params:{message:'Proceed?',requestedSchema:{type:'object',properties:{approved:{type:'boolean'}},required:['approved'],additionalProperties:false}}}}});
    if(body.method==='tasks/get')return response(body.id,{resultType:'complete',taskId:'task_trace_1',status:'input_required',inputRequests:{confirm:{method:'elicitation/create',params:{message:'Proceed?',requestedSchema:{type:'object',properties:{approved:{type:'boolean'}},required:['approved'],additionalProperties:false}}}}});
    if(body.method==='tasks/update'||body.method==='tasks/cancel')return response(body.id,{});
    throw new Error(`Unexpected MCP method ${body.method}`);
  };
  const options={traceContext};
  const preview=await previewAuthorizedTabMcpTool(tab,endpoint,'reports.generate',{topic:'interop'},options,{fetchImpl});
  const created=await executeAuthorizedTabMcpTool(tab,endpoint,'reports.generate',{topic:'interop'},preview.previewFingerprint,{...options,approved:true},{fetchImpl});
  assert.deepEqual(created.task.traceContext,traceContext);
  await getAuthorizedTabMcpTask(tab,endpoint,created.task,{}, {fetchImpl});
  const inputResponses={confirm:{action:'accept',content:{approved:true}}};
  const update=await previewAuthorizedTabMcpTaskUpdate(tab,endpoint,created.task,inputResponses,{},{});
  await executeAuthorizedTabMcpTaskUpdate(tab,endpoint,created.task,inputResponses,update.previewFingerprint,{approved:true},{fetchImpl});
  const cancel=await previewAuthorizedTabMcpTaskCancel(tab,endpoint,{...created.task,status:'working',inputRequests:null},{},{});
  await executeAuthorizedTabMcpTaskCancel(tab,endpoint,{...created.task,status:'working',inputRequests:null},cancel.previewFingerprint,{approved:true},{fetchImpl});
  const lifecycle=calls.filter(body=>['tasks/get','tasks/update','tasks/cancel'].includes(body.method));
  assert.equal(lifecycle.length,3);
  for(const body of lifecycle)assertTrace(body);
});

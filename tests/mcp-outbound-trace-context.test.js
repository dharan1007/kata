import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listModernMcpTools,
  buildMcpToolCallPreview,
  buildMcpInputRequiredResumePreview,
  fingerprintMcpToolCallPreview,
  executeModernMcpToolCall,
  executeModernMcpToolResume,
  getModernMcpTask,
  buildMcpTaskUpdatePreview,
  executeModernMcpTaskUpdate,
  buildMcpTaskCancelPreview,
  executeModernMcpTaskCancel,
} from '../src/mcp-adapter.js';

const endpoint='https://example.com/mcp';
const traceContext={
  traceparent:'00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
  tracestate:'rojo=00f067aa0ba902b7',
  baggage:'userId=alice;property=value',
};

function response(id,result){
  return {
    ok:true,
    status:200,
    headers:{get:()=> 'application/json'},
    body:null,
    text:async()=>JSON.stringify({jsonrpc:'2.0',id,result}),
  };
}

function tool(taskSupport='forbidden'){
  return {
    name:'reports.generate',
    description:'Generate a report',
    inputSchema:{type:'object',properties:{topic:{type:'string'}},required:['topic'],additionalProperties:false},
    execution:{taskSupport},
  };
}

function assertTrace(body){
  assert.equal(body.params._meta.traceparent,traceContext.traceparent);
  assert.equal(body.params._meta.tracestate,traceContext.tracestate);
  assert.equal(body.params._meta.baggage,traceContext.baggage);
}

test('validated W3C trace context propagates through tools/list and preview-bound tools/call without becoming transport authority',async()=>{
  const calls=[];
  const inventory=await listModernMcpTools(endpoint,{
    traceContext,
    fetchImpl:async(url,init)=>{
      const body=JSON.parse(init.body);calls.push({init,body});
      return response('kata-tools-list-1',{resultType:'complete',tools:[tool()]});
    },
  });
  assertTrace(calls[0].body);
  assert.equal(calls[0].init.headers.traceparent,undefined);
  assert.equal(calls[0].init.headers.tracestate,undefined);
  assert.equal(calls[0].init.headers.baggage,undefined);

  const preview=buildMcpToolCallPreview(inventory.tools[0],{topic:'interop'},endpoint,{traceContext});
  assert.deepEqual(preview.traceContext,traceContext);
  const fingerprint=await fingerprintMcpToolCallPreview(preview);
  const result=await executeModernMcpToolCall(preview,fingerprint,{
    approved:true,
    expectedFingerprint:fingerprint,
    fetchImpl:async(url,init)=>{
      const body=JSON.parse(init.body);calls.push({init,body});
      return response('kata-mcp-call',{resultType:'complete',content:[]});
    },
  });
  assertTrace(calls[1].body);
  assert.equal(calls[1].init.headers['Mcp-Method'],'tools/call');
  assert.equal(calls[1].init.headers['Mcp-Name'],'reports.generate');
  assert.equal(result.receipt.traceId,'4bf92f3577b34da6a3ce929d0e0e4736');
  assert.equal(Object.prototype.hasOwnProperty.call(result.receipt,'baggage'),false);
});

test('the same validated trace context survives explicit MRTR resume',async()=>{
  const candidate={...tool(),headerMappings:[],outputSchema:null,outputSchemaValidation:'not-declared',taskSupport:'forbidden'};
  const preview=buildMcpToolCallPreview(candidate,{topic:'interop'},endpoint,{traceContext});
  const inputRequired={
    resultType:'input_required',
    inputRequests:{confirm:{method:'elicitation/create',params:{message:'Proceed?',requestedSchema:{type:'object',properties:{approved:{type:'boolean'}},required:['approved'],additionalProperties:false}}}},
    requestState:'opaque-state',
  };
  const resume=buildMcpInputRequiredResumePreview(preview,inputRequired,{confirm:{action:'accept',content:{approved:true}}});
  assert.deepEqual(resume.traceContext,traceContext);
  const fingerprint=await fingerprintMcpToolCallPreview(resume);
  let sent;
  await executeModernMcpToolResume(resume,fingerprint,{
    approved:true,
    expectedFingerprint:fingerprint,
    fetchImpl:async(url,init)=>{sent=JSON.parse(init.body);return response('kata-mcp-call-r2',{resultType:'complete',content:[]});},
  });
  assertTrace(sent);
});

test('task lifecycle calls inherit validated trace context from the originating task',async()=>{
  const candidate={...tool('required'),headerMappings:[],outputSchema:null,outputSchemaValidation:'not-declared',taskSupport:'required'};
  const preview=buildMcpToolCallPreview(candidate,{topic:'interop'},endpoint,{traceContext});
  const fingerprint=await fingerprintMcpToolCallPreview(preview);
  const created=await executeModernMcpToolCall(preview,fingerprint,{
    approved:true,
    expectedFingerprint:fingerprint,
    fetchImpl:async()=>response('kata-mcp-call',{resultType:'task',taskId:'task_trace_1',status:'input_required',inputRequests:{confirm:{method:'elicitation/create',params:{message:'Proceed?',requestedSchema:{type:'object',properties:{approved:{type:'boolean'}},required:['approved'],additionalProperties:false}}}}}),
  });
  assert.deepEqual(created.task.traceContext,traceContext);

  const sent=[];
  await getModernMcpTask(created.task,{fetchImpl:async(url,init)=>{sent.push(JSON.parse(init.body));return response('kata-task-get',{resultType:'complete',taskId:'task_trace_1',status:'input_required',inputRequests:created.task.inputRequests});}});
  const update=buildMcpTaskUpdatePreview(created.task,{confirm:{action:'accept',content:{approved:true}}});
  const updateFingerprint=await fingerprintMcpToolCallPreview(update);
  await executeModernMcpTaskUpdate(update,updateFingerprint,{approved:true,expectedFingerprint:updateFingerprint,fetchImpl:async(url,init)=>{sent.push(JSON.parse(init.body));return response('kata-task-update',{});}});
  const cancel=buildMcpTaskCancelPreview(created.task);
  const cancelFingerprint=await fingerprintMcpToolCallPreview(cancel);
  await executeModernMcpTaskCancel(cancel,cancelFingerprint,{approved:true,expectedFingerprint:cancelFingerprint,fetchImpl:async(url,init)=>{sent.push(JSON.parse(init.body));return response('kata-task-cancel',{});}});
  assert.equal(sent.length,3);
  for(const body of sent)assertTrace(body);
});

test('invalid or oversized outbound trace context fails before network execution',async()=>{
  let fetches=0;
  await assert.rejects(
    ()=>listModernMcpTools(endpoint,{traceContext:{traceparent:'00-00000000000000000000000000000000-00f067aa0ba902b7-01'},fetchImpl:async()=>{fetches+=1;throw new Error('must not fetch');}}),
    /trace context/i,
  );
  await assert.rejects(
    ()=>listModernMcpTools(endpoint,{traceContext:{...traceContext,baggage:`k=${'a'.repeat(9000)}`},fetchImpl:async()=>{fetches+=1;throw new Error('must not fetch');}}),
    /trace context/i,
  );
  assert.equal(fetches,0);
});

test('omitting trace context preserves the existing MCP wire metadata shape',async()=>{
  let sent;
  await listModernMcpTools(endpoint,{fetchImpl:async(url,init)=>{sent=JSON.parse(init.body);return response('kata-tools-list-1',{resultType:'complete',tools:[]});}});
  assert.deepEqual(Object.keys(sent.params._meta).sort(),[
    'io.modelcontextprotocol/clientCapabilities',
    'io.modelcontextprotocol/clientInfo',
    'io.modelcontextprotocol/protocolVersion',
  ]);
});

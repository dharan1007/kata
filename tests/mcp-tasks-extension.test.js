import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileMcpToolInventory,
  buildMcpToolCallPreview,
  fingerprintMcpToolCallPreview,
  executeModernMcpToolCall,
  getModernMcpTask,
  buildMcpTaskUpdatePreview,
  executeModernMcpTaskUpdate,
  buildMcpTaskCancelPreview,
  executeModernMcpTaskCancel,
} from '../src/mcp-adapter.js';

const endpoint='https://example.com/mcp';

function response(payload){
  return {
    ok:true,
    status:200,
    headers:{get:()=> 'application/json'},
    body:null,
    text:async()=>JSON.stringify(payload),
  };
}

function taskTool(taskSupport='required'){
  return {
    name:'reports.generate',
    description:'Generate a long-running report',
    inputSchema:{
      type:'object',
      properties:{topic:{type:'string'}},
      required:['topic'],
      additionalProperties:false,
    },
    outputSchema:{
      type:'object',
      properties:{url:{type:'string'}},
      required:['url'],
      additionalProperties:false,
    },
    execution:{taskSupport},
  };
}

function createTaskResult(id='kata-mcp-call'){
  return response({
    jsonrpc:'2.0',
    id,
    result:{
      resultType:'task',
      taskId:'task_01J9ABCDEF',
      status:'working',
      createdAt:'2026-09-10T00:00:00Z',
      lastUpdatedAt:'2026-09-10T00:00:00Z',
      ttlMs:3600000,
      pollIntervalMs:2500,
    },
  });
}

test('required-task MCP tools compile and tools/call explicitly advertises the Tasks extension',async()=>{
  const inventory=compileMcpToolInventory([taskTool('required')]);
  assert.equal(inventory.rejected.length,0);
  assert.equal(inventory.tools.length,1);
  assert.equal(inventory.tools[0].taskSupport,'required');

  const preview=buildMcpToolCallPreview(inventory.tools[0],{topic:'interop'},endpoint,{timeoutMs:5000});
  assert.equal(preview.tasksExtension,true);
  const fingerprint=await fingerprintMcpToolCallPreview(preview);
  const calls=[];
  const result=await executeModernMcpToolCall(preview,fingerprint,{
    approved:true,
    expectedFingerprint:fingerprint,
    fetchImpl:async(url,init)=>{calls.push(JSON.parse(init.body));return createTaskResult();},
  });

  const extensions=calls[0].params._meta['io.modelcontextprotocol/clientCapabilities'].extensions;
  assert.deepEqual(extensions,{'io.modelcontextprotocol/tasks':{}});
  assert.equal(result.ok,false);
  assert.equal(result.receipt.taskCreated,true);
  assert.equal(result.task.taskId,'task_01J9ABCDEF');
  assert.equal(result.task.status,'working');
  assert.equal(result.task.pollIntervalMs,2500);
  assert.equal(result.task.automaticPolling,false);
});

test('tasks/get is explicit read-only polling and routes Mcp-Name to the opaque task id',async()=>{
  const calls=[];
  const task={
    taskId:'task_01J9ABCDEF',
    endpoint,
    toolName:'reports.generate',
    outputSchema:taskTool().outputSchema,
    outputSchemaValidation:'supported-subset',
    previewFingerprint:'origin-preview',
  };
  const result=await getModernMcpTask(task,{
    fetchImpl:async(url,init)=>{
      calls.push({url,init,body:JSON.parse(init.body)});
      return response({jsonrpc:'2.0',id:'kata-task-get',result:{resultType:'complete',taskId:task.taskId,status:'completed',createdAt:'2026-09-10T00:00:00Z',lastUpdatedAt:'2026-09-10T00:01:00Z',result:{resultType:'complete',structuredContent:{url:'https://example.com/report'}}}});
    },
  });
  assert.equal(calls.length,1);
  assert.equal(calls[0].body.method,'tasks/get');
  assert.equal(calls[0].init.headers['Mcp-Method'],'tasks/get');
  assert.equal(calls[0].init.headers['Mcp-Name'],task.taskId);
  assert.equal(calls[0].init.credentials,'omit');
  assert.equal(result.status,'completed');
  assert.equal(result.outputValidation,'validated-supported-subset');
  assert.equal(result.automaticPolling,false);
});

test('tasks/update is preview-bound, validates only current task elicitation requests, and never auto-polls',async()=>{
  const task={
    taskId:'task_01J9ABCDEF',
    endpoint,
    toolName:'reports.generate',
    status:'input_required',
    inputRequests:{
      confirm:{
        method:'elicitation/create',
        params:{
          message:'Proceed?',
          requestedSchema:{type:'object',properties:{approved:{type:'boolean'}},required:['approved'],additionalProperties:false},
        },
      },
    },
    previewFingerprint:'origin-preview',
  };
  const preview=buildMcpTaskUpdatePreview(task,{confirm:{action:'accept',content:{approved:true}}});
  const fingerprint=await fingerprintMcpToolCallPreview(preview);
  const calls=[];
  const result=await executeModernMcpTaskUpdate(preview,fingerprint,{
    approved:true,
    expectedFingerprint:fingerprint,
    fetchImpl:async(url,init)=>{calls.push({init,body:JSON.parse(init.body)});return response({jsonrpc:'2.0',id:'kata-task-update',result:{}});},
  });
  assert.equal(calls[0].body.method,'tasks/update');
  assert.equal(calls[0].init.headers['Mcp-Name'],task.taskId);
  assert.deepEqual(calls[0].body.params.inputResponses,{confirm:{action:'accept',content:{approved:true}}});
  assert.equal(result.updateAccepted,true);
  assert.equal(result.automaticPolling,false);
  assert.throws(()=>buildMcpTaskUpdatePreview(task,{unknown:{action:'decline'}}),/current task inputRequests/i);
});

test('tasks/cancel requires a fresh fingerprint and reports cooperative cancellation without claiming terminal state',async()=>{
  const task={taskId:'task_01J9ABCDEF',endpoint,toolName:'reports.generate',status:'working',previewFingerprint:'origin-preview'};
  const preview=buildMcpTaskCancelPreview(task);
  const fingerprint=await fingerprintMcpToolCallPreview(preview);
  const calls=[];
  const result=await executeModernMcpTaskCancel(preview,fingerprint,{
    approved:true,
    expectedFingerprint:fingerprint,
    fetchImpl:async(url,init)=>{calls.push({init,body:JSON.parse(init.body)});return response({jsonrpc:'2.0',id:'kata-task-cancel',result:{}});},
  });
  assert.equal(calls[0].body.method,'tasks/cancel');
  assert.equal(calls[0].init.headers['Mcp-Name'],task.taskId);
  assert.equal(result.cancelRequested,true);
  assert.equal(result.terminalStateClaimed,false);
});

test('task ids are bounded header-safe opaque handles and are never silently encoded',async()=>{
  const invalid={taskId:'task\r\nInjected: yes',endpoint,toolName:'reports.generate',previewFingerprint:'origin-preview'};
  await assert.rejects(()=>getModernMcpTask(invalid,{fetchImpl:async()=>{throw new Error('must not fetch');}}),/task id/i);
  assert.throws(()=>buildMcpTaskCancelPreview(invalid),/task id/i);
});

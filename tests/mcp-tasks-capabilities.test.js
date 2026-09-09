import test from 'node:test';
import assert from 'node:assert/strict';
import capabilitiesHandler from '../api/capabilities.js';

function mockRes(){return{statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;},end(value){this.body=value;return this;}};}

test('/api/capabilities publishes explicit bounded MCP Tasks semantics',async()=>{
  const req={method:'GET'};const res=mockRes();
  await capabilitiesHandler(req,res);
  const adapters=res.body.capabilities.interop.mcpToolAdapters;
  assert.equal(adapters.supportsTasksExtension,true);
  assert.deepEqual(adapters.taskMethods,['tasks/get','tasks/update','tasks/cancel']);
  assert.equal(adapters.taskPolling,'explicit-manual');
  assert.equal(adapters.taskNotifications,false);
  assert.equal(adapters.autoPollsTasks,false);
  assert.equal(adapters.taskUpdateApproval,'sha256-preview-bound');
  assert.equal(adapters.taskCancelApproval,'sha256-preview-bound');
  assert.equal(adapters.taskIdRoutingHeader,'Mcp-Name');
  assert.equal(adapters.maxTaskIdBytes,4096);

  const extension=res.body.capabilities.interop.browserExtension.mcpExecution;
  assert.equal(extension.supportsTasksExtension,true);
  assert.equal(extension.taskPolling,'explicit-manual');
  assert.equal(extension.taskNotifications,false);
  assert.equal(extension.autoPollsTasks,false);
  assert.equal(extension.taskHandles,'local-only');
});

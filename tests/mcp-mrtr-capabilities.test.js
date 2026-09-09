import test from 'node:test';
import assert from 'node:assert/strict';
import capabilities from '../api/capabilities.js';

function res(){return{statusCode:200,headers:{},body:null,status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};}

test('/api/capabilities truthfully publishes bounded manual MCP input_required support',async()=>{
  const r=res();
  await capabilities({method:'GET',headers:{}},r);
  const adapter=r.body.capabilities.interop.mcpToolAdapters;
  assert.equal(adapter.supportsInputRequired,true);
  assert.equal(adapter.inputRequiredMode,'preview-bound-manual-continuation');
  assert.deepEqual(adapter.supportedInputRequests,['elicitation/create:form']);
  assert.deepEqual(adapter.unsupportedInputRequests,['sampling/createMessage','roots/list','elicitation/create:url']);
  assert.equal(adapter.maxInputRequiredRounds,10);
  assert.equal(adapter.maxInputRequestsPerRound,16);
  assert.equal(adapter.maxRequestStateBytes,16384);
  assert.equal(adapter.requestStatePolicy,'opaque-byte-exact-echo');
  assert.equal(adapter.inputResponsesPolicy,'current-round-only');
  assert.equal(adapter.continuationSha256PreviewBinding,true);
  assert.equal(adapter.continuationExplicitApproval,true);
  assert.equal(adapter.automaticInputFulfillment,false);
  assert.equal(r.body.capabilities.interop.browserExtension.mcpExecution.supportsInputRequired,false);
});

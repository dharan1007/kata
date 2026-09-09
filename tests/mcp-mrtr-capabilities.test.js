import test from 'node:test';
import assert from 'node:assert/strict';
import capabilities from '../api/capabilities.js';

function res(){return{statusCode:200,headers:{},body:null,status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};}

test('/api/capabilities publishes explicit bounded MCP input_required semantics',async()=>{
  const r=res();await capabilities({method:'GET',headers:{}},r);
  const adapters=r.body.capabilities.interop.mcpToolAdapters;
  assert.equal(adapters.supportsInputRequired,true);
  assert.equal(adapters.inputRequiredMode,'explicit-elicitation-only');
  assert.equal(adapters.maxInputRequiredRounds,10);
  assert.equal(adapters.autoAnswersInputRequests,false);
  assert.deepEqual(adapters.supportedInputRequestMethods,['elicitation/create']);
  assert.deepEqual(adapters.unsupportedInputRequestMethods,['sampling/createMessage','roots/list']);
  const browser=r.body.capabilities.interop.browserExtension.mcpExecution;
  assert.equal(browser.supportsInputRequired,true);
  assert.equal(browser.requiresFreshPreviewPerRound,true);
  assert.equal(browser.relistBeforeEachRound,true);
  assert.equal(browser.requestStateHandling,'opaque-byte-exact-echo');
  assert.equal(browser.inputResponsesScope,'current-round-only');
});

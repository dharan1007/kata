import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import capabilities from '../api/capabilities.js';
import {createWebMcpRegistry} from '../src/webmcp.js';

function res(){return{statusCode:200,headers:{},body:null,status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};}

test('capabilities distinguish local OpenAPI compilation from user-authorized preview-bound execution',async()=>{
  const r=res();await capabilities({method:'GET',headers:{}},r);
  const adapters=r.body.capabilities.webmcp.apiAgentAdapters;
  assert.equal(adapters.tool,'kata_browser_compile_api_tools');
  assert.equal(adapters.mode,'preview-only');
  assert.equal(adapters.executesOperations,false);
  assert.equal(adapters.extensionExecutionAvailable,true);
  const execution=r.body.capabilities.interop.browserExtension.apiExecution;
  assert.deepEqual(execution,{source:'standards-discovered-openapi',mode:'user-authorized-preview-bound',sameOriginOnly:true,executionWorld:'MAIN',rediscoversContractBeforeExecution:true,sha256PreviewBinding:true,credentialModes:['omit','same-origin-browser-managed'],extractsCredentials:false,acceptsCredentialArguments:false,redirects:'error',automaticRetries:false,defaultTimeoutMs:15000,maxTimeoutMs:15000,maxRequestUrlBytes:16384,maxRequestHeaderBytes:32768,maxRequestBodyBytes:262144,defaultMaxResponseBytes:1048576,maxResponseBytes:1048576,responseMode:'bounded-snapshot',indeterminateNetworkOutcome:'unknown-no-auto-retry',receipts:'local-only',explicitExecutionApproval:true});
  assert.ok(r.body.capabilities.interop.browserExtension.localOnly.includes('apiExecutionPreviews'));
  assert.ok(r.body.capabilities.interop.browserExtension.localOnly.includes('apiExecutionReceipts'));
});

test('WebMCP registers the browser API compiler as a read-only local planning tool',async()=>{
  const registered=[];
  const runtime={modelContext:{async registerTool(tool){registered.push(tool);}},listPrograms:()=>[],search:async()=>{},summary:()=>({}),listAutomations:()=>[],runAutomation:async()=>{},executeProgram:async()=>{}};
  const registry=createWebMcpRegistry(runtime);await registry.refresh();
  const tool=registered.find(x=>x.name==='kata_browser_compile_api_tools');
  assert.ok(tool);
  assert.equal(tool.annotations.readOnlyHint,true);
  assert.equal(tool.inputSchema.properties.maxTools.maximum,100);
  registry.dispose();
});

test('extension UI exposes compile, preview and explicit execution controls without accepting an arbitrary execution URL',async()=>{
  const html=await fs.readFile(new URL('../extension/popup.html',import.meta.url),'utf8');
  const js=await fs.readFile(new URL('../extension/popup.js',import.meta.url),'utf8');
  assert.match(html,/id="compile-api-tools"/);
  assert.match(html,/id="api-operation"/);
  assert.match(html,/id="api-arguments"/);
  assert.match(html,/id="preview-api-request"/);
  assert.match(html,/id="execute-api-request"/);
  assert.match(html,/id="api-execution-approval"/);
  assert.match(js,/preview-api-tool/);
  assert.match(js,/execute-api-tool/);
  assert.doesNotMatch(html,/id="api-execution-url"/);
  assert.doesNotMatch(js,/api-execution-url/);
});

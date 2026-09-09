import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import capabilities from '../api/capabilities.js';
import {createWebMcpRegistry} from '../src/webmcp.js';

function res(){return{statusCode:200,headers:{},body:null,status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};}

test('capabilities advertise preview-only OpenAPI-to-agent compilation and its security boundary',async()=>{
  const r=res();await capabilities({method:'GET',headers:{}},r);
  const contract=r.body.capabilities.webmcp.apiAgentAdapters;
  assert.deepEqual(contract,{tool:'kata_browser_compile_api_tools',source:'standards-discovered-openapi',mode:'preview-only',resolvesLocalComponentRefs:true,fetchesExternalRefs:false,acceptsCredentialArguments:false,executesOperations:false,maxTools:100});
  assert.ok(r.body.capabilities.webmcp.browserTools.includes('kata_browser_compile_api_tools'));
  assert.ok(r.body.capabilities.interop.browserExtension.localOnly.includes('compiledApiToolContracts'));
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

test('extension UI exposes local API tool compilation without an execute button',async()=>{
  const html=await fs.readFile(new URL('../extension/popup.html',import.meta.url),'utf8');
  const js=await fs.readFile(new URL('../extension/popup.js',import.meta.url),'utf8');
  assert.match(html,/id="compile-api-tools"/);
  assert.match(html,/id="api-tools-result"/);
  assert.match(js,/compile-api-tools/);
  assert.doesNotMatch(html,/execute-api-operation/i);
  assert.doesNotMatch(js,/execute-api-operation/i);
});

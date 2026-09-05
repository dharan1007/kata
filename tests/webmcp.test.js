import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebMcpRegistry} from '../src/webmcp.js';

test('WebMCP registers document.modelContext tools with abortable generations and plain results',async()=>{
 const calls=[];const mc={async registerTool(tool,{signal}){calls.push({tool,signal});}};
 let ws={version:1,knownWorks:{},savedWorks:{},runs:{},activity:[]};
 const runtime={modelContext:mc,getWorkspace:()=>ws,setWorkspace:x=>{ws=x},search:async q=>({query:q}),summary:()=>({saved:0}),listAutomations:()=>[],runAutomation:async id=>({id}),listPrograms:()=>[{name:'learned_x',description:'x',inputSchema:{type:'object',properties:{workId:{type:'string'}},required:['workId'],additionalProperties:false}}],executeProgram:async(name,input)=>({name,input})};
 const r=createWebMcpRegistry(runtime);await r.refresh();assert.ok(calls.length>=6);const firstSignal=calls[0].signal;const learned=calls.find(x=>x.tool.name==='learned_x').tool;assert.deepEqual(await learned.execute({workId:'W1'}),{name:'learned_x',input:{workId:'W1'}});await r.refresh();assert.equal(firstSignal.aborted,true);r.dispose();assert.equal(calls.at(-1).signal.aborted,true);
});

test('WebMCP forwards invocation AbortSignal to network-backed runtime operations',async()=>{
 const registered=[];const mc={async registerTool(tool){registered.push(tool);}};const seen={};
 const runtime={
  modelContext:mc,
  search:async(query,limit,source,options)=>{seen.search={query,limit,source,options};return{query};},
  summary:()=>({}),listAutomations:()=>[],
  runAutomation:async(id,source,works,options)=>{seen.automation={id,source,works,options};return{id};},
  listPrograms:()=>[{name:'learned_x',description:'x',inputSchema:{type:'object',properties:{},additionalProperties:false}}],
  executeProgram:async(name,input,source,options)=>{seen.program={name,input,source,options};return{name};}
 };
 const registry=createWebMcpRegistry(runtime);await registry.refresh();const controller=new AbortController();const context={signal:controller.signal};
 await registered.find(x=>x.name==='kata_search_research').execute({query:'agents',limit:3},context);
 await registered.find(x=>x.name==='kata_run_automation').execute({automationId:'a1'},context);
 await registered.find(x=>x.name==='learned_x').execute({},context);
 assert.equal(seen.search.options?.signal,controller.signal);
 assert.equal(seen.automation.options?.signal,controller.signal);
 assert.equal(seen.program.options?.signal,controller.signal);
 registry.dispose();
});

test('WebMCP cross-origin exposure is explicit, secure-origin-only, and never wildcarded',async()=>{
 const calls=[];const mc={async registerTool(tool,options){calls.push({tool,options});}};
 const runtime={
  modelContext:mc,
  webMcpExposedTo:['https://agent.example','https://partner.example/','http://insecure.example','*','not-a-url'],
  search:async()=>({}),summary:()=>({}),listAutomations:()=>[],runAutomation:async()=>({}),listPrograms:()=>[],executeProgram:async()=>({})
 };
 const registry=createWebMcpRegistry(runtime);await registry.refresh();
 assert.ok(calls.length>=5);
 for(const call of calls){
  assert.deepEqual(call.options.exposedTo,['https://agent.example','https://partner.example']);
  assert.equal(call.options.exposedTo.includes('*'),false);
  assert.equal(call.options.exposedTo.some(origin=>origin.startsWith('http://')),false);
 }
 registry.dispose();
});

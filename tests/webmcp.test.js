import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebMcpRegistry} from '../src/webmcp.js';

test('WebMCP registers document.modelContext tools with abortable generations and plain results',async()=>{
 const calls=[];const mc={async registerTool(tool,{signal}){calls.push({tool,signal});}};
 let ws={version:1,knownWorks:{},savedWorks:{},runs:{},activity:[]};
 const runtime={modelContext:mc,getWorkspace:()=>ws,setWorkspace:x=>{ws=x},search:async q=>({query:q}),summary:()=>({saved:0}),listAutomations:()=>[],runAutomation:async id=>({id}),listPrograms:()=>[{name:'learned_x',description:'x',inputSchema:{type:'object',properties:{workId:{type:'string'}},required:['workId'],additionalProperties:false}}],executeProgram:async(name,input)=>({name,input})};
 const r=createWebMcpRegistry(runtime);await r.refresh();assert.ok(calls.length>=15);const firstSignal=calls[0].signal;const learned=calls.find(x=>x.tool.name==='learned_x').tool;assert.deepEqual(await learned.execute({workId:'W1'}),{name:'learned_x',input:{workId:'W1'}});await r.refresh();assert.equal(firstSignal.aborted,true);r.dispose();assert.equal(calls.at(-1).signal.aborted,true);
});

test('WebMCP forwards invocation AbortSignal to canonical, browser-state and learned operations',async()=>{
 const registered=[];const mc={async registerTool(tool){registered.push(tool);}};const seen={};
 const runtime={
  modelContext:mc,
  invokeCanonical:async(name,args,options)=>{seen.canonical={name,args,options};return{name};},
  search:async(query,limit,source,options)=>{seen.search={query,limit,source,options};return{query};},
  summary:()=>({}),listAutomations:()=>[],
  runAutomation:async(id,source,works,options)=>{seen.automation={id,source,works,options};return{id};},
  listPrograms:()=>[{name:'learned_x',description:'x',inputSchema:{type:'object',properties:{},additionalProperties:false}}],
  executeProgram:async(name,input,source,options)=>{seen.program={name,input,source,options};return{name};}
 };
 const registry=createWebMcpRegistry(runtime);await registry.refresh();const controller=new AbortController();const context={signal:controller.signal};
 await registered.find(x=>x.name==='kata_search_research').execute({query:'agents',limit:3},context);
 await registered.find(x=>x.name==='kata_browser_search_and_load_research').execute({query:'agents',limit:3},context);
 await registered.find(x=>x.name==='kata_browser_run_saved_automation').execute({automationId:'a1'},context);
 await registered.find(x=>x.name==='learned_x').execute({},context);
 assert.equal(seen.canonical.name,'kata_search_research');
 assert.equal(seen.canonical.options?.signal,controller.signal);
 assert.equal(seen.search.options?.signal,controller.signal);
 assert.equal(seen.automation.options?.signal,controller.signal);
 assert.equal(seen.program.options?.signal,controller.signal);
 registry.dispose();
});

test('WebMCP cross-origin exposure accepts potentially trustworthy local development origins without allowing insecure remote HTTP',async()=>{
 const calls=[];const mc={async registerTool(tool,options){calls.push({tool,options});}};
 const runtime={
  modelContext:mc,
  webMcpExposedTo:['https://agent.example','https://partner.example/','http://localhost:3000','http://127.0.0.1:5173','http://[::1]:4173','http://insecure.example','http://127.example','*','not-a-url'],
  search:async()=>({}),summary:()=>({}),listAutomations:()=>[],runAutomation:async()=>({}),listPrograms:()=>[],executeProgram:async()=>({})
 };
 const registry=createWebMcpRegistry(runtime);await registry.refresh();
 assert.ok(calls.length>=14);
 for(const call of calls){
  assert.deepEqual(call.options.exposedTo,['https://agent.example','https://partner.example','http://localhost:3000','http://127.0.0.1:5173','http://[::1]:4173']);
  assert.equal(call.options.exposedTo.includes('*'),false);
  assert.equal(call.options.exposedTo.includes('http://insecure.example'),false);
  assert.equal(call.options.exposedTo.includes('http://127.example'),false);
 }
 registry.dispose();
});

test('WebMCP isolates a rejected tool instead of unregistering healthy tools in the same refresh',async()=>{
 const calls=[];const statuses=[];
 const mc={async registerTool(tool,{signal}){calls.push({name:tool.name,signal});if(tool.name==='stale_bad')throw new Error('NATIVE_TOOL_REJECTED');}};
 const runtime={
  modelContext:mc,
  search:async()=>({}),summary:()=>({}),listAutomations:()=>[],runAutomation:async()=>({}),
  listPrograms:()=>[
   {name:'stale_bad',description:'stale persisted tool',inputSchema:{type:'object',properties:{},additionalProperties:false}},
   {name:'learned_good',description:'healthy learned tool',inputSchema:{type:'object',properties:{},additionalProperties:false}}
  ],
  executeProgram:async()=>({})
 };
 const registry=createWebMcpRegistry(runtime,status=>statuses.push(status));
 await registry.refresh();
 const status=statuses.at(-1);
 assert.equal(calls.find(x=>x.name==='kata_search_research').signal.aborted,false);
 assert.equal(calls.some(x=>x.name==='learned_good'),true);
 assert.ok(status.active.includes('kata_search_research'));
 assert.ok(status.active.includes('learned_good'));
 assert.deepEqual(status.rejected,[{name:'stale_bad',error:'NATIVE_TOOL_REJECTED'}]);
 assert.equal(status.error,null);
 registry.dispose();
});

test('WebMCP discovers only browser-authorized cross-origin descendant tools without executing them',async()=>{
 const registered=[];const seen=[];let executed=false;
 const mc={
  async registerTool(tool){registered.push(tool);},
  async getTools(options){seen.push(options);return[
   {name:'partner_lookup',title:'Partner lookup',description:'Read partner data',origin:'https://partner.example',inputSchema:{type:'object'},annotations:{readOnlyHint:true,untrustedContentHint:true,consequentialHint:false},execute:()=>{executed=true;}},
   {name:'same_origin_tool',description:'Same-origin tool',origin:'https://kata.example',annotations:{readOnlyHint:true}}
  ];}
 };
 const runtime={modelContext:mc,search:async()=>({}),summary:()=>({}),listAutomations:()=>[],runAutomation:async()=>({}),listPrograms:()=>[],executeProgram:async()=>({})};
 const registry=createWebMcpRegistry(runtime);await registry.refresh();
 const tool=registered.find(x=>x.name==='kata_browser_discover_webmcp_tools');
 const out=await tool.execute({fromOrigins:['https://partner.example/','http://localhost:3000'],maxTools:1},{signal:new AbortController().signal});
 assert.deepEqual(seen,[{fromOrigins:['https://partner.example','http://localhost:3000']}]);
 assert.equal(executed,false);
 assert.equal(out.totalObserved,2);assert.equal(out.truncated,true);assert.equal(out.tools.length,1);
 assert.deepEqual(out.tools[0],{name:'partner_lookup',title:'Partner lookup',description:'Read partner data',origin:'https://partner.example',annotations:{readOnlyHint:true,untrustedContentHint:true,consequentialHint:false}});
 assert.equal('execute' in out.tools[0],false);assert.equal('window' in out.tools[0],false);assert.equal('inputSchema' in out.tools[0],false);
 registry.dispose();
});

test('WebMCP cross-origin discovery rejects insecure or non-origin requests before calling getTools',async()=>{
 const registered=[];let calls=0;const mc={async registerTool(tool){registered.push(tool);},async getTools(){calls++;return[];}};
 const runtime={modelContext:mc,search:async()=>({}),summary:()=>({}),listAutomations:()=>[],runAutomation:async()=>({}),listPrograms:()=>[],executeProgram:async()=>({})};
 const registry=createWebMcpRegistry(runtime);await registry.refresh();const tool=registered.find(x=>x.name==='kata_browser_discover_webmcp_tools');
 await assert.rejects(()=>tool.execute({fromOrigins:['http://insecure.example']}),/WEBMCP_INVALID_ORIGIN/);
 await assert.rejects(()=>tool.execute({fromOrigins:['https://partner.example/path']}),/WEBMCP_INVALID_ORIGIN/);
 assert.equal(calls,0);registry.dispose();
});

test('WebMCP cross-origin discovery fails explicitly when getTools is unavailable',async()=>{
 const registered=[];const mc={async registerTool(tool){registered.push(tool);}};
 const runtime={modelContext:mc,search:async()=>({}),summary:()=>({}),listAutomations:()=>[],runAutomation:async()=>({}),listPrograms:()=>[],executeProgram:async()=>({})};
 const registry=createWebMcpRegistry(runtime);await registry.refresh();const tool=registered.find(x=>x.name==='kata_browser_discover_webmcp_tools');
 await assert.rejects(()=>tool.execute({fromOrigins:['https://partner.example']}),/WEBMCP_GET_TOOLS_UNAVAILABLE/);registry.dispose();
});

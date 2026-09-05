import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebMcpRegistry} from '../src/webmcp.js';

test('WebMCP registers document.modelContext tools with abortable generations and plain results',async()=>{
 const calls=[];const mc={async registerTool(tool,{signal}){calls.push({tool,signal});}};
 let ws={version:1,knownWorks:{},savedWorks:{},runs:{},activity:[]};
 const runtime={modelContext:mc,getWorkspace:()=>ws,setWorkspace:x=>{ws=x},search:async q=>({query:q}),summary:()=>({saved:0}),listAutomations:()=>[],runAutomation:async id=>({id}),listPrograms:()=>[{name:'learned_x',description:'x',inputSchema:{type:'object',properties:{workId:{type:'string'}},required:['workId'],additionalProperties:false}}],executeProgram:async(name,input)=>({name,input})};
 const r=createWebMcpRegistry(runtime);await r.refresh();assert.ok(calls.length>=6);const firstSignal=calls[0].signal;const learned=calls.find(x=>x.tool.name==='learned_x').tool;assert.deepEqual(await learned.execute({workId:'W1'}),{name:'learned_x',input:{workId:'W1'}});await r.refresh();assert.equal(firstSignal.aborted,true);r.dispose();assert.equal(calls.at(-1).signal.aborted,true);
});

test('WebMCP forwards execution AbortSignal to cancellable runtime operations',async()=>{
 const registered=[];const calls=[];
 const runtime={
  modelContext:{async registerTool(tool){registered.push(tool);}},
  search(...args){calls.push(['search',args]);return Promise.resolve({ok:true});},
  summary(){return {ok:true};},
  listAutomations(){return [];},
  runAutomation(...args){calls.push(['runAutomation',args]);return Promise.resolve({ok:true});},
  listPrograms(){return [{name:'learned_tool',description:'learned',inputSchema:{type:'object',properties:{},additionalProperties:false}}];},
  executeProgram(...args){calls.push(['executeProgram',args]);return Promise.resolve({ok:true});}
 };
 const registry=createWebMcpRegistry(runtime);await registry.refresh();
 const signal=new AbortController().signal;
 await registered.find(tool=>tool.name==='kata_search_research').execute({query:'agents',limit:4},{signal});
 await registered.find(tool=>tool.name==='kata_run_automation').execute({automationId:'a1'},{signal});
 await registered.find(tool=>tool.name==='learned_tool').execute({value:1},{signal});
 assert.equal(calls.find(([name])=>name==='search')[1][3],signal);
 assert.equal(calls.find(([name])=>name==='runAutomation')[1][2],signal);
 assert.equal(calls.find(([name])=>name==='executeProgram')[1][3],signal);
});

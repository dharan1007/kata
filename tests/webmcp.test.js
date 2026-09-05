import test from 'node:test';import assert from 'node:assert/strict';import {createWebMcpRegistry} from '../src/webmcp.js';

test('WebMCP registers document.modelContext tools with abortable generations and plain results',async()=>{
 const calls=[];const mc={async registerTool(tool,{signal}){calls.push({tool,signal});}};
 let ws={version:1,knownWorks:{},savedWorks:{},runs:{},activity:[]};
 const runtime={modelContext:mc,getWorkspace:()=>ws,setWorkspace:x=>{ws=x},search:async q=>({query:q}),summary:()=>({saved:0}),listAutomations:()=>[],runAutomation:async id=>({id}),listPrograms:()=>[{name:'learned_x',description:'x',inputSchema:{type:'object',properties:{workId:{type:'string'}},required:['workId'],additionalProperties:false}}],executeProgram:async(name,input)=>({name,input})};
 const r=createWebMcpRegistry(runtime);await r.refresh();assert.ok(calls.length>=6);const firstSignal=calls[0].signal;const learned=calls.find(x=>x.tool.name==='learned_x').tool;assert.deepEqual(await learned.execute({workId:'W1'}),{name:'learned_x',input:{workId:'W1'}});await r.refresh();assert.equal(firstSignal.aborted,true);r.dispose();assert.equal(calls.at(-1).signal.aborted,true);
});

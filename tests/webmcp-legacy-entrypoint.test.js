import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebMcpRegistry} from '../src/webmcp.js';

function restoreGlobal(name,descriptor){
  if(descriptor)Object.defineProperty(globalThis,name,descriptor);
  else delete globalThis[name];
}

test('WebMCP falls back to navigator.modelContext during the Chromium transition',async()=>{
  const documentDescriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
  const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const calls=[];
  const mc={async registerTool(tool,options){calls.push({tool,options});}};
  try{
    Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{}});
    Object.defineProperty(globalThis,'navigator',{configurable:true,writable:true,value:{modelContext:mc}});
    const runtime={
      search:async()=>({}),
      summary:()=>({}),
      listAutomations:()=>[],
      runAutomation:async()=>({}),
      listPrograms:()=>[],
      executeProgram:async()=>({})
    };
    let status=null;
    const registry=createWebMcpRegistry(runtime,value=>{status=value;});
    await registry.refresh();
    assert.equal(status?.supported,true);
    assert.ok(calls.length>=5);
    registry.dispose();
  }finally{
    restoreGlobal('document',documentDescriptor);
    restoreGlobal('navigator',navigatorDescriptor);
  }
});

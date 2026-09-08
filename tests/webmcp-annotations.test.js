import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebMcpRegistry} from '../src/webmcp.js';

function runtimeFixture(){
  const registered=[];
  const runtime={
    modelContext:{
      async registerTool(tool){registered.push(structuredClone(tool));}
    },
    search:async()=>({}),
    summary:()=>({}),
    listAutomations:()=>[],
    runAutomation:async()=>({}),
    listPrograms:()=>[{name:'learned_tool',description:'learned',inputSchema:{type:'object',properties:{},additionalProperties:false}}],
    executeProgram:async()=>({})
  };
  return{runtime,registered};
}

const standardKeys=new Set(['readOnlyHint','destructiveHint','idempotentHint','openWorldHint']);

test('browser WebMCP tools expose only standardized MCP risk annotations',async()=>{
  const {runtime,registered}=runtimeFixture();
  const registry=createWebMcpRegistry(runtime);
  await registry.refresh();

  assert.equal(registered.length,6);
  for(const tool of registered){
    assert.ok(tool.annotations&&typeof tool.annotations==='object',`${tool.name} is missing annotations`);
    assert.equal(Object.hasOwn(tool.annotations,'untrustedContentHint'),false,`${tool.name} exposes stale non-standard untrustedContentHint`);
    for(const key of Object.keys(tool.annotations))assert.ok(standardKeys.has(key),`${tool.name} exposes non-standard annotation ${key}`);
    assert.equal(typeof tool.annotations.readOnlyHint,'boolean',`${tool.name} must declare readOnlyHint`);
    assert.equal(typeof tool.annotations.openWorldHint,'boolean',`${tool.name} must declare openWorldHint`);
  }

  const byName=Object.fromEntries(registered.map(tool=>[tool.name,tool]));
  assert.deepEqual(byName.kata_search_research.annotations,{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true});
  assert.deepEqual(byName.kata_workspace_summary.annotations,{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false});
  assert.deepEqual(byName.kata_list_automations.annotations,{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false});
  assert.deepEqual(byName.kata_run_automation.annotations,{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true});
  assert.deepEqual(byName.kata_list_learned_tools.annotations,{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false});
  assert.deepEqual(byName.learned_tool.annotations,{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false});
});

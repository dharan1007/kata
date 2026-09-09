import test from 'node:test';
import assert from 'node:assert/strict';
import {toolDefinitions} from '../lib/server/tools.js';
import {createWebMcpRegistry} from '../src/webmcp.js';

function makeRuntime(){
  const registered=[];
  const seen={canonical:[],browserSearch:[]};
  const modelContext={async registerTool(tool,options){registered.push({tool,options});}};
  const runtime={
    modelContext,
    async invokeCanonical(name,args,options={}){seen.canonical.push({name,args,options});return{surface:'canonical',name,args};},
    async search(query,limit,source,options={}){seen.browserSearch.push({query,limit,source,options});return{surface:'browser',query,limit};},
    summary:()=>({savedWorks:2}),
    listAutomations:()=>[{id:'a1',name:'Saved automation'}],
    async runAutomation(id,source,works,options={}){return{id,source,works,signal:options.signal??null};},
    listPrograms:()=>[],
    async executeProgram(name,input){return{name,input}}
  };
  return{runtime,registered,seen};
}

const byName=registered=>new Map(registered.map(x=>[x.tool.name,x.tool]));

test('WebMCP exposes every canonical tool with the same contract metadata',async()=>{
  const {runtime,registered}=makeRuntime();
  const registry=createWebMcpRegistry(runtime);await registry.refresh();
  const tools=byName(registered);
  for(const def of toolDefinitions){
    const browser=tools.get(def.name);
    assert.ok(browser,`missing canonical WebMCP tool ${def.name}`);
    assert.equal(browser.description,def.description,`${def.name} description drifted`);
    assert.deepEqual(browser.inputSchema,def.inputSchema,`${def.name} input schema drifted`);
  }
  assert.equal(tools.get('kata_search_research').annotations.readOnlyHint,true);
  assert.deepEqual(tools.get('kata_run_automation').inputSchema.required,['workspace','works','automation','previewFingerprint']);
  registry.dispose();
});

test('canonical WebMCP execution delegates to the canonical invoke path without browser workspace side effects',async()=>{
  const {runtime,registered,seen}=makeRuntime();
  const registry=createWebMcpRegistry(runtime);await registry.refresh();
  const tools=byName(registered);const controller=new AbortController();
  const result=await tools.get('kata_search_research').execute({query:'agents',limit:3},{signal:controller.signal});
  assert.deepEqual(result,{surface:'canonical',name:'kata_search_research',args:{query:'agents',limit:3}});
  assert.equal(seen.canonical.length,1);
  assert.equal(seen.canonical[0].name,'kata_search_research');
  assert.equal(seen.canonical[0].options.signal,controller.signal);
  assert.equal(seen.browserSearch.length,0);
  registry.dispose();
});

test('browser-owned stateful actions use explicit browser-scoped names',async()=>{
  const {runtime,registered,seen}=makeRuntime();
  const registry=createWebMcpRegistry(runtime);await registry.refresh();
  const tools=byName(registered);
  for(const name of ['kata_browser_search_and_load_research','kata_browser_workspace_summary','kata_browser_list_automations','kata_browser_run_saved_automation','kata_browser_list_learned_tools'])assert.ok(tools.has(name),`missing ${name}`);
  const controller=new AbortController();
  await tools.get('kata_browser_search_and_load_research').execute({query:'web agents',limit:5},{signal:controller.signal});
  assert.equal(seen.browserSearch.length,1);
  assert.equal(seen.browserSearch[0].source,'agent');
  assert.equal(seen.browserSearch[0].options.signal,controller.signal);
  registry.dispose();
});

test('learned tools cannot shadow canonical or browser-owned tool names',async()=>{
  const statuses=[];const {runtime,registered}=makeRuntime();
  runtime.listPrograms=()=>[
    {name:'kata_search_research',description:'collision',inputSchema:{type:'object',properties:{},additionalProperties:false}},
    {name:'kata_browser_workspace_summary',description:'collision',inputSchema:{type:'object',properties:{},additionalProperties:false}},
    {name:'learned_safe',description:'safe',inputSchema:{type:'object',properties:{},additionalProperties:false}}
  ];
  const registry=createWebMcpRegistry(runtime,status=>statuses.push(status));await registry.refresh();
  const tools=byName(registered);
  assert.ok(tools.has('learned_safe'));
  assert.equal(registered.filter(x=>x.tool.name==='kata_search_research').length,1);
  assert.equal(registered.filter(x=>x.tool.name==='kata_browser_workspace_summary').length,1);
  assert.deepEqual(statuses.at(-1).collisions,['kata_browser_workspace_summary','kata_search_research']);
  registry.dispose();
});

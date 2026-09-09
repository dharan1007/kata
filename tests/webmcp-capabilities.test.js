import test from 'node:test';
import assert from 'node:assert/strict';
import capabilities from '../api/capabilities.js';
import {toolDefinitions} from '../lib/server/tools.js';

function res(){return{statusCode:200,headers:{},body:null,status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};}

test('/api/capabilities publishes canonical WebMCP parity and explicit browser-owned tools',async()=>{
  const r=res();await capabilities({method:'GET',headers:{}},r);
  const webmcp=r.body.capabilities.webmcp;
  assert.equal(r.statusCode,200);
  assert.equal(webmcp.entryPoint,'document.modelContext');
  assert.equal(webmcp.canonicalToolParity,true);
  assert.equal(webmcp.canonicalExecutionEndpoint,'/api/invoke');
  assert.deepEqual(webmcp.canonicalTools,toolDefinitions.map(t=>t.name));
  assert.equal(webmcp.browserToolPrefix,'kata_browser_');
  assert.deepEqual(webmcp.browserTools,[
    'kata_browser_search_and_load_research',
    'kata_browser_workspace_summary',
    'kata_browser_list_automations',
    'kata_browser_run_saved_automation',
    'kata_browser_list_learned_tools'
  ]);
});

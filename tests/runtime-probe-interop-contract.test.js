import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectBrowserRuntime} from '../src/runtime-probe.js';
import {createToolRegistry,toolDefinitions,toOpenAIResponsesTools,toAnthropicTools,toGeminiFunctionDeclarations} from '../lib/server/tools.js';

function minimalDocument(){
  return{
    URL:'https://example.test/',
    documentElement:null,
    querySelector(){return null;},
    querySelectorAll(){return[];}
  };
}

function serverAvailabilitySchema(tool){
  return tool.inputSchema.properties.environment.properties.serverSideApiAvailable;
}

test('browser runtime probe output is accepted by canonical interop diagnosis',async()=>{
  const probe=inspectBrowserRuntime({document:minimalDocument(),window:null,navigator:null,isSecureContext:true});
  assert.equal(probe.environment.serverSideApiAvailable,'unknown');
  const result=await createToolRegistry({openAlex:async()=>({works:[]})}).invoke('kata_diagnose_web_interop',{
    intent:'call_api',
    environment:probe.environment
  });
  assert.equal(result.status,'unknown');
  assert.equal(result.primaryPath,'server_api');
  assert.equal(result.paths.server_api.status,'unknown');
});

test('server-side API availability stays tri-state across canonical model tool projections',()=>{
  const canonical=toolDefinitions.find(tool=>tool.name==='kata_diagnose_web_interop');
  const openai=toOpenAIResponsesTools().find(tool=>tool.name==='kata_diagnose_web_interop');
  const anthropic=toAnthropicTools().find(tool=>tool.name==='kata_diagnose_web_interop');
  const gemini=toGeminiFunctionDeclarations().find(tool=>tool.name==='kata_diagnose_web_interop');
  for(const schema of[
    serverAvailabilitySchema(canonical),
    serverAvailabilitySchema({inputSchema:openai.parameters}),
    serverAvailabilitySchema({inputSchema:anthropic.input_schema}),
    serverAvailabilitySchema({inputSchema:gemini.parameters})
  ]){
    assert.deepEqual(schema.enum,[true,false,'unknown']);
    assert.equal(schema.type,undefined);
  }
});

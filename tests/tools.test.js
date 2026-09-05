import test from 'node:test';
import assert from 'node:assert/strict';
import {createToolRegistry, toolDefinitions, toOpenAITools, toAnthropicTools, toGeminiInteractionTools, toGeminiFunctionDeclarations} from '../lib/server/tools.js';
import {createWorkspace} from '../lib/server/engine.js';

test('tool schemas reject unexpected inputs before handlers run',async()=>{
 const reg=createToolRegistry({openAlex:async()=>({works:[]})});
 await assert.rejects(()=>reg.invoke('kata_plan_triage',{query:'x',bogus:true}),/INVALID_ARGUMENTS/);
});

test('agent bridges derive from the same canonical registry',()=>{
 assert.equal(toOpenAITools().length,toolDefinitions.length); assert.equal(toAnthropicTools().length,toolDefinitions.length); assert.equal(toGeminiInteractionTools().length,toolDefinitions.length); assert.equal(toGeminiFunctionDeclarations().length,toolDefinitions.length);
 assert.equal(toOpenAITools()[0].type,'function'); assert.ok(toAnthropicTools()[0].input_schema);
 const interaction=toGeminiInteractionTools()[0];assert.equal(interaction.type,'function');assert.equal(interaction.name,toolDefinitions[0].name);assert.deepEqual(interaction.parameters,toolDefinitions[0].inputSchema);
 const declaration=toGeminiFunctionDeclarations()[0];assert.equal(declaration.name,toolDefinitions[0].name);assert.deepEqual(declaration.parameters,toolDefinitions[0].inputSchema);
});

test('recursive tool invocation is capped',async()=>{
 const reg=createToolRegistry({openAlex:async()=>({works:[]})}); const ws=createWorkspace();
 await assert.rejects(()=>reg.invoke('kata_run_automation',{workspace:ws,works:[{id:'W1',title:'x',year:2026,citations:1,authors:[]}],automation:{name:'loop',trigger:'MANUAL',actions:[{kind:'RUN_TOOL',name:'kata_run_automation',input:{workspace:ws,works:[],automation:{name:'inner',trigger:'MANUAL',actions:[{kind:'SAVE_WORK'}]}}}]},previewFingerprint:'bad'},{depth:4}),/TOOL_DEPTH_EXCEEDED/);
});

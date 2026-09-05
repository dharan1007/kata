import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand, createWorkspace, compileDemos, executeProgram, createAutomation, previewAutomation, runAutomation} from '../lib/server/engine.js';

const works=[
 {id:'W1',title:'One',year:2026,citations:100,authors:['A']},
 {id:'W2',title:'Two',year:2025,citations:60,authors:['B']},
 {id:'W3',title:'Three',year:2020,citations:500,authors:['C']},
];
function seeded(){const ws=createWorkspace(); for(const w of works)ws.knownWorks[w.id]=w; return ws;}

test('commands validate state and stay idempotent',()=>{
 let ws=seeded(); ws=applyCommand(ws,{kind:'SAVE_WORK',args:{workId:'W1'}}); ws=applyCommand(ws,{kind:'SAVE_WORK',args:{workId:'W1'}});
 assert.equal(Object.keys(ws.savedWorks).length,1);
 assert.throws(()=>applyCommand(ws,{kind:'ADD_TAG',args:{workId:'W2',tag:'x'}}),/WORK_NOT_SAVED/);
});

test('compiler anti-unifies two typed demonstrations',()=>{
 const p=compileDemos('triage paper',[
  {kind:'SAVE_WORK',args:{workId:'W1'}},{kind:'ADD_TAG',args:{workId:'W1',tag:'agents'}}
 ],[
  {kind:'SAVE_WORK',args:{workId:'W2'}},{kind:'ADD_TAG',args:{workId:'W2',tag:'agents'}}
 ]);
 assert.equal(p.name,'triage_paper'); assert.deepEqual(p.inputSchema.required,['workId']);
 let ws=seeded(); const out=executeProgram(p,{workId:'W3'},ws); assert.ok(out.workspace.savedWorks.W3); assert.deepEqual(out.workspace.savedWorks.W3.tags,['agents']);
});

test('compiler rejects unsupported semantic command kinds',()=>{
 assert.throws(()=>compileDemos('bad',[{kind:'DELETE_WORK',args:{workId:'W1'}}],[{kind:'DELETE_WORK',args:{workId:'W2'}}]),/INVALID_COMMAND_KIND/);
});

test('unsupported automation triggers are rejected, never silently downgraded',()=>{
 assert.throws(()=>createAutomation({name:'x',trigger:'WEBHOOK',actions:[{kind:'SAVE_WORK'}]}),/INVALID_TRIGGER/);
});

test('preview fingerprint changes when automation or candidates change',()=>{
 const ws=seeded();
 const a=createAutomation({name:'x',trigger:'MANUAL',filters:{minYear:2025},actions:[{kind:'SAVE_WORK'}]});
 const p1=previewAutomation(a,works,ws); const p2=previewAutomation({...a,maxItemsPerRun:1},works,ws); const p3=previewAutomation(a,works.slice(0,1),ws);
 assert.notEqual(p1.fingerprint,p2.fingerprint); assert.notEqual(p1.fingerprint,p3.fingerprint);
});

test('RUN_TOOL executes through injected runtime transactionally and depth is bounded',async()=>{
 const ws=seeded();
 const a=createAutomation({name:'x',trigger:'MANUAL',actions:[{kind:'SAVE_WORK'},{kind:'RUN_TOOL',name:'tag_current',input:{workId:{$workId:true}}}]});
 const runtime=async(name,input,current,{depth})=>{
   assert.equal(name,'tag_current'); assert.equal(depth,1);
   return {workspace:applyCommand(current,{kind:'ADD_TAG',args:{workId:input.workId,tag:'runtime'}})};
 };
 const preview=previewAutomation(a,[works[0]],ws);
 const out=await runAutomation(a,[works[0]],ws,{expectedFingerprint:preview.fingerprint,invokeTool:runtime});
 assert.equal(out.receipt.status,'success'); assert.deepEqual(out.workspace.savedWorks.W1.tags,['runtime']);
 const bad=async()=>{throw new Error('TOOL_FAILED')};
 const failed=await runAutomation(a,[works[1]],ws,{expectedFingerprint:previewAutomation(a,[works[1]],ws).fingerprint,invokeTool:bad});
 assert.equal(failed.receipt.status,'failed'); assert.equal(failed.workspace.savedWorks.W2,undefined);
});

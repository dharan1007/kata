import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/app.js';

const GLOBALS=['window','location','history','localStorage','document','fetch'];
function installGlobal(name,value){Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});}
function jsonResponse(body){return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});}
function emptyWorkspace(){return{version:1,knownWorks:{},savedWorks:{},runs:{},activity:[]};}

function installBrowserHarness({store,tools,fetchImpl}){
 installGlobal('localStorage',{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)});
 installGlobal('location',{pathname:'/dashboard'});
 installGlobal('history',{pushState(){}});
 installGlobal('window',{addEventListener(){},removeEventListener(){},scrollTo(){}});
 installGlobal('document',{modelContext:{async registerTool(tool){tools.set(tool.name,tool);}}});
 installGlobal('fetch',fetchImpl);
 return{innerHTML:'',addEventListener(){},querySelector(){return null;}};
}

async function withRestoredGlobals(run){
 const saved=new Map(GLOBALS.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 try{return await run();}
 finally{for(const name of GLOBALS){const descriptor=saved.get(name);if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
}

test('aborting a WebMCP search aborts the underlying fetch and prevents workspace commit',async()=>withRestoredGlobals(async()=>{
 const store=new Map(),tools=new Map();let searchSignal=null;let app;
 try{
  const root=installBrowserHarness({store,tools,fetchImpl:(path,options={})=>{
   if(path==='/api/health')return Promise.resolve(jsonResponse({ok:true,service:'kata-webmcp',version:'3.0.0',apiVersion:'v2'}));
   if(String(path).startsWith('/api/search?')){
    searchSignal=options.signal??null;
    return new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>resolve(jsonResponse({ok:true,works:[{id:'W1',title:'Should not commit',year:2026,citations:1,authors:[]}],meta:{source:'openalex'}})),30);
     if(options.signal){
      const abort=()=>{clearTimeout(timer);reject(options.signal.reason??new DOMException('Aborted','AbortError'));};
      if(options.signal.aborted)abort();else options.signal.addEventListener('abort',abort,{once:true});
     }
    });
   }
   throw new Error(`UNEXPECTED_FETCH:${path}`);
  }});
  app=createApp(root);await new Promise(resolve=>setImmediate(resolve));
  const searchTool=tools.get('kata_search_research');assert.ok(searchTool,'search tool registered');
  const controller=new AbortController();const execution=searchTool.execute({query:'cancel me',limit:1},{signal:controller.signal});controller.abort();
  await assert.rejects(execution,error=>error?.name==='AbortError');
  assert.equal(searchSignal,controller.signal);
  const persisted=store.get('kata.v3.local');
  if(persisted)assert.equal(JSON.parse(persisted).workspace.knownWorks.W1,undefined);
 } finally {app?.dispose();}
}));

test('cancelling during AFTER_SEARCH automation rolls back the whole WebMCP search transaction',async()=>withRestoredGlobals(async()=>{
 const store=new Map(),tools=new Map();let app;let runSignal=null;let runStartedResolve;
 const runStarted=new Promise(resolve=>{runStartedResolve=resolve;});
 const initial={
  workspace:emptyWorkspace(),results:[],automations:[{id:'auto-1',name:'Auto 1',trigger:'AFTER_SEARCH',filters:{},actions:[{kind:'SAVE_WORK'}],maxItemsPerRun:1,enabled:true}],programs:[],activity:[],demos:{A:[],B:[]},recording:null,lastQuery:'before'
 };
 store.set('kata.v3.local',JSON.stringify(initial));
 try{
  const root=installBrowserHarness({store,tools,fetchImpl:async(path,options={})=>{
   if(path==='/api/health')return jsonResponse({ok:true,service:'kata-webmcp',version:'3.0.0',apiVersion:'v2'});
   if(String(path).startsWith('/api/search?'))return jsonResponse({ok:true,works:[{id:'W1',title:'Transient result',year:2026,citations:1,authors:[]}],meta:{source:'openalex'}});
   if(path==='/api/invoke'){
    const request=JSON.parse(options.body);
    if(request.name==='kata_preview_automation')return jsonResponse({ok:true,result:{automation:request.arguments.automation,preview:{fingerprint:'a'.repeat(64),matches:['W1'],plannedOperations:1}}});
    if(request.name==='kata_run_automation'){
     runSignal=options.signal??null;runStartedResolve();
     return new Promise((resolve,reject)=>{
      const abort=()=>reject(options.signal?.reason??new DOMException('Aborted','AbortError'));
      if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
     });
    }
   }
   throw new Error(`UNEXPECTED_FETCH:${path}`);
  }});
  app=createApp(root);await new Promise(resolve=>setImmediate(resolve));
  const searchTool=tools.get('kata_search_research');assert.ok(searchTool,'search tool registered');
  const controller=new AbortController();const execution=searchTool.execute({query:'atomic cancel',limit:1},{signal:controller.signal});
  await runStarted;controller.abort();
  await assert.rejects(execution,error=>error?.name==='AbortError');
  assert.equal(runSignal,controller.signal);
  const persisted=JSON.parse(store.get('kata.v3.local'));
  assert.deepEqual(persisted.workspace,initial.workspace);
  assert.deepEqual(persisted.results,initial.results);
  assert.deepEqual(persisted.activity,initial.activity);
  assert.equal(persisted.lastQuery,initial.lastQuery);
  assert.deepEqual(persisted.automations,initial.automations);
 } finally {app?.dispose();}
}));

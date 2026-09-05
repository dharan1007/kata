import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/app.js';

const GLOBALS=['window','location','history','localStorage','document','fetch'];
function installGlobal(name,value){Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});}
function jsonResponse(body){return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});}

test('aborting a WebMCP search aborts the underlying fetch and prevents workspace commit',async()=>{
 const saved=new Map(GLOBALS.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const store=new Map(),tools=new Map();let searchSignal=null;let app;
 try{
  installGlobal('localStorage',{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)});
  installGlobal('location',{pathname:'/dashboard'});
  installGlobal('history',{pushState(){}});
  installGlobal('window',{addEventListener(){},removeEventListener(){},scrollTo(){}});
  installGlobal('document',{modelContext:{async registerTool(tool){tools.set(tool.name,tool);}}});
  installGlobal('fetch',(path,options={})=>{
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
  });
  const root={innerHTML:'',addEventListener(){},querySelector(){return null;}};
  app=createApp(root);await new Promise(resolve=>setImmediate(resolve));
  const searchTool=tools.get('kata_search_research');assert.ok(searchTool,'search tool registered');
  const controller=new AbortController();const execution=searchTool.execute({query:'cancel me',limit:1},{signal:controller.signal});controller.abort();
  await assert.rejects(execution,error=>error?.name==='AbortError');
  assert.equal(searchSignal,controller.signal);
  const persisted=store.get('kata.v3.local');
  if(persisted)assert.equal(JSON.parse(persisted).workspace.knownWorks.W1,undefined);
 } finally {
  app?.dispose();
  for(const name of GLOBALS){const descriptor=saved.get(name);if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
 }
});

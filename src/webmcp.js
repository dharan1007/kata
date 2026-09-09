import {toolDefinitions} from '../lib/shared/tool-contracts.js';
import {inspectBrowserRuntime} from './runtime-probe.js';

function getModelContext(runtime){return runtime.modelContext??globalThis.document?.modelContext??globalThis.navigator?.modelContext??null;}
function isPotentiallyTrustworthyOrigin(url){
 const protocol=url.protocol.toLowerCase(),host=url.hostname.toLowerCase().replace(/\.$/,'');
 if(protocol==='https:')return true;
 if(protocol!=='http:')return false;
 if(host==='localhost'||host.endsWith('.localhost')||host==='[::1]'||host==='::1'||/^127(?:\.\d{1,3}){3}$/.test(host))return true;
 return false;
}
function secureOrigins(values){
 const out=[];for(const raw of Array.isArray(values)?values:[]){try{const url=new URL(String(raw));if(!isPotentiallyTrustworthyOrigin(url)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)continue;const origin=url.origin;if(origin!=='null'&&!out.includes(origin))out.push(origin);}catch{}}
 return out;
}
function exposureConfig(runtime){
 const configured=runtime.webMcpExposedTo??globalThis.document?.querySelector?.('meta[name="kata-webmcp-exposed-to"]')?.content?.split(',').map(x=>x.trim()).filter(Boolean)??[];
 return secureOrigins(configured);
}
function browserAnnotations(annotations={}){
 const out={};
 if('readOnlyHint'in annotations)out.readOnlyHint=Boolean(annotations.readOnlyHint);
 if('untrustedContentHint'in annotations)out.untrustedContentHint=Boolean(annotations.untrustedContentHint);
 return out;
}
async function invokeCanonical(runtime,name,args,signal){
 if(typeof runtime.invokeCanonical==='function')return runtime.invokeCanonical(name,args,{signal});
 signal?.throwIfAborted();
 const response=await fetch('/api/invoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,arguments:args}),signal});
 let data;try{data=await response.json();}catch(error){if(signal?.aborted)throw signal.reason??error;throw new Error(`HTTP_${response.status}`);}
 signal?.throwIfAborted();
 if(!response.ok||data.ok===false){const error=new Error(data?.error?.code??`HTTP_${response.status}`);error.details=data?.error?.details;throw error;}
 return data.result;
}
function canonicalTools(runtime){
 return toolDefinitions.map(def=>({
  name:def.name,
  description:def.description,
  inputSchema:structuredClone(def.inputSchema),
  annotations:browserAnnotations(def.annotations),
  execute:(input,context={})=>invokeCanonical(runtime,def.name,input,context.signal)
 }));
}
function browserTools(runtime){
 const searchSchema=toolDefinitions.find(x=>x.name==='kata_search_research').inputSchema;
 return[
  {name:'kata_browser_inspect_runtime',description:'Inspect the current host document for directly observable WebMCP, browser policy, frame, framework, DOM topology and declared API evidence without probing protected resources or guessing security state.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>inspectBrowserRuntime({document:globalThis.document,window:globalThis.window,navigator:globalThis.navigator,isSecureContext:globalThis.isSecureContext})},
  {name:'kata_browser_search_and_load_research',description:'Search live OpenAlex research and load the results into this browser-owned KATA workspace.',inputSchema:structuredClone(searchSchema),annotations:{readOnlyHint:false,untrustedContentHint:true},execute:({query,limit=8},context={})=>runtime.search(query,limit,'agent',{signal:context.signal})},
  {name:'kata_browser_workspace_summary',description:'Read the current browser-owned KATA workspace summary.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>runtime.summary()},
  {name:'kata_browser_list_automations',description:'List automations saved in this browser-owned KATA workspace.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>runtime.listAutomations()},
  {name:'kata_browser_run_saved_automation',description:'Preview and run a saved browser-owned KATA automation by ID against the current candidates.',inputSchema:{type:'object',properties:{automationId:{type:'string',minLength:1}},required:['automationId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:({automationId},context={})=>runtime.runAutomation(automationId,'agent',undefined,{signal:context.signal})},
  {name:'kata_browser_list_learned_tools',description:'List deterministic tools learned in this browser-owned KATA workspace.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>runtime.listPrograms()}
 ];
}
export function createWebMcpRegistry(runtime,onStatus=()=>{}){
  let controller=null;
  async function refresh(){
    controller?.abort();controller=new AbortController();const mc=getModelContext(runtime);if(!mc?.registerTool){onStatus({supported:false,active:[],collisions:[],error:null});return;}
    const tools=[...canonicalTools(runtime),...browserTools(runtime)];
    const reserved=new Set(tools.map(x=>x.name)),collisions=[];
    for(const p of runtime.listPrograms()){
      if(reserved.has(p.name)){collisions.push(p.name);continue;}
      reserved.add(p.name);
      tools.push({name:p.name,description:p.description,inputSchema:p.inputSchema,annotations:{readOnlyHint:false,untrustedContentHint:false},execute:(input,context={})=>runtime.executeProgram(p.name,input,'agent',{signal:context.signal})});
    }
    collisions.sort();
    const exposedTo=exposureConfig(runtime),registrationOptions={signal:controller.signal,...(exposedTo.length?{exposedTo}:{})};
    const active=[];try{for(const tool of tools){await mc.registerTool(tool,registrationOptions);active.push(tool.name);}onStatus({supported:true,active,collisions,error:null,...(exposedTo.length?{exposedTo}:{})});}catch(error){controller.abort();onStatus({supported:true,active:[],collisions,error:error instanceof Error?error.message:String(error),...(exposedTo.length?{exposedTo}:{})});}
  }
  return{refresh,dispose(){controller?.abort();controller=null;}};
}

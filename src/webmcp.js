import {toolDefinitions} from '../lib/shared/tool-contracts.js';
import {inspectBrowserRuntime} from './runtime-probe.js';
import {discoverBrowserApis} from './api-discovery.js';
import {compileOpenApiCandidates} from './api-adapter.js';

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
function requestedOrigins(values){
 if(!Array.isArray(values)||values.length<1||values.length>8)throw new Error('WEBMCP_INVALID_ORIGINS');
 const out=[];
 for(const raw of values){
  let url;try{url=new URL(String(raw));}catch{throw new Error('WEBMCP_INVALID_ORIGIN');}
  if(!isPotentiallyTrustworthyOrigin(url)||url.username||url.password||url.pathname!=='/'||url.search||url.hash||url.origin==='null')throw new Error('WEBMCP_INVALID_ORIGIN');
  if(!out.includes(url.origin))out.push(url.origin);
 }
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
 if('consequentialHint'in annotations)out.consequentialHint=Boolean(annotations.consequentialHint);
 return out;
}
function boundedText(value,max){const text=String(value??'');return text.length>max?`${text.slice(0,max-1)}…`:text;}
function projectedRegisteredTool(tool){
 return{
  name:boundedText(tool?.name,128),
  title:tool?.title==null?null:boundedText(tool.title,160),
  description:boundedText(tool?.description,500),
  origin:boundedText(tool?.origin,2048),
  annotations:browserAnnotations(tool?.annotations??{})
 };
}
async function discoverWebMcpTools(runtime,options={},context={}){
 context.signal?.throwIfAborted();
 const mc=getModelContext(runtime);if(typeof mc?.getTools!=='function')throw new Error('WEBMCP_GET_TOOLS_UNAVAILABLE');
 const fromOrigins=requestedOrigins(options.fromOrigins),maxTools=Number.isInteger(options.maxTools)?Math.max(1,Math.min(50,options.maxTools)):25;
 const discovered=await mc.getTools({fromOrigins});context.signal?.throwIfAborted();
 const tools=Array.isArray(discovered)?discovered:[];
 return{fromOrigins,tools:tools.slice(0,maxTools).map(projectedRegisteredTool),truncated:tools.length>maxTools,totalObserved:tools.length};
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
function browserRuntimeSnapshot(){return inspectBrowserRuntime({document:globalThis.document,window:globalThis.window,navigator:globalThis.navigator,isSecureContext:globalThis.isSecureContext});}
function browserFetch(){return typeof globalThis.fetch==='function'?globalThis.fetch.bind(globalThis):undefined;}
async function discoverCurrentDocument(options={},context={}){const probe=browserRuntimeSnapshot();return discoverBrowserApis({declaredApiDescriptions:probe.runtime.declaredApiDescriptions,includeWellKnownCatalog:options.includeWellKnownCatalog!==false,maxDescriptions:options.maxDescriptions??3,signal:context.signal},{origin:probe.runtime.origin,fetch:browserFetch()});}
function browserTools(runtime){
 const searchSchema=toolDefinitions.find(x=>x.name==='kata_search_research').inputSchema;
 return[
  {name:'kata_browser_inspect_runtime',description:'Inspect the current host document for directly observable WebMCP, browser policy, frame, framework, DOM topology and declared API evidence without probing protected resources or guessing security state.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>browserRuntimeSnapshot()},
  {name:'kata_browser_discover_webmcp_tools',description:'Discover WebMCP tools from explicitly requested secure descendant origins using the browser-authorized getTools({fromOrigins}) path. This read-only operation does not execute discovered tools and cannot bypass Permissions Policy or exposedTo origin gating.',inputSchema:{type:'object',properties:{fromOrigins:{type:'array',minItems:1,maxItems:8,items:{type:'string',minLength:1,maxLength:2048}},maxTools:{type:'integer',minimum:1,maximum:50}},required:['fromOrigins'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:(options={},context={})=>discoverWebMcpTools(runtime,options,context)},
  {name:'kata_browser_discover_api',description:'Discover and inventory standards-declared OpenAPI descriptions from the current document and optional current-origin RFC 9727 API catalog. This read-only tool never invokes API operations and preserves normal browser CORS, CSP, authentication and credential boundaries.',inputSchema:{type:'object',properties:{includeWellKnownCatalog:{type:'boolean'},maxDescriptions:{type:'integer',minimum:1,maximum:5}},required:[],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:(options={},context={})=>discoverCurrentDocument(options,context)},
  {name:'kata_browser_compile_api_tools',description:'Compile standards-discovered OpenAPI operations into local preview-only agent tool contracts. Resolves bounded local component references, excludes credential arguments, never fetches external references, and never executes target API operations.',inputSchema:{type:'object',properties:{includeWellKnownCatalog:{type:'boolean'},maxDescriptions:{type:'integer',minimum:1,maximum:5},maxTools:{type:'integer',minimum:1,maximum:100}},required:[],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async(options={},context={})=>compileOpenApiCandidates(await discoverCurrentDocument(options,context),{maxTools:options.maxTools??50})},
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
    controller?.abort();controller=new AbortController();const mc=getModelContext(runtime);if(!mc?.registerTool){onStatus({supported:false,active:[],collisions:[],rejected:[],error:null});return;}
    const tools=[...canonicalTools(runtime),...browserTools(runtime)];
    const reserved=new Set(tools.map(x=>x.name)),collisions=[];
    for(const p of runtime.listPrograms()){
      if(reserved.has(p.name)){collisions.push(p.name);continue;}
      reserved.add(p.name);
      tools.push({name:p.name,description:p.description,inputSchema:p.inputSchema,annotations:{readOnlyHint:false,untrustedContentHint:false},execute:(input,context={})=>runtime.executeProgram(p.name,input,'agent',{signal:context.signal})});
    }
    collisions.sort();
    const exposedTo=exposureConfig(runtime),registrationOptions={signal:controller.signal,...(exposedTo.length?{exposedTo}:{})};
    const active=[],rejected=[];
    for(const tool of tools){
      try{await mc.registerTool(tool,registrationOptions);active.push(tool.name);}
      catch(error){rejected.push({name:tool.name,error:error instanceof Error?error.message:String(error)});}
    }
    const error=active.length===0&&rejected.length?rejected[0].error:null;
    if(error)controller.abort();
    onStatus({supported:true,active,collisions,rejected,error,...(exposedTo.length?{exposedTo}:{})});
  }
  return{refresh,dispose(){controller?.abort();controller=null;}};
}

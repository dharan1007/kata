import {inspectBrowserRuntime} from '../src/runtime-probe.js';

const KATA_BASE='https://kata-webmcp.vercel.app';
const MCP_VERSION='2026-07-28';
const INTENTS=new Set(['read','act','automate','expose_webmcp','call_api','connect_mcp']);

function assertIntent(intent){
  if(!INTENTS.has(intent))throw new Error(`Unsupported interoperability intent: ${intent}`);
}
function tabUrl(tab){
  if(!Number.isInteger(tab?.id))throw new Error('An active browser tab is required.');
  try{return new URL(String(tab.url??''));}catch{throw new Error('The active tab does not expose a valid HTTP(S) URL.');}
}
function assertInspectableTab(tab){
  const url=tabUrl(tab);
  if(url.protocol!=='https:'&&url.protocol!=='http:')throw new Error('KATA only inspects explicitly authorized HTTP(S) pages.');
  return url;
}
function isLoopback(hostname){
  const h=String(hostname).toLowerCase();
  return h==='localhost'||h==='::1'||h==='[::1]'||h==='127.0.0.1'||h.startsWith('127.');
}
function resolveMcpEndpoint(tab,endpoint){
  const page=assertInspectableTab(tab);
  const target=new URL(String(endpoint||'/mcp'),page.origin);
  if(target.origin!==page.origin)throw new Error('MCP inspection is restricted to a same-origin endpoint on the explicitly authorized tab.');
  if(target.protocol!=='https:'&&!(target.protocol==='http:'&&isLoopback(target.hostname)))throw new Error('Remote MCP inspection requires HTTPS; cleartext HTTP is allowed only for loopback development endpoints.');
  target.hash='';
  return target;
}
function localFailure(error,probe){
  return{ok:false,error:String(error?.message??error),runtime:probe?.runtime??null,evidence:probe?.evidence??[]};
}
function discoverBody(){
  return{jsonrpc:'2.0',id:'kata-mcp-discover',method:'server/discover',params:{_meta:{'io.modelcontextprotocol/protocolVersion':MCP_VERSION,'io.modelcontextprotocol/clientCapabilities':{},'io.modelcontextprotocol/clientInfo':{name:'kata-interop-inspector',version:'3.0.0'}}}};
}
function resourceMetadataUrl(value){
  const match=String(value??'').match(/(?:^|[,\s])resource_metadata=(?:"([^"]+)"|([^,\s]+))/i);
  return match?.[1]??match?.[2]??null;
}
async function readProtectedResourceMetadata(response,target,fetchImpl){
  const raw=resourceMetadataUrl(response?.headers?.get?.('www-authenticate'));
  if(!raw)return{state:'unverified',metadata:null};
  let url;
  try{url=new URL(raw,target);}catch{return{state:'unverified',metadata:null};}
  if(url.origin!==target.origin||url.protocol!==target.protocol)return{state:'unverified',metadata:null};
  let metadataResponse;
  try{metadataResponse=await fetchImpl(url.href,{method:'GET',headers:{Accept:'application/json'},credentials:'omit',cache:'no-store',redirect:'manual'});}catch{return{state:'unverified',metadata:null};}
  if(!metadataResponse?.ok)return{state:'unverified',metadata:null};
  let metadata;
  try{metadata=await metadataResponse.json();}catch{return{state:'unverified',metadata:null};}
  if(!metadata||typeof metadata!=='object'||!Array.isArray(metadata.authorization_servers))return{state:'unverified',metadata:null};
  return{state:'available',metadata:{resource:typeof metadata.resource==='string'?metadata.resource:null,authorizationServers:metadata.authorization_servers.filter(x=>typeof x==='string').slice(0,16),scopesSupported:Array.isArray(metadata.scopes_supported)?metadata.scopes_supported.filter(x=>typeof x==='string').slice(0,64):[]}};
}

export async function inspectMcpEndpoint(tab,endpoint='/mcp',deps={}){
  const fetchImpl=deps.fetchImpl??globalThis.fetch;
  if(typeof fetchImpl!=='function')throw new Error('fetch is unavailable.');
  const target=resolveMcpEndpoint(tab,endpoint);
  const init={method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':MCP_VERSION,'Mcp-Method':'server/discover'},body:JSON.stringify(discoverBody()),credentials:'omit',cache:'no-store',redirect:'manual'};
  let response;
  try{response=await fetchImpl(target.href,init);}catch(error){return{ok:false,error:`MCP discovery request failed: ${error?.message??error}`,environment:{mcpEndpoint:'unknown',mcpModernProtocol:'unknown',mcpAuth:'unknown',mcpAuthMetadata:'unknown'}};}
  if(response?.status===401){
    const authorization=await readProtectedResourceMetadata(response,target,fetchImpl);
    return{ok:true,endpoint:target.href,environment:{mcpEndpoint:'protected',mcpModernProtocol:'unknown',mcpAuth:'required',mcpAuthMetadata:authorization.state},authorization:authorization.metadata};
  }
  let payload=null;
  try{payload=await response?.json?.();}catch{}
  if(response?.ok&&payload?.jsonrpc==='2.0'&&payload?.result&&Array.isArray(payload.result.supportedVersions)){
    const supported=payload.result.supportedVersions.includes(MCP_VERSION);
    return{ok:true,endpoint:target.href,environment:{mcpEndpoint:'available',mcpModernProtocol:supported?'supported':'unsupported',mcpAuth:'none',mcpAuthMetadata:'not-required'},server:{supportedVersions:payload.result.supportedVersions.slice(0,32),capabilities:payload.result.capabilities??{},serverInfo:payload.result.serverInfo??null,instructions:typeof payload.result.instructions==='string'?payload.result.instructions:null}};
  }
  if(payload?.error?.code===-32601){
    return{ok:true,endpoint:target.href,environment:{mcpEndpoint:'legacy-candidate',mcpModernProtocol:'unsupported',mcpAuth:'unknown',mcpAuthMetadata:'unknown'},server:null};
  }
  return{ok:false,error:`MCP server/discover was not established (HTTP ${response?.status??'unknown'}).`,endpoint:target.href,environment:{mcpEndpoint:'unknown',mcpModernProtocol:'unknown',mcpAuth:'unknown',mcpAuthMetadata:'unknown'}};
}

export async function inspectAuthorizedTab(tab,intent='read',deps={}){
  const chromeApi=deps.chromeApi??globalThis.chrome;
  const fetchImpl=deps.fetchImpl??globalThis.fetch;
  const kataBase=String(deps.kataBase??KATA_BASE).replace(/\/$/,'');
  assertIntent(intent);
  assertInspectableTab(tab);
  if(!chromeApi?.scripting?.executeScript)throw new Error('chrome.scripting is unavailable.');
  if(typeof fetchImpl!=='function')throw new Error('fetch is unavailable.');

  const injected=await chromeApi.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:inspectBrowserRuntime,args:[{}]});
  const probe=injected?.[0]?.result;
  if(!probe?.environment||!probe?.runtime)throw new Error('The page runtime probe did not return a valid KATA evidence snapshot.');

  const environment={...probe.environment,userAuthorizedBrowserFlow:true};
  const body={name:'kata_diagnose_web_interop',arguments:{intent,environment}};
  let response;
  try{response=await fetchImpl(`${kataBase}/api/invoke`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',cache:'no-store'});}catch(error){return localFailure(new Error(`KATA diagnosis request failed: ${error?.message??error}`),probe);}
  if(!response?.ok)return localFailure(new Error(`KATA diagnosis service returned HTTP ${response?.status??'unknown'}.`),probe);
  let payload;
  try{payload=await response.json();}catch{return localFailure(new Error('KATA diagnosis service returned an invalid JSON response.'),probe);}
  if(!payload?.ok||!payload?.result)return localFailure(new Error('KATA diagnosis service returned an invalid diagnosis payload.'),probe);
  return{ok:true,runtime:probe.runtime,evidence:probe.evidence??[],diagnosis:payload.result};
}

async function activeTab(){const tabs=await globalThis.chrome.tabs.query({active:true,currentWindow:true});return tabs?.[0];}
async function inspectFromPopup(message){return inspectAuthorizedTab(await activeTab(),message.intent??'read');}
async function inspectMcpFromPopup(message){return inspectMcpEndpoint(await activeTab(),message.endpoint??'/mcp');}

if(globalThis.chrome?.runtime?.onMessage){
  globalThis.chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
    if(message?.type==='inspect-active-tab')inspectFromPopup(message).then(sendResponse,error=>sendResponse({ok:false,error:String(error?.message??error)}));
    else if(message?.type==='inspect-mcp-endpoint')inspectMcpFromPopup(message).then(sendResponse,error=>sendResponse({ok:false,error:String(error?.message??error)}));
    else return false;
    return true;
  });
}

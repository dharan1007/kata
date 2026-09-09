import {inspectBrowserRuntime} from '../src/runtime-probe.js';

const KATA_BASE='https://kata-webmcp.vercel.app';
const INTENTS=new Set(['read','act','automate','expose_webmcp','call_api']);

function assertIntent(intent){
  if(!INTENTS.has(intent))throw new Error(`Unsupported interoperability intent: ${intent}`);
}
function assertInspectableTab(tab){
  if(!Number.isInteger(tab?.id))throw new Error('An active browser tab is required.');
  let url;
  try{url=new URL(String(tab.url??''));}catch{throw new Error('The active tab does not expose a valid HTTP(S) URL.');}
  if(url.protocol!=='https:'&&url.protocol!=='http:')throw new Error('KATA only inspects explicitly authorized HTTP(S) pages.');
}
function localFailure(error,probe){
  return{ok:false,error:String(error?.message??error),runtime:probe?.runtime??null,evidence:probe?.evidence??[]};
}

export async function inspectAuthorizedTab(tab,intent='read',deps={}){
  const chromeApi=deps.chromeApi??globalThis.chrome;
  const fetchImpl=deps.fetchImpl??globalThis.fetch;
  const kataBase=String(deps.kataBase??KATA_BASE).replace(/\/$/,'');
  assertIntent(intent);
  assertInspectableTab(tab);
  if(!chromeApi?.scripting?.executeScript)throw new Error('chrome.scripting is unavailable.');
  if(typeof fetchImpl!=='function')throw new Error('fetch is unavailable.');

  const injected=await chromeApi.scripting.executeScript({
    target:{tabId:tab.id},
    world:'MAIN',
    func:inspectBrowserRuntime,
    args:[{}]
  });
  const probe=injected?.[0]?.result;
  if(!probe?.environment||!probe?.runtime)throw new Error('The page runtime probe did not return a valid KATA evidence snapshot.');

  const environment={...probe.environment,userAuthorizedBrowserFlow:true};
  const body={name:'kata_diagnose_web_interop',arguments:{intent,environment}};
  let response;
  try{
    response=await fetchImpl(`${kataBase}/api/invoke`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
      credentials:'omit',
      cache:'no-store'
    });
  }catch(error){
    return localFailure(new Error(`KATA diagnosis request failed: ${error?.message??error}`),probe);
  }
  if(!response?.ok)return localFailure(new Error(`KATA diagnosis service returned HTTP ${response?.status??'unknown'}.`),probe);
  let payload;
  try{payload=await response.json();}catch{return localFailure(new Error('KATA diagnosis service returned an invalid JSON response.'),probe);}
  if(!payload?.ok||!payload?.result)return localFailure(new Error('KATA diagnosis service returned an invalid diagnosis payload.'),probe);
  return{ok:true,runtime:probe.runtime,evidence:probe.evidence??[],diagnosis:payload.result};
}

async function inspectFromPopup(message){
  const tabs=await globalThis.chrome.tabs.query({active:true,currentWindow:true});
  const tab=tabs?.[0];
  return inspectAuthorizedTab(tab,message.intent??'read');
}

if(globalThis.chrome?.runtime?.onMessage){
  globalThis.chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
    if(message?.type!=='inspect-active-tab')return false;
    inspectFromPopup(message).then(sendResponse,error=>sendResponse({ok:false,error:String(error?.message??error)}));
    return true;
  });
}

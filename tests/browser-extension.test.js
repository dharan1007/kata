import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {inspectBrowserRuntime} from '../src/runtime-probe.js';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const extensionDir=path.join(root,'extension');
const manifestPath=path.join(extensionDir,'manifest.json');
const workerPath=path.join(extensionDir,'service-worker.js');

function manifest(){
  assert.equal(fs.existsSync(manifestPath),true,'extension/manifest.json must exist');
  return JSON.parse(fs.readFileSync(manifestPath,'utf8'));
}
async function worker(){
  assert.equal(fs.existsSync(workerPath),true,'extension/service-worker.js must exist');
  return import(`${pathToFileURL(workerPath).href}?test=${Date.now()}-${Math.random()}`);
}
function observedProbe(){
  return{
    environment:{
      webMcpApi:'available',frame:'top',toolsPermission:'allowed',originExposure:'not-required',crossOriginRequest:'not-required',api:'documented',auth:'unknown',authScope:'unknown',cors:'unknown',cspConnect:'unknown',rateLimit:'unknown',rateLimitScope:'unknown',botProtection:'unknown',botProtectionScope:'unknown',terms:'unknown',termsScope:'unknown',userAuthorizedBrowserFlow:false,serverSideApiAvailable:false
    },
    runtime:{url:'https://private.example/account?secret=local-only',origin:'https://private.example',secureContext:true,frameworkHints:[{name:'Next.js',evidence:'test'}],dom:{openShadowRoots:1,iframes:2,accessibleFrames:1,inaccessibleFrames:1},declaredApiDescriptions:['https://private.example/openapi.json'],cspMetaPresent:false,cspMeta:null,notes:[]},
    evidence:[{key:'frame',value:'top',source:'browser-runtime',confidence:1}]
  };
}

test('browser bridge is Manifest V3 with temporary active-tab access plus session-only storage and no broad/sensitive permissions',()=>{
  const m=manifest();
  assert.equal(m.manifest_version,3);
  assert.equal(Number(m.minimum_chrome_version),102);
  assert.deepEqual([...m.permissions].sort(),['activeTab','scripting','storage']);
  assert.deepEqual(m.host_permissions,['https://kata-webmcp.vercel.app/*']);
  const serialized=JSON.stringify(m);
  assert.equal(serialized.includes('<all_urls>'),false);
  assert.equal(serialized.includes('https://*/'),false);
  for(const forbidden of ['cookies','webRequest','debugger','history','downloads','nativeMessaging','clipboardRead','clipboardWrite','identity','alarms'])assert.equal(m.permissions.includes(forbidden),false,`forbidden permission ${forbidden}`);
  assert.equal(m.background?.type,'module');
  assert.equal(m.background?.service_worker,'service-worker.js');
  assert.equal(m.action?.default_popup,'popup.html');
});

test('canonical runtime probe is closure-free enough for chrome.scripting function serialization',()=>{
  const source=`(${inspectBrowserRuntime.toString()})`;
  const context=vm.createContext({globalThis:{document:null,window:null,navigator:null,isSecureContext:false}});
  const serialized=vm.runInContext(source,context);
  const result=serialized({document:null,window:null,navigator:null,isSecureContext:false});
  assert.equal(result.environment.webMcpApi,'unavailable');
  assert.equal(result.environment.frame,'unknown');
  assert.equal(result.runtime.secureContext,false);
});

test('active-tab inspection runs the canonical probe in MAIN world and transmits only bounded environment evidence',async()=>{
  const {inspectAuthorizedTab}=await worker();
  const probe=observedProbe();
  let injection=null,request=null;
  const chromeApi={scripting:{executeScript:async spec=>{injection=spec;return[{frameId:0,result:probe}];}}};
  const fetchImpl=async(url,init)=>{request={url,init,body:JSON.parse(init.body)};return{ok:true,status:200,json:async()=>({ok:true,tool:'kata_diagnose_web_interop',result:{status:'possible',primaryPath:'webmcp',blockers:[],recommendedAction:'Use WebMCP.'}})};};
  const result=await inspectAuthorizedTab({id:42,url:probe.runtime.url},'read',{chromeApi,fetchImpl});

  assert.equal(injection.target.tabId,42);
  assert.equal(injection.target.allFrames,undefined);
  assert.equal(injection.world,'MAIN');
  assert.equal(injection.func,inspectBrowserRuntime);
  assert.deepEqual(injection.args,[{}]);
  assert.equal(request.url,'https://kata-webmcp.vercel.app/api/invoke');
  assert.equal(request.init.method,'POST');
  assert.equal(request.body.name,'kata_diagnose_web_interop');
  assert.equal(request.body.arguments.intent,'read');
  assert.equal(request.body.arguments.environment.userAuthorizedBrowserFlow,true);
  assert.equal(JSON.stringify(request.body).includes('private.example'),false,'visited URL/origin must remain local');
  assert.equal(JSON.stringify(request.body).includes('frameworkHints'),false,'runtime details must remain local');
  assert.equal(result.runtime.url,probe.runtime.url);
  assert.deepEqual(result.evidence,probe.evidence);
  assert.equal(result.diagnosis.primaryPath,'webmcp');
});

test('active-tab bridge rejects non-http(s) pages before script injection',async()=>{
  const {inspectAuthorizedTab}=await worker();
  let injected=false;
  const chromeApi={scripting:{executeScript:async()=>{injected=true;return[];}}};
  await assert.rejects(()=>inspectAuthorizedTab({id:9,url:'chrome://settings'},'read',{chromeApi,fetchImpl:async()=>{throw new Error('should not fetch');}}),/HTTP\(S\)/i);
  assert.equal(injected,false);
});

test('active-tab bridge preserves local evidence when the KATA diagnosis service fails',async()=>{
  const {inspectAuthorizedTab}=await worker();
  const probe=observedProbe();
  const chromeApi={scripting:{executeScript:async()=>[{frameId:0,result:probe}]}};
  const result=await inspectAuthorizedTab({id:3,url:'https://private.example/'},'automate',{chromeApi,fetchImpl:async()=>({ok:false,status:503,json:async()=>({ok:false})})});
  assert.equal(result.ok,false);
  assert.match(result.error,/503/);
  assert.equal(result.runtime.url,probe.runtime.url);
  assert.deepEqual(result.evidence,probe.evidence);
});

test('active-tab bridge rejects unknown intents before injection',async()=>{
  const {inspectAuthorizedTab}=await worker();
  let injected=false;
  await assert.rejects(()=>inspectAuthorizedTab({id:1,url:'https://example.com'},'delete_everything',{chromeApi:{scripting:{executeScript:async()=>{injected=true;return[];}}},fetchImpl:async()=>{throw new Error('should not fetch');}}),/intent/i);
  assert.equal(injected,false);
});

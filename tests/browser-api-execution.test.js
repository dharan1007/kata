import test from 'node:test';
import assert from 'node:assert/strict';
import * as worker from '../extension/service-worker.js';

const DOCUMENT={
  openapi:'3.1.0',info:{title:'Account API',version:'1'},servers:[{url:'/api'}],
  components:{securitySchemes:{SessionCookie:{type:'apiKey',in:'cookie',name:'session'}}},
  paths:{'/items/{id}':{post:{operationId:'updateItem',security:[{SessionCookie:[]}],parameters:[{name:'id',in:'path',required:true,schema:{type:'string'}}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',properties:{name:{type:'string'}},required:['name'],additionalProperties:false}}}},responses:{'200':{description:'ok',content:{'application/json':{schema:{type:'object'}}}}}}}}
};
const TAB={id:9,url:'https://app.test/account?private=yes'};

function openApiResponse(body=DOCUMENT){return{ok:true,status:200,url:'https://app.test/openapi.json',headers:{get(name){return name.toLowerCase()==='content-type'?'application/json':null;}},async text(){return JSON.stringify(body);}};}
function chromeApi(executionResult={ok:true,status:200,statusText:'OK',url:'https://app.test/api/items/a%2Fb',contentType:'application/json',bytes:11,bodyText:'{"ok":true}',truncated:false,outcome:'completed'}){
  const calls=[];
  return{calls,api:{scripting:{async executeScript(options){calls.push(options);if(options.func?.name==='inspectBrowserRuntime')return[{result:{environment:{api:'documented'},runtime:{origin:'https://app.test',declaredApiDescriptions:['https://app.test/openapi.json']},evidence:[{code:'API_DESCRIPTION_DECLARED'}]}}];return[{result:executionResult}];}}}};
}
function deps(chrome){return{chromeApi:chrome.api,fetchImpl:async(url)=>{assert.equal(String(url),'https://app.test/openapi.json');return openApiResponse();}};}

test('active-tab API execution is preview-bound, same-origin, and requires a second explicit approval for mutation',async()=>{
  assert.equal(typeof worker.previewAuthorizedTabApiExecution,'function');
  assert.equal(typeof worker.executeAuthorizedTabApiExecution,'function');
  const chrome=chromeApi();
  const args={path:{id:'a/b'},body:{name:'Renamed'}};
  const preview=await worker.previewAuthorizedTabApiExecution(TAB,'updateItem',args,{includeWellKnownCatalog:false},deps(chrome));
  assert.equal(preview.ok,true);
  assert.equal(preview.preview.method,'POST');
  assert.equal(preview.preview.url,'https://app.test/api/items/a%2Fb');
  assert.equal(preview.preview.sameOrigin,true);
  assert.equal(preview.preview.credentialMode,'same-origin');
  assert.equal(preview.preview.stateChanging,true);
  assert.equal(preview.preview.readyToExecute,true);
  assert.match(preview.previewFingerprint,/^[a-f0-9]{64}$/);
  await assert.rejects(()=>worker.executeAuthorizedTabApiExecution(TAB,'updateItem',args,preview.previewFingerprint,{approved:false,includeWellKnownCatalog:false},deps(chrome)),/explicit approval/i);
  const executed=await worker.executeAuthorizedTabApiExecution(TAB,'updateItem',args,preview.previewFingerprint,{approved:true,includeWellKnownCatalog:false},deps(chrome));
  assert.equal(executed.ok,true);
  assert.equal(executed.receipt.previewFingerprint,preview.previewFingerprint);
  assert.equal(executed.receipt.method,'POST');
  assert.equal(executed.receipt.status,200);
  assert.equal(executed.receipt.outcome,'completed');
  const executionCall=chrome.calls.find(call=>call.func?.name==='executePageApiRequest');
  assert.ok(executionCall);
  assert.equal(executionCall.world,'MAIN');
  assert.deepEqual(executionCall.target,{tabId:9});
  const request=executionCall.args[0];
  assert.equal(request.credentials,'same-origin');
  assert.equal(request.redirect,'error');
  assert.equal(request.url,'https://app.test/api/items/a%2Fb');
  assert.equal(request.headers.Authorization,undefined);
  assert.equal(request.headers.Cookie,undefined);
});

test('execution re-discovers the live contract and rejects a stale or forged preview fingerprint before page fetch',async()=>{
  assert.equal(typeof worker.executeAuthorizedTabApiExecution,'function');
  const chrome=chromeApi();
  await assert.rejects(()=>worker.executeAuthorizedTabApiExecution(TAB,'updateItem',{path:{id:'1'},body:{name:'x'}},'0'.repeat(64),{approved:true,includeWellKnownCatalog:false},deps(chrome)),/preview.*stale|fingerprint/i);
  assert.equal(chrome.calls.some(call=>call.func?.name==='executePageApiRequest'),false);
});

test('cross-origin compiled API operations remain inspectable but cannot enter the active-tab execution path',async()=>{
  assert.equal(typeof worker.previewAuthorizedTabApiExecution,'function');
  const document={...DOCUMENT,servers:[{url:'https://api.other.test'}]};
  const chrome=chromeApi();
  const result=await worker.previewAuthorizedTabApiExecution(TAB,'updateItem',{path:{id:'1'},body:{name:'x'}},{includeWellKnownCatalog:false},{chromeApi:chrome.api,fetchImpl:async()=>openApiResponse(document)});
  assert.equal(result.ok,true);
  assert.equal(result.preview.sameOrigin,false);
  assert.equal(result.preview.readyToExecute,false);
  assert.equal(result.preview.blockedReason,'same_origin_required');
});

test('page executor enforces origin, response bounds, no redirects, and browser-managed credentials without exposing cookies',async()=>{
  assert.equal(typeof worker.executePageApiRequest,'function');
  const seen=[];
  const runtime={location:{origin:'https://app.test'},fetch:async(url,init)=>{seen.push({url,init});return{ok:true,status:200,statusText:'OK',url,headers:{get(name){if(name.toLowerCase()==='content-type')return'application/json';if(name.toLowerCase()==='content-length')return'11';return null;}},body:null,async text(){return'{"ok":true}';}};},AbortController,Uint8Array,TextDecoder,TextEncoder,setTimeout,clearTimeout,performance:{now:()=>10}};
  const request={method:'GET',url:'https://app.test/api/me',headers:{Accept:'application/json'},body:null,credentials:'same-origin',redirect:'error',timeoutMs:5000,maxResponseBytes:1024};
  const response=await worker.executePageApiRequest(request,runtime);
  assert.equal(response.ok,true);
  assert.equal(response.status,200);
  assert.equal(response.bodyText,'{"ok":true}');
  assert.equal(response.truncated,false);
  assert.equal(seen[0].init.credentials,'same-origin');
  assert.equal(seen[0].init.redirect,'error');
  await assert.rejects(()=>worker.executePageApiRequest({...request,url:'https://evil.test/x'},runtime),/same-origin/i);
  const bounded=await worker.executePageApiRequest({...request,maxResponseBytes:5},runtime);
  assert.equal(bounded.outcome,'completed');
  assert.equal(bounded.truncated,true);
  assert.ok(bounded.bytes<=5);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionBroker} from '../extension/session-broker.js';

const ORIGIN='https://app.test';
const TAB={id:41,url:`${ORIGIN}/account`};
const DOCUMENT={openapi:'3.1.0',info:{title:'Protected API',version:'1'},servers:[{url:'/api'}],components:{securitySchemes:{BearerAuth:{type:'http',scheme:'bearer'}}},paths:{'/me':{get:{operationId:'getMe',security:[{BearerAuth:['read']}],responses:{'200':{description:'ok'}}}}}};
function storageArea(){const data={};return{async get(keys){const names=Array.isArray(keys)?keys:[keys];const out={};for(const key of names)if(Object.prototype.hasOwnProperty.call(data,key))out[key]=structuredClone(data[key]);return out;},async set(values){for(const [key,value] of Object.entries(values))data[key]=structuredClone(value);},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete data[key];}};}
function cryptoStub(){let n=5;return{getRandomValues(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=(n++*31)&255;return bytes;},subtle:globalThis.crypto.subtle};}
function response(payload,url,status=200){const text=typeof payload==='string'?payload:JSON.stringify(payload);return{ok:status>=200&&status<300,status,statusText:status===200?'OK':'Error',url,headers:{get(n){const key=String(n).toLowerCase();if(key==='content-type')return'application/json';if(key==='content-length')return String(new TextEncoder().encode(text).length);return null;}},body:null,async text(){return text;}};}
function chromeApi(){return{scripting:{async executeScript(spec){if(spec.func?.name==='inspectBrowserRuntime')return[{result:{environment:{api:'documented'},runtime:{origin:ORIGIN,declaredApiDescriptions:[`${ORIGIN}/openapi.json`]},evidence:[]}}];throw new Error(`unexpected page injection ${spec.func?.name}`);}}};}

test('active-tab protected API preview uses redacted session descriptors and extension dispatch resolves secret only after approval',async()=>{
  const calls=[];
  const fetchImpl=async(url,init={})=>{
    calls.push({url,init:{...init,headers:{...(init.headers??{})}}});
    if(url===`${ORIGIN}/openapi.json`)return response(DOCUMENT,url);
    if(url===`${ORIGIN}/api/me`){assert.equal(init.headers.Authorization,'Bearer session-secret');assert.equal(init.credentials,'omit');return response({},url);}
    throw new Error(`unexpected fetch ${url}`);
  };
  const broker=createSessionBroker({storageArea:storageArea(),cryptoImpl:cryptoStub(),fetchImpl,chromeApi:chromeApi(),now:()=>1700000000000});
  const descriptor=await broker.vault.putCredential({origin:ORIGIN,kind:'bearer-token',schemeName:'BearerAuth',secret:'session-secret',scopes:['read']});
  const preview=await broker.previewApi(TAB,'getMe',{}, {includeWellKnownCatalog:false});
  assert.equal(preview.preview.readyToExecute,true);
  assert.equal(preview.preview.authorizationStrategy,'brokered');
  assert.equal(preview.preview.executionContext,'extension-service-worker');
  assert.equal(JSON.stringify(preview).includes('session-secret'),false);
  assert.equal(calls.some(call=>call.init.headers.Authorization),false,'preview must not resolve/send the raw secret');
  await assert.rejects(()=>broker.executeApi(TAB,'getMe',{},preview.previewFingerprint,{approved:false,includeWellKnownCatalog:false}),/approval/i);
  const result=await broker.executeApi(TAB,'getMe',{},preview.previewFingerprint,{approved:true,includeWellKnownCatalog:false});
  assert.equal(result.ok,true);
  assert.equal(JSON.stringify(result).includes('session-secret'),false);
  assert.equal(calls.filter(call=>call.url===`${ORIGIN}/api/me`).length,1);
});

test('mixed browser-cookie plus brokered OpenAPI requirements fail closed rather than extracting cookies or exposing the secret to page JavaScript',async()=>{
  const mixed={openapi:'3.1.0',info:{title:'Mixed API',version:'1'},servers:[{url:'/api'}],components:{securitySchemes:{Session:{type:'apiKey',in:'cookie',name:'sid'},ApiKey:{type:'apiKey',in:'header',name:'X-API-Key'}}},paths:{'/mixed':{post:{operationId:'mixed',security:[{Session:[],ApiKey:[]}],responses:{'200':{description:'ok'}}}}}};
  const fetchImpl=async url=>response(mixed,url);
  const broker=createSessionBroker({storageArea:storageArea(),cryptoImpl:cryptoStub(),fetchImpl,chromeApi:{scripting:{async executeScript(){return[{result:{environment:{api:'documented'},runtime:{origin:ORIGIN,declaredApiDescriptions:[`${ORIGIN}/openapi.json`]},evidence:[]}}];}}}});
  await broker.vault.putCredential({origin:ORIGIN,kind:'api-key',schemeName:'ApiKey',location:'header',parameterName:'X-API-Key',secret:'secret'});
  const preview=await broker.previewApi(TAB,'mixed',{}, {includeWellKnownCatalog:false});
  assert.equal(preview.preview.readyToExecute,false);
  assert.equal(preview.preview.blockedReason,'mixed_browser_and_brokered_auth_unsupported');
});

test('created protected MCP task is persisted in session vault for later popup/service-worker recovery',async()=>{
  const broker=createSessionBroker({storageArea:storageArea(),cryptoImpl:cryptoStub(),fetchImpl:async()=>{throw new Error('not used');}});
  const saved=await broker.vault.putTask({endpoint:`${ORIGIN}/mcp`,toolName:'longJob',taskId:'opaque-77',status:'working',pollIntervalMs:1000,ttlMs:60000,authorizationBinding:{credentialId:'cred',revision:1,origin:ORIGIN,kind:'bearer-token',schemeName:'McpBearer',scopes:[]}});
  const tasks=await broker.listTasks(ORIGIN);
  assert.equal(tasks.length,1);
  assert.equal(tasks[0].vaultTaskId,saved.vaultTaskId);
  assert.equal(JSON.stringify(tasks).includes('opaque-77'),false);
});
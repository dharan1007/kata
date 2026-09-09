import test from 'node:test';
import assert from 'node:assert/strict';
import * as worker from '../extension/service-worker.js';

const TAB={id:41,url:'https://app.test/account'};
const DOCUMENT={openapi:'3.1.0',info:{title:'Protected API',version:'1'},servers:[{url:'/api'}],components:{securitySchemes:{BearerAuth:{type:'http',scheme:'bearer'}}},paths:{'/me':{get:{operationId:'getMe',security:[{BearerAuth:['read']}],responses:{'200':{description:'ok'}}}}}};
const descriptor={credentialId:'cred-1',revision:4,origin:'https://app.test',kind:'bearer-token',schemeName:'BearerAuth',location:null,parameterName:null,scopes:['read']};
function openApiResponse(){return{ok:true,status:200,url:'https://app.test/openapi.json',headers:{get(n){return String(n).toLowerCase()==='content-type'?'application/json':null;}},async text(){return JSON.stringify(DOCUMENT);}};}
function chromeApi(){const calls=[];return{calls,api:{scripting:{async executeScript(spec){calls.push(spec);if(spec.func?.name==='inspectBrowserRuntime')return[{result:{environment:{api:'documented'},runtime:{origin:'https://app.test',declaredApiDescriptions:['https://app.test/openapi.json']},evidence:[]}}];if(spec.func?.name==='executePageApiRequest'){const request=spec.args[0];assert.equal(request.credentialBindings[0].credentialId,'cred-1');assert.equal(request.credentialMaterial[0].secret,'session-secret');return[{result:{ok:true,status:200,statusText:'OK',url:'https://app.test/api/me',contentType:'application/json',bytes:2,bodyText:'{}',truncated:false,outcome:'completed',networkError:null,durationMs:1}}];}throw new Error('unexpected injection');}}}};}

test('active-tab protected API preview uses redacted session descriptors and execution resolves secret only after approval',async()=>{
  assert.equal(typeof worker.previewAuthorizedTabApiExecution,'function');
  const chrome=chromeApi();
  let resolved=0;
  const sessionVault={
    async listCredentialDescriptors(origin){assert.equal(origin,'https://app.test');return[descriptor];},
    async resolveCredential(binding){resolved++;assert.deepEqual(binding,{...descriptor,transport:'bearer'});return{...descriptor,secret:'session-secret'};}
  };
  const deps={chromeApi:chrome.api,fetchImpl:async()=>openApiResponse(),sessionVault};
  const preview=await worker.previewAuthorizedTabApiExecution(TAB,'getMe',{}, {includeWellKnownCatalog:false}, deps);
  assert.equal(preview.preview.readyToExecute,true);
  assert.equal(preview.preview.authorizationStrategy,'brokered');
  assert.equal(JSON.stringify(preview).includes('session-secret'),false);
  assert.equal(resolved,0,'preview must not resolve raw secret material');
  await assert.rejects(()=>worker.executeAuthorizedTabApiExecution(TAB,'getMe',{},preview.previewFingerprint,{approved:false,includeWellKnownCatalog:false},deps),/approval/i);
  assert.equal(resolved,0);
  const result=await worker.executeAuthorizedTabApiExecution(TAB,'getMe',{},preview.previewFingerprint,{approved:true,includeWellKnownCatalog:false},deps);
  assert.equal(result.ok,true);
  assert.equal(resolved,1);
  assert.equal(JSON.stringify(result).includes('session-secret'),false);
});

test('created MCP task is persisted in session vault for later popup/service-worker recovery',async()=>{
  assert.equal(typeof worker.persistMcpTaskResult,'function');
  const saved=[];
  const sessionVault={async putTask(task){saved.push(task);return{vaultTaskId:'vault-1',origin:'https://app.test',toolName:task.toolName,status:task.status};}};
  const execution={ok:false,attempted:true,task:{taskId:'opaque-77',status:'working',endpoint:'https://app.test/mcp',toolName:'longJob',pollIntervalMs:1000,ttlMs:60000}};
  const result=await worker.persistMcpTaskResult(execution,sessionVault);
  assert.equal(saved.length,1);
  assert.equal(saved[0].taskId,'opaque-77');
  assert.equal(result.taskVault.vaultTaskId,'vault-1');
  assert.equal(JSON.stringify(result).includes('session-secret'),false);
});
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionVault} from '../extension/session-vault.js';

const moduleUrl=new URL('../extension/session-broker.js',import.meta.url).href;
const brokerModule=await import(`${moduleUrl}?test=${Date.now()}`).catch(()=>({}));
const createSessionBroker=brokerModule.createSessionBroker;
const createBearerAuthorizedFetch=brokerModule.createBearerAuthorizedFetch;

const ORIGIN='https://app.test';
const ENDPOINT=`${ORIGIN}/mcp`;

function storageArea(){const data={};return{async get(keys){const names=Array.isArray(keys)?keys:[keys];const out={};for(const key of names)if(Object.prototype.hasOwnProperty.call(data,key))out[key]=structuredClone(data[key]);return out;},async set(values){for(const [key,value] of Object.entries(values))data[key]=structuredClone(value);},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete data[key];},data};}
function cryptoStub(){let n=1;return{getRandomValues(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=(n++*29)&255;return bytes;},subtle:globalThis.crypto.subtle};}
function headers(values={}){const map=new Map(Object.entries(values).map(([k,v])=>[k.toLowerCase(),String(v)]));return{get(name){return map.get(String(name).toLowerCase())??null;}};}
function jsonResponse(payload,status=200,extraHeaders={}){const text=JSON.stringify(payload);return{ok:status>=200&&status<300,status,headers:headers({'content-type':'application/json','content-length':String(new TextEncoder().encode(text).length),...extraHeaders}),async text(){return text;},async json(){return payload;},url:ENDPOINT};}
function rpcResult(id,result){return jsonResponse({jsonrpc:'2.0',id,result});}
function mcpServer({protectedMode=true,taskMode=false}={}){
  const calls=[];
  const fetchImpl=async(url,init={})=>{
    const body=init.body?JSON.parse(init.body):null;
    calls.push({url,init:{...init,headers:{...(init.headers??{})}},body});
    const auth=init.headers?.Authorization??init.headers?.authorization??null;
    if(protectedMode&&auth!=='Bearer mcp-secret-token')return jsonResponse({error:'unauthorized'},401,{'www-authenticate':`Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`});
    if(body?.method==='server/discover')return rpcResult(body.id,{supportedVersions:['2026-07-28'],capabilities:{tools:{}},serverInfo:{name:'protected-test',version:'1'}});
    if(body?.method==='tools/list')return rpcResult(body.id,{resultType:'complete',tools:[{name:'secure_tool',description:'secure',inputSchema:{type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false},execution:{taskSupport:taskMode?'required':'forbidden'}}]});
    if(body?.method==='tools/call'){
      if(taskMode)return rpcResult(body.id,{resultType:'task',taskId:'remote-task-secret-handle',status:'working',pollIntervalMs:1000,ttlMs:60000});
      return rpcResult(body.id,{resultType:'complete',structuredContent:{ok:true}});
    }
    if(body?.method==='tasks/get')return rpcResult(body.id,{resultType:'complete',taskId:'remote-task-secret-handle',status:'working',pollIntervalMs:1000,ttlMs:60000});
    throw new Error(`unexpected MCP method ${body?.method}`);
  };
  return{calls,fetchImpl};
}
async function setup({taskMode=false}={}){
  assert.equal(typeof createSessionBroker,'function','session-broker must export createSessionBroker');
  assert.equal(typeof createBearerAuthorizedFetch,'function','session-broker must export createBearerAuthorizedFetch');
  const storage=storageArea(),cryptoImpl=cryptoStub(),vault=createSessionVault(storage,cryptoImpl,()=>1700000000000);
  const credential=await vault.putCredential({origin:ORIGIN,kind:'bearer-token',schemeName:'McpBearer',secret:'mcp-secret-token',scopes:['tools']});
  const server=mcpServer({protectedMode:true,taskMode});
  const broker=createSessionBroker({storageArea:storage,cryptoImpl,fetchImpl:server.fetchImpl,now:()=>1700000000000});
  return{storage,credential,server,broker};
}

test('trusted MCP fetch injects one bound Bearer secret while preserving omit/manual transport policy',async()=>{
  const {credential,broker}=await setup();
  let sent=null;
  const baseFetch=async(url,init)=>{sent={url,init};return{ok:true,status:204};};
  const authorized=await createBearerAuthorizedFetch(baseFetch,broker.vault,credential,ENDPOINT);
  const response=await authorized(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',credentials:'omit',redirect:'manual'});
  assert.equal(response.status,204);
  assert.equal(sent.init.headers.Authorization,'Bearer mcp-secret-token');
  assert.equal(sent.init.credentials,'omit');
  assert.equal(sent.init.redirect,'manual');
  assert.equal(JSON.stringify(credential).includes('mcp-secret-token'),false);
});

test('protected server/discover, tools/list and tools/call work only with an explicit redacted bearer binding',async()=>{
  const {credential,server,broker}=await setup();
  const tab={id:7,url:`${ORIGIN}/app`};
  const listed=await broker.listMcpTools(tab,'/mcp',credential,{});
  assert.equal(listed.inventory.tools.length,1);
  const previewed=await broker.previewMcpTool(tab,'/mcp','secure_tool',{value:'hello'},credential,{});
  assert.equal(previewed.preview.authorizationBinding.credentialId,credential.credentialId);
  assert.equal(previewed.preview.authorizationBinding.revision,credential.revision);
  assert.equal(JSON.stringify(previewed).includes('mcp-secret-token'),false);
  const executed=await broker.executeMcpTool(tab,'/mcp','secure_tool',{value:'hello'},credential,previewed.previewFingerprint,{approved:true});
  assert.equal(executed.ok,true);
  assert.equal(JSON.stringify(executed).includes('mcp-secret-token'),false);
  assert.ok(server.calls.filter(call=>call.body?.method==='server/discover').length>=2,'fresh discovery must remain part of preview/execute freshness checks');
  for(const call of server.calls.filter(call=>call.body?.method))assert.equal(call.init.headers.Authorization,'Bearer mcp-secret-token');
});

test('stale, deleted, or wrong-origin MCP credential bindings fail before the protected network call',async()=>{
  const {credential,server,broker}=await setup();
  const tab={id:7,url:`${ORIGIN}/app`};
  const before=server.calls.length;
  await assert.rejects(()=>broker.listMcpTools(tab,'/mcp',{...credential,revision:credential.revision+1},{}),/revision|stale/i);
  assert.equal(server.calls.length,before);
  await assert.rejects(()=>broker.listMcpTools(tab,'/mcp',{...credential,origin:'https://other.test'},{}),/origin/i);
  assert.equal(server.calls.length,before);
  await broker.vault.removeCredential(credential.credentialId);
  await assert.rejects(()=>broker.listMcpTools(tab,'/mcp',credential,{}),/not found|missing/i);
  assert.equal(server.calls.length,before);
});

test('task-producing protected MCP calls are vaulted before popup handoff and recover across broker recreation',async()=>{
  const {credential,storage,server,broker}=await setup({taskMode:true});
  const tab={id:9,url:`${ORIGIN}/app`};
  const previewed=await broker.previewMcpTool(tab,'/mcp','secure_tool',{value:'go'},credential,{});
  const executed=await broker.executeMcpTool(tab,'/mcp','secure_tool',{value:'go'},credential,previewed.previewFingerprint,{approved:true});
  assert.equal(executed.receipt.taskCreated,true);
  assert.ok(executed.task?.vaultTaskId);
  assert.equal('taskId' in executed.task,false,'popup-visible task must not expose remote task id');
  assert.equal(JSON.stringify(executed).includes('remote-task-secret-handle'),false);
  const second=createSessionBroker({storageArea:storage,cryptoImpl:cryptoStub(),fetchImpl:server.fetchImpl,now:()=>1700000001000});
  const tasks=await second.listTasks(ORIGIN);
  assert.equal(tasks.length,1);
  assert.equal(tasks[0].vaultTaskId,executed.task.vaultTaskId);
  const refreshed=await second.refreshTask(tab,'/mcp',executed.task.vaultTaskId,{});
  assert.equal(refreshed.status,'working');
  assert.equal(JSON.stringify(refreshed).includes('remote-task-secret-handle'),false);
  assert.equal(JSON.stringify(refreshed).includes('mcp-secret-token'),false);
});

test('session MCP broker never uploads endpoint, task handle, or credential secret to KATA diagnosis',async()=>{
  const {credential,broker}=await setup();
  const serialized=JSON.stringify({credential,capabilities:broker.publicCapabilities()});
  for(const secret of ['mcp-secret-token','remote-task-secret-handle',ENDPOINT])assert.equal(serialized.includes(secret),false,`${secret} must remain outside public broker contracts`);
  assert.equal(broker.publicCapabilities().cloudVisible,false);
  assert.equal(broker.publicCapabilities().modelVisible,false);
  assert.equal(broker.publicCapabilities().backgroundPolling,false);
});
import test from 'node:test';
import assert from 'node:assert/strict';

const url=new URL('../extension/session-controller.js',import.meta.url).href;
const mod=await import(`${url}?test=${Date.now()}`).catch(()=>({}));
const createSessionController=mod.createSessionController;

const TAB={id:5,url:'https://app.test/work'};

test('session controller derives credential origin from the authorized tab and never echoes a submitted secret',async()=>{
  assert.equal(typeof createSessionController,'function');
  const calls=[];
  const vault={
    async putCredential(value){calls.push(value);return{credentialId:'c1',revision:1,origin:value.origin,kind:value.kind,schemeName:value.schemeName,location:value.location??null,parameterName:value.parameterName??null,scopes:value.scopes??[]};},
    async listCredentialDescriptors(origin){return[{credentialId:'c1',revision:1,origin,kind:'bearer-token',schemeName:'BearerAuth',location:null,parameterName:null,scopes:[]}];},
    async removeCredential(){return true;},async clearCredentials(){return 1;}
  };
  const controller=createSessionController({sessionBroker:{vault,listTasks:async()=>[],publicCapabilities:()=>({})},apiBroker:{publicCapabilities:()=>({})}});
  const result=await controller.handle({type:'session-put-credential',credential:{origin:'https://attacker.test',kind:'bearer-token',schemeName:'BearerAuth',secret:'top-secret',scopes:['read']}},TAB);
  assert.equal(calls[0].origin,'https://app.test');
  assert.equal(JSON.stringify(result).includes('top-secret'),false);
  const listed=await controller.handle({type:'session-list-credentials'},TAB);
  assert.equal(listed.credentials[0].origin,'https://app.test');
});

test('session controller routes protected API/MCP actions and task recovery through brokers only for session-prefixed messages',async()=>{
  assert.equal(typeof createSessionController,'function');
  const routed=[];
  const sessionBroker={vault:{listCredentialDescriptors:async()=>[],putCredential:async()=>({}),removeCredential:async()=>true,clearCredentials:async()=>1},listTasks:async origin=>{routed.push(['tasks',origin]);return[{vaultTaskId:'v1'}];},listMcpTools:async(...args)=>{routed.push(['mcp-list',...args]);return{ok:true};},previewMcpTool:async(...args)=>{routed.push(['mcp-preview',...args]);return{ok:true};},executeMcpTool:async(...args)=>{routed.push(['mcp-execute',...args]);return{ok:true};},refreshTask:async(...args)=>{routed.push(['task-refresh',...args]);return{status:'working'};},previewTaskUpdate:async()=>({ok:true}),executeTaskUpdate:async()=>({ok:true}),previewTaskCancel:async()=>({ok:true}),executeTaskCancel:async()=>({ok:true}),publicCapabilities:()=>({protectedMcp:'explicit-session-bearer'})};
  const apiBroker={previewApi:async(...args)=>{routed.push(['api-preview',...args]);return{ok:true};},executeApi:async(...args)=>{routed.push(['api-execute',...args]);return{ok:true};},publicCapabilities:()=>({sessionAuthorization:true})};
  const controller=createSessionController({sessionBroker,apiBroker});
  await controller.handle({type:'session-preview-api',operationName:'getMe',arguments:{}},TAB);
  await controller.handle({type:'session-list-mcp-tools',endpoint:'/mcp',credential:{credentialId:'c',revision:1,origin:'https://app.test',kind:'bearer-token'}},TAB);
  await controller.handle({type:'session-list-tasks'},TAB);
  await controller.handle({type:'session-refresh-task',endpoint:'/mcp',vaultTaskId:'v1'},TAB);
  assert.deepEqual(routed.map(row=>row[0]),['api-preview','mcp-list','tasks','task-refresh']);
  await assert.rejects(()=>controller.handle({type:'execute-api-tool'},TAB),/session message|unsupported/i);
});

test('session controller capability output is redacted and declares no background polling',async()=>{
  const controller=createSessionController({sessionBroker:{vault:{},publicCapabilities:()=>({storage:'chrome.storage.session',modelVisible:false,cloudVisible:false,backgroundPolling:false})},apiBroker:{publicCapabilities:()=>({sessionAuthorization:true,modelVisible:false,cloudVisible:false})}});
  const result=await controller.handle({type:'session-capabilities'},TAB);
  assert.equal(result.session.mcp.modelVisible,false);
  assert.equal(result.session.api.cloudVisible,false);
  assert.equal(result.session.mcp.backgroundPolling,false);
});
import {createSessionBroker} from './session-broker.js';
import {createSessionApiBroker} from './session-api-broker.js';

function originOfTab(tab){let url;try{url=new URL(String(tab?.url??''));}catch{throw new Error('The active tab does not expose a valid HTTP(S) URL.');}if(!Number.isInteger(tab?.id)||!['http:','https:'].includes(url.protocol))throw new Error('A user-authorized HTTP(S) tab is required.');return url.origin;}
function sessionOptions(message){return{includeWellKnownCatalog:message.includeWellKnownCatalog!==false,maxDescriptions:message.maxDescriptions??3,maxTools:message.maxTools??50,maxPages:message.maxPages??8,maxResponseBytes:message.maxResponseBytes,timeoutMs:message.timeoutMs,approved:message.approved===true,signal:message.signal};}

export function createSessionController({sessionBroker,apiBroker,storageArea,cryptoImpl,fetchImpl,chromeApi,now}={}){
  const mcp=sessionBroker??createSessionBroker({storageArea,cryptoImpl,fetchImpl,chromeApi,now});
  const api=apiBroker??createSessionApiBroker({vault:mcp.vault,chromeApi,fetchImpl,cryptoImpl});
  async function handle(message,tab){
    if(!message?.type?.startsWith('session-'))throw new Error('Unsupported session message.');
    const origin=originOfTab(tab),options=sessionOptions(message);
    switch(message.type){
      case'session-capabilities':return{ok:true,session:{mcp:mcp.publicCapabilities(),api:api.publicCapabilities()}};
      case'session-list-credentials':return{ok:true,credentials:await mcp.vault.listCredentialDescriptors(origin)};
      case'session-put-credential':{
        const input=message.credential??{};
        const credential=await mcp.vault.putCredential({credentialId:input.credentialId,revision:input.revision,origin,kind:input.kind,schemeName:input.schemeName,location:input.location,parameterName:input.parameterName,scopes:input.scopes,secret:input.secret});
        return{ok:true,credential};
      }
      case'session-remove-credential':return{ok:true,removed:await mcp.vault.removeCredential(message.credentialId),credentials:await mcp.vault.listCredentialDescriptors(origin)};
      case'session-clear-credentials':return{ok:true,removed:await mcp.vault.clearCredentials(origin),credentials:[]};
      case'session-preview-api':return api.previewApi(tab,message.operationName,message.arguments??{},options);
      case'session-execute-api':return api.executeApi(tab,message.operationName,message.arguments??{},message.expectedFingerprint,options);
      case'session-list-mcp-tools':return mcp.listMcpTools(tab,message.endpoint??'/mcp',message.credential,options);
      case'session-preview-mcp-tool':return mcp.previewMcpTool(tab,message.endpoint??'/mcp',message.toolName,message.arguments??{},message.credential,options);
      case'session-execute-mcp-tool':return mcp.executeMcpTool(tab,message.endpoint??'/mcp',message.toolName,message.arguments??{},message.credential,message.expectedFingerprint,options);
      case'session-preview-mcp-resume':return mcp.previewMcpResume(tab,message.endpoint??'/mcp',message.toolName,message.arguments??{},message.continuation,message.inputResponses??{},message.credential,options);
      case'session-execute-mcp-resume':return mcp.executeMcpResume(tab,message.endpoint??'/mcp',message.toolName,message.arguments??{},message.continuation,message.inputResponses??{},message.credential,message.expectedFingerprint,options);
      case'session-list-tasks':return{ok:true,tasks:await mcp.listTasks(origin)};
      case'session-refresh-task':return{ok:true,task:await mcp.refreshTask(tab,message.endpoint??'/mcp',message.vaultTaskId,options)};
      case'session-preview-task-update':return mcp.previewTaskUpdate(tab,message.endpoint??'/mcp',message.vaultTaskId,message.inputResponses??{},options);
      case'session-execute-task-update':return mcp.executeTaskUpdate(tab,message.endpoint??'/mcp',message.vaultTaskId,message.inputResponses??{},message.expectedFingerprint,options);
      case'session-preview-task-cancel':return mcp.previewTaskCancel(tab,message.endpoint??'/mcp',message.vaultTaskId,options);
      case'session-execute-task-cancel':return mcp.executeTaskCancel(tab,message.endpoint??'/mcp',message.vaultTaskId,message.expectedFingerprint,options);
      case'session-remove-task':return{ok:true,removed:await mcp.vault.removeTask(message.vaultTaskId),tasks:await mcp.listTasks(origin)};
      default:throw new Error(`Unsupported session message: ${message.type}`);
    }
  }
  return{handle,sessionBroker:mcp,apiBroker:api};
}

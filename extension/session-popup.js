const q=id=>document.getElementById(id);
const send=message=>chrome.runtime.sendMessage(message);
const show=(node,value)=>{if(!node)return;node.hidden=false;node.textContent=typeof value==='string'?value:JSON.stringify(value,null,2);};
const parseJson=(node,label)=>{try{return JSON.parse(node?.value||'{}');}catch{throw new Error(`${label} must contain valid JSON.`);}};
const selectedValue=id=>q(id)?.value||'';

const secretInput=q('session-secret');
const credentialList=q('session-credential-list');
const taskList=q('session-task-list');
const apiPreviewNode=q('session-api-preview');
const apiResultNode=q('session-api-result');
const mcpPreviewNode=q('session-mcp-preview');
const mcpResultNode=q('session-mcp-result');
const taskResultNode=q('session-task-result');

let credentials=[];
let tasks=[];
let apiFingerprint='';
let mcpFingerprint='';
let taskUpdateFingerprint='';
let taskCancelFingerprint='';

function errorText(error){return error instanceof Error?error.message:String(error);}
function descriptorById(id){return credentials.find(item=>item.credentialId===id)||null;}
function selectedCredential(){return descriptorById(credentialList?.value||'');}
function selectedBearer(){const descriptor=selectedCredential();if(!descriptor)throw new Error('Select a session credential first.');if(descriptor.kind!=='bearer-token')throw new Error('Protected MCP requires a Bearer / OAuth access-token session credential.');return descriptor;}
function selectedTaskId(){const id=taskList?.value||'';if(!id)throw new Error('Select a session task first.');return id;}
function endpoint(){return selectedValue('mcp-endpoint')||'/mcp';}
function operationName(){const name=selectedValue('api-operation');if(!name)throw new Error('Compile and select an OpenAPI operation first.');return name;}
function toolName(){const name=selectedValue('mcp-tool');if(!name)throw new Error('Select an MCP tool first.');return name;}
function apiArguments(){return parseJson(q('api-arguments'),'API arguments');}
function mcpArguments(){return parseJson(q('mcp-arguments'),'MCP arguments');}
function taskInputResponses(){return parseJson(q('session-task-input-responses'),'Task input responses');}

async function checked(message){const result=await send(message);if(!result||result.ok===false)throw new Error(result?.error||'Session operation failed.');return result;}

function renderCredentials(items){credentials=Array.isArray(items)?items:[];if(!credentialList)return;const previous=credentialList.value;credentialList.textContent='';for(const item of credentials){const option=document.createElement('option');option.value=item.credentialId;option.textContent=`${item.kind} · ${item.schemeName||'unnamed'} · rev ${item.revision}`;credentialList.append(option);}if(credentials.some(item=>item.credentialId===previous))credentialList.value=previous;}
function renderTasks(items){tasks=Array.isArray(items)?items:[];if(!taskList)return;const previous=taskList.value;taskList.textContent='';for(const item of tasks){const option=document.createElement('option');option.value=item.vaultTaskId;option.textContent=`${item.toolName||'MCP task'} · ${item.status||'unknown'}`;taskList.append(option);}if(tasks.some(item=>item.vaultTaskId===previous))taskList.value=previous;}

async function reloadCredentials(){const result=await checked({type:'session-list-credentials'});renderCredentials(result.credentials);return result.credentials;}
async function reloadTasks(){const result=await checked({type:'session-list-tasks'});renderTasks(result.tasks);return result.tasks;}

q('session-save-credential')?.addEventListener('click',async()=>{
  try{
    const kind=selectedValue('session-credential-kind');
    const secret=secretInput?.value||'';
    if(!secret)throw new Error('Enter a secret to store for this browser session.');
    const credential={kind,schemeName:selectedValue('session-scheme-name')||null,secret,scopes:selectedValue('session-scopes').split(',').map(value=>value.trim()).filter(Boolean)};
    if(kind==='api-key'){
      credential.location=selectedValue('session-api-key-location')||'header';
      credential.parameterName=selectedValue('session-api-key-name');
      if(!credential.schemeName||!credential.parameterName)throw new Error('API-key credentials require a security scheme name and parameter name.');
    }else if(!credential.schemeName){credential.schemeName='BearerAuth';}
    const result=await checked({type:'session-put-credential',credential});
    secretInput.value='';
    await reloadCredentials();
    if(credentialList)credentialList.value=result.credential.credentialId;
  }catch(error){show(apiResultNode,{ok:false,error:errorText(error)});}
});

q('session-remove-credential')?.addEventListener('click',async()=>{
  try{const credentialId=credentialList?.value;if(!credentialId)throw new Error('Select a credential to remove.');const result=await checked({type:'session-remove-credential',credentialId});renderCredentials(result.credentials);}catch(error){show(apiResultNode,{ok:false,error:errorText(error)});}
});
q('session-clear-credentials')?.addEventListener('click',async()=>{try{const result=await checked({type:'session-clear-credentials'});renderCredentials(result.credentials);}catch(error){show(apiResultNode,{ok:false,error:errorText(error)});}});

q('session-preview-api')?.addEventListener('click',async()=>{
  try{const result=await checked({type:'session-preview-api',operationName:operationName(),arguments:apiArguments()});apiFingerprint=result.previewFingerprint;show(apiPreviewNode,result);if(q('session-api-approval'))q('session-api-approval').checked=false;if(q('session-execute-api'))q('session-execute-api').disabled=true;}catch(error){apiFingerprint='';show(apiPreviewNode,{ok:false,error:errorText(error)});}
});
q('session-api-approval')?.addEventListener('change',event=>{if(q('session-execute-api'))q('session-execute-api').disabled=!(event.target.checked&&apiFingerprint);});
q('session-execute-api')?.addEventListener('click',async()=>{
  try{if(!q('session-api-approval')?.checked||!apiFingerprint)throw new Error('Preview and explicitly approve the exact API request first.');const result=await checked({type:'session-execute-api',operationName:operationName(),arguments:apiArguments(),expectedFingerprint:apiFingerprint,approved:true});show(apiResultNode,result);apiFingerprint='';q('session-api-approval').checked=false;q('session-execute-api').disabled=true;}catch(error){show(apiResultNode,{ok:false,error:errorText(error)});}
});

q('session-list-mcp-tools')?.addEventListener('click',async()=>{
  try{const result=await checked({type:'session-list-mcp-tools',endpoint:endpoint(),credential:selectedBearer()});const select=q('mcp-tool');if(select){select.textContent='';for(const item of result.inventory?.tools||[]){const option=document.createElement('option');option.value=item.name;option.textContent=item.title||item.name;select.append(option);}}show(mcpResultNode,{ok:true,server:result.server,toolCount:result.inventory?.tools?.length||0});}catch(error){show(mcpResultNode,{ok:false,error:errorText(error)});}
});
q('session-preview-mcp-tool')?.addEventListener('click',async()=>{
  try{const result=await checked({type:'session-preview-mcp-tool',endpoint:endpoint(),toolName:toolName(),arguments:mcpArguments(),credential:selectedBearer()});mcpFingerprint=result.previewFingerprint;show(mcpPreviewNode,result);q('session-mcp-approval').checked=false;q('session-execute-mcp-tool').disabled=true;}catch(error){mcpFingerprint='';show(mcpPreviewNode,{ok:false,error:errorText(error)});}
});
q('session-mcp-approval')?.addEventListener('change',event=>{q('session-execute-mcp-tool').disabled=!(event.target.checked&&mcpFingerprint);});
q('session-execute-mcp-tool')?.addEventListener('click',async()=>{
  try{if(!q('session-mcp-approval')?.checked||!mcpFingerprint)throw new Error('Preview and explicitly approve the exact MCP call first.');const result=await checked({type:'session-execute-mcp-tool',endpoint:endpoint(),toolName:toolName(),arguments:mcpArguments(),credential:selectedBearer(),expectedFingerprint:mcpFingerprint,approved:true});show(mcpResultNode,result);mcpFingerprint='';q('session-mcp-approval').checked=false;q('session-execute-mcp-tool').disabled=true;if(result.task)await reloadTasks();}catch(error){show(mcpResultNode,{ok:false,error:errorText(error)});}
});

q('session-refresh-task')?.addEventListener('click',async()=>{try{const result=await checked({type:'session-refresh-task',endpoint:endpoint(),vaultTaskId:selectedTaskId()});show(taskResultNode,result.task);await reloadTasks();}catch(error){show(taskResultNode,{ok:false,error:errorText(error)});}});
q('session-remove-task')?.addEventListener('click',async()=>{try{const result=await checked({type:'session-remove-task',vaultTaskId:selectedTaskId()});renderTasks(result.tasks);show(taskResultNode,{ok:true,removed:result.removed});}catch(error){show(taskResultNode,{ok:false,error:errorText(error)});}});
q('session-preview-task-update')?.addEventListener('click',async()=>{try{const result=await checked({type:'session-preview-task-update',endpoint:endpoint(),vaultTaskId:selectedTaskId(),inputResponses:taskInputResponses()});taskUpdateFingerprint=result.previewFingerprint;show(taskResultNode,result);q('session-task-update-approval').checked=false;q('session-execute-task-update').disabled=true;}catch(error){taskUpdateFingerprint='';show(taskResultNode,{ok:false,error:errorText(error)});}});
q('session-task-update-approval')?.addEventListener('change',event=>{q('session-execute-task-update').disabled=!(event.target.checked&&taskUpdateFingerprint);});
q('session-execute-task-update')?.addEventListener('click',async()=>{try{if(!q('session-task-update-approval')?.checked||!taskUpdateFingerprint)throw new Error('Preview and explicitly approve the exact task update first.');const result=await checked({type:'session-execute-task-update',endpoint:endpoint(),vaultTaskId:selectedTaskId(),inputResponses:taskInputResponses(),expectedFingerprint:taskUpdateFingerprint,approved:true});show(taskResultNode,result);taskUpdateFingerprint='';q('session-task-update-approval').checked=false;q('session-execute-task-update').disabled=true;await reloadTasks();}catch(error){show(taskResultNode,{ok:false,error:errorText(error)});}});
q('session-preview-task-cancel')?.addEventListener('click',async()=>{try{const result=await checked({type:'session-preview-task-cancel',endpoint:endpoint(),vaultTaskId:selectedTaskId()});taskCancelFingerprint=result.previewFingerprint;show(taskResultNode,result);q('session-task-cancel-approval').checked=false;q('session-execute-task-cancel').disabled=true;}catch(error){taskCancelFingerprint='';show(taskResultNode,{ok:false,error:errorText(error)});}});
q('session-task-cancel-approval')?.addEventListener('change',event=>{q('session-execute-task-cancel').disabled=!(event.target.checked&&taskCancelFingerprint);});
q('session-execute-task-cancel')?.addEventListener('click',async()=>{try{if(!q('session-task-cancel-approval')?.checked||!taskCancelFingerprint)throw new Error('Preview and explicitly approve the cancellation request first.');const result=await checked({type:'session-execute-task-cancel',endpoint:endpoint(),vaultTaskId:selectedTaskId(),expectedFingerprint:taskCancelFingerprint,approved:true});show(taskResultNode,result);taskCancelFingerprint='';q('session-task-cancel-approval').checked=false;q('session-execute-task-cancel').disabled=true;await reloadTasks();}catch(error){show(taskResultNode,{ok:false,error:errorText(error)});}});

Promise.all([reloadCredentials(),reloadTasks()]).catch(error=>show(taskResultNode,{ok:false,error:errorText(error)}));

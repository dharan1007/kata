const STORAGE_KEY='kata.sessionVault.v1';
const MAX_SECRET_BYTES=16*1024;
const MAX_CREDENTIALS=64;
const MAX_TASKS=128;
const MAX_TASK_RECORD_BYTES=256*1024;
const CREDENTIAL_KINDS=new Set(['api-key','bearer-token']);
const API_KEY_LOCATIONS=new Set(['header','query']);

function utf8Bytes(value){return new TextEncoder().encode(String(value??'')).length;}
function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
function originOf(value){let url;try{url=new URL(String(value));}catch{throw new TypeError('A valid HTTP(S) origin is required.');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new TypeError('A valid HTTP(S) origin is required.');return url.origin;}
function safeString(value,name,max=512){if(typeof value!=='string'||!value||utf8Bytes(value)>max)throw new TypeError(`${name} is invalid.`);return value;}
function randomId(cryptoImpl){if(!cryptoImpl?.getRandomValues)throw new Error('Web Crypto random generation is unavailable.');const bytes=new Uint8Array(16);cryptoImpl.getRandomValues(bytes);return [...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
function emptyState(){return{version:1,credentials:{},tasks:{}};}
function normalizeState(raw){if(!raw||typeof raw!=='object'||raw.version!==1)return emptyState();return{version:1,credentials:raw.credentials&&typeof raw.credentials==='object'&&!Array.isArray(raw.credentials)?raw.credentials:{},tasks:raw.tasks&&typeof raw.tasks==='object'&&!Array.isArray(raw.tasks)?raw.tasks:{}};}
function credentialDescriptor(record){return{credentialId:record.credentialId,revision:record.revision,origin:record.origin,kind:record.kind,schemeName:record.schemeName??null,location:record.location??null,parameterName:record.parameterName??null,scopes:Array.isArray(record.scopes)?[...record.scopes]:[],createdAt:record.createdAt,updatedAt:record.updatedAt};}
function taskDescriptor(record){return{vaultTaskId:record.vaultTaskId,origin:record.origin,toolName:record.toolName??null,status:record.status??null,pollIntervalMs:Number.isFinite(record.pollIntervalMs)?record.pollIntervalMs:null,ttlMs:Number.isFinite(record.ttlMs)?record.ttlMs:null,createdAt:record.vaultCreatedAt,updatedAt:record.vaultUpdatedAt};}

export function createSessionVault(storageArea,cryptoImpl=globalThis.crypto,now=()=>Date.now()){
  if(!storageArea?.get||!storageArea?.set||!storageArea?.remove)throw new TypeError('A chrome.storage.session-compatible storage area is required.');
  let writeQueue=Promise.resolve();
  async function read(){const raw=await storageArea.get([STORAGE_KEY]);return normalizeState(raw?.[STORAGE_KEY]);}
  async function write(state){await storageArea.set({[STORAGE_KEY]:state});}
  function mutate(fn){const run=writeQueue.then(async()=>{const state=await read();const result=await fn(state);await write(state);return result;});writeQueue=run.catch(()=>{});return run;}

  async function putCredential(input){
    if(!input||typeof input!=='object')throw new TypeError('A credential record is required.');
    const origin=originOf(input.origin),kind=safeString(input.kind,'Credential kind',64);if(!CREDENTIAL_KINDS.has(kind))throw new TypeError('Credential kind is not supported.');
    const secret=safeString(input.secret,'Credential secret',MAX_SECRET_BYTES);if(utf8Bytes(secret)>MAX_SECRET_BYTES)throw new TypeError('Credential secret is too large.');
    const schemeName=input.schemeName==null?null:safeString(input.schemeName,'Credential scheme name',256);
    let location=null,parameterName=null;
    if(kind==='api-key'){
      location=safeString(input.location,'API key location',32);if(!API_KEY_LOCATIONS.has(location))throw new TypeError('API key location must be header or query.');
      parameterName=safeString(input.parameterName,'API key parameter name',256);
    }
    const scopes=Array.isArray(input.scopes)?input.scopes.map(scope=>safeString(scope,'Credential scope',256)).slice(0,64):[];
    return mutate(async state=>{
      const id=input.credentialId==null?randomId(cryptoImpl):safeString(input.credentialId,'Credential id',128);
      const existing=state.credentials[id]??null;
      if(existing){
        if(input.revision!==existing.revision)throw new Error('Credential revision is stale.');
        if(existing.origin!==origin)throw new Error('Credential origin does not match the existing binding.');
        if(existing.kind!==kind)throw new Error('Credential kind cannot change for an existing binding.');
      }else if(Object.keys(state.credentials).length>=MAX_CREDENTIALS)throw new Error('Session credential limit exceeded.');
      const timestamp=Number(now());
      const record={credentialId:id,revision:existing?existing.revision+1:1,origin,kind,schemeName,location,parameterName,scopes,secret,createdAt:existing?.createdAt??timestamp,updatedAt:timestamp};
      state.credentials[id]=record;
      return credentialDescriptor(record);
    });
  }

  async function listCredentialDescriptors(origin){const state=await read();const normalized=origin==null?null:originOf(origin);return Object.values(state.credentials).filter(record=>!normalized||record.origin===normalized).map(credentialDescriptor).sort((a,b)=>a.credentialId.localeCompare(b.credentialId));}
  async function resolveCredential(binding){
    if(!binding||typeof binding!=='object')throw new TypeError('A credential binding is required.');
    const id=safeString(binding.credentialId,'Credential id',128),state=await read(),record=state.credentials[id];if(!record)throw new Error('Session credential was not found.');
    if(binding.revision!==record.revision)throw new Error('Credential revision is stale.');
    if(originOf(binding.origin)!==record.origin)throw new Error('Credential origin does not match the stored binding.');
    if(binding.kind!==undefined&&binding.kind!==record.kind)throw new Error('Credential kind does not match the stored binding.');
    if(binding.schemeName!==undefined&&binding.schemeName!==null&&binding.schemeName!==record.schemeName)throw new Error('Credential scheme does not match the stored binding.');
    return clone(record);
  }
  async function removeCredential(id){const credentialId=safeString(id,'Credential id',128);return mutate(async state=>{const existed=Boolean(state.credentials[credentialId]);delete state.credentials[credentialId];return existed;});}
  async function clearCredentials(origin){const normalized=origin==null?null:originOf(origin);return mutate(async state=>{let removed=0;for(const [id,record] of Object.entries(state.credentials)){if(!normalized||record.origin===normalized){delete state.credentials[id];removed++;}}return removed;});}

  async function putTask(input){
    if(!input||typeof input!=='object')throw new TypeError('An MCP task record is required.');
    const endpoint=safeString(input.endpoint,'MCP task endpoint',16384),origin=originOf(endpoint),taskId=safeString(input.taskId,'MCP task id',4096);
    const serialized=JSON.stringify(input);if(utf8Bytes(serialized)>MAX_TASK_RECORD_BYTES)throw new TypeError('MCP task record is too large.');
    return mutate(async state=>{
      const vaultTaskId=input.vaultTaskId==null?randomId(cryptoImpl):safeString(input.vaultTaskId,'Vault task id',128),existing=state.tasks[vaultTaskId]??null;
      if(!existing&&Object.keys(state.tasks).length>=MAX_TASKS)throw new Error('Session task limit exceeded.');
      if(existing&&existing.origin!==origin)throw new Error('MCP task origin cannot change.');
      const timestamp=Number(now());
      const record={...clone(input),vaultTaskId,endpoint,newTask:false,origin,taskId,vaultCreatedAt:existing?.vaultCreatedAt??timestamp,vaultUpdatedAt:timestamp};
      state.tasks[vaultTaskId]=record;
      return taskDescriptor(record);
    });
  }
  async function listTaskDescriptors(origin){const state=await read(),normalized=origin==null?null:originOf(origin);return Object.values(state.tasks).filter(record=>!normalized||record.origin===normalized).map(taskDescriptor).sort((a,b)=>a.vaultTaskId.localeCompare(b.vaultTaskId));}
  async function resolveTask(vaultTaskId){const id=safeString(vaultTaskId,'Vault task id',128),state=await read(),record=state.tasks[id];if(!record)throw new Error('Session MCP task was not found.');return clone(record);}
  async function removeTask(vaultTaskId){const id=safeString(vaultTaskId,'Vault task id',128);return mutate(async state=>{const existed=Boolean(state.tasks[id]);delete state.tasks[id];return existed;});}

  return{putCredential,listCredentialDescriptors,resolveCredential,removeCredential,clearCredentials,putTask,listTaskDescriptors,resolveTask,removeTask};
}

export const sessionVaultLimits=Object.freeze({maxSecretBytes:MAX_SECRET_BYTES,maxCredentials:MAX_CREDENTIALS,maxTasks:MAX_TASKS,maxTaskRecordBytes:MAX_TASK_RECORD_BYTES,storageKey:STORAGE_KEY});
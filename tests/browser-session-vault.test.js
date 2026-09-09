import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'extension','manifest.json'),'utf8'));
const moduleUrl=pathToFileURL(path.join(root,'extension','session-vault.js')).href;
const vaultModule=await import(`${moduleUrl}?test=${Date.now()}`).catch(()=>({}));
const createSessionVault=vaultModule.createSessionVault;

function storageArea(){
  const data={};
  return{
    data,
    async get(keys){if(keys===null||keys===undefined)return structuredClone(data);const names=Array.isArray(keys)?keys:[keys];const out={};for(const key of names)if(Object.prototype.hasOwnProperty.call(data,key))out[key]=structuredClone(data[key]);return out;},
    async set(values){for(const [key,value] of Object.entries(values))data[key]=structuredClone(value);},
    async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete data[key];},
    async clear(){for(const key of Object.keys(data))delete data[key];}
  };
}
function deterministicCrypto(){let n=0;return{getRandomValues(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=(n++*17+11)&255;return bytes;}};}

async function vault(storage=storageArea()){
  assert.equal(typeof createSessionVault,'function','extension/session-vault.js must export createSessionVault');
  return{storage,vault:createSessionVault(storage,deterministicCrypto(),()=>1700000000000)};
}

test('extension session vault uses Chrome 102+ storage permission without broad authority',()=>{
  assert.ok(Number(manifest.minimum_chrome_version)>=102);
  assert.deepEqual([...manifest.permissions].sort(),['activeTab','scripting','storage']);
  assert.deepEqual(manifest.host_permissions,['https://kata-webmcp.vercel.app/*']);
  const serialized=JSON.stringify(manifest);
  for(const forbidden of ['<all_urls>','cookies','webRequest','debugger','history','downloads','nativeMessaging','identity','alarms'])assert.equal(serialized.includes(forbidden),false,`forbidden extension authority: ${forbidden}`);
});

test('credential descriptors are redacted and resolution is exact-origin plus exact-revision',async()=>{
  const {vault:v}=await vault();
  const created=await v.putCredential({origin:'https://app.test',kind:'api-key',schemeName:'ApiKey',location:'header',parameterName:'X-API-Key',secret:'super-secret-value'});
  assert.equal(created.origin,'https://app.test');
  assert.equal(created.kind,'api-key');
  assert.equal(created.revision,1);
  assert.equal('secret' in created,false);
  assert.equal(JSON.stringify(created).includes('super-secret-value'),false);
  const listed=await v.listCredentialDescriptors('https://app.test');
  assert.equal(listed.length,1);
  assert.equal(JSON.stringify(listed).includes('super-secret-value'),false);
  const resolved=await v.resolveCredential({...created});
  assert.equal(resolved.secret,'super-secret-value');
  await assert.rejects(()=>v.resolveCredential({...created,origin:'https://other.test'}),/origin/i);
  await v.putCredential({...created,secret:'rotated-secret'});
  await assert.rejects(()=>v.resolveCredential(created),/revision|stale/i);
});

test('credential vault enforces secret size and never lists raw values',async()=>{
  const {vault:v}=await vault();
  await assert.rejects(()=>v.putCredential({origin:'https://app.test',kind:'bearer-token',schemeName:'Bearer',secret:'x'.repeat(16*1024+1)}),/secret.*large|size/i);
  await v.putCredential({origin:'https://app.test',kind:'bearer-token',schemeName:'Bearer',secret:'token-123'});
  assert.equal(JSON.stringify(await v.listCredentialDescriptors()).includes('token-123'),false);
});

test('MCP task handles survive popup and service-worker recreation within one browser session',async()=>{
  const shared=storageArea();
  const first=await vault(shared);
  const stored=await first.vault.putTask({endpoint:'https://app.test/mcp',toolName:'long_job',taskId:'opaque-task-handle',status:'working',pollIntervalMs:1500,ttlMs:60000,previewFingerprint:'a'.repeat(64)});
  assert.equal('taskId' in stored,false,'popup-facing task descriptor must not expose the remote task id');
  const second=await vault(shared);
  const descriptors=await second.vault.listTaskDescriptors('https://app.test');
  assert.equal(descriptors.length,1);
  assert.equal(descriptors[0].vaultTaskId,stored.vaultTaskId);
  assert.equal(JSON.stringify(descriptors).includes('opaque-task-handle'),false);
  const recovered=await second.vault.resolveTask(stored.vaultTaskId);
  assert.equal(recovered.taskId,'opaque-task-handle');
  assert.equal(recovered.status,'working');
  await second.vault.removeTask(stored.vaultTaskId);
  await assert.rejects(()=>second.vault.resolveTask(stored.vaultTaskId),/not found|missing/i);
});
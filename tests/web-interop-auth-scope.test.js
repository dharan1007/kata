import test from 'node:test';
import assert from 'node:assert/strict';
import {createToolRegistry,toolDefinitions} from '../lib/server/tools.js';

const diagnose=async environment=>createToolRegistry({openAlex:async()=>({works:[]})}).invoke('kata_diagnose_web_interop',{intent:'automate',environment});

const base={
  webMcpApi:'available',
  frame:'top',
  toolsPermission:'allowed',
  originExposure:'not-required',
  api:'documented',
  cors:'allowed',
  cspConnect:'allowed',
  rateLimit:'ok',
  botProtection:'clear',
  terms:'allowed',
  userAuthorizedBrowserFlow:true,
  serverSideApiAvailable:true
};

test('interop schema accepts an explicit authentication scope',()=>{
  const tool=toolDefinitions.find(x=>x.name==='kata_diagnose_web_interop');
  const scope=tool.inputSchema.properties.environment.properties.authScope;
  assert.deepEqual(scope.enum,['browser','all-paths','unknown']);
});

test('browser-scoped authentication preserves an independently supported documented server API',async()=>{
  const result=await diagnose({...base,auth:'required',authScope:'browser'});
  assert.equal(result.status,'possible');
  assert.equal(result.primaryPath,'server_api');
  assert.ok(result.blockers.some(x=>x.code==='AUTH_REQUIRED'));
  assert.match(result.blockers.find(x=>x.code==='AUTH_REQUIRED').remediation,/browser|server API/i);
  assert.doesNotMatch(JSON.stringify(result).toLowerCase(),/bypass|evade|circumvent/);
});

test('authentication requirement without explicit browser scope remains setup-required',async()=>{
  const result=await diagnose({...base,auth:'required'});
  assert.equal(result.status,'setup_required');
  assert.ok(result.blockers.some(x=>x.code==='AUTH_REQUIRED'));
});

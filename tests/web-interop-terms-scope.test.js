import test from 'node:test';
import assert from 'node:assert/strict';
import {createToolRegistry,toolDefinitions} from '../lib/server/tools.js';

const diagnose=async environment=>createToolRegistry({openAlex:async()=>({works:[]})}).invoke('kata_diagnose_web_interop',{intent:'automate',environment});

test('interop schema accepts an explicit service-policy scope',()=>{
  const tool=toolDefinitions.find(x=>x.name==='kata_diagnose_web_interop');
  const scope=tool.inputSchema.properties.environment.properties.termsScope;
  assert.deepEqual(scope.enum,['browser','all-paths','unknown']);
});

test('browser-scoped service restriction preserves an explicitly permitted documented server API',async()=>{
  const result=await diagnose({
    webMcpApi:'available',
    frame:'top',
    toolsPermission:'allowed',
    originExposure:'not-required',
    api:'documented',
    auth:'authenticated',
    cors:'allowed',
    cspConnect:'allowed',
    rateLimit:'ok',
    botProtection:'clear',
    terms:'restricted',
    termsScope:'browser',
    userAuthorizedBrowserFlow:false,
    serverSideApiAvailable:true
  });
  assert.equal(result.status,'possible');
  assert.equal(result.primaryPath,'server_api');
  assert.ok(result.blockers.some(x=>x.code==='TERMS_RESTRICTED'));
  assert.match(result.blockers.find(x=>x.code==='TERMS_RESTRICTED').remediation,/server API|service policy/i);
  assert.doesNotMatch(JSON.stringify(result).toLowerCase(),/bypass|evade|circumvent/);
});

test('service restriction without explicit browser scope remains blocked',async()=>{
  const result=await diagnose({
    webMcpApi:'available',
    frame:'top',
    toolsPermission:'allowed',
    originExposure:'not-required',
    api:'documented',
    auth:'authenticated',
    cors:'allowed',
    cspConnect:'allowed',
    rateLimit:'ok',
    botProtection:'clear',
    terms:'restricted',
    userAuthorizedBrowserFlow:false,
    serverSideApiAvailable:true
  });
  assert.equal(result.status,'blocked');
  assert.ok(result.blockers.some(x=>x.code==='TERMS_RESTRICTED'));
});

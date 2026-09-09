import test from 'node:test';
import assert from 'node:assert/strict';
import {createToolRegistry} from '../lib/server/tools.js';

const diagnose=async environment=>createToolRegistry({openAlex:async()=>({works:[]})}).invoke('kata_diagnose_web_interop',{intent:'automate',environment});

const base={
  webMcpApi:'available',
  frame:'top',
  toolsPermission:'blocked',
  originExposure:'not-required',
  api:'none',
  auth:'none',
  cors:'not-applicable',
  cspConnect:'not-applicable',
  rateLimit:'ok',
  botProtection:'clear',
  terms:'allowed',
  userAuthorizedBrowserFlow:false
};

test('top-level Permissions-Policy tools=() blocks WebMCP instead of reporting it possible',async()=>{
  const result=await diagnose({...base});
  assert.equal(result.status,'blocked');
  assert.equal(result.primaryPath,'webmcp');
  const blocker=result.blockers.find(x=>x.code==='WEBMCP_PERMISSION_POLICY');
  assert.ok(blocker);
  assert.match(blocker.reason,/permission/i);
  assert.match(blocker.remediation,/Permissions-Policy|tools/i);
});

test('same-origin iframe with tools permission explicitly blocked cannot be treated as usable WebMCP',async()=>{
  const result=await diagnose({...base,frame:'same-origin'});
  assert.equal(result.status,'blocked');
  assert.ok(result.blockers.some(x=>x.code==='WEBMCP_PERMISSION_POLICY'));
});

test('blocked browser WebMCP can use a separately established documented server API',async()=>{
  const result=await diagnose({...base,api:'documented',auth:'authenticated',cors:'allowed',cspConnect:'allowed',serverSideApiAvailable:true});
  assert.equal(result.status,'possible');
  assert.equal(result.primaryPath,'server_api');
  assert.ok(result.blockers.some(x=>x.code==='WEBMCP_PERMISSION_POLICY'));
  assert.doesNotMatch(JSON.stringify(result).toLowerCase(),/bypass|evade|circumvent/);
});

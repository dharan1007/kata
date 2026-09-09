import test from 'node:test';
import assert from 'node:assert/strict';
import {createToolRegistry,toolDefinitions} from '../lib/server/tools.js';

const diagnose=async environment=>createToolRegistry({openAlex:async()=>({works:[]})}).invoke('kata_diagnose_web_interop',{intent:'automate',environment});
const base={webMcpApi:'available',frame:'cross-origin',toolsPermission:'allowed',originExposure:'allowed',api:'none',auth:'none',cors:'not-applicable',cspConnect:'not-applicable',rateLimit:'ok',botProtection:'clear',terms:'allowed',userAuthorizedBrowserFlow:false};

test('interop schema exposes explicit cross-origin WebMCP discovery state',()=>{
  const tool=toolDefinitions.find(x=>x.name==='kata_diagnose_web_interop');
  const schema=tool.inputSchema.properties.environment.properties.crossOriginRequest;
  assert.deepEqual(schema,{type:'string',enum:['requested','not-requested','not-required','unknown']});
});

test('missing fromOrigins request is setup-required instead of falsely possible',async()=>{
  const result=await diagnose({...base,crossOriginRequest:'not-requested'});
  assert.equal(result.status,'setup_required');
  assert.equal(result.primaryPath,'webmcp');
  const blocker=result.blockers.find(x=>x.code==='WEBMCP_FROM_ORIGINS_REQUIRED');
  assert.ok(blocker);
  assert.match(blocker.remediation,/getTools\(\{fromOrigins:/);
  assert.match(blocker.remediation,/secure producer origin/i);
});

test('explicit cross-origin request keeps otherwise valid WebMCP path possible',async()=>{
  const result=await diagnose({...base,crossOriginRequest:'requested'});
  assert.equal(result.status,'possible');
  assert.equal(result.primaryPath,'webmcp');
  assert.equal(result.blockers.some(x=>x.code==='WEBMCP_FROM_ORIGINS_REQUIRED'),false);
});

test('missing cross-origin request can fall back to a separately supported documented API',async()=>{
  const result=await diagnose({...base,crossOriginRequest:'not-requested',api:'documented',auth:'authenticated',cors:'allowed',cspConnect:'allowed',serverSideApiAvailable:true});
  assert.equal(result.status,'possible');
  assert.equal(result.primaryPath,'server_api');
  assert.ok(result.blockers.some(x=>x.code==='WEBMCP_FROM_ORIGINS_REQUIRED'));
  assert.doesNotMatch(JSON.stringify(result).toLowerCase(),/bypass|evade|circumvent/);
});

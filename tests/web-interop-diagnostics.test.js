import test from 'node:test';
import assert from 'node:assert/strict';
import {createToolRegistry,toolDefinitions} from '../lib/server/tools.js';

const diagnose=async environment=>createToolRegistry({openAlex:async()=>({works:[]})}).invoke('kata_diagnose_web_interop',{intent:'automate',environment});

test('canonical registry exposes deterministic web interoperability diagnostics',()=>{
  const tool=toolDefinitions.find(x=>x.name==='kata_diagnose_web_interop');
  assert.ok(tool);
  assert.equal(tool.annotations.readOnlyHint,true);
  assert.equal(tool.annotations.openWorldHint,false);
});

test('blocked cross-origin WebMCP delegation reports the control and compliant remediation',async()=>{
  const result=await diagnose({webMcpApi:'available',frame:'cross-origin',toolsPermission:'blocked',originExposure:'allowed',api:'none',auth:'none',cors:'not-applicable',cspConnect:'not-applicable',rateLimit:'ok',botProtection:'clear',terms:'allowed',userAuthorizedBrowserFlow:false});
  assert.equal(result.status,'blocked');
  assert.equal(result.primaryPath,'webmcp');
  assert.ok(result.blockers.some(x=>x.code==='WEBMCP_PERMISSION_POLICY'));
  assert.match(result.blockers.find(x=>x.code==='WEBMCP_PERMISSION_POLICY').remediation,/Permissions-Policy|allow="tools"/);
});

test('blocked WebMCP prefers an already supported documented API fallback',async()=>{
  const result=await diagnose({webMcpApi:'available',frame:'cross-origin',toolsPermission:'blocked',originExposure:'blocked',api:'documented',auth:'authenticated',cors:'allowed',cspConnect:'allowed',rateLimit:'ok',botProtection:'clear',terms:'allowed',userAuthorizedBrowserFlow:false,serverSideApiAvailable:true});
  assert.equal(result.status,'possible');
  assert.equal(result.primaryPath,'server_api');
  assert.ok(result.blockers.some(x=>x.code==='WEBMCP_PERMISSION_POLICY'));
  assert.ok(result.blockers.some(x=>x.code==='WEBMCP_ORIGIN_EXPOSURE'));
  assert.match(result.recommendedAction,/server-side|server side/i);
});

test('authentication and bot controls never produce a bypass recommendation',async()=>{
  const result=await diagnose({webMcpApi:'unavailable',frame:'top',toolsPermission:'unknown',originExposure:'not-required',api:'documented',auth:'required',cors:'allowed',cspConnect:'allowed',rateLimit:'ok',botProtection:'challenge',terms:'allowed',userAuthorizedBrowserFlow:true});
  assert.equal(result.status,'setup_required');
  assert.ok(result.blockers.some(x=>x.code==='AUTH_REQUIRED'));
  assert.ok(result.blockers.some(x=>x.code==='BOT_CHALLENGE'));
  const guidance=JSON.stringify(result).toLowerCase();
  assert.doesNotMatch(guidance,/bypass|evade|disable captcha|circumvent/);
  assert.match(guidance,/user-authorized|documented api/);
});

test('documented API authentication is setup-required even without a browser login flow',async()=>{
  const result=await diagnose({webMcpApi:'unavailable',frame:'top',toolsPermission:'unknown',originExposure:'not-required',api:'documented',auth:'required',cors:'not-applicable',cspConnect:'not-applicable',rateLimit:'ok',botProtection:'clear',terms:'allowed',userAuthorizedBrowserFlow:false,serverSideApiAvailable:true});
  assert.equal(result.status,'setup_required');
  assert.equal(result.primaryPath,'server_api');
  assert.ok(result.blockers.some(x=>x.code==='AUTH_REQUIRED'));
  assert.match(result.recommendedAction,/credential|oauth/i);
  assert.doesNotMatch(JSON.stringify(result).toLowerCase(),/bypass|circumvent/);
});

test('browser-scoped bot challenge does not block an explicitly supported server API',async()=>{
  const result=await diagnose({webMcpApi:'unavailable',frame:'top',toolsPermission:'unknown',originExposure:'not-required',api:'documented',auth:'authenticated',cors:'not-applicable',cspConnect:'not-applicable',rateLimit:'ok',botProtection:'challenge',botProtectionScope:'browser',terms:'allowed',userAuthorizedBrowserFlow:false,serverSideApiAvailable:true});
  assert.equal(result.status,'possible');
  assert.equal(result.primaryPath,'server_api');
  assert.ok(result.blockers.some(x=>x.code==='BOT_CHALLENGE'));
  assert.match(result.recommendedAction,/server-side|server side/i);
  assert.doesNotMatch(JSON.stringify(result).toLowerCase(),/bypass|evade|disable captcha|circumvent/);
});

test('browser-scoped bot challenge keeps server API primary even when WebMCP is available',async()=>{
  const result=await diagnose({webMcpApi:'available',frame:'top',toolsPermission:'allowed',originExposure:'not-required',api:'documented',auth:'authenticated',cors:'allowed',cspConnect:'allowed',rateLimit:'ok',botProtection:'challenge',botProtectionScope:'browser',terms:'allowed',userAuthorizedBrowserFlow:false,serverSideApiAvailable:true});
  assert.equal(result.status,'possible');
  assert.equal(result.primaryPath,'server_api');
  assert.ok(result.blockers.some(x=>x.code==='BOT_CHALLENGE'));
  assert.match(result.recommendedAction,/server-side|server side/i);
  assert.doesNotMatch(JSON.stringify(result).toLowerCase(),/bypass|evade|disable captcha|circumvent/);
});

test('browser-scoped rate limit does not downgrade an independently supported server API',async()=>{
  const result=await diagnose({webMcpApi:'unavailable',frame:'top',toolsPermission:'unknown',originExposure:'not-required',api:'documented',auth:'authenticated',cors:'not-applicable',cspConnect:'not-applicable',rateLimit:'limited',rateLimitScope:'browser',botProtection:'clear',terms:'allowed',userAuthorizedBrowserFlow:false,serverSideApiAvailable:true});
  assert.equal(result.status,'possible');
  assert.equal(result.primaryPath,'server_api');
  assert.ok(result.blockers.some(x=>x.code==='RATE_LIMITED'));
  assert.match(result.blockers.find(x=>x.code==='RATE_LIMITED').remediation,/Retry-After|separate supported quota/i);
  assert.doesNotMatch(JSON.stringify(result).toLowerCase(),/bypass|evade|circumvent/);
});

test('browser-scoped rate limit keeps server API primary when WebMCP is available',async()=>{
  const result=await diagnose({webMcpApi:'available',frame:'top',toolsPermission:'allowed',originExposure:'not-required',api:'documented',auth:'authenticated',cors:'allowed',cspConnect:'allowed',rateLimit:'limited',rateLimitScope:'browser',botProtection:'clear',terms:'allowed',userAuthorizedBrowserFlow:false,serverSideApiAvailable:true});
  assert.equal(result.status,'possible');
  assert.equal(result.primaryPath,'server_api');
  assert.ok(result.blockers.some(x=>x.code==='RATE_LIMITED'));
  assert.match(result.recommendedAction,/server-side|server side/i);
});

test('rate limiting without an explicit browser scope remains conservative',async()=>{
  const result=await diagnose({webMcpApi:'unavailable',frame:'top',toolsPermission:'unknown',originExposure:'not-required',api:'documented',auth:'authenticated',cors:'not-applicable',cspConnect:'not-applicable',rateLimit:'limited',botProtection:'clear',terms:'allowed',userAuthorizedBrowserFlow:false,serverSideApiAvailable:true});
  assert.equal(result.status,'setup_required');
  assert.equal(result.primaryPath,'server_api');
  assert.ok(result.blockers.some(x=>x.code==='RATE_LIMITED'));
});

test('CORS-blocked browser API does not downgrade a viable server-side documented API',async()=>{
  const result=await diagnose({webMcpApi:'unavailable',frame:'top',toolsPermission:'unknown',originExposure:'not-required',api:'documented',auth:'authenticated',cors:'blocked',cspConnect:'allowed',rateLimit:'ok',botProtection:'clear',terms:'allowed',userAuthorizedBrowserFlow:false,serverSideApiAvailable:true});
  assert.equal(result.status,'possible');
  assert.equal(result.primaryPath,'server_api');
  assert.ok(result.blockers.some(x=>x.code==='CORS_BLOCKED'));
  assert.match(result.recommendedAction,/server-side|server side/i);
});

test('CSP connect-src blocked browser API does not downgrade a viable server-side documented API',async()=>{
  const result=await diagnose({webMcpApi:'unavailable',frame:'top',toolsPermission:'unknown',originExposure:'not-required',api:'documented',auth:'authenticated',cors:'allowed',cspConnect:'blocked',rateLimit:'ok',botProtection:'clear',terms:'allowed',userAuthorizedBrowserFlow:false,serverSideApiAvailable:true});
  assert.equal(result.status,'possible');
  assert.equal(result.primaryPath,'server_api');
  assert.ok(result.blockers.some(x=>x.code==='CSP_CONNECT_BLOCKED'));
  assert.match(result.recommendedAction,/server-side|server side/i);
});

test('CORS-blocked documented browser API does not displace an independently viable WebMCP path',async()=>{
  const result=await diagnose({webMcpApi:'available',frame:'top',toolsPermission:'allowed',originExposure:'not-required',api:'documented',auth:'authenticated',cors:'blocked',cspConnect:'allowed',rateLimit:'ok',botProtection:'clear',terms:'allowed',userAuthorizedBrowserFlow:false,serverSideApiAvailable:false});
  assert.equal(result.status,'possible');
  assert.equal(result.primaryPath,'webmcp');
  assert.ok(result.blockers.some(x=>x.code==='CORS_BLOCKED'));
  assert.match(result.recommendedAction,/WebMCP/i);
});

test('CSP-blocked documented browser API does not displace an independently viable WebMCP path',async()=>{
  const result=await diagnose({webMcpApi:'available',frame:'top',toolsPermission:'allowed',originExposure:'not-required',api:'documented',auth:'authenticated',cors:'allowed',cspConnect:'blocked',rateLimit:'ok',botProtection:'clear',terms:'allowed',userAuthorizedBrowserFlow:false,serverSideApiAvailable:false});
  assert.equal(result.status,'possible');
  assert.equal(result.primaryPath,'webmcp');
  assert.ok(result.blockers.some(x=>x.code==='CSP_CONNECT_BLOCKED'));
  assert.match(result.recommendedAction,/WebMCP/i);
});

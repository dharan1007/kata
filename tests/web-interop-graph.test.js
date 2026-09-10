import test from 'node:test';
import assert from 'node:assert/strict';
import {buildInteropGraph} from '../lib/server/interop-graph.js';

const base={webMcpApi:'available',frame:'top',toolsPermission:'allowed',originExposure:'not-required',crossOriginRequest:'not-required',api:'documented',auth:'authenticated',authScope:'unknown',cors:'allowed',cspConnect:'allowed',rateLimit:'ok',rateLimitScope:'unknown',botProtection:'clear',botProtectionScope:'unknown',terms:'allowed',termsScope:'unknown',userAuthorizedBrowserFlow:false,serverSideApiAvailable:true};

test('evidence graph evaluates paths independently and prefers an immediately usable WebMCP path',()=>{
  const graph=buildInteropGraph(base);
  assert.equal(graph.paths.webmcp.status,'possible');
  assert.equal(graph.paths.server_api.status,'possible');
  assert.equal(graph.paths.browser_api.status,'possible');
  assert.deepEqual(graph.decision,{status:'possible',primaryPath:'webmcp'});
  assert.ok(graph.decisionTrace.every(x=>typeof x.status==='string'));
});

test('browser-scoped authentication degrades browser paths without contaminating an established server API',()=>{
  const graph=buildInteropGraph({...base,auth:'required',authScope:'browser'});
  assert.equal(graph.paths.webmcp.status,'setup_required');
  assert.equal(graph.paths.browser_api.status,'setup_required');
  assert.equal(graph.paths.server_api.status,'possible');
  assert.deepEqual(graph.decision,{status:'possible',primaryPath:'server_api'});
});

test('CORS and connect-src constrain browser API only',()=>{
  const graph=buildInteropGraph({...base,webMcpApi:'unavailable',cors:'blocked',cspConnect:'blocked'});
  assert.equal(graph.paths.browser_api.status,'blocked');
  assert.equal(graph.paths.server_api.status,'possible');
  assert.deepEqual(graph.decision,{status:'possible',primaryPath:'server_api'});
});

test('unknown WebMCP permission remains setup-required instead of being treated as authorization',()=>{
  const graph=buildInteropGraph({...base,api:'none',serverSideApiAvailable:false,toolsPermission:'unknown'});
  assert.equal(graph.paths.webmcp.status,'setup_required');
  assert.deepEqual(graph.decision,{status:'setup_required',primaryPath:'webmcp'});
  assert.equal(graph.evidence.find(x=>x.key==='toolsPermission').known,false);
});

test('browser-scoped service restriction leaves independently permitted server API possible',()=>{
  const graph=buildInteropGraph({...base,terms:'restricted',termsScope:'browser'});
  assert.equal(graph.paths.webmcp.status,'blocked');
  assert.equal(graph.paths.browser_api.status,'blocked');
  assert.equal(graph.paths.server_api.status,'possible');
  assert.deepEqual(graph.decision,{status:'possible',primaryPath:'server_api'});
});

test('documented API without server-side evidence remains unknown instead of being declared unavailable',()=>{
  const {serverSideApiAvailable,...withoutServerEvidence}=base;
  const graph=buildInteropGraph({...withoutServerEvidence,webMcpApi:'unavailable'});
  assert.equal(graph.paths.server_api.status,'unknown');
  assert.equal(graph.paths.server_api.availability,'unknown');
});

test('a blocked browser API does not overstate impossibility while an eligible server API remains unknown',()=>{
  const {serverSideApiAvailable,...withoutServerEvidence}=base;
  const graph=buildInteropGraph({...withoutServerEvidence,webMcpApi:'unavailable',cors:'blocked',cspConnect:'blocked'},'call_api');
  assert.equal(graph.paths.server_api.status,'unknown');
  assert.equal(graph.paths.browser_api.status,'blocked');
  assert.deepEqual(graph.decision,{status:'unknown',primaryPath:'server_api'});
});

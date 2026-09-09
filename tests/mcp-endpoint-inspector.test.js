import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectMcpEndpoint} from '../extension/service-worker.js';
import {buildInteropGraph} from '../lib/server/interop-graph.js';
import {toolDefinitions} from '../lib/shared/tool-contracts.js';

function headers(values={}){
  const map=new Map(Object.entries(values).map(([k,v])=>[k.toLowerCase(),String(v)]));
  return{get:name=>map.get(String(name).toLowerCase())??null};
}
function response(status,body,{headers:values={}}={}){
  return{ok:status>=200&&status<300,status,headers:headers(values),json:async()=>body,text:async()=>JSON.stringify(body)};
}

test('MCP inspector performs read-only same-origin server/discover with no ambient credentials',async()=>{
  assert.equal(typeof inspectMcpEndpoint,'function');
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push({url,init,body:JSON.parse(init.body)});
    return response(200,{jsonrpc:'2.0',id:'kata-mcp-discover',result:{supportedVersions:['2026-07-28'],capabilities:{tools:{listChanged:true}},serverInfo:{name:'Example MCP',version:'1.2.3'}}},{headers:{'content-type':'application/json'}});
  };
  const out=await inspectMcpEndpoint({id:4,url:'https://example.com/app'},'/mcp',{fetchImpl});
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://example.com/mcp');
  assert.equal(calls[0].init.method,'POST');
  assert.equal(calls[0].init.credentials,'omit');
  assert.equal(calls[0].init.cache,'no-store');
  assert.equal(calls[0].init.redirect,'manual');
  assert.equal(calls[0].init.headers['MCP-Protocol-Version'],'2026-07-28');
  assert.equal(calls[0].init.headers['Mcp-Method'],'server/discover');
  assert.equal(calls[0].init.headers.Authorization,undefined);
  assert.equal(calls[0].body.method,'server/discover');
  assert.equal(calls[0].body.params._meta['io.modelcontextprotocol/protocolVersion'],'2026-07-28');
  assert.deepEqual(out.environment,{mcpEndpoint:'available',mcpModernProtocol:'supported',mcpAuth:'none',mcpAuthMetadata:'not-required'});
  assert.equal(out.server.serverInfo.name,'Example MCP');
  assert.deepEqual(out.server.supportedVersions,['2026-07-28']);
});

test('MCP inspector keeps remote targets same-origin and only permits cleartext on loopback',async()=>{
  assert.equal(typeof inspectMcpEndpoint,'function');
  let calls=0;
  const fetchImpl=async()=>{calls++;return response(500,{});};
  await assert.rejects(()=>inspectMcpEndpoint({id:1,url:'https://example.com/app'},'https://other.example/mcp',{fetchImpl}),/same-origin/i);
  await assert.rejects(()=>inspectMcpEndpoint({id:1,url:'http://example.com/app'},'/mcp',{fetchImpl}),/https|loopback/i);
  assert.equal(calls,0);

  const localCalls=[];
  await inspectMcpEndpoint({id:2,url:'http://localhost:3000/app'},'/mcp',{fetchImpl:async(url,init)=>{localCalls.push({url,init});return response(200,{jsonrpc:'2.0',id:'kata-mcp-discover',result:{supportedVersions:['2026-07-28'],capabilities:{},serverInfo:{name:'local',version:'dev'}}});}});
  assert.equal(localCalls[0].url,'http://localhost:3000/mcp');
});

test('401 remains an authorization boundary and only same-origin RFC 9728 metadata is inspected',async()=>{
  assert.equal(typeof inspectMcpEndpoint,'function');
  const calls=[];
  const fetchImpl=async(url,init)=>{
    calls.push({url,init});
    if(calls.length===1)return response(401,{},{headers:{'www-authenticate':'Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource/mcp"'}});
    return response(200,{resource:'https://example.com/mcp',authorization_servers:['https://auth.example.net'],scopes_supported:['mcp:read']},{headers:{'content-type':'application/json'}});
  };
  const out=await inspectMcpEndpoint({id:8,url:'https://example.com/app'},'/mcp',{fetchImpl});
  assert.equal(calls.length,2);
  assert.equal(calls[1].url,'https://example.com/.well-known/oauth-protected-resource/mcp');
  assert.equal(calls[1].init.credentials,'omit');
  assert.equal(calls[1].init.redirect,'manual');
  assert.deepEqual(out.environment,{mcpEndpoint:'protected',mcpModernProtocol:'unknown',mcpAuth:'required',mcpAuthMetadata:'available'});
  assert.deepEqual(out.authorization.authorizationServers,['https://auth.example.net']);
  assert.equal(calls.some(c=>String(c.url).includes('auth.example.net')),false,'authorization server must not be followed during inspection');
});

test('cross-origin resource_metadata is evidence only and is never fetched',async()=>{
  assert.equal(typeof inspectMcpEndpoint,'function');
  const calls=[];
  const out=await inspectMcpEndpoint({id:8,url:'https://example.com/app'},'/mcp',{fetchImpl:async(url,init)=>{calls.push({url,init});return response(401,{},{headers:{'www-authenticate':'Bearer resource_metadata="https://metadata.attacker.example/prm"'}});}});
  assert.equal(calls.length,1);
  assert.deepEqual(out.environment,{mcpEndpoint:'protected',mcpModernProtocol:'unknown',mcpAuth:'required',mcpAuthMetadata:'unverified'});
});

test('connect_mcp is a canonical diagnostic intent and the evidence graph selects the MCP path',()=>{
  const diagnostic=toolDefinitions.find(x=>x.name==='kata_diagnose_web_interop');
  assert.ok(diagnostic.inputSchema.properties.intent.enum.includes('connect_mcp'));
  const base={webMcpApi:'unavailable',frame:'top',toolsPermission:'unknown',originExposure:'not-required',api:'none',auth:'unknown',cors:'unknown',cspConnect:'unknown',rateLimit:'unknown',botProtection:'unknown',terms:'unknown',userAuthorizedBrowserFlow:true,mcpEndpoint:'available',mcpModernProtocol:'supported',mcpAuth:'none',mcpAuthMetadata:'not-required'};
  const publicGraph=buildInteropGraph(base,'connect_mcp');
  assert.equal(publicGraph.paths.mcp.status,'possible');
  assert.equal(publicGraph.decision.primaryPath,'mcp');
  assert.equal(publicGraph.decision.status,'possible');

  const protectedGraph=buildInteropGraph({...base,mcpEndpoint:'protected',mcpModernProtocol:'unknown',mcpAuth:'required',mcpAuthMetadata:'available'},'connect_mcp');
  assert.equal(protectedGraph.paths.mcp.status,'setup_required');
  assert.equal(protectedGraph.decision.primaryPath,'mcp');
  assert.equal(protectedGraph.decision.status,'setup_required');
});

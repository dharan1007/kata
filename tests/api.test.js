import test from 'node:test';
import assert from 'node:assert/strict';
import health from '../api/health.js';
import capabilities from '../api/capabilities.js';
import openapi from '../api/openapi.js';
import invoke from '../api/invoke.js';
import mcp from '../api/mcp.js';
import {queryParam} from '../lib/server/http.js';
import {toolDefinitions} from '../lib/server/tools.js';

const MCP_ACCEPT='application/json, text/event-stream';
function res(){return{statusCode:200,headers:{},body:null,status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};}

async function withMcpOrigins(value,fn){
  const previous=process.env.MCP_ALLOWED_ORIGINS;
  if(value==null)delete process.env.MCP_ALLOWED_ORIGINS;else process.env.MCP_ALLOWED_ORIGINS=value;
  try{return await fn();}finally{if(previous==null)delete process.env.MCP_ALLOWED_ORIGINS;else process.env.MCP_ALLOWED_ORIGINS=previous;}
}

test('/api/health is explicit and versioned',async()=>{const r=res();await health({method:'GET',headers:{}},r);assert.equal(r.statusCode,200);assert.deepEqual(r.body,{ok:true,service:'kata-webmcp',version:'3.0.0',apiVersion:'v2'});});

test('/api/capabilities exposes real protocol surfaces and the exact modern MCP request contract',async()=>{const r=res();await capabilities({method:'GET',headers:{}},r);assert.equal(r.statusCode,200);assert.equal(r.body.capabilities.mcp.protocolVersion,'2026-07-28');assert.deepEqual(r.body.capabilities.mcp.supportedVersions,['2026-07-28','2025-11-25']);assert.deepEqual(r.body.capabilities.mcp.modernRequest.requiredHeaders,['Content-Type','Accept','MCP-Protocol-Version','Mcp-Method']);assert.equal(r.body.capabilities.mcp.modernRequest.contentType,'application/json');assert.deepEqual(r.body.capabilities.mcp.modernRequest.accept,['application/json','text/event-stream']);assert.equal(r.body.capabilities.mcp.modernRequest.toolCallHeader,'Mcp-Name');assert.deepEqual(r.body.capabilities.mcp.modernRequest.requiredMetaKeys,['io.modelcontextprotocol/protocolVersion','io.modelcontextprotocol/clientCapabilities']);assert.deepEqual(r.body.capabilities.mcp.modernRequest.optionalMetaKeys,['io.modelcontextprotocol/clientInfo']);assert.equal(r.body.capabilities.webmcp.entryPoint,'document.modelContext');assert.ok(r.body.capabilities.tools.length>=7);});

test('/api/openapi is machine-actionable and stays aligned with canonical tool names',async()=>{const r=res();await openapi({method:'GET',headers:{}},r);assert.equal(r.statusCode,200);assert.equal(r.body.openapi,'3.1.0');assert.equal(r.body.paths['/api/invoke'].post.operationId,'invokeKataTool');assert.deepEqual(r.body.paths['/api/invoke'].post.requestBody.content['application/json'].schema.properties.name.enum,toolDefinitions.map(t=>t.name));assert.ok(r.body.paths['/api/capabilities']);assert.match(r.body.paths['/api/agents'].get.summary,/Gemini/);const operationIds=Object.values(r.body.paths).flatMap(path=>Object.values(path).map(op=>op.operationId).filter(Boolean));assert.equal(operationIds.length,new Set(operationIds).size);});

test('/api/invoke rejects oversized/unexpected tool input cleanly',async()=>{const r=res();await invoke({method:'POST',headers:{'content-length':'200000'},body:{}},r);assert.equal(r.statusCode,413);});

test('/api/mcp accepts legacy initialized notification with an empty 202 response',async()=>{const r=res();await mcp({method:'POST',headers:{accept:MCP_ACCEPT,'content-type':'application/json','mcp-protocol-version':'2025-11-25'},body:{jsonrpc:'2.0',method:'notifications/initialized',params:{}}},r);assert.equal(r.statusCode,202);assert.equal(r.body,undefined);});

test('/api/mcp requires clients to advertise both Streamable HTTP response media types',async()=>{
  const request={method:'POST',headers:{'content-type':'application/json','mcp-protocol-version':'2025-11-25'},body:{jsonrpc:'2.0',id:1,method:'ping',params:{}}};
  for(const accept of [undefined,'application/json','text/event-stream','application/json, text/event-stream;q=0']){
    const r=res();const headers={...request.headers};if(accept)headers.accept=accept;await mcp({...request,headers},r);assert.equal(r.statusCode,406);assert.equal(r.body?.error?.code,-32000);
  }
  const r=res();await mcp({...request,headers:{...request.headers,accept:'Application/JSON; q=1, text/event-stream; charset=utf-8'}},r);assert.equal(r.statusCode,200);
});

test('/api/mcp allows an explicitly configured browser origin and emits usable CORS preflight headers',async()=>withMcpOrigins('https://agent.example, https://console.example',async()=>{const r=res();await mcp({method:'OPTIONS',headers:{origin:'https://agent.example'}},r);assert.equal(r.statusCode,204);assert.equal(r.headers['access-control-allow-origin'],'https://agent.example');assert.equal(r.headers.vary,'Origin');assert.match(r.headers['access-control-allow-methods'],/POST/);assert.match(r.headers['access-control-allow-headers'],/Authorization/);assert.equal(r.headers['access-control-max-age'],'600');}));

test('/api/mcp refuses CORS preflight for origins outside the configured allowlist',async()=>withMcpOrigins('https://agent.example',async()=>{const r=res();await mcp({method:'OPTIONS',headers:{origin:'https://evil.example'}},r);assert.equal(r.statusCode,403);assert.equal(r.headers['access-control-allow-origin'],undefined);assert.equal(r.headers.vary,'Origin');assert.deepEqual(r.body,{error:'ORIGIN_NOT_ALLOWED'});}));

test('/api/mcp rejects disallowed POST origins before media negotiation or body parsing',async()=>withMcpOrigins('https://agent.example',async()=>{
  const invalidMedia=res();
  await mcp({method:'POST',headers:{origin:'https://evil.example','content-type':'text/plain'}},invalidMedia);
  assert.equal(invalidMedia.statusCode,403);
  assert.equal(invalidMedia.headers['access-control-allow-origin'],undefined);
  assert.equal(invalidMedia.headers.vary,'Origin');
  assert.deepEqual(invalidMedia.body,{error:'ORIGIN_NOT_ALLOWED'});

  const request={method:'POST',headers:{origin:'https://evil.example','content-type':'application/json',accept:MCP_ACCEPT,'mcp-protocol-version':'2025-11-25'}};
  Object.defineProperty(request,'body',{get(){throw new Error('BODY_SHOULD_NOT_BE_READ');}});
  const unread=res();
  await mcp(request,unread);
  assert.equal(unread.statusCode,403);
  assert.deepEqual(unread.body,{error:'ORIGIN_NOT_ALLOWED'});
}));

test('/api/mcp reflects the allowed origin on actual MCP responses without using a wildcard',async()=>withMcpOrigins('https://agent.example',async()=>{const r=res();await mcp({method:'POST',headers:{accept:MCP_ACCEPT,origin:'https://agent.example','content-type':'application/json','mcp-protocol-version':'2025-11-25'},body:{jsonrpc:'2.0',id:1,method:'ping',params:{}}},r);assert.equal(r.statusCode,200);assert.equal(r.headers['access-control-allow-origin'],'https://agent.example');assert.notEqual(r.headers['access-control-allow-origin'],'*');assert.equal(r.headers.vary,'Origin');}));

test('/api/mcp sanitizes unexpected transport failures instead of exposing runtime details',async()=>{
  const secret='socket reset by internal-proxy.prod.local while reading tenant_db';
  const request={
    method:'POST',
    headers:{accept:MCP_ACCEPT,'content-type':'application/json','mcp-protocol-version':'2025-11-25'},
    async *[Symbol.asyncIterator](){throw new Error(secret);}
  };
  const r=res();
  await mcp(request,r);
  assert.equal(r.statusCode,500);
  assert.equal(r.body?.error?.code,-32603);
  assert.equal(r.body?.error?.message,'Internal error');
  assert.doesNotMatch(JSON.stringify(r.body),/internal-proxy|tenant_db|socket reset/i);
});

test('query parsing uses WHATWG URL without touching deprecated req.query compatibility layer',()=>{const req={url:'/api/search?query=machine%20learning&limit=2'};Object.defineProperty(req,'query',{get(){throw new Error('REQ_QUERY_ACCESSED');}});assert.equal(queryParam(req,'query'),'machine learning');assert.equal(queryParam(req,'limit'),'2');assert.equal(queryParam(req,'missing'),null);});

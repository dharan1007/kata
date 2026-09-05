import test from 'node:test';
import assert from 'node:assert/strict';
import health from '../api/health.js';
import capabilities from '../api/capabilities.js';
import invoke from '../api/invoke.js';
import mcp from '../api/mcp.js';
import {queryParam} from '../lib/server/http.js';

function res(){return{statusCode:200,headers:{},body:null,status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};}

async function withMcpOrigins(value,fn){
  const previous=process.env.MCP_ALLOWED_ORIGINS;
  if(value==null)delete process.env.MCP_ALLOWED_ORIGINS;else process.env.MCP_ALLOWED_ORIGINS=value;
  try{return await fn();}finally{if(previous==null)delete process.env.MCP_ALLOWED_ORIGINS;else process.env.MCP_ALLOWED_ORIGINS=previous;}
}

test('/api/health is explicit and versioned',async()=>{const r=res();await health({method:'GET',headers:{}},r);assert.equal(r.statusCode,200);assert.deepEqual(r.body,{ok:true,service:'kata-webmcp',version:'3.0.0',apiVersion:'v2'});});

test('/api/capabilities exposes real protocol surfaces',async()=>{const r=res();await capabilities({method:'GET',headers:{}},r);assert.equal(r.statusCode,200);assert.equal(r.body.capabilities.mcp.protocolVersion,'2026-07-28');assert.deepEqual(r.body.capabilities.mcp.supportedVersions,['2026-07-28','2025-11-25']);assert.equal(r.body.capabilities.webmcp.entryPoint,'document.modelContext');assert.ok(r.body.capabilities.tools.length>=7);});

test('/api/invoke rejects oversized/unexpected tool input cleanly',async()=>{const r=res();await invoke({method:'POST',headers:{'content-length':'200000'},body:{}},r);assert.equal(r.statusCode,413);});

test('/api/mcp accepts legacy initialized notification with an empty 202 response',async()=>{const r=res();await mcp({method:'POST',headers:{'mcp-protocol-version':'2025-11-25'},body:{jsonrpc:'2.0',method:'notifications/initialized',params:{}}},r);assert.equal(r.statusCode,202);assert.equal(r.body,undefined);});

test('/api/mcp allows an explicitly configured browser origin and emits usable CORS preflight headers',async()=>withMcpOrigins('https://agent.example, https://console.example',async()=>{const r=res();await mcp({method:'OPTIONS',headers:{origin:'https://agent.example'}},r);assert.equal(r.statusCode,204);assert.equal(r.headers['access-control-allow-origin'],'https://agent.example');assert.equal(r.headers.vary,'Origin');assert.match(r.headers['access-control-allow-methods'],/POST/);assert.match(r.headers['access-control-allow-headers'],/Authorization/);assert.equal(r.headers['access-control-max-age'],'600');}));

test('/api/mcp refuses CORS preflight for origins outside the configured allowlist',async()=>withMcpOrigins('https://agent.example',async()=>{const r=res();await mcp({method:'OPTIONS',headers:{origin:'https://evil.example'}},r);assert.equal(r.statusCode,403);assert.equal(r.headers['access-control-allow-origin'],undefined);assert.equal(r.headers.vary,'Origin');assert.deepEqual(r.body,{error:'ORIGIN_NOT_ALLOWED'});}));

test('/api/mcp reflects the allowed origin on actual MCP responses without using a wildcard',async()=>withMcpOrigins('https://agent.example',async()=>{const r=res();await mcp({method:'POST',headers:{origin:'https://agent.example','mcp-protocol-version':'2025-11-25'},body:{jsonrpc:'2.0',id:1,method:'ping',params:{}}},r);assert.equal(r.statusCode,200);assert.equal(r.headers['access-control-allow-origin'],'https://agent.example');assert.notEqual(r.headers['access-control-allow-origin'],'*');assert.equal(r.headers.vary,'Origin');}));

test('query parsing uses WHATWG URL without touching deprecated req.query compatibility layer',()=>{const req={url:'/api/search?query=machine%20learning&limit=2'};Object.defineProperty(req,'query',{get(){throw new Error('REQ_QUERY_ACCESSED');}});assert.equal(queryParam(req,'query'),'machine learning');assert.equal(queryParam(req,'limit'),'2');assert.equal(queryParam(req,'missing'),null);});

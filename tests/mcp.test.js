import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest, MCP_VERSION} from '../lib/server/mcp.js';

const LEGACY_MCP_VERSION='2025-11-25';

test('MCP 2026-07-28 discovery and tool listing are stateless and cacheable',async()=>{
 const discover=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'server/discover'},body:{jsonrpc:'2.0',id:1,method:'server/discover',params:{_meta:{'io.modelcontextprotocol/protocolVersion':MCP_VERSION}}}});
 assert.equal(discover.status,200); assert.deepEqual(discover.body.result.supportedVersions,[MCP_VERSION]);
 const list=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/list'},body:{jsonrpc:'2.0',id:2,method:'tools/list',params:{_meta:{'io.modelcontextprotocol/protocolVersion':MCP_VERSION}}}});
 assert.ok(list.body.result.tools.length>=5); assert.equal(list.body.result.cacheScope,'public'); assert.ok(list.body.result.ttlMs>0);
});

test('MCP 2025-11-25 clients can initialize and use tools without 2026 routing headers',async()=>{
 const initialize=await handleMcpRequest({headers:{},body:{jsonrpc:'2.0',id:10,method:'initialize',params:{protocolVersion:LEGACY_MCP_VERSION,capabilities:{},clientInfo:{name:'legacy-client',version:'1.0.0'}}}});
 assert.equal(initialize.status,200);
 assert.equal(initialize.body.result.protocolVersion,LEGACY_MCP_VERSION);
 assert.equal(initialize.body.result.serverInfo.name,'kata-webmcp');

 const list=await handleMcpRequest({headers:{'mcp-protocol-version':LEGACY_MCP_VERSION},body:{jsonrpc:'2.0',id:11,method:'tools/list',params:{}}});
 assert.equal(list.status,200);
 assert.ok(list.body.result.tools.length>=5);

 const call=await handleMcpRequest({headers:{'mcp-protocol-version':LEGACY_MCP_VERSION},body:{jsonrpc:'2.0',id:12,method:'tools/call',params:{name:'kata_plan_triage',arguments:{works:[]}}}});
 assert.equal(call.status,200);
 assert.equal(call.body.result.isError,false);
 assert.deepEqual(call.body.result.structuredContent.matches,[]);
});

test('MCP rejects header/body route mismatch and tool-name mismatch',async()=>{
 const r=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/list'},body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'kata_plan_triage',arguments:{}}}}); assert.equal(r.status,400);
 const t=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/call','mcp-name':'other'},body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'kata_plan_triage',arguments:{query:'x'}}}}); assert.equal(t.status,400);
});

test('MCP optional bearer auth and origin allowlist are enforced',async()=>{
 const env={MCP_BEARER_TOKEN:'secret',MCP_ALLOWED_ORIGINS:'https://example.com'};
 const req={headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/list',origin:'https://evil.com'},body:{jsonrpc:'2.0',id:1,method:'tools/list',params:{}}};
 const a=await handleMcpRequest(req,{env}); assert.equal(a.status,403);
 req.headers.origin='https://example.com'; const b=await handleMcpRequest(req,{env}); assert.equal(b.status,401);
 req.headers.authorization='Bearer secret'; const c=await handleMcpRequest(req,{env}); assert.equal(c.status,200);
});

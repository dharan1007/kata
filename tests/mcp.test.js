import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest, MCP_VERSION, LEGACY_MCP_VERSION} from '../lib/server/mcp.js';

const modernMeta=(extra={})=>({'io.modelcontextprotocol/protocolVersion':MCP_VERSION,'io.modelcontextprotocol/clientCapabilities':{},...extra});

test('MCP 2026-07-28 discovery advertises dual-era compatibility and remains cacheable',async()=>{
 const discover=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'server/discover'},body:{jsonrpc:'2.0',id:1,method:'server/discover',params:{_meta:modernMeta()}}});
 assert.equal(discover.status,200); assert.deepEqual(discover.body.result.supportedVersions,[MCP_VERSION,LEGACY_MCP_VERSION]);
 assert.equal(discover.body.result._meta['io.modelcontextprotocol/serverInfo'].name,'kata-webmcp');
 const list=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/list'},body:{jsonrpc:'2.0',id:2,method:'tools/list',params:{_meta:modernMeta()}}});
 assert.ok(list.body.result.tools.length>=5); assert.equal(list.body.result.cacheScope,'public'); assert.ok(list.body.result.ttlMs>0);
});

test('MCP rejects malformed JSON-RPC requests before invoking tools',async()=>{
 let invoked=0;
 const registry={list:()=>[],invoke:async()=>{invoked++;return{unexpected:true};}};
 const base={headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/call','mcp-name':'kata_search_research'}};
 const missingVersion=await handleMcpRequest({...base,body:{id:1,method:'tools/call',params:{name:'kata_search_research',arguments:{query:'x'},_meta:modernMeta()}}},{registry});
 assert.equal(missingVersion.status,400);assert.equal(missingVersion.body.error.code,-32600);
 const missingId=await handleMcpRequest({...base,body:{jsonrpc:'2.0',method:'tools/call',params:{name:'kata_search_research',arguments:{query:'x'},_meta:modernMeta()}}},{registry});
 assert.equal(missingId.status,400);assert.equal(missingId.body.error.code,-32600);
 const nullId=await handleMcpRequest({...base,body:{jsonrpc:'2.0',id:null,method:'tools/call',params:{name:'kata_search_research',arguments:{query:'x'},_meta:modernMeta()}}},{registry});
 assert.equal(nullId.status,400);assert.equal(nullId.body.error.code,-32600);
 assert.equal(invoked,0);
});

test('MCP reports failed tool receipts as tool execution errors visible to the model',async()=>{
 const registry={
  list:()=>[],
  invoke:async()=>({workspace:{version:1},receipt:{status:'failed',error:'STALE_PREVIEW',processed:0}})
 };
 const response=await handleMcpRequest({
  headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/call','mcp-name':'kata_run_automation'},
  body:{jsonrpc:'2.0',id:30,method:'tools/call',params:{name:'kata_run_automation',arguments:{},_meta:modernMeta()}}
 },{registry});
 assert.equal(response.status,200);
 assert.equal(response.body.error,undefined);
 assert.equal(response.body.result.isError,true);
 assert.equal(response.body.result.structuredContent.receipt.status,'failed');
 assert.match(response.body.result.content[0].text,/STALE_PREVIEW/);
});

test('MCP keeps thrown tool-handler failures in the tool result so agents can recover',async()=>{
 const registry={
  list:()=>[],
  invoke:async()=>{const error=new Error('UPSTREAM_RATE_LIMITED');error.details={retryAfterSeconds:12};throw error;}
 };
 const response=await handleMcpRequest({
  headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/call','mcp-name':'kata_search_research'},
  body:{jsonrpc:'2.0',id:31,method:'tools/call',params:{name:'kata_search_research',arguments:{query:'agents'},_meta:modernMeta()}}
 },{registry});
 assert.equal(response.status,200);
 assert.equal(response.body.error,undefined);
 assert.equal(response.body.result.isError,true);
 assert.equal(response.body.result.structuredContent.error,'UPSTREAM_RATE_LIMITED');
 assert.deepEqual(response.body.result.structuredContent.details,{retryAfterSeconds:12});
 assert.match(response.body.result.content[0].text,/UPSTREAM_RATE_LIMITED/);
});

test('MCP sanitizes unexpected tool crashes while keeping them model-visible',async()=>{
 const registry={
  list:()=>[],
  invoke:async()=>{const error=new Error('postgres://admin:secret@db.internal/customer');error.details={sql:'select * from private_users'};throw error;}
 };
 const response=await handleMcpRequest({
  headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/call','mcp-name':'kata_search_research'},
  body:{jsonrpc:'2.0',id:32,method:'tools/call',params:{name:'kata_search_research',arguments:{query:'agents'},_meta:modernMeta()}}
 },{registry});
 assert.equal(response.status,200);
 assert.equal(response.body.result.isError,true);
 assert.equal(response.body.result.structuredContent.error,'TOOL_EXECUTION_FAILED');
 assert.equal(response.body.result.structuredContent.details,undefined);
 assert.doesNotMatch(response.body.result.content[0].text,/secret|private_users|postgres/i);
});

test('MCP reports unknown tools as Invalid Params protocol errors in both protocol eras',async()=>{
 const registry={list:()=>[],invoke:async()=>{throw new Error('TOOL_NOT_FOUND');}};
 const modern=await handleMcpRequest({
  headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/call','mcp-name':'missing_tool'},
  body:{jsonrpc:'2.0',id:33,method:'tools/call',params:{name:'missing_tool',arguments:{},_meta:modernMeta()}}
 },{registry});
 assert.equal(modern.status,400);
 assert.equal(modern.body.error.code,-32602);
 assert.match(modern.body.error.message,/unknown tool/i);
 assert.equal(modern.body.result,undefined);

 const legacy=await handleMcpRequest({
  headers:{'mcp-protocol-version':LEGACY_MCP_VERSION},
  body:{jsonrpc:'2.0',id:34,method:'tools/call',params:{name:'missing_tool',arguments:{}}}
 },{registry});
 assert.equal(legacy.status,400);
 assert.equal(legacy.body.error.code,-32602);
 assert.match(legacy.body.error.message,/unknown tool/i);
 assert.equal(legacy.body.result,undefined);
});

test('MCP 2026-07-28 requires a self-describing metadata envelope and matching version header',async()=>{
 const missing=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/list'},body:{jsonrpc:'2.0',id:20,method:'tools/list',params:{}}});
 assert.equal(missing.status,400); assert.equal(missing.body.error.code,-32600);

 const missingCaps=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/list'},body:{jsonrpc:'2.0',id:21,method:'tools/list',params:{_meta:{'io.modelcontextprotocol/protocolVersion':MCP_VERSION}}}});
 assert.equal(missingCaps.status,400); assert.equal(missingCaps.body.error.code,-32600);

 const requested='2026-01-01';
 const unsupported=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/list'},body:{jsonrpc:'2.0',id:22,method:'tools/list',params:{_meta:modernMeta({'io.modelcontextprotocol/protocolVersion':requested})}}});
 assert.equal(unsupported.status,400); assert.equal(unsupported.body.error.code,-32022);
 assert.deepEqual(unsupported.body.error.data,{supported:[MCP_VERSION,LEGACY_MCP_VERSION],requested});
});

test('MCP 2025-11-25 clients can initialize, acknowledge, and use tools without 2026 routing headers',async()=>{
 const initialize=await handleMcpRequest({headers:{},body:{jsonrpc:'2.0',id:10,method:'initialize',params:{protocolVersion:LEGACY_MCP_VERSION,capabilities:{},clientInfo:{name:'legacy-client',version:'1.0.0'}}}});
 assert.equal(initialize.status,200);
 assert.equal(initialize.body.result.protocolVersion,LEGACY_MCP_VERSION);
 assert.equal(initialize.body.result.serverInfo.name,'kata-webmcp');

 const initialized=await handleMcpRequest({headers:{'mcp-protocol-version':LEGACY_MCP_VERSION},body:{jsonrpc:'2.0',method:'notifications/initialized',params:{}}});
 assert.equal(initialized.status,202);
 assert.equal(initialized.body,undefined);

 const list=await handleMcpRequest({headers:{'mcp-protocol-version':LEGACY_MCP_VERSION},body:{jsonrpc:'2.0',id:11,method:'tools/list',params:{}}});
 assert.equal(list.status,200);
 assert.ok(list.body.result.tools.length>=5);

 const call=await handleMcpRequest({headers:{'mcp-protocol-version':LEGACY_MCP_VERSION},body:{jsonrpc:'2.0',id:12,method:'tools/call',params:{name:'kata_plan_triage',arguments:{works:[]}}}});
 assert.equal(call.status,200);
 assert.equal(call.body.result.isError,false);
 assert.deepEqual(call.body.result.structuredContent.matches,[]);
});

test('MCP rejects header/body route mismatch and tool-name mismatch with the modern header-mismatch code',async()=>{
 const r=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/list'},body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'kata_plan_triage',arguments:{},_meta:modernMeta()}}}); assert.equal(r.status,400); assert.equal(r.body.error.code,-32020);
 const t=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/call','mcp-name':'other'},body:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'kata_plan_triage',arguments:{query:'x'},_meta:modernMeta()}}}); assert.equal(t.status,400); assert.equal(t.body.error.code,-32020);
});

test('MCP optional bearer auth and origin allowlist are enforced',async()=>{
 const env={MCP_BEARER_TOKEN:'secret',MCP_ALLOWED_ORIGINS:'https://example.com'};
 const req={headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/list',origin:'https://evil.com'},body:{jsonrpc:'2.0',id:1,method:'tools/list',params:{_meta:modernMeta()}}};
 const a=await handleMcpRequest(req,{env}); assert.equal(a.status,403);
 req.headers.origin='https://example.com'; const b=await handleMcpRequest(req,{env}); assert.equal(b.status,401);
 req.headers.authorization='Bearer secret'; const c=await handleMcpRequest(req,{env}); assert.equal(c.status,200);
});

test('MCP 2026-07-28 returns the dedicated UnsupportedProtocolVersion error for negotiation and fallback',async()=>{
 const requested='2027-01-01';
 const response=await handleMcpRequest({
  headers:{'mcp-protocol-version':requested,'mcp-method':'server/discover'},
  body:{jsonrpc:'2.0',id:40,method:'server/discover',params:{_meta:{'io.modelcontextprotocol/protocolVersion':requested,'io.modelcontextprotocol/clientCapabilities':{}}}}
 });
 assert.equal(response.status,400);
 assert.equal(response.body.error.code,-32022);
 assert.deepEqual(response.body.error.data,{supported:[MCP_VERSION,LEGACY_MCP_VERSION],requested});
});

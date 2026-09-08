import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest,MCP_VERSION,LEGACY_MCP_VERSION} from '../lib/server/mcp.js';
import {createToolRegistry} from '../lib/server/tools.js';

const modernMeta=(extra={})=>({
 'io.modelcontextprotocol/protocolVersion':MCP_VERSION,
 'io.modelcontextprotocol/clientCapabilities':{},
 ...extra
});

test('MCP 2026-07-28 discovery advertises dual-era compatibility and remains cacheable',async()=>{
 const response=await handleMcpRequest({
  headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'server/discover'},
  body:{jsonrpc:'2.0',id:1,method:'server/discover',params:{_meta:modernMeta()}}
 });
 assert.equal(response.status,200);
 assert.deepEqual(response.body.result.supportedVersions,[MCP_VERSION,LEGACY_MCP_VERSION]);
 assert.equal(response.body.result.resultType,'complete');
 assert.equal(response.body.result._meta['io.modelcontextprotocol/serverInfo'].name,'kata-webmcp');
 assert.equal(response.headers['Cache-Control'],'public, max-age=60');
});

test('MCP rejects malformed JSON-RPC requests before invoking tools',async()=>{
 let invoked=false;
 const registry={list:()=>[],invoke:async()=>{invoked=true;return{};}};
 const response=await handleMcpRequest({
  headers:{'mcp-protocol-version':MCP_VERSION},
  body:{jsonrpc:'1.0',id:2,method:'tools/list',params:{_meta:modernMeta()}}
 },{registry});
 assert.equal(response.status,400);
 assert.equal(response.body.error.code,-32600);
 assert.equal(invoked,false);
});

test('MCP reports failed tool receipts as tool execution errors visible to the model',async()=>{
 const registry={list:()=>[],invoke:async()=>({receipt:{status:'failed'},error:'FAILED'})};
 const response=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/call','mcp-name':'demo'},body:{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'demo',arguments:{},_meta:modernMeta()}}},{registry});
 assert.equal(response.status,200);
 assert.equal(response.body.result.isError,true);
 assert.equal(response.body.result.structuredContent.error,'FAILED');
});

test('MCP keeps thrown tool-handler failures in the tool result so agents can recover',async()=>{
 const error=new Error('INVALID_QUERY');
 const registry={list:()=>[],invoke:async()=>{throw error;}};
 const response=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/call','mcp-name':'demo'},body:{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'demo',arguments:{},_meta:modernMeta()}}},{registry});
 assert.equal(response.status,200);
 assert.equal(response.body.result.isError,true);
 assert.equal(response.body.result.structuredContent.error,'INVALID_QUERY');
});

test('MCP sanitizes unexpected tool crashes while keeping them model-visible',async()=>{
 const registry={list:()=>[],invoke:async()=>{throw new Error('secret stack detail');}};
 const response=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/call','mcp-name':'demo'},body:{jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'demo',arguments:{},_meta:modernMeta()}}},{registry});
 assert.equal(response.status,200);
 assert.equal(response.body.result.isError,true);
 assert.equal(response.body.result.structuredContent.error,'TOOL_EXECUTION_FAILED');
 assert.doesNotMatch(response.body.result.content[0].text,/secret stack detail/);
});

test('MCP reports unknown tools as Invalid Params protocol errors in both protocol eras',async()=>{
 const registry=createToolRegistry();
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

test('MCP 2026-07-28 requires a self-describing metadata envelope and applies header validation before version support checks',async()=>{
 const missing=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/list'},body:{jsonrpc:'2.0',id:20,method:'tools/list',params:{}}});
 assert.equal(missing.status,400); assert.equal(missing.body.error.code,-32600);

 const missingCaps=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/list'},body:{jsonrpc:'2.0',id:21,method:'tools/list',params:{_meta:{'io.modelcontextprotocol/protocolVersion':MCP_VERSION}}}});
 assert.equal(missingCaps.status,400); assert.equal(missingCaps.body.error.code,-32600);

 const requested='2026-01-01';
 const mismatch=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/list'},body:{jsonrpc:'2.0',id:22,method:'tools/list',params:{_meta:modernMeta({'io.modelcontextprotocol/protocolVersion':requested})}}});
 assert.equal(mismatch.status,400); assert.equal(mismatch.body.error.code,-32020);
 assert.deepEqual(mismatch.body.error.data,{header:MCP_VERSION,body:requested});

 const unsupported=await handleMcpRequest({headers:{'mcp-protocol-version':requested,'mcp-method':'tools/list'},body:{jsonrpc:'2.0',id:23,method:'tools/list',params:{_meta:modernMeta({'io.modelcontextprotocol/protocolVersion':requested})}}});
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
});

test('MCP rejects header/body route mismatch and tool-name mismatch with the modern header-mismatch code',async()=>{
 const methodMismatch=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/call'},body:{jsonrpc:'2.0',id:30,method:'tools/list',params:{_meta:modernMeta()}}});
 assert.equal(methodMismatch.status,400);
 assert.equal(methodMismatch.body.error.code,-32020);

 const nameMismatch=await handleMcpRequest({headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/call','mcp-name':'wrong'},body:{jsonrpc:'2.0',id:31,method:'tools/call',params:{name:'kata_plan_triage',arguments:{works:[]},_meta:modernMeta()}}});
 assert.equal(nameMismatch.status,400);
 assert.equal(nameMismatch.body.error.code,-32020);
});

test('MCP optional bearer auth and origin allowlist are enforced',async()=>{
 const env={MCP_BEARER_TOKEN:'topsecret',MCP_ALLOWED_ORIGINS:'https://allowed.example'};
 const denied=await handleMcpRequest({headers:{origin:'https://blocked.example'},body:{}},{env});
 assert.equal(denied.status,403);

 const unauthorized=await handleMcpRequest({headers:{origin:'https://allowed.example'},body:{}},{env});
 assert.equal(unauthorized.status,401);
 assert.equal(unauthorized.headers['WWW-Authenticate'],'Bearer');
});

test('MCP 2026-07-28 returns the dedicated UnsupportedProtocolVersion error for negotiation and fallback',async()=>{
 const requested='2027-01-01';
 const modern=await handleMcpRequest({headers:{'mcp-protocol-version':requested,'mcp-method':'tools/list'},body:{jsonrpc:'2.0',id:40,method:'tools/list',params:{_meta:{'io.modelcontextprotocol/protocolVersion':requested,'io.modelcontextprotocol/clientCapabilities':{}}}}});
 assert.equal(modern.status,400);
 assert.equal(modern.body.error.code,-32022);
 assert.deepEqual(modern.body.error.data,{supported:[MCP_VERSION,LEGACY_MCP_VERSION],requested});
});

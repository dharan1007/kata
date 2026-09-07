import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest, MCP_VERSION} from '../lib/server/mcp.js';

const TRACE_META={
  'io.modelcontextprotocol/protocolVersion':MCP_VERSION,
  'io.modelcontextprotocol/clientCapabilities':{},
  traceparent:'00-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01',
  tracestate:'vendor=opaque',
  baggage:'tenant=acme,request_source=agent'
};

test('MCP 2026 passes request _meta including W3C trace context into tool execution context',async()=>{
  let receivedMeta;
  const registry={
    list:()=>[],
    invoke:async(_name,_args,ctx)=>{receivedMeta=ctx.meta;return{ok:true};}
  };
  const response=await handleMcpRequest({
    headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/call','mcp-name':'kata_search_research'},
    body:{jsonrpc:'2.0',id:'trace-1',method:'tools/call',params:{name:'kata_search_research',arguments:{query:'mcp tracing'},_meta:TRACE_META}}
  },{registry});

  assert.equal(response.status,200);
  assert.deepEqual(receivedMeta,TRACE_META);
});

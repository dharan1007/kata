import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest, MCP_VERSION} from '../lib/server/mcp.js';

const modernMeta=()=>({
  'io.modelcontextprotocol/protocolVersion':MCP_VERSION,
  'io.modelcontextprotocol/clientCapabilities':{}
});

test('MCP preserves REQUEST_CANCELLED as an actionable tool result',async()=>{
  const registry={
    list:()=>[],
    invoke:async()=>{throw new Error('REQUEST_CANCELLED');}
  };
  const response=await handleMcpRequest({
    headers:{
      'mcp-protocol-version':MCP_VERSION,
      'mcp-method':'tools/call',
      'mcp-name':'kata_search_research'
    },
    body:{
      jsonrpc:'2.0',
      id:61,
      method:'tools/call',
      params:{name:'kata_search_research',arguments:{query:'agents'},_meta:modernMeta()}
    }
  },{registry});
  assert.equal(response.status,200);
  assert.equal(response.body.result.isError,true);
  assert.equal(response.body.result.structuredContent.error,'REQUEST_CANCELLED');
  assert.match(response.body.result.content[0].text,/REQUEST_CANCELLED/);
});

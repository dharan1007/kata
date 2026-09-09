import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest,MCP_VERSION} from '../lib/server/mcp.js';

const meta={
  'io.modelcontextprotocol/protocolVersion':MCP_VERSION,
  'io.modelcontextprotocol/clientCapabilities':{}
};

function notification(headers={}){
  return {
    headers,
    body:{
      jsonrpc:'2.0',
      method:'notifications/cancelled',
      params:{requestId:'work-1',reason:'user cancelled',_meta:meta}
    }
  };
}

test('modern notifications require the MCP-Protocol-Version and Mcp-Method routing headers',async()=>{
  const result=await handleMcpRequest(notification());
  assert.equal(result.status,400);
  assert.equal(result.body.error.code,-32020);
});

test('modern notifications reject a routing method header that disagrees with the JSON-RPC method',async()=>{
  const result=await handleMcpRequest(notification({
    'mcp-protocol-version':MCP_VERSION,
    'mcp-method':'notifications/progress'
  }));
  assert.equal(result.status,400);
  assert.equal(result.body.error.code,-32020);
});

test('modern notifications with matching routing headers remain accepted without a response body',async()=>{
  const result=await handleMcpRequest(notification({
    'mcp-protocol-version':MCP_VERSION,
    'mcp-method':'notifications/cancelled'
  }));
  assert.equal(result.status,202);
  assert.equal(result.body,undefined);
});

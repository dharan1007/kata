import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest, LEGACY_MCP_VERSION} from '../lib/server/mcp.js';

test('MCP 2025-11-25 suppresses responses for valid client notifications', async()=>{
  let invoked=0;
  const registry={list:()=>[],invoke:async()=>{invoked++;return{unexpected:true};}};
  const response=await handleMcpRequest({
    headers:{'mcp-protocol-version':LEGACY_MCP_VERSION},
    body:{jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:123,reason:'client abandoned request'}}
  },{registry});

  assert.equal(response.status,202);
  assert.equal(response.body,undefined);
  assert.equal(invoked,0);
});

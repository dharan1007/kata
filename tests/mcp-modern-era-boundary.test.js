import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest, MCP_VERSION, LEGACY_MCP_VERSION} from '../lib/server/mcp.js';

const modernMeta=()=>({
  'io.modelcontextprotocol/protocolVersion':MCP_VERSION,
  'io.modelcontextprotocol/clientCapabilities':{},
  'io.modelcontextprotocol/clientInfo':{name:'modern-client',version:'1.0.0'}
});

test('explicit 2026-07-28 requests cannot enter the legacy initialize handshake',async()=>{
  const response=await handleMcpRequest({
    headers:{
      'mcp-protocol-version':MCP_VERSION,
      'mcp-method':'initialize'
    },
    body:{
      jsonrpc:'2.0',
      id:70,
      method:'initialize',
      params:{
        protocolVersion:LEGACY_MCP_VERSION,
        capabilities:{},
        clientInfo:{name:'legacy-shaped-client',version:'1.0.0'},
        _meta:modernMeta()
      }
    }
  });

  assert.equal(response.status,404);
  assert.equal(response.body.error.code,-32601);
  assert.match(response.body.error.message,/method not found/i);
  assert.equal(response.body.result,undefined);
  assert.equal(response.body.error._meta['io.modelcontextprotocol/serverInfo'].name,'kata-webmcp');
});

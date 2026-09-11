import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest, MCP_VERSION, LEGACY_MCP_VERSION} from '../lib/server/mcp.js';

const modernMeta=()=>({
  'io.modelcontextprotocol/protocolVersion':MCP_VERSION,
  'io.modelcontextprotocol/clientCapabilities':{}
});

test('modern server/discover advertises only modern per-request protocol versions',async()=>{
  const response=await handleMcpRequest({
    headers:{
      'mcp-protocol-version':MCP_VERSION,
      'mcp-method':'server/discover'
    },
    body:{
      jsonrpc:'2.0',
      id:'discover-era',
      method:'server/discover',
      params:{_meta:modernMeta()}
    }
  });

  assert.equal(response.status,200);
  assert.deepEqual(response.body.result.supportedVersions,[MCP_VERSION]);
  assert.equal(response.body.result.supportedVersions.includes(LEGACY_MCP_VERSION),false);
});

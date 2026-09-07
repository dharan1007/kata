import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest, MCP_VERSION, LEGACY_MCP_VERSION} from '../lib/server/mcp.js';

test('headerless non-initialize MCP requests use legacy fallback error semantics', async () => {
  const response = await handleMcpRequest({
    headers: {},
    body: {
      jsonrpc: '2.0',
      id: 51,
      method: 'tools/list',
      params: {}
    }
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, -32600);
  assert.equal(response.body.error.message, 'Unsupported MCP protocol version');
  assert.deepEqual(response.body.error.data, {
    supportedVersions: [MCP_VERSION, LEGACY_MCP_VERSION]
  });
  assert.equal(response.body.error._meta, undefined);
});

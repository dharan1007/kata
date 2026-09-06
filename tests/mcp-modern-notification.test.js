import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest, MCP_VERSION} from '../lib/server/mcp.js';

const metadata = {
  'io.modelcontextprotocol/protocolVersion': MCP_VERSION,
  'io.modelcontextprotocol/clientCapabilities': {}
};

test('MCP 2026-07-28 notifications require Mcp-Method routing metadata', async () => {
  let invoked = false;
  const registry = {
    list() { return []; },
    async invoke() { invoked = true; return {}; }
  };

  const response = await handleMcpRequest({
    headers: {
      'mcp-protocol-version': MCP_VERSION
    },
    body: {
      jsonrpc: '2.0',
      method: 'notifications/custom-event',
      params: {_meta: metadata}
    }
  }, {registry});

  assert.equal(response.status, 400);
  assert.equal(response.body?.error?.code, -32020);
  assert.equal(invoked, false);
});

test('MCP 2026-07-28 notifications with matching Mcp-Method return 202 without a JSON-RPC body', async () => {
  let invoked = false;
  const registry = {
    list() { return []; },
    async invoke() { invoked = true; return {}; }
  };

  const response = await handleMcpRequest({
    headers: {
      'mcp-protocol-version': MCP_VERSION,
      'mcp-method': 'notifications/custom-event'
    },
    body: {
      jsonrpc: '2.0',
      method: 'notifications/custom-event',
      params: {_meta: metadata}
    }
  }, {registry});

  assert.equal(response.status, 202);
  assert.equal(response.body, undefined);
  assert.equal(invoked, false);
});

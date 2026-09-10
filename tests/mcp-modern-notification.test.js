import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest, MCP_VERSION} from '../lib/server/mcp.js';

const metadata = {
  'io.modelcontextprotocol/protocolVersion': MCP_VERSION,
  'io.modelcontextprotocol/clientCapabilities': {}
};

test('MCP 2026-07-28 notifications accept modern metadata without transport routing headers', async () => {
  let invoked = false;
  const registry = {
    list() { return []; },
    async invoke() { invoked = true; return {}; }
  };

  const response = await handleMcpRequest({
    headers: {},
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

test('MCP 2026-07-28 notifications still require protocol metadata', async () => {
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
      params: {_meta: {
        'io.modelcontextprotocol/clientCapabilities': {}
      }}
    }
  }, {registry});

  assert.equal(response.status, 400);
  assert.equal(response.body?.error?.code, -32602);
  assert.match(response.body?.error?.message ?? '', /protocol version metadata/i);
  assert.equal(invoked, false);
});

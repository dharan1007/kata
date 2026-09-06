import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest, MCP_VERSION} from '../lib/server/mcp.js';

test('MCP 2026-07-28 notifications return 202 without request routing headers or JSON-RPC response bodies', async () => {
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
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': MCP_VERSION,
          'io.modelcontextprotocol/clientCapabilities': {}
        }
      }
    }
  }, {registry});

  assert.equal(response.status, 202);
  assert.equal(response.body, undefined);
  assert.equal(invoked, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest, MCP_VERSION, LEGACY_MCP_VERSION} from '../lib/server/mcp.js';

test('MCP 2026-07-28 reports HeaderMismatch before UnsupportedProtocolVersion when header and body disagree', async () => {
  const requested = '2027-01-01';
  const response = await handleMcpRequest({
    headers: {
      'mcp-protocol-version': MCP_VERSION,
      'mcp-method': 'tools/list'
    },
    body: {
      jsonrpc: '2.0',
      id: 41,
      method: 'tools/list',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': requested,
          'io.modelcontextprotocol/clientCapabilities': {}
        }
      }
    }
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, -32020);
  assert.deepEqual(response.body.error.data, {
    header: MCP_VERSION,
    body: requested
  });
});

test('MCP 2026-07-28 returns Invalid Params for an unsupported modern protocol revision', async () => {
  const requested = '2027-01-01';
  const response = await handleMcpRequest({
    headers: {
      'mcp-protocol-version': requested,
      'mcp-method': 'tools/list'
    },
    body: {
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/list',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': requested,
          'io.modelcontextprotocol/clientCapabilities': {}
        }
      }
    }
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, -32602);
  assert.equal(response.body.error.message, 'Unsupported MCP protocol version');
  assert.deepEqual(response.body.error.data, {
    supported: [MCP_VERSION, LEGACY_MCP_VERSION],
    requested
  });
});

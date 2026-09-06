import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest, MCP_VERSION} from '../lib/server/mcp.js';

const modernRequest = method => ({
  headers: {
    authorization: 'Bearer super-secret-token',
    'mcp-protocol-version': MCP_VERSION,
    'mcp-method': method
  },
  body: {
    jsonrpc: '2.0',
    id: 91,
    method,
    params: {
      _meta: {
        'io.modelcontextprotocol/protocolVersion': MCP_VERSION,
        'io.modelcontextprotocol/clientCapabilities': {}
      }
    }
  }
});

test('authenticated MCP discovery responses are never marked public-cacheable', async () => {
  for (const method of ['server/discover', 'tools/list']) {
    const response = await handleMcpRequest(modernRequest(method), {
      env: {MCP_BEARER_TOKEN: 'super-secret-token'}
    });

    assert.equal(response.status, 200);
    const cacheControl = String(response.headers?.['Cache-Control'] ?? '').toLowerCase();
    assert.match(cacheControl, /no-store/);
    assert.doesNotMatch(cacheControl, /\bpublic\b/);
  }
});

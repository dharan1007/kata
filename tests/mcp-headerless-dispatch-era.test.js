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

test('headerless modern MCP envelope is classified as modern and reports the missing protocol header', async () => {
  const response = await handleMcpRequest({
    headers: {},
    body: {
      jsonrpc: '2.0',
      id: 52,
      method: 'tools/list',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': MCP_VERSION,
          'io.modelcontextprotocol/clientCapabilities': {}
        }
      }
    }
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, -32020);
  assert.equal(response.body.error.message, 'MCP-Protocol-Version header does not match request metadata');
  assert.deepEqual(response.body.error.data, {
    header: null,
    body: MCP_VERSION
  });
  assert.deepEqual(response.body.error._meta, {
    'io.modelcontextprotocol/serverInfo': {
      name: 'kata-webmcp',
      version: '3.0.0'
    }
  });
});

test('headerless malformed parsed requests retain legacy error envelopes', async () => {
  const response = await handleMcpRequest({
    headers: {},
    body: {
      jsonrpc: '2.0',
      id: null,
      method: 'tools/list',
      params: {}
    }
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, -32600);
  assert.equal(response.body.error.message, 'MCP request id must not be null');
  assert.equal(response.body.error._meta, undefined);
});

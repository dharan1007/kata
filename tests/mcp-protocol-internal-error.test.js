import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest, MCP_VERSION} from '../lib/server/mcp.js';

test('MCP sanitizes unexpected protocol-handler failures instead of exposing internal exception details', async () => {
  const secret='postgres://internal-user:super-secret@db.internal.example/kata';
  const error=new Error(`registry exploded while connecting to ${secret}`);
  error.details={dsn:secret,sql:'select * from private_table'};
  const registry={
    list(){throw error;},
    async invoke(){return {};}
  };
  const response=await handleMcpRequest({
    headers:{
      'mcp-protocol-version':MCP_VERSION,
      'mcp-method':'tools/list'
    },
    body:{
      jsonrpc:'2.0',
      id:77,
      method:'tools/list',
      params:{
        _meta:{
          'io.modelcontextprotocol/protocolVersion':MCP_VERSION,
          'io.modelcontextprotocol/clientCapabilities':{}
        }
      }
    }
  },{registry});

  assert.equal(response.status,500);
  assert.equal(response.body.error.code,-32603);
  assert.equal(response.body.error.message,'Internal error');
  assert.equal(response.body.error.data,undefined);
  const serialized=JSON.stringify(response.body);
  assert.doesNotMatch(serialized,/super-secret|db\.internal\.example|private_table/);
});

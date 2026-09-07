import test from 'node:test';
import assert from 'node:assert/strict';
import mcp from '../api/mcp.js';

const MCP_ACCEPT='application/json, text/event-stream';

function res(){
  return {
    statusCode:200,
    headers:{},
    body:null,
    status(n){this.statusCode=n;return this;},
    setHeader(k,v){this.headers[k.toLowerCase()]=v;},
    json(v){this.body=v;return this;},
    end(v){this.body=v;return this;}
  };
}

function malformedRequest(protocol){
  return {
    method:'POST',
    headers:{
      accept:MCP_ACCEPT,
      'content-type':'application/json',
      'mcp-protocol-version':protocol
    },
    async *[Symbol.asyncIterator](){yield Buffer.from('{');}
  };
}

test('MCP transport parse errors preserve the explicitly declared protocol era',async()=>{
  const modern=res();
  await mcp(malformedRequest('2026-07-28'),modern);
  assert.equal(modern.statusCode,400);
  assert.equal(modern.body?.error?.code,-32700);
  assert.equal(modern.body?.error?._meta?.['io.modelcontextprotocol/serverInfo']?.name,'kata-webmcp');

  const legacy=res();
  await mcp(malformedRequest('2025-11-25'),legacy);
  assert.equal(legacy.statusCode,400);
  assert.equal(legacy.body?.error?.code,-32700);
  assert.equal(legacy.body?.error?._meta,undefined);
});

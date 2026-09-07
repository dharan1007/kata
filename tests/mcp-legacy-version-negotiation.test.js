import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest, LEGACY_MCP_VERSION} from '../lib/server/mcp.js';

test('legacy initialize counter-offers the latest supported handshake version',async()=>{
  const response=await handleMcpRequest({
    headers:{},
    body:{
      jsonrpc:'2.0',
      id:1,
      method:'initialize',
      params:{
        protocolVersion:'2025-06-18',
        capabilities:{},
        clientInfo:{name:'older-client',version:'1.0.0'}
      }
    }
  });

  assert.equal(response.status,200);
  assert.equal(response.body.error,undefined);
  assert.equal(response.body.result.protocolVersion,LEGACY_MCP_VERSION);
  assert.equal(response.body.result.serverInfo.name,'kata-webmcp');
});

test('legacy initialize rejects missing or malformed required client handshake fields',async()=>{
  const invalidParams=[
    {protocolVersion:LEGACY_MCP_VERSION},
    {protocolVersion:LEGACY_MCP_VERSION,capabilities:[],clientInfo:{name:'client',version:'1.0.0'}},
    {protocolVersion:LEGACY_MCP_VERSION,capabilities:{},clientInfo:[]},
    {protocolVersion:LEGACY_MCP_VERSION,capabilities:{},clientInfo:{name:'client'}},
    {protocolVersion:'',capabilities:{},clientInfo:{name:'client',version:'1.0.0'}}
  ];

  for(const params of invalidParams){
    const response=await handleMcpRequest({
      headers:{},
      body:{jsonrpc:'2.0',id:2,method:'initialize',params}
    });

    assert.equal(response.status,400);
    assert.equal(response.body.result,undefined);
    assert.equal(response.body.error.code,-32602);
    assert.equal(response.body.error.message,'Invalid params');
  }
});

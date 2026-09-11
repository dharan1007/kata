import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest,MCP_VERSION} from '../lib/server/mcp.js';
import {compileMcpToolInventory,buildMcpToolCallPreview} from '../src/mcp-adapter.js';

const META_PROTOCOL_VERSION='io.modelcontextprotocol/protocolVersion';
const META_CLIENT_CAPABILITIES='io.modelcontextprotocol/clientCapabilities';

function encodedHeader(value){
  return `=?base64?${Buffer.from(value,'utf8').toString('base64')}?=`;
}

test('MCP 2026 decodes Base64-sentinel Mcp-Name before routing validation',async()=>{
  const toolName='検索-工具';
  let invoked=false;
  const registry={
    list(){return[];},
    async invoke(name,args){
      invoked=true;
      assert.equal(name,toolName);
      assert.deepEqual(args,{query:'café'});
      return{ok:true,name};
    }
  };

  const response=await handleMcpRequest({
    headers:{
      'mcp-protocol-version':MCP_VERSION,
      'mcp-method':'tools/call',
      'mcp-name':encodedHeader(toolName)
    },
    body:{
      jsonrpc:'2.0',
      id:1,
      method:'tools/call',
      params:{
        name:toolName,
        arguments:{query:'café'},
        _meta:{
          [META_PROTOCOL_VERSION]:MCP_VERSION,
          [META_CLIENT_CAPABILITIES]:{}
        }
      }
    }
  },{registry,env:{}});

  assert.equal(response.status,200);
  assert.equal(invoked,true);
  assert.equal(response.body.result.structuredContent.ok,true);
  assert.equal(response.body.result.structuredContent.name,toolName);
});

test('MCP 2026 rejects malformed Base64-sentinel routing headers instead of leniently decoding them',async()=>{
  const response=await handleMcpRequest({
    headers:{
      'mcp-protocol-version':MCP_VERSION,
      'mcp-method':'tools/call',
      'mcp-name':'=?base64?%%%?='
    },
    body:{
      jsonrpc:'2.0',
      id:2,
      method:'tools/call',
      params:{
        name:'kata_search_research',
        arguments:{query:'agents'},
        _meta:{
          [META_PROTOCOL_VERSION]:MCP_VERSION,
          [META_CLIENT_CAPABILITIES]:{}
        }
      }
    }
  },{env:{}});

  assert.equal(response.status,400);
  assert.equal(response.body.error.code,-32020);
});

test('MCP 2026 Base64-encodes a literal sentinel-shaped x-mcp-header value',()=>{
  const literal='=?base64?literal?=';
  const inventory=compileMcpToolInventory([{
    name:'echo',
    inputSchema:{
      type:'object',
      properties:{value:{type:'string','x-mcp-header':'Val'}},
      required:['value'],
      additionalProperties:false
    }
  }]);

  assert.equal(inventory.rejected.length,0);
  const preview=buildMcpToolCallPreview(inventory.tools[0],{value:literal},'https://example.test/mcp');

  assert.equal(preview.headers['Mcp-Param-Val'],encodedHeader(literal));
});

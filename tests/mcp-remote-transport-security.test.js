import test from 'node:test';
import assert from 'node:assert/strict';
import {compileMcpToolInventory,buildMcpToolCallPreview,listModernMcpTools} from '../src/mcp-adapter.js';

const tool={name:'lookup.user',description:'Lookup a user',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}};
const candidate=compileMcpToolInventory([tool]).tools[0];

test('remote MCP execution previews require HTTPS while preserving loopback HTTP development',()=>{
  assert.throws(()=>buildMcpToolCallPreview(candidate,{id:'abc'},'http://mcp.example.com/mcp'),/HTTPS|loopback/i);
  assert.equal(buildMcpToolCallPreview(candidate,{id:'abc'},'https://mcp.example.com/mcp').endpoint,'https://mcp.example.com/mcp');
  assert.equal(buildMcpToolCallPreview(candidate,{id:'abc'},'http://localhost:3000/mcp').endpoint,'http://localhost:3000/mcp');
  assert.equal(buildMcpToolCallPreview(candidate,{id:'abc'},'http://127.0.0.1:3000/mcp').endpoint,'http://127.0.0.1:3000/mcp');
  assert.equal(buildMcpToolCallPreview(candidate,{id:'abc'},'http://[::1]:3000/mcp').endpoint,'http://[::1]:3000/mcp');
});

test('remote cleartext MCP list requests fail before fetch',async()=>{
  let fetchCalls=0;
  const fetchImpl=async()=>{fetchCalls+=1;throw new Error('fetch must not run');};
  await assert.rejects(()=>listModernMcpTools('http://mcp.example.com/mcp',{fetchImpl}),/HTTPS|loopback/i);
  assert.equal(fetchCalls,0);
});

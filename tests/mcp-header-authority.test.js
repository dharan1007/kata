import test from 'node:test';
import assert from 'node:assert/strict';
import {listModernMcpTools} from '../src/mcp-adapter.js';

const MCP_VERSION='2026-07-28';

function lowerHeaderMap(headers={}){
  const out=new Map();
  for(const [name,value] of Object.entries(headers)){
    const lower=name.toLowerCase();
    const values=out.get(lower)??[];
    values.push(String(value));
    out.set(lower,values);
  }
  return out;
}

test('caller extension headers cannot override or duplicate MCP transport authority',async()=>{
  let observed;
  const fetchImpl=async(_url,init)=>{
    observed=init;
    const body=JSON.parse(init.body);
    return{ok:true,status:200,json:async()=>({jsonrpc:'2.0',id:body.id,result:{resultType:'complete',tools:[]}})};
  };

  await listModernMcpTools('https://example.com/mcp',{
    fetchImpl,
    extraHeaders:{
      'MCP-Protocol-Version':'1900-01-01',
      'mcp-method':'tools/call',
      'CONTENT-TYPE':'text/plain',
      accept:'text/html',
      Authorization:'Bearer injected',
      cookie:'session=injected',
      'X-Kata-Integration':'allowed'
    }
  });

  const headers=lowerHeaderMap(observed.headers);
  assert.deepEqual(headers.get('mcp-protocol-version'),[MCP_VERSION]);
  assert.deepEqual(headers.get('mcp-method'),['tools/list']);
  assert.deepEqual(headers.get('content-type'),['application/json']);
  assert.deepEqual(headers.get('accept'),['application/json, text/event-stream']);
  assert.equal(headers.has('authorization'),false);
  assert.equal(headers.has('cookie'),false);
  assert.deepEqual(headers.get('x-kata-integration'),['allowed']);
});

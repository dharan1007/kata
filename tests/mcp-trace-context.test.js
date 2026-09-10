import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMcpRequest, MCP_VERSION} from '../lib/server/mcp.js';

const TRACE_META={
  'io.modelcontextprotocol/protocolVersion':MCP_VERSION,
  'io.modelcontextprotocol/clientCapabilities':{},
  traceparent:'00-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01',
  tracestate:'vendor=opaque',
  baggage:'tenant=acme,request_source=agent'
};

function modernToolRequest(meta=TRACE_META){
  return{
    headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/call','mcp-name':'kata_search_research'},
    body:{jsonrpc:'2.0',id:'trace-1',method:'tools/call',params:{name:'kata_search_research',arguments:{query:'mcp tracing'},_meta:meta}}
  };
}

test('MCP 2026 passes valid W3C trace context into tool execution context unchanged',async()=>{
  let receivedMeta;
  const registry={
    list:()=>[],
    invoke:async(_name,_args,ctx)=>{receivedMeta=ctx.meta;return{ok:true};}
  };
  const response=await handleMcpRequest(modernToolRequest(),{registry});

  assert.equal(response.status,200);
  assert.deepEqual(receivedMeta,TRACE_META);
});

test('MCP rejects malformed or zero W3C traceparent before tool execution',async()=>{
  for(const traceparent of [
    '00-00000000000000000000000000000000-00f067aa0ba902b7-01',
    '00-0af7651916cd43dd8448eb211c80319c-0000000000000000-01',
    '00-0AF7651916CD43DD8448EB211C80319C-00f067aa0ba902b7-01',
    'ff-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01',
    '00-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01-extra'
  ]){
    let invoked=false;
    const registry={list:()=>[],invoke:async()=>{invoked=true;return{ok:true};}};
    const response=await handleMcpRequest(modernToolRequest({...TRACE_META,traceparent}),{registry});
    assert.equal(response.status,400,traceparent);
    assert.equal(response.body.error.code,-32602,traceparent);
    assert.equal(response.body.error.message,'Invalid MCP trace context',traceparent);
    assert.deepEqual(response.body.error.data,{field:'traceparent'},traceparent);
    assert.equal(invoked,false,traceparent);
  }
});

test('MCP accepts a structurally valid future traceparent version without interpreting extension fields',async()=>{
  const traceparent='01-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01-vendor-extension';
  let receivedMeta;
  const registry={list:()=>[],invoke:async(_name,_args,ctx)=>{receivedMeta=ctx.meta;return{ok:true};}};
  const response=await handleMcpRequest(modernToolRequest({...TRACE_META,traceparent}),{registry});
  assert.equal(response.status,200);
  assert.equal(receivedMeta.traceparent,traceparent);
});

test('MCP rejects oversized or excess-member tracestate before tool execution',async()=>{
  const invalidValues=[
    Array.from({length:33},(_,i)=>`v${i}=x`).join(','),
    `vendor=${'x'.repeat(506)}`
  ];
  for(const tracestate of invalidValues){
    let invoked=false;
    const registry={list:()=>[],invoke:async()=>{invoked=true;return{ok:true};}};
    const response=await handleMcpRequest(modernToolRequest({...TRACE_META,tracestate}),{registry});
    assert.equal(response.status,400);
    assert.equal(response.body.error.code,-32602);
    assert.deepEqual(response.body.error.data,{field:'tracestate'});
    assert.equal(invoked,false);
  }
});

test('MCP rejects malformed tracestate syntax before tool execution',async()=>{
  const tracestate='Vendor=opaque';
  let invoked=false;
  const registry={list:()=>[],invoke:async()=>{invoked=true;return{ok:true};}};
  const response=await handleMcpRequest(modernToolRequest({...TRACE_META,tracestate}),{registry});
  assert.equal(response.status,400);
  assert.equal(response.body.error.code,-32602);
  assert.deepEqual(response.body.error.data,{field:'tracestate'});
  assert.equal(invoked,false);
});

test('MCP rejects oversized or excess-member baggage before tool execution',async()=>{
  const invalidValues=[
    Array.from({length:65},(_,i)=>`k${i}=v`).join(','),
    `key=${'x'.repeat(8189)}`
  ];
  for(const baggage of invalidValues){
    let invoked=false;
    const registry={list:()=>[],invoke:async()=>{invoked=true;return{ok:true};}};
    const response=await handleMcpRequest(modernToolRequest({...TRACE_META,baggage}),{registry});
    assert.equal(response.status,400);
    assert.equal(response.body.error.code,-32602);
    assert.deepEqual(response.body.error.data,{field:'baggage'});
    assert.equal(invoked,false);
  }
});

test('MCP rejects malformed baggage syntax before tool execution',async()=>{
  const baggage='tenant="acme"';
  let invoked=false;
  const registry={list:()=>[],invoke:async()=>{invoked=true;return{ok:true};}};
  const response=await handleMcpRequest(modernToolRequest({...TRACE_META,baggage}),{registry});
  assert.equal(response.status,400);
  assert.equal(response.body.error.code,-32602);
  assert.deepEqual(response.body.error.data,{field:'baggage'});
  assert.equal(invoked,false);
});

test('MCP trace metadata cannot override routing or authorization decisions',async()=>{
  let invoked=false;
  const registry={list:()=>[],invoke:async()=>{invoked=true;return{ok:true};}};
  const response=await handleMcpRequest({
    ...modernToolRequest({...TRACE_META,baggage:'authorization=Bearer%20forged,mcp-name=other_tool'}),
    headers:{'mcp-protocol-version':MCP_VERSION,'mcp-method':'tools/call','mcp-name':'wrong_tool'}
  },{registry,env:{MCP_BEARER_TOKEN:'real-secret'}});
  assert.equal(response.status,401);
  assert.equal(invoked,false);
});

test('MCP requests without trace context preserve existing behavior',async()=>{
  const meta={
    'io.modelcontextprotocol/protocolVersion':MCP_VERSION,
    'io.modelcontextprotocol/clientCapabilities':{},
    'vendor.example/context':'opaque'
  };
  let receivedMeta;
  const registry={list:()=>[],invoke:async(_name,_args,ctx)=>{receivedMeta=ctx.meta;return{ok:true};}};
  const response=await handleMcpRequest(modernToolRequest(meta),{registry});
  assert.equal(response.status,200);
  assert.deepEqual(receivedMeta,meta);
});

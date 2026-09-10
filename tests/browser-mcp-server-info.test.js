import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectMcpEndpoint} from '../extension/service-worker.js';
import {handleMcpRequest,MCP_VERSION} from '../lib/server/mcp.js';

const tab={id:7,url:'https://example.com/app'};
const SERVER_INFO_KEY='io.modelcontextprotocol/serverInfo';

function response(result){
  return {ok:true,status:200,async json(){return{jsonrpc:'2.0',id:'kata-mcp-discover',result};}};
}

function discoverResult(extra={}){
  return {supportedVersions:['2026-07-28'],capabilities:{tools:{}},...extra};
}

test('MCP 2026 discovery reads server identity from result _meta',async()=>{
  const fetchImpl=async()=>response(discoverResult({_meta:{[SERVER_INFO_KEY]:{name:'Modern MCP',version:'2.1.0'}}}));
  const discovered=await inspectMcpEndpoint(tab,'/mcp',{fetchImpl});
  assert.deepEqual(discovered.server.serverInfo,{name:'Modern MCP',version:'2.1.0'});
});

test('MCP 2026 discovery accepts an anonymous conforming server',async()=>{
  const fetchImpl=async()=>response(discoverResult());
  const discovered=await inspectMcpEndpoint(tab,'/mcp',{fetchImpl});
  assert.equal(discovered.ok,true);
  assert.equal(discovered.server.serverInfo,null);
});

test('MCP 2026 discovery ignores malformed server identity metadata',async()=>{
  const malformed=[null,[],{}, {name:''},{name:7},{name:'Valid',version:7}];
  for(const identity of malformed){
    const fetchImpl=async()=>response(discoverResult({_meta:{[SERVER_INFO_KEY]:identity}}));
    const discovered=await inspectMcpEndpoint(tab,'/mcp',{fetchImpl});
    assert.equal(discovered.ok,true);
    assert.equal(discovered.server.serverInfo,null);
  }
});

test('MCP 2026 result _meta identity wins over stale body-level serverInfo',async()=>{
  const fetchImpl=async()=>response(discoverResult({serverInfo:{name:'Legacy Body',version:'1'},_meta:{[SERVER_INFO_KEY]:{name:'Canonical Meta',version:'2'}}}));
  const discovered=await inspectMcpEndpoint(tab,'/mcp',{fetchImpl});
  assert.deepEqual(discovered.server.serverInfo,{name:'Canonical Meta',version:'2'});
});

test('legacy body-level serverInfo remains display-only fallback when modern metadata is absent',async()=>{
  const fetchImpl=async()=>response(discoverResult({serverInfo:{name:'Transition Server',version:'1'}}));
  const discovered=await inspectMcpEndpoint(tab,'/mcp',{fetchImpl});
  assert.deepEqual(discovered.server.serverInfo,{name:'Transition Server',version:'1'});
});

test('KATA modern server discovery round-trips its result metadata identity through the browser inspector',async()=>{
  const fetchImpl=async(_url,init)=>{
    const body=JSON.parse(init.body);
    const handled=await handleMcpRequest({headers:init.headers,body},{env:{}});
    return {ok:handled.status>=200&&handled.status<300,status:handled.status,headers:{get(name){const target=String(name).toLowerCase();for(const [key,value] of Object.entries(handled.headers??{}))if(key.toLowerCase()===target)return value;return null;}},async json(){return handled.body;}};
  };
  const discovered=await inspectMcpEndpoint(tab,'/mcp',{fetchImpl});
  assert.equal(discovered.ok,true);
  assert.equal(discovered.environment.mcpModernProtocol,'supported');
  assert.deepEqual(discovered.server.serverInfo,{name:'kata-webmcp',version:'3.0.0'});
  assert.ok(discovered.server.supportedVersions.includes(MCP_VERSION));
});

test('MCP 2026 active-tab discovery propagates explicitly supplied W3C trace context in request _meta',async()=>{
  const traceContext={
    traceparent:'00-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01',
    tracestate:'vendor=opaque',
    baggage:'tenant=diagnostic'
  };
  let body=null;
  const fetchImpl=async(_url,init)=>{body=JSON.parse(init.body);return response(discoverResult());};
  const discovered=await inspectMcpEndpoint(tab,'/mcp',{fetchImpl,traceContext});
  assert.equal(discovered.ok,true);
  assert.deepEqual({
    traceparent:body.params._meta.traceparent,
    tracestate:body.params._meta.tracestate,
    baggage:body.params._meta.baggage
  },traceContext);
});

test('MCP 2026 active-tab discovery rejects invalid trace context before fetch',async()=>{
  let fetchCalls=0;
  const fetchImpl=async()=>{fetchCalls+=1;return response(discoverResult());};
  await assert.rejects(
    inspectMcpEndpoint(tab,'/mcp',{fetchImpl,traceContext:{traceparent:'00-00000000000000000000000000000000-00f067aa0ba902b7-01'}}),
    /traceparent/i
  );
  assert.equal(fetchCalls,0);
});

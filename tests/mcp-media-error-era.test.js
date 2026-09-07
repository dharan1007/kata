import test from 'node:test';
import assert from 'node:assert/strict';
import mcp from '../api/mcp.js';

function res(){return{statusCode:200,headers:{},body:null,status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};}

function request(protocol,headers={}){
  const out={method:'POST',headers:{...headers},body:{jsonrpc:'2.0',id:1,method:'ping',params:{}}};
  if(protocol!==undefined)out.headers['mcp-protocol-version']=protocol;
  return out;
}

function assertEra(response,{status,code,modern}){
  assert.equal(response.statusCode,status);
  assert.equal(response.body?.jsonrpc,'2.0');
  assert.equal(response.body?.error?.code,code);
  assert.equal(response.body?.error?._meta?.['io.modelcontextprotocol/serverInfo']?.name,modern?'kata-webmcp':undefined);
}

test('MCP 415 media errors preserve the explicitly declared protocol era',async()=>{
  const modern=res();
  await mcp(request('2026-07-28',{accept:'application/json, text/event-stream','content-type':'text/plain'}),modern);
  assertEra(modern,{status:415,code:-32600,modern:true});

  const legacy=res();
  await mcp(request('2025-11-25',{accept:'application/json, text/event-stream','content-type':'text/plain'}),legacy);
  assertEra(legacy,{status:415,code:-32600,modern:false});
});

test('MCP 406 Accept errors preserve the explicitly declared protocol era',async()=>{
  const modern=res();
  await mcp(request('2026-07-28',{'content-type':'application/json',accept:'application/json'}),modern);
  assertEra(modern,{status:406,code:-32000,modern:true});

  const legacy=res();
  await mcp(request('2025-11-25',{'content-type':'application/json',accept:'application/json'}),legacy);
  assertEra(legacy,{status:406,code:-32000,modern:false});
});

test('headerless pre-2026 clients keep legacy-shaped media errors',async()=>{
  const unsupportedMedia=res();
  await mcp(request(undefined,{accept:'application/json, text/event-stream','content-type':'text/plain'}),unsupportedMedia);
  assertEra(unsupportedMedia,{status:415,code:-32600,modern:false});

  const unacceptable=res();
  await mcp(request(undefined,{'content-type':'application/json',accept:'application/json'}),unacceptable);
  assertEra(unacceptable,{status:406,code:-32000,modern:false});
});

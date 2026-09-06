import test from 'node:test';
import assert from 'node:assert/strict';
import mcp from '../api/mcp.js';

function res(){return{statusCode:200,headers:{},body:null,status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};}

const ping={jsonrpc:'2.0',id:1,method:'ping',params:{}};

test('/api/mcp requires application/json media type before dispatching MCP requests',async()=>{
  const wrong=res();
  await mcp({method:'POST',headers:{'content-type':'text/plain','mcp-protocol-version':'2025-11-25'},body:ping},wrong);
  assert.equal(wrong.statusCode,415);
  assert.equal(wrong.headers['accept-post'],'application/json');
  assert.equal(wrong.body?.jsonrpc,'2.0');
  assert.equal(wrong.body?.error?.code,-32600);

  const missing=res();
  await mcp({method:'POST',headers:{'mcp-protocol-version':'2025-11-25'},body:ping},missing);
  assert.equal(missing.statusCode,415);

  const valid=res();
  await mcp({method:'POST',headers:{'content-type':'Application/JSON; charset=utf-8','mcp-protocol-version':'2025-11-25'},body:ping},valid);
  assert.equal(valid.statusCode,200);
  assert.deepEqual(valid.body,{jsonrpc:'2.0',id:1,result:{}});
});

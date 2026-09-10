import test from 'node:test';
import assert from 'node:assert/strict';
import capabilities from '../api/capabilities.js';

function res(){return{statusCode:200,headers:{},body:null,status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};}

test('/api/capabilities distinguishes modern request routing headers from notification transport headers',async()=>{
  const r=res();
  await capabilities({method:'GET',headers:{}},r);
  assert.equal(r.statusCode,200);
  const contract=r.body.capabilities.mcp.modernRequest;
  assert.deepEqual(contract.requiredHeaders,['Content-Type','Accept','MCP-Protocol-Version','Mcp-Method']);
  assert.deepEqual(contract.notificationRequiredHeaders,['Content-Type','Accept','MCP-Protocol-Version']);
  assert.equal(contract.notificationRoutingHeadersRequired,false);
});

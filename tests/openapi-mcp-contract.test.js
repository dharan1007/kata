import test from 'node:test';
import assert from 'node:assert/strict';
import openapi from '../api/openapi.js';
import {MCP_VERSION,LEGACY_MCP_VERSION} from '../lib/server/mcp.js';

function res(){return{statusCode:200,headers:{},body:null,status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};}

test('/api/openapi publishes the modern MCP transport contract',async()=>{
  const r=res();
  await openapi({method:'GET',headers:{}},r);
  assert.equal(r.statusCode,200);

  const operation=r.body.paths['/api/mcp'].post;
  assert.equal(operation.operationId,'callKataMcp');

  const parameters=Object.fromEntries(operation.parameters.map(parameter=>[parameter.name,parameter]));
  assert.equal(parameters['MCP-Protocol-Version'].in,'header');
  assert.deepEqual(parameters['MCP-Protocol-Version'].schema.enum,[MCP_VERSION,LEGACY_MCP_VERSION]);
  assert.equal(parameters['Mcp-Method'].in,'header');
  assert.equal(parameters['Mcp-Method'].required,false);
  assert.equal(parameters['Mcp-Name'].required,false);

  const requestMedia=operation.requestBody.content;
  assert.ok(requestMedia['application/json']);
  const requestSchema=requestMedia['application/json'].schema;
  assert.equal(requestSchema.properties.jsonrpc.const,'2.0');
  assert.ok(requestSchema.properties.params.properties._meta.properties['io.modelcontextprotocol/protocolVersion']);
  assert.ok(requestSchema.properties.params.properties._meta.properties['io.modelcontextprotocol/clientCapabilities']);
  assert.ok(requestSchema.properties.params.properties._meta.properties.traceparent);

  assert.equal(operation.responses['200'].description,'JSON-RPC response for request/response calls');
  assert.ok(operation.responses['200'].content['application/json']);
  assert.equal(operation.responses['202'].description,'Accepted MCP notification; no JSON-RPC response body');
  assert.ok(operation.responses['400']);
  assert.ok(operation.responses['401']);
  assert.ok(operation.responses['403']);
  assert.ok(operation.responses['406']);
  assert.ok(operation.responses['413']);
  assert.ok(operation.responses['415']);
  assert.ok(operation.responses['500']);
});

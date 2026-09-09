import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverBrowserApis} from '../src/api-discovery.js';
import {compileOpenApiCandidates} from '../src/api-adapter.js';

function response(body){return{ok:true,status:200,url:'https://app.test/openapi.json',headers:{get(name){return name.toLowerCase()==='content-type'?'application/json':null;}},async text(){return JSON.stringify(body);}};}

const BASE={
  openapi:'3.1.0',info:{title:'Ref API',version:'1'},servers:[{url:'/api'}],
  components:{
    parameters:{Id:{name:'id',in:'path',required:true,schema:{$ref:'#/components/schemas/Identifier'}}},
    requestBodies:{Payload:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/Payload'}}}}},
    schemas:{
      Identifier:{type:'string',pattern:'^[a-z0-9-]+$'},
      Payload:{type:'object',properties:{name:{type:'string'},nested:{$ref:'#/components/schemas/Nested'}},required:['name'],additionalProperties:false},
      Nested:{type:'object',properties:{enabled:{type:'boolean'}},additionalProperties:false}
    }
  },
  paths:{
    '/objects/{id}':{
      parameters:[{$ref:'#/components/parameters/Id'}],
      put:{operationId:'replaceObject',requestBody:{$ref:'#/components/requestBodies/Payload'},responses:{'204':{description:'ok'}}}
    }
  }
};

test('resolves bounded local component refs for path parameters, request bodies and nested schemas',async()=>{
  const discovery=await discoverBrowserApis({declaredApiDescriptions:['https://app.test/openapi.json'],includeWellKnownCatalog:false},{origin:'https://app.test',fetch:async()=>response(BASE)});
  const operation=discovery.operations[0];
  assert.equal(operation.parameters[0].name,'id');
  assert.equal(operation.parameters[0].schema.pattern,'^[a-z0-9-]+$');
  assert.equal(operation.requestBody.required,true);
  assert.equal(operation.requestBody.schema.properties.nested.properties.enabled.type,'boolean');
  const compiled=compileOpenApiCandidates(discovery);
  assert.equal(compiled.tools.length,1);
  assert.deepEqual(compiled.tools[0].inputSchema.required,['path','body']);
});

test('does not fetch or silently compile external OpenAPI refs',async()=>{
  const document=structuredClone(BASE);
  document.paths['/objects/{id}'].parameters=[{$ref:'https://attacker.test/parameter.json'}];
  const calls=[];
  const discovery=await discoverBrowserApis({declaredApiDescriptions:['https://app.test/openapi.json'],includeWellKnownCatalog:false},{origin:'https://app.test',fetch:async url=>{calls.push(String(url));return response(document);}});
  assert.deepEqual(calls,['https://app.test/openapi.json']);
  assert.equal(discovery.operations[0].hasUnresolvedRequiredInputs,true);
  const compiled=compileOpenApiCandidates(discovery);
  assert.equal(compiled.tools.length,0);
  assert.equal(compiled.rejected[0].reason,'unsupported_required_input');
});

test('bounds recursive schema refs and rejects cyclic required input rather than recursing forever',async()=>{
  const document=structuredClone(BASE);
  document.components.schemas.Payload={type:'object',properties:{self:{$ref:'#/components/schemas/Payload'}},required:['self']};
  const discovery=await discoverBrowserApis({declaredApiDescriptions:['https://app.test/openapi.json'],includeWellKnownCatalog:false},{origin:'https://app.test',fetch:async()=>response(document)});
  assert.equal(discovery.operations[0].hasUnresolvedRequiredInputs,true);
  const compiled=compileOpenApiCandidates(discovery);
  assert.equal(compiled.tools.length,0);
  assert.equal(compiled.rejected[0].reason,'unsupported_required_input');
});

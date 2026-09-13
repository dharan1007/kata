import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverBrowserApis} from '../src/api-discovery.js';
import {compileOpenApiCandidates} from '../src/api-adapter.js';
import {buildAuthorizedExecutionPreview} from '../src/api-execution.js';

function response(body){return{ok:true,status:200,url:'https://app.test/openapi.json',headers:{get(name){return name.toLowerCase()==='content-type'?'application/json':null;}},async text(){return JSON.stringify(body);}};}

async function discoveryFor(document){
  return discoverBrowserApis(
    {declaredApiDescriptions:['https://app.test/openapi.json'],includeWellKnownCatalog:false},
    {origin:'https://app.test',fetch:async()=>response(document)}
  );
}

async function candidateFor(document){
  const discovery=await discoveryFor(document);
  assert.equal(discovery.operations.length,1);
  const compiled=compileOpenApiCandidates(discovery);
  assert.equal(compiled.tools.length,1);
  return compiled.tools[0];
}

function documentFor(openapi,propertySchema){
  return{
    openapi,
    info:{title:'Exclusive bounds contract',version:'1'},
    servers:[{url:'/api'}],
    paths:{
      '/limits':{
        post:{
          operationId:'setLimit',
          requestBody:{required:true,content:{'application/json':{schema:{
            type:'object',
            required:['amount'],
            properties:{amount:propertySchema}
          }}}},
          responses:{'204':{description:'ok'}}
        }
      }
    }
  };
}

test('executes OpenAPI 3.1 numeric exclusiveMinimum and exclusiveMaximum constraints',async()=>{
  const candidate=await candidateFor(documentFor('3.1.0',{type:'number',exclusiveMinimum:0,exclusiveMaximum:10}));

  assert.equal(buildAuthorizedExecutionPreview(candidate,{body:{amount:5}},'https://app.test').readyToExecute,true);
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate,{body:{amount:0}},'https://app.test'),
    /exclusiveMinimum 0/
  );
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate,{body:{amount:10}},'https://app.test'),
    /exclusiveMaximum 10/
  );
});

test('normalizes OpenAPI 3.0 boolean exclusive bounds into executable numeric constraints',async()=>{
  const candidate=await candidateFor(documentFor('3.0.4',{type:'number',minimum:0,exclusiveMinimum:true,maximum:10,exclusiveMaximum:true}));

  assert.equal(buildAuthorizedExecutionPreview(candidate,{body:{amount:5}},'https://app.test').readyToExecute,true);
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate,{body:{amount:0}},'https://app.test'),
    /exclusiveMinimum 0/
  );
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate,{body:{amount:10}},'https://app.test'),
    /exclusiveMaximum 10/
  );
});

test('rejects OpenAPI 3.0 numeric exclusive-bound declarations instead of treating them as 3.1 semantics',async()=>{
  const discovery=await discoveryFor(documentFor('3.0.4',{type:'number',minimum:0,exclusiveMinimum:1}));
  assert.equal(discovery.operations.length,1);

  const compiled=compileOpenApiCandidates(discovery);
  assert.equal(compiled.tools.length,0);
  assert.deepEqual(compiled.rejected,[{
    operationId:'setLimit',
    method:'POST',
    path:'/limits',
    reason:'unsupported_schema_contract'
  }]);
});

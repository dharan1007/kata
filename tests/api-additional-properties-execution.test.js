import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverBrowserApis} from '../src/api-discovery.js';
import {compileOpenApiCandidates} from '../src/api-adapter.js';
import {buildAuthorizedExecutionPreview} from '../src/api-execution.js';

function response(body){return{ok:true,status:200,url:'https://app.test/openapi.json',headers:{get(name){return name.toLowerCase()==='content-type'?'application/json':null;}},async text(){return JSON.stringify(body);}};}

async function candidateFor(document){
  const discovery=await discoverBrowserApis(
    {declaredApiDescriptions:['https://app.test/openapi.json'],includeWellKnownCatalog:false},
    {origin:'https://app.test',fetch:async()=>response(document)}
  );
  assert.equal(discovery.operations.length,1);
  const compiled=compileOpenApiCandidates(discovery);
  assert.equal(compiled.tools.length,1);
  return compiled.tools[0];
}

function documentFor(openapi,bodySchema){
  return{
    openapi,
    info:{title:'Typed map contract',version:'1'},
    servers:[{url:'/api'}],
    paths:{
      '/settings':{
        post:{
          operationId:'updateSettings',
          requestBody:{required:true,content:{'application/json':{schema:bodySchema}}},
          responses:{'204':{description:'ok'}}
        }
      }
    }
  };
}

test('executes schema-valued additionalProperties for typed OpenAPI maps',async()=>{
  const candidate=await candidateFor(documentFor('3.1.0',{
    type:'object',
    required:['source'],
    properties:{source:{type:'string'}},
    additionalProperties:{type:'integer',minimum:0}
  }));

  const body={source:'agent',retries:2,shard:0};
  const preview=buildAuthorizedExecutionPreview(candidate,{body},'https://app.test');
  assert.equal(preview.readyToExecute,true);
  assert.equal(preview.body,JSON.stringify(body));

  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate,{body:{source:'agent',retries:-1}},'https://app.test'),
    /minimum 0/
  );
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate,{body:{source:'agent',retries:'2'}},'https://app.test'),
    /must be integer/
  );
});

test('normalizes OpenAPI 3.0 nullable map-value schemas inside additionalProperties',async()=>{
  const candidate=await candidateFor(documentFor('3.0.4',{
    type:'object',
    additionalProperties:{type:'string',nullable:true,minLength:2}
  }));

  const nullPreview=buildAuthorizedExecutionPreview(candidate,{body:{nickname:null}},'https://app.test');
  assert.equal(nullPreview.readyToExecute,true);
  assert.equal(nullPreview.body,JSON.stringify({nickname:null}));

  const stringPreview=buildAuthorizedExecutionPreview(candidate,{body:{nickname:'ok'}},'https://app.test');
  assert.equal(stringPreview.readyToExecute,true);

  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate,{body:{nickname:'x'}},'https://app.test'),
    /minLength 2/
  );
});

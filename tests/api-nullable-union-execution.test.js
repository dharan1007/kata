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

function documentFor(openapi,propertySchema){
  return{
    openapi,
    info:{title:'Nullable contract',version:'1'},
    servers:[{url:'/api'}],
    paths:{
      '/profiles':{
        post:{
          operationId:'updateProfile',
          requestBody:{required:true,content:{'application/json':{schema:{
            type:'object',
            required:['nickname'],
            properties:{nickname:propertySchema}
          }}}},
          responses:{'204':{description:'ok'}}
        }
      }
    }
  };
}

test('executes OpenAPI 3.1 JSON Schema nullable type unions without weakening member constraints',async()=>{
  const candidate=await candidateFor(documentFor('3.1.0',{type:['string','null'],minLength:2}));

  const nullPreview=buildAuthorizedExecutionPreview(candidate,{body:{nickname:null}},'https://app.test');
  assert.equal(nullPreview.readyToExecute,true);
  assert.equal(nullPreview.body,JSON.stringify({nickname:null}));

  const stringPreview=buildAuthorizedExecutionPreview(candidate,{body:{nickname:'Ada'}},'https://app.test');
  assert.equal(stringPreview.readyToExecute,true);

  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate,{body:{nickname:'A'}},'https://app.test'),
    /minLength 2/
  );
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate,{body:{nickname:42}},'https://app.test'),
    /must be one of the allowed types|must be string or null/
  );
});

test('normalizes OpenAPI 3.0 nullable schemas into the executable JSON Schema contract',async()=>{
  const candidate=await candidateFor(documentFor('3.0.4',{type:'string',nullable:true,minLength:2}));

  const nullPreview=buildAuthorizedExecutionPreview(candidate,{body:{nickname:null}},'https://app.test');
  assert.equal(nullPreview.readyToExecute,true);
  assert.equal(nullPreview.body,JSON.stringify({nickname:null}));

  const stringPreview=buildAuthorizedExecutionPreview(candidate,{body:{nickname:'Grace'}},'https://app.test');
  assert.equal(stringPreview.readyToExecute,true);

  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate,{body:{nickname:7}},'https://app.test'),
    /must be one of the allowed types|must be string or null/
  );
});

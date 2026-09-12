import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverBrowserApis} from '../src/api-discovery.js';
import {compileOpenApiCandidates} from '../src/api-adapter.js';

function response(body){return{ok:true,status:200,url:'https://app.test/openapi.json',headers:{get(name){return name.toLowerCase()==='content-type'?'application/json':null;}},async text(){return JSON.stringify(body);}};}

async function discover(document){
  return discoverBrowserApis({declaredApiDescriptions:['https://app.test/openapi.json'],includeWellKnownCatalog:false},{origin:'https://app.test',fetch:async()=>response(document)});
}

test('preserves OpenAPI 3.1 Schema Object constraints adjacent to a local $ref',async()=>{
  const discovery=await discover({
    openapi:'3.1.0',
    info:{title:'Schema ref siblings',version:'1'},
    servers:[{url:'/api'}],
    components:{schemas:{BaseCode:{type:'string',minLength:2}}},
    paths:{
      '/objects':{
        post:{
          operationId:'createObject',
          requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['code'],properties:{code:{$ref:'#/components/schemas/BaseCode',maxLength:5,pattern:'^[A-Z]+$'}}}}}},
          responses:{'204':{description:'ok'}}
        }
      }
    }
  });

  assert.equal(discovery.operations.length,1);
  const compiled=compileOpenApiCandidates(discovery);
  assert.equal(compiled.tools.length,1);
  const codeSchema=compiled.tools[0].inputSchema.properties.body.properties.code;
  assert.deepEqual(codeSchema,{
    allOf:[
      {type:'string',minLength:2},
      {maxLength:5,pattern:'^[A-Z]+$'}
    ]
  });
});

test('keeps OpenAPI 3.0 reference siblings ignored for compatibility',async()=>{
  const discovery=await discover({
    openapi:'3.0.3',
    info:{title:'Legacy schema refs',version:'1'},
    servers:[{url:'/api'}],
    components:{schemas:{BaseCode:{type:'string',minLength:2}}},
    paths:{
      '/objects':{
        post:{
          operationId:'createLegacyObject',
          requestBody:{required:true,content:{'application/json':{schema:{type:'object',required:['code'],properties:{code:{$ref:'#/components/schemas/BaseCode',maxLength:5}}}}}},
          responses:{'204':{description:'ok'}}
        }
      }
    }
  });

  const compiled=compileOpenApiCandidates(discovery);
  assert.equal(compiled.tools.length,1);
  assert.deepEqual(compiled.tools[0].inputSchema.properties.body.properties.code,{type:'string',minLength:2});
});
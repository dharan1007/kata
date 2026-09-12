import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverBrowserApis} from '../src/api-discovery.js';
import {compileOpenApiCandidates} from '../src/api-adapter.js';

function response(body){return{ok:true,status:200,url:'https://app.test/openapi.json',headers:{get(name){return name.toLowerCase()==='content-type'?'application/json':null;}},async text(){return JSON.stringify(body);}};}

test('does not expose an optional JSON body when any nested schema reference is unresolved',async()=>{
  const document={
    openapi:'3.1.0',
    info:{title:'Optional body safety',version:'1'},
    servers:[{url:'/api'}],
    paths:{
      '/objects':{
        post:{
          operationId:'createObject',
          requestBody:{
            required:false,
            content:{
              'application/json':{
                schema:{
                  type:'object',
                  properties:{
                    name:{type:'string'},
                    policy:{$ref:'https://schemas.example.test/policy.json'}
                  },
                  additionalProperties:true
                }
              }
            }
          },
          responses:{'204':{description:'ok'}}
        }
      }
    }
  };

  const calls=[];
  const discovery=await discoverBrowserApis({declaredApiDescriptions:['https://app.test/openapi.json'],includeWellKnownCatalog:false},{origin:'https://app.test',fetch:async url=>{calls.push(String(url));return response(document);}});
  assert.deepEqual(calls,['https://app.test/openapi.json']);
  assert.equal(discovery.operations.length,1);

  const compiled=compileOpenApiCandidates(discovery);
  assert.equal(compiled.tools.length,1);
  assert.equal(Object.hasOwn(compiled.tools[0].inputSchema.properties,'body'),false);
});

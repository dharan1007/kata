import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverBrowserApis} from '../src/api-discovery.js';
import {compileOpenApiCandidates} from '../src/api-adapter.js';

function response(body,url='https://docs.example.test/openapi.json'){
  return{ok:true,status:200,url,headers:{get(name){return name.toLowerCase()==='content-type'?'application/json':null;}},async text(){return JSON.stringify(body);}};
}

test('honors operation and path server overrides before the root OpenAPI server',async()=>{
  const document={
    openapi:'3.1.2',
    info:{title:'Server precedence',version:'1.0.0'},
    servers:[{url:'https://root.example.test/api'}],
    paths:{
      '/path-only':{
        servers:[{url:'https://path.example.test/v2'}],
        get:{operationId:'pathServer',responses:{'200':{description:'ok'}}}
      },
      '/operation':{
        servers:[{url:'https://path.example.test/v2'}],
        get:{
          operationId:'operationServer',
          servers:[{url:'https://operation.example.test/v3'}],
          responses:{'200':{description:'ok'}}
        }
      }
    }
  };
  const discovery=await discoverBrowserApis({declaredApiDescriptions:['https://docs.example.test/openapi.json'],includeWellKnownCatalog:false},{origin:'https://docs.example.test',fetch:async()=>response(document)});
  const {tools}=compileOpenApiCandidates(discovery);
  assert.equal(tools.find(tool=>tool.name==='pathServer')?.execution.urlTemplate,'https://path.example.test/v2/path-only');
  assert.equal(tools.find(tool=>tool.name==='operationServer')?.execution.urlTemplate,'https://operation.example.test/v3/operation');
});

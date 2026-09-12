import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverBrowserApis} from '../src/api-discovery.js';
import {compileOpenApiCandidates} from '../src/api-adapter.js';

function response(body,url='https://docs.example.test/openapi.json'){
  return{ok:true,status:200,url,headers:{get(name){return name.toLowerCase()==='content-type'?'application/json':null;}},async text(){return JSON.stringify(body);}};
}

test('resolves OpenAPI server variables from declared defaults before compiling an executable candidate',async()=>{
  const document={
    openapi:'3.1.2',
    info:{title:'Server variables',version:'1.0.0'},
    servers:[{
      url:'https://{tenant}.api.example.test:{port}/{basePath}',
      variables:{
        tenant:{default:'demo'},
        port:{enum:['443','8443'],default:'8443'},
        basePath:{default:'v2'}
      }
    }],
    paths:{
      '/widgets':{
        get:{operationId:'listWidgets',responses:{'200':{description:'ok'}}}
      }
    }
  };
  const discovery=await discoverBrowserApis({declaredApiDescriptions:['https://docs.example.test/openapi.json'],includeWellKnownCatalog:false},{origin:'https://docs.example.test',fetch:async()=>response(document)});
  const {tools,rejected}=compileOpenApiCandidates(discovery);
  assert.equal(rejected.length,0);
  assert.equal(tools.find(tool=>tool.name==='listWidgets')?.execution.urlTemplate,'https://demo.api.example.test:8443/v2/widgets');
});

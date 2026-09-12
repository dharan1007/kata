import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverBrowserApis} from '../src/api-discovery.js';
import {compileOpenApiCandidates} from '../src/api-adapter.js';

function response(body,url='https://docs.example.test/openapi.json'){
  return{ok:true,status:200,url,headers:{get(name){return name.toLowerCase()==='content-type'?'application/json':null;}},async text(){return JSON.stringify(body);}};
}

async function compile(document){
  const discovery=await discoverBrowserApis({declaredApiDescriptions:['https://docs.example.test/openapi.json'],includeWellKnownCatalog:false},{origin:'https://docs.example.test',fetch:async()=>response(document)});
  return compileOpenApiCandidates(discovery);
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
    paths:{'/widgets':{get:{operationId:'listWidgets',responses:{'200':{description:'ok'}}}}}
  };
  const {tools,rejected}=await compile(document);
  assert.equal(rejected.length,0);
  assert.equal(tools.find(tool=>tool.name==='listWidgets')?.execution.urlTemplate,'https://demo.api.example.test:8443/v2/widgets');
});

test('keeps unresolved or inconsistent OpenAPI server variables fail-closed',async()=>{
  const base={openapi:'3.1.2',info:{title:'Bad server variables',version:'1.0.0'},paths:{'/widgets':{get:{operationId:'listWidgets',responses:{'200':{description:'ok'}}}}}};
  const missingDefault=await compile({...base,servers:[{url:'https://{tenant}.api.example.test',variables:{tenant:{description:'required default omitted'}}}]});
  assert.equal(missingDefault.tools.length,0);
  assert.equal(missingDefault.rejected[0]?.reason,'unsafe_or_unresolved_server');

  const enumMismatch=await compile({...base,servers:[{url:'https://{tenant}.api.example.test',variables:{tenant:{enum:['prod'],default:'demo'}}}]});
  assert.equal(enumMismatch.tools.length,0);
  assert.equal(enumMismatch.rejected[0]?.reason,'unsafe_or_unresolved_server');

  const credentialInjection=await compile({...base,servers:[{url:'https://{authority}/v1',variables:{authority:{default:'user:pass@example.test'}}}]});
  assert.equal(credentialInjection.tools.length,0);
  assert.equal(credentialInjection.rejected[0]?.reason,'unsafe_or_unresolved_server');
});

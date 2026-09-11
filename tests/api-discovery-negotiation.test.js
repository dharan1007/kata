import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverBrowserApis} from '../src/api-discovery.js';

function response({url='https://app.test/openapi',contentType='application/json',body='{}'}={}){
  return{
    ok:true,
    status:200,
    url,
    headers:{get(name){return name.toLowerCase()==='content-type'?contentType:null;}},
    async text(){return body;}
  };
}

test('OpenAPI discovery only negotiates representation formats the parser can consume',async()=>{
  const jsonDocument=JSON.stringify({
    openapi:'3.2.0',
    info:{title:'Negotiated API',version:'1.0.0'},
    paths:{'/health':{get:{operationId:'health',responses:{'200':{content:{'application/json':{}}}}}}}
  });
  let observedAccept='';
  const fetch=async(url,options)=>{
    observedAccept=String(options.headers?.Accept??'');
    if(/(?:application|text)\/ya?ml/i.test(observedAccept)){
      return response({url:String(url),contentType:'application/yaml',body:'openapi: 3.2.0\ninfo:\n  title: Negotiated API'});
    }
    return response({url:String(url),contentType:'application/openapi+json',body:jsonDocument});
  };

  const result=await discoverBrowserApis(
    {declaredApiDescriptions:['https://app.test/openapi'],includeWellKnownCatalog:false},
    {origin:'https://app.test',fetch}
  );

  assert.doesNotMatch(observedAccept,/(?:application|text)\/ya?ml/i);
  assert.equal(result.resources[0]?.status,'ok');
  assert.equal(result.descriptions[0]?.title,'Negotiated API');
  assert.equal(result.operations[0]?.operationId,'health');
});

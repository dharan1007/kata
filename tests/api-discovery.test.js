import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverBrowserApis} from '../src/api-discovery.js';

function response({url='https://app.test/openapi.json',status=200,contentType='application/json',body='{}'}={}){
  return{
    ok:status>=200&&status<300,status,url,
    headers:{get(name){return name.toLowerCase()==='content-type'?contentType:null;}},
    async text(){return body;}
  };
}

const OPENAPI={
  openapi:'3.2.0',
  info:{title:'Example API',version:'1.0.0'},
  servers:[{url:'https://api.example.test/v1'}],
  security:[{oauth:['read']}],
  components:{securitySchemes:{oauth:{type:'oauth2',flows:{authorizationCode:{authorizationUrl:'https://auth.example.test/authorize',tokenUrl:'https://auth.example.test/token',scopes:{read:'Read'}}}},apiKey:{type:'apiKey',in:'header',name:'X-API-Key'}}},
  paths:{
    '/events':{get:{operationId:'listEvents',summary:'List events',tags:['events'],responses:{'200':{content:{'text/event-stream':{schema:{type:'string'}}}}}}},
    '/items':{post:{operationId:'createItem',security:[{apiKey:[]}],responses:{'201':{content:{'application/json':{schema:{type:'object'}}}}}}}
  }
};

test('discovers declared same-origin OpenAPI and extracts bounded operations, auth and streaming metadata',async()=>{
  const calls=[];
  const fetch=async(url,options)=>{calls.push({url:String(url),options});return response({body:JSON.stringify(OPENAPI)});};
  const result=await discoverBrowserApis({declaredApiDescriptions:['https://app.test/openapi.json'],includeWellKnownCatalog:false,maxDescriptions:3},{origin:'https://app.test',fetch});
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.credentials,'same-origin');
  assert.equal(calls[0].options.mode,'cors');
  assert.equal(result.descriptions.length,1);
  assert.equal(result.descriptions[0].openapi,'3.2.0');
  assert.equal(result.descriptions[0].title,'Example API');
  assert.deepEqual(result.descriptions[0].servers,['https://api.example.test/v1']);
  assert.equal(result.operations.length,2);
  assert.deepEqual(result.operations.find(x=>x.operationId==='listEvents').streamingMedia,['text/event-stream']);
  assert.deepEqual(result.operations.find(x=>x.operationId==='createItem').security,['apiKey']);
  assert.deepEqual(result.securitySchemes.map(x=>[x.name,x.type]),[['apiKey','apiKey'],['oauth','oauth2']]);
  assert.deepEqual(result.environmentPatch,{api:'documented'});
});

test('inventories OpenAPI 3.2 additionalOperations instead of silently dropping custom HTTP methods',async()=>{
  const document=structuredClone(OPENAPI);
  document.paths['/items'].additionalOperations={COPY:{operationId:'copyItem',summary:'Copy item',security:[{apiKey:[]}],responses:{'200':{content:{'application/json':{}}}}}};
  const fetch=async()=>response({body:JSON.stringify(document)});
  const result=await discoverBrowserApis({declaredApiDescriptions:['https://app.test/openapi.json'],includeWellKnownCatalog:false},{origin:'https://app.test',fetch});
  const operation=result.operations.find(x=>x.operationId==='copyItem');
  assert.ok(operation,'missing OAS 3.2 additional operation');
  assert.equal(operation.method,'COPY');
  assert.equal(operation.path,'/items');
  assert.deepEqual(operation.security,['apiKey']);
});

test('uses omitted credentials for cross-origin descriptions and reports browser fetch failures without bypassing them',async()=>{
  const calls=[];
  const fetch=async(url,options)=>{calls.push({url:String(url),options});throw new TypeError('Failed to fetch');};
  const result=await discoverBrowserApis({declaredApiDescriptions:['https://docs.vendor.test/openapi.json'],includeWellKnownCatalog:false},{origin:'https://app.test',fetch});
  assert.equal(calls[0].options.credentials,'omit');
  assert.equal(calls[0].options.mode,'cors');
  assert.equal(result.descriptions.length,0);
  assert.equal(result.resources[0].status,'fetch_blocked_or_failed');
  assert.equal(result.environmentPatch.api,undefined);
  assert.ok(result.evidence.some(x=>x.code==='API_DESCRIPTION_FETCH_FAILED'));
});

test('discovers RFC 9727 description, endpoint and nested-catalog evidence without crawling endpoint or nested-catalog targets',async()=>{
  const calls=[];
  const catalog={linkset:[
    {anchor:'https://publisher.test/api/foo','service-desc':[{href:'/openapi.json'},{href:'https://docs.vendor.test/api.json'}],item:[{href:'https://api.publisher.test/foo'}]},
    {anchor:'https://publisher.test/.well-known/api-catalog','api-catalog':[{href:'https://publisher.test/iot/api-catalog'}]}
  ]};
  const fetch=async(url,options)=>{
    calls.push({url:String(url),options});
    if(String(url).endsWith('/.well-known/api-catalog'))return response({url:'https://publisher.test/catalog.json',contentType:'application/linkset+json',body:JSON.stringify(catalog)});
    return response({url:String(url),body:JSON.stringify(OPENAPI)});
  };
  const result=await discoverBrowserApis({declaredApiDescriptions:[],includeWellKnownCatalog:true,maxDescriptions:4},{origin:'https://app.test',fetch});
  assert.equal(calls[0].url,'https://app.test/.well-known/api-catalog');
  assert.equal(calls[0].options.credentials,'same-origin');
  assert.equal(calls[0].options.mode,'cors');
  assert.equal(result.catalog.status,'ok');
  assert.equal(result.catalog.finalUrl,'https://publisher.test/catalog.json');
  assert.ok(result.sources.includes('https://publisher.test/openapi.json'));
  assert.ok(result.sources.includes('https://docs.vendor.test/api.json'));
  assert.deepEqual(result.catalog.apiEndpoints,['https://api.publisher.test/foo']);
  assert.deepEqual(result.catalog.nestedCatalogs,['https://publisher.test/iot/api-catalog']);
  assert.ok(!calls.some(x=>x.url==='https://api.publisher.test/foo'));
  assert.ok(!calls.some(x=>x.url==='https://publisher.test/iot/api-catalog'));
});

test('reports YAML descriptions as unsupported instead of guessing a partial parse',async()=>{
  const fetch=async()=>response({contentType:'application/yaml',body:'openapi: 3.2.0\ninfo:\n  title: Example'});
  const result=await discoverBrowserApis({declaredApiDescriptions:['https://app.test/openapi.yaml'],includeWellKnownCatalog:false},{origin:'https://app.test',fetch});
  assert.equal(result.descriptions.length,0);
  assert.equal(result.resources[0].status,'unsupported_format');
  assert.equal(result.resources[0].format,'yaml');
});

test('forwards AbortSignal to every fetch and propagates cancellation',async()=>{
  const controller=new AbortController();
  const fetch=async(url,options)=>{assert.equal(options.signal,controller.signal);controller.abort(new Error('cancelled'));throw controller.signal.reason;};
  await assert.rejects(()=>discoverBrowserApis({declaredApiDescriptions:['https://app.test/openapi.json'],includeWellKnownCatalog:false,signal:controller.signal},{origin:'https://app.test',fetch}),/cancelled/);
});

test('does not accept arbitrary discovery URLs outside declared descriptions and current-origin catalog',async()=>{
  const calls=[];
  const fetch=async(url,options)=>{calls.push({url:String(url),options});return response({url:String(url),body:JSON.stringify(OPENAPI)});};
  const result=await discoverBrowserApis({declaredApiDescriptions:['javascript:alert(1)','data:application/json,{}','https://app.test/openapi.json'],includeWellKnownCatalog:false},{origin:'https://app.test',fetch});
  assert.deepEqual(calls.map(x=>x.url),['https://app.test/openapi.json']);
  assert.deepEqual(result.sources,['https://app.test/openapi.json']);
});

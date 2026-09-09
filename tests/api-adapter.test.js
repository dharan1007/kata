import test from 'node:test';
import assert from 'node:assert/strict';
import {compileOpenApiCandidates,previewOpenApiRequest} from '../src/api-adapter.js';
import {discoverBrowserApis} from '../src/api-discovery.js';

function response(body,url='https://app.test/openapi.json'){
  return{ok:true,status:200,url,headers:{get(name){return name.toLowerCase()==='content-type'?'application/json':null;}},async text(){return JSON.stringify(body);}};
}

const DOCUMENT={
  openapi:'3.1.0',
  info:{title:'Orders API',version:'1.0.0'},
  servers:[{url:'https://app.test/api'}],
  components:{securitySchemes:{apiKey:{type:'apiKey',in:'header',name:'X-API-Key'}}},
  paths:{
    '/orders/{orderId}':{
      get:{
        operationId:'getOrder',summary:'Get one order',security:[{apiKey:[]}],
        parameters:[
          {name:'orderId',in:'path',required:true,schema:{type:'string',minLength:1}},
          {name:'expand',in:'query',required:false,schema:{type:'string',enum:['items','customer']}},
          {name:'X-Trace-Mode',in:'header',required:false,schema:{type:'string'}}
        ],
        responses:{'200':{content:{'application/json':{schema:{type:'object'}}}}}
      }
    },
    '/orders':{
      post:{
        operationId:'createOrder',summary:'Create an order',
        requestBody:{required:true,content:{'application/json':{schema:{type:'object',properties:{sku:{type:'string'},quantity:{type:'integer',minimum:1}},required:['sku','quantity'],additionalProperties:false}}}},
        responses:{'201':{content:{'application/json':{schema:{type:'object'}}}}}
      }
    },
    '/events':{
      get:{operationId:'streamEvents',responses:{'200':{content:{'text/event-stream':{schema:{type:'string'}}}}}}
    }
  }
};

test('discovery retains bounded request-shape evidence needed to compile real tool contracts',async()=>{
  const result=await discoverBrowserApis({declaredApiDescriptions:['https://app.test/openapi.json'],includeWellKnownCatalog:false},{origin:'https://app.test',fetch:async()=>response(DOCUMENT)});
  const getOrder=result.operations.find(x=>x.operationId==='getOrder');
  assert.deepEqual(getOrder.parameters.map(x=>[x.name,x.in,x.required]),[
    ['orderId','path',true],['expand','query',false],['X-Trace-Mode','header',false]
  ]);
  const create=result.operations.find(x=>x.operationId==='createOrder');
  assert.equal(create.requestBody.required,true);
  assert.equal(create.requestBody.contentType,'application/json');
  assert.deepEqual(create.requestBody.schema.required,['sku','quantity']);
});

test('compiles discovered OpenAPI operations into model-ready candidate tools without credential fields',async()=>{
  const discovery=await discoverBrowserApis({declaredApiDescriptions:['https://app.test/openapi.json'],includeWellKnownCatalog:false},{origin:'https://app.test',fetch:async()=>response(DOCUMENT)});
  const result=compileOpenApiCandidates(discovery);
  const tool=result.tools.find(x=>x.name==='getOrder');
  assert.equal(tool.kind,'openapi-candidate');
  assert.equal(tool.execution.mode,'preview-only');
  assert.equal(tool.execution.requiresAuthorization,true);
  assert.equal(tool.execution.method,'GET');
  assert.equal(tool.execution.urlTemplate,'https://app.test/api/orders/{orderId}');
  assert.deepEqual(tool.inputSchema.required,['path']);
  assert.equal(tool.inputSchema.properties.path.properties.orderId.type,'string');
  assert.equal(tool.inputSchema.properties.query.properties.expand.enum[0],'items');
  assert.equal(tool.inputSchema.properties.headers.properties['X-Trace-Mode'].type,'string');
  assert.equal(tool.inputSchema.properties.headers.properties['X-API-Key'],undefined);
  assert.deepEqual(tool.execution.security,['apiKey']);
});

test('compiles JSON request bodies and marks streaming operations without executing them',async()=>{
  const discovery=await discoverBrowserApis({declaredApiDescriptions:['https://app.test/openapi.json'],includeWellKnownCatalog:false},{origin:'https://app.test',fetch:async()=>response(DOCUMENT)});
  const result=compileOpenApiCandidates(discovery);
  const create=result.tools.find(x=>x.name==='createOrder');
  assert.deepEqual(create.inputSchema.required,['body']);
  assert.deepEqual(create.inputSchema.properties.body.required,['sku','quantity']);
  const stream=result.tools.find(x=>x.name==='streamEvents');
  assert.deepEqual(stream.execution.streamingMedia,['text/event-stream']);
  assert.equal(result.executesOperations,false);
});

test('request preview validates required path/body inputs and never accepts auth material as a tool argument',async()=>{
  const discovery=await discoverBrowserApis({declaredApiDescriptions:['https://app.test/openapi.json'],includeWellKnownCatalog:false},{origin:'https://app.test',fetch:async()=>response(DOCUMENT)});
  const {tools}=compileOpenApiCandidates(discovery);
  const getOrder=tools.find(x=>x.name==='getOrder');
  assert.throws(()=>previewOpenApiRequest(getOrder,{query:{expand:'items'}}),/orderId/);
  const preview=previewOpenApiRequest(getOrder,{path:{orderId:'abc 123'},query:{expand:'items'},headers:{'X-Trace-Mode':'debug'}});
  assert.equal(preview.method,'GET');
  assert.equal(preview.url,'https://app.test/api/orders/abc%20123?expand=items');
  assert.deepEqual(preview.headers,{'X-Trace-Mode':'debug'});
  assert.equal(preview.body,null);
  assert.equal(preview.requiresAuthorization,true);
  assert.equal(preview.readyToExecute,false);
});

test('rejects unsafe server templates and duplicate/invalid agent names instead of inventing executable endpoints',()=>{
  const discovery={descriptions:[{url:'https://app.test/openapi.json',servers:['javascript:alert(1)']}],operations:[
    {method:'GET',path:'/x',operationId:'bad name with spaces',summary:null,security:[],streamingMedia:[],descriptionUrl:'https://app.test/openapi.json',parameters:[],requestBody:null},
    {method:'GET',path:'/y',operationId:'bad name with spaces',summary:null,security:[],streamingMedia:[],descriptionUrl:'https://app.test/openapi.json',parameters:[],requestBody:null}
  ],securitySchemes:[]};
  const result=compileOpenApiCandidates(discovery);
  assert.equal(result.tools.length,0);
  assert.ok(result.rejected.some(x=>x.reason==='unsafe_or_unresolved_server'));
});

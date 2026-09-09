import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverBrowserApis} from '../src/api-discovery.js';
import {compileOpenApiCandidates} from '../src/api-adapter.js';
import {buildAuthorizedExecutionPreview} from '../src/api-execution.js';

function response(document,url='https://app.test/openapi.json'){
  return{ok:true,status:200,url,headers:{get(name){return name.toLowerCase()==='content-type'?'application/json':null;}},async text(){return JSON.stringify(document);}};
}

async function compile(document){
  const discovery=await discoverBrowserApis({declaredApiDescriptions:['https://app.test/openapi.json'],includeWellKnownCatalog:false},{origin:'https://app.test',fetch:async()=>response(document)});
  const compilation=compileOpenApiCandidates(discovery,{maxTools:20});
  assert.equal(compilation.rejected.length,0);
  assert.equal(compilation.tools.length,1);
  return compilation.tools[0];
}

function doc({security,schemes}){
  return{
    openapi:'3.1.0',info:{title:'Auth API',version:'1'},servers:[{url:'/api'}],
    components:{securitySchemes:schemes??{}},
    paths:{'/account':{post:{operationId:'updateAccount',security,responses:{'200':{description:'ok'}}}}}
  };
}

test('anonymous OpenAPI security alternative executes without ambient browser credentials',async()=>{
  const candidate=await compile(doc({
    security:[{}, {OAuth:['account:write']}],
    schemes:{OAuth:{type:'oauth2',flows:{authorizationCode:{authorizationUrl:'https://id.test/auth',tokenUrl:'https://id.test/token',scopes:{'account:write':'write'}}}}}
  }));
  const preview=buildAuthorizedExecutionPreview(candidate,{},'https://app.test');
  assert.equal(preview.readyToExecute,true);
  assert.equal(preview.requiresAuthorization,false);
  assert.equal(preview.credentialMode,'omit');
  assert.equal(preview.authorizationStrategy,'anonymous');
});

test('bearer or OAuth OpenAPI security never borrows ambient cookies as a substitute credential',async()=>{
  for(const [name,scheme] of [
    ['BearerAuth',{type:'http',scheme:'bearer'}],
    ['OAuth',{type:'oauth2',flows:{authorizationCode:{authorizationUrl:'https://id.test/auth',tokenUrl:'https://id.test/token',scopes:{write:'write'}}}}]
  ]){
    const candidate=await compile(doc({security:[{[name]:[]}],schemes:{[name]:scheme}}));
    const preview=buildAuthorizedExecutionPreview(candidate,{},'https://app.test');
    assert.equal(preview.readyToExecute,false,name);
    assert.equal(preview.requiresAuthorization,true,name);
    assert.equal(preview.credentialMode,'omit',name);
    assert.equal(preview.blockedReason,'authorization_setup_required',name);
    assert.equal(preview.authorizationStrategy,'unsupported-browser-managed',name);
  }
});

test('declared same-origin cookie security is the only OpenAPI auth path eligible for browser-managed credentials',async()=>{
  const candidate=await compile(doc({security:[{SessionCookie:[]}],schemes:{SessionCookie:{type:'apiKey',in:'cookie',name:'session'}}}));
  const preview=buildAuthorizedExecutionPreview(candidate,{},'https://app.test');
  assert.equal(preview.readyToExecute,true);
  assert.equal(preview.requiresAuthorization,true);
  assert.equal(preview.credentialMode,'same-origin');
  assert.equal(preview.authorizationStrategy,'browser-cookie');
  assert.deepEqual(preview.selectedSecurityRequirement,[{name:'SessionCookie',scopes:[]}]);
});

test('AND security requirements execute only when the complete requirement is browser-manageable',async()=>{
  const candidate=await compile(doc({
    security:[{SessionCookie:[],BearerAuth:[]}],
    schemes:{SessionCookie:{type:'apiKey',in:'cookie',name:'session'},BearerAuth:{type:'http',scheme:'bearer'}}
  }));
  const preview=buildAuthorizedExecutionPreview(candidate,{},'https://app.test');
  assert.equal(preview.readyToExecute,false);
  assert.equal(preview.credentialMode,'omit');
  assert.equal(preview.blockedReason,'authorization_setup_required');
  assert.equal(preview.authorizationStrategy,'unsupported-browser-managed');
});

test('security requirements remain bound to their declaring OpenAPI document when scheme names collide',async()=>{
  const docs={
    'https://app.test/a.json':{
      openapi:'3.1.0',info:{title:'A',version:'1'},servers:[{url:'/a'}],components:{securitySchemes:{Auth:{type:'apiKey',in:'cookie',name:'session'}}},
      paths:{'/x':{post:{operationId:'cookieOperation',security:[{Auth:[]}],responses:{'200':{description:'ok'}}}}}
    },
    'https://app.test/b.json':{
      openapi:'3.1.0',info:{title:'B',version:'1'},servers:[{url:'/b'}],components:{securitySchemes:{Auth:{type:'http',scheme:'bearer'}}},
      paths:{'/y':{post:{operationId:'bearerOperation',security:[{Auth:[]}],responses:{'200':{description:'ok'}}}}}
    }
  };
  const discovery=await discoverBrowserApis({declaredApiDescriptions:Object.keys(docs),includeWellKnownCatalog:false,maxDescriptions:2},{origin:'https://app.test',fetch:async url=>response(docs[String(url)],String(url))});
  const compilation=compileOpenApiCandidates(discovery,{maxTools:20});
  const cookie=compilation.tools.find(x=>x.name==='cookieOperation');
  const bearer=compilation.tools.find(x=>x.name==='bearerOperation');
  assert.ok(cookie&&bearer);
  assert.equal(buildAuthorizedExecutionPreview(cookie,{},'https://app.test').authorizationStrategy,'browser-cookie');
  const bearerPreview=buildAuthorizedExecutionPreview(bearer,{},'https://app.test');
  assert.equal(bearerPreview.authorizationStrategy,'unsupported-browser-managed');
  assert.equal(bearerPreview.readyToExecute,false);
});

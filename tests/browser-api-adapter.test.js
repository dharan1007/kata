import test from 'node:test';
import assert from 'node:assert/strict';
import {compileAuthorizedTabApiTools} from '../extension/service-worker.js';

const DOCUMENT={
  openapi:'3.1.0',info:{title:'Tab API',version:'1'},servers:[{url:'/api'}],
  paths:{'/items/{id}':{get:{operationId:'getItem',parameters:[{name:'id',in:'path',required:true,schema:{type:'string'}}],responses:{'200':{description:'ok'}}}}}
};

function chromeApi(){return{scripting:{async executeScript(options){
  assert.equal(options.world,'MAIN');assert.deepEqual(options.target,{tabId:9});
  return[{result:{environment:{api:'documented'},runtime:{origin:'https://app.test',declaredApiDescriptions:['https://app.test/openapi.json']},evidence:[{code:'API_DESCRIPTION_DECLARED'}]}}];
}}};}

function response(body){return{ok:true,status:200,url:'https://app.test/openapi.json',headers:{get(name){return name.toLowerCase()==='content-type'?'application/json':null;}},async text(){return JSON.stringify(body);}};}

test('active-tab bridge compiles declared API into local preview-only agent tools without executing operations or contacting KATA',async()=>{
  const calls=[];
  const result=await compileAuthorizedTabApiTools({id:9,url:'https://app.test/account?private=yes'},{includeWellKnownCatalog:false},{chromeApi:chromeApi(),fetchImpl:async(url,options)=>{calls.push({url:String(url),options});return response(DOCUMENT);}});
  assert.equal(result.ok,true);
  assert.equal(result.compilation.executesOperations,false);
  assert.equal(result.compilation.tools[0].name,'getItem');
  assert.equal(result.compilation.tools[0].execution.mode,'preview-only');
  assert.equal(result.compilation.tools[0].execution.urlTemplate,'https://app.test/api/items/{id}');
  assert.deepEqual(calls.map(x=>x.url),['https://app.test/openapi.json']);
  assert.equal(calls[0].options.credentials,'same-origin');
  assert.ok(!calls.some(x=>x.options?.method==='POST'));
});

test('active-tab API compilation rejects non-http pages before injection or network access',async()=>{
  let injected=false,fetched=false;
  await assert.rejects(()=>compileAuthorizedTabApiTools({id:9,url:'chrome://settings'}, {},{chromeApi:{scripting:{async executeScript(){injected=true;}}},fetchImpl:async()=>{fetched=true;}}),/HTTP\(S\)/);
  assert.equal(injected,false);assert.equal(fetched,false);
});

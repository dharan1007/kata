import test from 'node:test';
import assert from 'node:assert/strict';
import * as worker from '../extension/service-worker.js';

const DOCUMENT={openapi:'3.1.0',info:{title:'Mutation API',version:'1'},servers:[{url:'/api'}],paths:{'/items/{id}':{post:{operationId:'updateItem',parameters:[{name:'id',in:'path',required:true,schema:{type:'string'}}],requestBody:{required:true,content:{'application/json':{schema:{type:'object',properties:{name:{type:'string'}},required:['name'],additionalProperties:false}}}},responses:{'200':{description:'ok'}}}}}};
const TAB={id:11,url:'https://app.test/page'};
function apiDescription(){return{ok:true,status:200,url:'https://app.test/openapi.json',headers:{get(name){return name.toLowerCase()==='content-type'?'application/json':null;}},async text(){return JSON.stringify(DOCUMENT);}};}
function chromeApi(){const calls=[];return{calls,api:{scripting:{async executeScript(options){calls.push(options);if(options.func?.name==='inspectBrowserRuntime')return[{result:{environment:{api:'documented'},runtime:{origin:'https://app.test',declaredApiDescriptions:['https://app.test/openapi.json']},evidence:[]}}];return[{result:{ok:false,status:null,statusText:null,url:'https://app.test/api/items/1',contentType:null,bytes:0,bodyText:null,truncated:false,outcome:'unknown',networkError:'timeout',durationMs:15000}}];}}}};}

test('a timed-out state-changing request remains an attempted unknown outcome with a preview-bound receipt',async()=>{
  const chrome=chromeApi();
  const deps={chromeApi:chrome.api,fetchImpl:async()=>apiDescription()};
  const args={path:{id:'1'},body:{name:'renamed'}};
  const preview=await worker.previewAuthorizedTabApiExecution(TAB,'updateItem',args,{includeWellKnownCatalog:false},deps);
  const result=await worker.executeAuthorizedTabApiExecution(TAB,'updateItem',args,preview.previewFingerprint,{approved:true,includeWellKnownCatalog:false},deps);
  assert.equal(result.ok,false);
  assert.equal(result.attempted,true);
  assert.equal(result.receipt.outcome,'unknown');
  assert.equal(result.receipt.previewFingerprint,preview.previewFingerprint);
  assert.equal(result.receipt.stateChanging,true);
  assert.match(result.error,/unknown/i);
  assert.match(result.error,/do not retry automatically/i);
});

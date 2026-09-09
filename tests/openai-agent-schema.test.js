import test from 'node:test';
import assert from 'node:assert/strict';
import agents from '../api/agents.js';
import {toolDefinitions,toOpenAITools,toOpenAIResponsesTools} from '../lib/server/tools.js';

function res(){return{statusCode:200,headers:{},body:null,status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};}

test('OpenAI Responses projection uses the current top-level function tool envelope',()=>{
  const projected=toOpenAIResponsesTools();
  assert.equal(projected.length,toolDefinitions.length);
  for(let i=0;i<projected.length;i++){
    assert.deepEqual(projected[i],{
      type:'function',
      name:toolDefinitions[i].name,
      description:toolDefinitions[i].description,
      parameters:toolDefinitions[i].inputSchema
    });
    assert.equal('function' in projected[i],false);
  }
});

test('legacy OpenAI Chat Completions projection remains backward compatible',()=>{
  const projected=toOpenAITools();
  assert.equal(projected.length,toolDefinitions.length);
  assert.deepEqual(projected[0],{
    type:'function',
    function:{
      name:toolDefinitions[0].name,
      description:toolDefinitions[0].description,
      parameters:toolDefinitions[0].inputSchema
    }
  });
});

test('/api/agents publishes both modern Responses and legacy OpenAI schemas',async()=>{
  const r=res();
  await agents({method:'GET',headers:{}},r);
  assert.equal(r.statusCode,200);
  assert.deepEqual(r.body.openaiResponses,toOpenAIResponsesTools());
  assert.deepEqual(r.body.openai,toOpenAITools());
  assert.equal(r.body.openaiResponses[0].name,toolDefinitions[0].name);
  assert.equal(r.body.openai[0].function.name,toolDefinitions[0].name);
});

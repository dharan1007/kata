import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAuthorizedExecutionPreview} from '../src/api-execution.js';

function candidate(bodySchema){
  return{
    kind:'openapi-candidate',
    name:'setPolicy',
    inputSchema:{
      type:'object',
      properties:{body:bodySchema},
      required:['body'],
      additionalProperties:false
    },
    execution:{
      mode:'preview-only',
      method:'POST',
      urlTemplate:'https://app.test/api/policy',
      pathSerialization:{},querySerialization:{},security:[],securityRequirements:[],securitySchemes:[],requiresAuthorization:false,streamingMedia:[]
    }
  };
}

test('rejects unknown JSON Schema type names before API execution',()=>{
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate({type:'numbre'}),{body:'not-a-number'},'https://app.test'),
    /Invalid type schema/
  );
});

test('rejects malformed enum schemas before API execution',()=>{
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate({type:'string',enum:'admin'}),{body:'admin'},'https://app.test'),
    /Invalid enum schema/
  );
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate({type:'string',enum:[]}),{body:'admin'},'https://app.test'),
    /Invalid enum schema/
  );
});

test('rejects malformed required and scalar bound schemas before API execution',()=>{
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate({type:'object',required:'role',properties:{role:{type:'string'}}}),{body:{role:'admin'}},'https://app.test'),
    /Invalid required schema/
  );
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate({type:'string',minLength:-1}),{body:'x'},'https://app.test'),
    /Invalid minLength schema/
  );
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate({type:'array',maxItems:1.5,items:{type:'string'}}),{body:['x']},'https://app.test'),
    /Invalid maxItems schema/
  );
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate({type:'number',minimum:'0'}),{body:1},'https://app.test'),
    /Invalid minimum schema/
  );
});

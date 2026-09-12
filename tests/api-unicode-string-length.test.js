import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAuthorizedExecutionPreview} from '../src/api-execution.js';

function candidate(codeSchema){
  return{
    kind:'openapi-candidate',
    name:'setLabel',
    inputSchema:{
      type:'object',
      properties:{body:{type:'object',properties:{code:{type:'string',...codeSchema}},required:['code'],additionalProperties:false}},
      required:['body'],
      additionalProperties:false
    },
    execution:{
      mode:'preview-only',
      method:'POST',
      urlTemplate:'https://app.test/api/label',
      pathSerialization:{},querySerialization:{},security:[],securityRequirements:[],securitySchemes:[],requiresAuthorization:false,streamingMedia:[]
    }
  };
}

test('uses JSON Schema character counts instead of UTF-16 code units for minLength and maxLength',()=>{
  const astral='😀';
  const valid=buildAuthorizedExecutionPreview(candidate({maxLength:1}),{body:{code:astral}},'https://app.test');
  assert.equal(valid.readyToExecute,true);
  assert.equal(valid.body,JSON.stringify({code:astral}));

  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate({minLength:2}),{body:{code:astral}},'https://app.test'),
    /minLength 2/
  );
});

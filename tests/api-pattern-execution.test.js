import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAuthorizedExecutionPreview} from '../src/api-execution.js';

function candidate(pattern){
  return{
    kind:'openapi-candidate',
    name:'setCode',
    inputSchema:{
      type:'object',
      properties:{body:{type:'object',properties:{code:{type:'string',pattern}},required:['code'],additionalProperties:false}},
      required:['body'],
      additionalProperties:false
    },
    execution:{
      mode:'preview-only',
      method:'POST',
      urlTemplate:'https://app.test/api/code',
      pathSerialization:{},querySerialization:{},security:[],securityRequirements:[],securitySchemes:[],requiresAuthorization:false,streamingMedia:[]
    }
  };
}

test('executes valid OpenAPI pattern constraints and rejects non-matching input',()=>{
  const valid=buildAuthorizedExecutionPreview(candidate('^[A-Z]{2,5}$'),{body:{code:'ABC'}},'https://app.test');
  assert.equal(valid.readyToExecute,true);
  assert.equal(valid.body,JSON.stringify({code:'ABC'}));

  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate('^[A-Z]{2,5}$'),{body:{code:'abc'}},'https://app.test'),
    /invalid format/
  );
});

test('rejects malformed or non-string pattern schemas before API execution',()=>{
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate('['),{body:{code:'ABC'}},'https://app.test'),
    /Invalid pattern schema/
  );
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate(42),{body:{code:'ABC'}},'https://app.test'),
    /Invalid pattern schema/
  );
});

test('rejects oversized pattern schemas before API execution',()=>{
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate(`^${'a'.repeat(1025)}$`),{body:{code:'aaa'}},'https://app.test'),
    /Invalid pattern schema/
  );
});

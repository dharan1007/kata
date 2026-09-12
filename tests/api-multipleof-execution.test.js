import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAuthorizedExecutionPreview} from '../src/api-execution.js';

function candidate(multipleOf){
  return{
    kind:'openapi-candidate',
    name:'setQuota',
    inputSchema:{
      type:'object',
      properties:{body:{type:'object',properties:{quota:{type:'number',multipleOf}},required:['quota'],additionalProperties:false}},
      required:['body'],
      additionalProperties:false
    },
    execution:{
      mode:'preview-only',
      method:'POST',
      urlTemplate:'https://app.test/api/quota',
      pathSerialization:{},querySerialization:{},security:[],securityRequirements:[],securitySchemes:[],requiresAuthorization:false,streamingMedia:[]
    }
  };
}

test('executes OpenAPI numeric multipleOf constraints without weakening validation',()=>{
  const valid=buildAuthorizedExecutionPreview(candidate(0.25),{body:{quota:1.5}},'https://app.test');
  assert.equal(valid.readyToExecute,true);
  assert.equal(valid.body,JSON.stringify({quota:1.5}));

  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate(0.25),{body:{quota:1.3}},'https://app.test'),
    /multipleOf 0\.25/
  );
});

test('rejects malformed multipleOf schemas before API execution',()=>{
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate(0),{body:{quota:1}},'https://app.test'),
    /Invalid multipleOf schema/
  );
});

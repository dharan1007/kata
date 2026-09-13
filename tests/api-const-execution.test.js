import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAuthorizedExecutionPreview} from '../src/api-execution.js';

function candidate(constValue){
  return{
    kind:'openapi-candidate',
    name:'applyPolicy',
    inputSchema:{
      type:'object',
      properties:{
        body:{
          type:'object',
          properties:{policy:{const:constValue}},
          required:['policy'],
          additionalProperties:false
        }
      },
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

test('executes JSON Schema const constraints using structural JSON equality',()=>{
  const required={region:'us',tiers:['pro',{preview:true}]};
  const preview=buildAuthorizedExecutionPreview(
    candidate(required),
    {body:{policy:{tiers:['pro',{preview:true}],region:'us'}}},
    'https://app.test'
  );

  assert.equal(preview.readyToExecute,true);
  assert.equal(preview.body,JSON.stringify({policy:{tiers:['pro',{preview:true}],region:'us'}}));

  assert.throws(
    ()=>buildAuthorizedExecutionPreview(
      candidate(required),
      {body:{policy:{region:'us',tiers:['pro',{preview:false}]}}},
      'https://app.test'
    ),
    /const/
  );
});

test('supports null and primitive JSON Schema const values without coercion',()=>{
  assert.equal(buildAuthorizedExecutionPreview(candidate(null),{body:{policy:null}},'https://app.test').readyToExecute,true);
  assert.throws(()=>buildAuthorizedExecutionPreview(candidate(null),{body:{policy:'null'}},'https://app.test'),/const/);
});

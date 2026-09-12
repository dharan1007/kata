import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAuthorizedExecutionPreview} from '../src/api-execution.js';

function candidate(enumValues){
  return{
    kind:'openapi-candidate',
    name:'setPolicy',
    inputSchema:{
      type:'object',
      properties:{
        body:{
          type:'object',
          properties:{policy:{enum:enumValues}},
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

test('uses JSON Schema structural equality for object and array enum values',()=>{
  const allowed={region:'us',tiers:['pro','beta']};
  const preview=buildAuthorizedExecutionPreview(
    candidate([allowed,['fallback',{enabled:true}]]),
    {body:{policy:{tiers:['pro','beta'],region:'us'}}},
    'https://app.test'
  );

  assert.equal(preview.readyToExecute,true);
  assert.equal(preview.body,JSON.stringify({policy:{tiers:['pro','beta'],region:'us'}}));

  assert.throws(
    ()=>buildAuthorizedExecutionPreview(
      candidate([allowed]),
      {body:{policy:{region:'us',tiers:['pro','stable']}}},
      'https://app.test'
    ),
    /must be one of/
  );
});

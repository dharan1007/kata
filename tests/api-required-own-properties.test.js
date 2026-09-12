import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAuthorizedExecutionPreview} from '../src/api-execution.js';

function candidate(){
  return{
    kind:'openapi-candidate',
    name:'setSecret',
    inputSchema:{
      type:'object',
      properties:{
        body:{
          type:'object',
          properties:{secret:{type:'string'}},
          required:['secret'],
          additionalProperties:false
        }
      },
      required:['body'],
      additionalProperties:false
    },
    execution:{
      mode:'preview-only',
      method:'POST',
      urlTemplate:'https://app.test/api/secret',
      pathSerialization:{},querySerialization:{},security:[],securityRequirements:[],securitySchemes:[],requiresAuthorization:false,streamingMedia:[]
    }
  };
}

test('does not let inherited JavaScript properties satisfy JSON Schema required',()=>{
  const inherited=Object.create({secret:'prototype-value'});

  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate(),{body:inherited},'https://app.test'),
    /\.body\.secret: required/
  );

  const valid=buildAuthorizedExecutionPreview(candidate(),{body:{secret:'own-value'}},'https://app.test');
  assert.equal(valid.readyToExecute,true);
  assert.equal(valid.body,JSON.stringify({secret:'own-value'}));
});

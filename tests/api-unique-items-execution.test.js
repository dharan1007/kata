import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAuthorizedExecutionPreview} from '../src/api-execution.js';

function candidate(bodySchema){
  return{
    kind:'openapi-candidate',
    name:'submitIds',
    inputSchema:{
      type:'object',
      properties:{body:bodySchema},
      required:['body'],
      additionalProperties:false
    },
    execution:{
      mode:'preview-only',
      method:'POST',
      urlTemplate:'https://app.test/api/ids',
      pathSerialization:{},querySerialization:{},security:[],securityRequirements:[],securitySchemes:[],requiresAuthorization:false,streamingMedia:[]
    }
  };
}

test('executes JSON Schema uniqueItems using structural JSON equality',()=>{
  const schema={type:'array',uniqueItems:true,items:{type:'object'}};
  const unique=[{id:1},{id:2}];
  const preview=buildAuthorizedExecutionPreview(candidate(schema),{body:unique},'https://app.test');
  assert.equal(preview.readyToExecute,true);
  assert.equal(preview.body,JSON.stringify(unique));

  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate(schema),{body:[{id:1},{id:1}]},'https://app.test'),
    /uniqueItems|unique|Invalid API execution arguments/
  );
});

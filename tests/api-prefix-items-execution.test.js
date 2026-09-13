import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAuthorizedExecutionPreview} from '../src/api-execution.js';

function candidate(bodySchema){
  return{
    kind:'openapi-candidate',
    name:'submitTuple',
    inputSchema:{
      type:'object',
      properties:{body:bodySchema},
      required:['body'],
      additionalProperties:false
    },
    execution:{
      mode:'preview-only',
      method:'POST',
      urlTemplate:'https://app.test/api/tuple',
      pathSerialization:{},querySerialization:{},security:[],securityRequirements:[],securitySchemes:[],requiresAuthorization:false,streamingMedia:[]
    }
  };
}

test('executes JSON Schema 2020-12 prefixItems tuples and applies items only after the prefix',()=>{
  const schema={
    type:'array',
    prefixItems:[
      {type:'string',minLength:1},
      {type:'integer',minimum:0}
    ],
    items:{type:'boolean'}
  };

  const body=['job',2,true,false];
  const preview=buildAuthorizedExecutionPreview(candidate(schema),{body},'https://app.test');
  assert.equal(preview.readyToExecute,true);
  assert.equal(preview.body,JSON.stringify(body));

  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate(schema),{body:['job',-1,true]},'https://app.test'),
    /minimum 0/
  );
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate(schema),{body:['job',2,'not-boolean']},'https://app.test'),
    /must be boolean/
  );
});

test('prefixItems does not apply the tail items schema to tuple positions it already evaluated',()=>{
  const schema={
    type:'array',
    prefixItems:[{type:'string'},{type:'integer'}],
    items:{type:'boolean'}
  };

  assert.equal(
    buildAuthorizedExecutionPreview(candidate(schema),{body:['ok',1,true]},'https://app.test').readyToExecute,
    true
  );
});

test('rejects malformed or oversized executable prefixItems schemas',()=>{
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate({type:'array',prefixItems:[]}),{body:[]},'https://app.test'),
    /prefixItems/
  );
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate({type:'array',prefixItems:Array.from({length:33},()=>({type:'string'}))}),{body:[]},'https://app.test'),
    /prefixItems/
  );
});

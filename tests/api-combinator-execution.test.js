import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAuthorizedExecutionPreview} from '../src/api-execution.js';

function candidate(bodySchema){
  return{
    kind:'openapi-candidate',
    name:'submitVariant',
    inputSchema:{
      type:'object',
      properties:{body:bodySchema},
      required:['body'],
      additionalProperties:false
    },
    execution:{
      mode:'preview-only',
      method:'POST',
      urlTemplate:'https://app.test/api/variant',
      pathSerialization:{},querySerialization:{},security:[],securityRequirements:[],securitySchemes:[],requiresAuthorization:false,streamingMedia:[]
    }
  };
}

test('executes JSON Schema anyOf request bodies when at least one bounded branch matches',()=>{
  const schema={
    anyOf:[
      {type:'object',properties:{kind:{const:'text'},text:{type:'string',minLength:1}},required:['kind','text'],additionalProperties:false},
      {type:'object',properties:{kind:{const:'count'},count:{type:'integer',minimum:0}},required:['kind','count'],additionalProperties:false}
    ]
  };

  const preview=buildAuthorizedExecutionPreview(candidate(schema),{body:{kind:'count',count:2}},'https://app.test');
  assert.equal(preview.readyToExecute,true);
  assert.equal(preview.body,JSON.stringify({kind:'count',count:2}));

  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate(schema),{body:{kind:'count',count:-1}},'https://app.test'),
    /anyOf/
  );
});

test('executes JSON Schema oneOf request bodies only when exactly one bounded branch matches',()=>{
  const schema={
    oneOf:[
      {type:'object',properties:{value:{type:'number',minimum:0}},required:['value'],additionalProperties:false},
      {type:'object',properties:{value:{type:'number',maximum:10}},required:['value'],additionalProperties:false}
    ]
  };

  assert.equal(buildAuthorizedExecutionPreview(candidate(schema),{body:{value:20}},'https://app.test').readyToExecute,true);
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate(schema),{body:{value:5}},'https://app.test'),
    /oneOf/
  );
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate(schema),{body:{value:'not-a-number'}},'https://app.test'),
    /oneOf/
  );
});

test('rejects empty or oversized executable anyOf and oneOf branch sets',()=>{
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate({anyOf:[]}),{body:{}},'https://app.test'),
    /Invalid or oversized anyOf schema/
  );
  assert.throws(
    ()=>buildAuthorizedExecutionPreview(candidate({oneOf:Array.from({length:33},()=>({type:'string'}))}),{body:'x'},'https://app.test'),
    /Invalid or oversized oneOf schema/
  );
});

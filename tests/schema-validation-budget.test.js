import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSchema} from '../lib/shared/schema.js';

function nestedItemsSchema(depth){
  let schema={type:'integer'};
  for(let i=0;i<depth;i+=1)schema={type:'array',items:schema};
  return schema;
}

test('rejects executable schemas deeper than the shared recursion budget',()=>{
  const schema=nestedItemsSchema(65);
  assert.throws(
    ()=>assertSchema(schema,0),
    error=>error?.message==='INVALID_SCHEMA'&&error.details?.some(detail=>detail.includes('maximum depth 64'))
  );
});

test('rejects executable schemas that exceed the aggregate schema-node budget',()=>{
  const properties=Object.fromEntries(Array.from({length:4097},(_,index)=>[`p${index}`,{type:'string'}]));
  assert.throws(
    ()=>assertSchema({type:'object',properties},{}),
    error=>error?.message==='INVALID_SCHEMA'&&error.details?.some(detail=>detail.includes('maximum node budget 4096'))
  );
});

test('bounds aggregate validation work across individually legal combinator branches',()=>{
  const itemSchema={type:'integer'};
  const schema={
    type:'array',
    allOf:Array.from({length:32},()=>({type:'array',items:itemSchema}))
  };
  const value=Array.from({length:8000},(_,index)=>index);
  assert.throws(
    ()=>assertSchema(schema,value),
    error=>error?.message==='INVALID_ARGUMENTS'&&error.details?.some(detail=>detail.includes('validation work budget exceeded'))
  );
});

test('ordinary bounded nested schemas continue to validate normally',()=>{
  const schema={
    type:'object',
    properties:{
      rows:{type:'array',items:{type:'object',properties:{id:{type:'integer'}},required:['id'],additionalProperties:false}}
    },
    required:['rows'],
    additionalProperties:false
  };
  assert.doesNotThrow(()=>assertSchema(schema,{rows:[{id:1},{id:2}]}));
});

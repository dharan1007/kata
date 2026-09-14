import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSchema} from '../lib/shared/schema.js';

test('propertyNames validates every object property name as a string',()=>{
  const schema={type:'object',propertyNames:{pattern:'^[a-z][a-z0-9_]*$'}};
  assert.doesNotThrow(()=>assertSchema(schema,{alpha:1,beta_2:true}));
  assert.throws(
    ()=>assertSchema(schema,{alpha:1,'Bad-Key':2}),
    error=>error instanceof Error&&error.message==='INVALID_ARGUMENTS'&&error.details?.some(detail=>detail.includes('property name "Bad-Key"'))
  );
});

test('propertyNames supports boolean schemas and only applies to objects',()=>{
  assert.doesNotThrow(()=>assertSchema({propertyNames:true},{anything:1}));
  assert.throws(
    ()=>assertSchema({type:'object',propertyNames:false},{blocked:1}),
    error=>error instanceof Error&&error.message==='INVALID_ARGUMENTS'
  );
  assert.doesNotThrow(()=>assertSchema({propertyNames:false},['not-an-object']));
});

test('propertyNames schema shape is validated recursively',()=>{
  assert.throws(
    ()=>assertSchema({type:'object',propertyNames:'^[a-z]+$'},{alpha:1}),
    error=>error instanceof Error&&error.message==='INVALID_SCHEMA'&&error.details?.some(detail=>detail.includes('Invalid propertyNames schema'))
  );
  assert.throws(
    ()=>assertSchema({type:'object',propertyNames:{pattern:'['}},{alpha:1}),
    error=>error instanceof Error&&error.message==='INVALID_SCHEMA'&&error.details?.some(detail=>detail.includes('Invalid pattern schema'))
  );
});

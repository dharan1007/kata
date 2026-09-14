import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSchema} from '../lib/shared/schema.js';

function expectInvalidArguments(schema,value,detail){
  assert.throws(
    ()=>assertSchema(schema,value),
    error=>error instanceof Error&&error.message==='INVALID_ARGUMENTS'&&error.details?.some(item=>item.includes(detail))
  );
}

function expectInvalidSchema(schema,value,detail){
  assert.throws(
    ()=>assertSchema(schema,value),
    error=>error instanceof Error&&error.message==='INVALID_SCHEMA'&&error.details?.some(item=>item.includes(detail))
  );
}

test('enforces minProperties and maxProperties for object instances',()=>{
  assert.doesNotThrow(()=>assertSchema({type:'object',minProperties:1,maxProperties:2},{one:true}));
  assert.doesNotThrow(()=>assertSchema({type:'object',minProperties:1,maxProperties:2},{one:true,two:true}));
  expectInvalidArguments({type:'object',minProperties:1},{},'at least 1 properties');
  expectInvalidArguments({type:'object',maxProperties:1},{one:true,two:true},'at most 1 properties');
});

test('property count constraints only apply to object instances',()=>{
  assert.doesNotThrow(()=>assertSchema({minProperties:2},'not-an-object'));
  assert.doesNotThrow(()=>assertSchema({maxProperties:0},[]));
});

test('rejects malformed minProperties and maxProperties schemas',()=>{
  expectInvalidSchema({type:'object',minProperties:-1},{},'Invalid minProperties schema');
  expectInvalidSchema({type:'object',maxProperties:1.5},{},'Invalid maxProperties schema');
  expectInvalidSchema({type:'object',minProperties:'1'},{},'Invalid minProperties schema');
});
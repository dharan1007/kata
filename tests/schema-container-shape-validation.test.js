import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSchema} from '../lib/shared/schema.js';

function expectInvalidSchema(schema,value={}){
  assert.throws(
    ()=>assertSchema(schema,value),
    error=>error instanceof Error&&error.message==='INVALID_SCHEMA'
  );
}

test('rejects malformed properties containers instead of silently weakening the contract',()=>{
  expectInvalidSchema({type:'object',properties:['not','a','map']},{anything:'accepted-before'});
  expectInvalidSchema({type:'object',properties:'not-a-map'},{anything:'accepted-before'});
});

test('rejects malformed additionalProperties schemas instead of silently allowing unknown keys',()=>{
  expectInvalidSchema({type:'object',additionalProperties:'deny'},{unexpected:'accepted-before'});
  expectInvalidSchema({type:'object',additionalProperties:[]},{unexpected:'accepted-before'});
});

test('rejects malformed items schemas instead of silently skipping array item validation',()=>{
  expectInvalidSchema({type:'array',items:'integer'},['accepted-before']);
  expectInvalidSchema({type:'array',items:[]},['accepted-before']);
});

test('keeps valid boolean and object subschemas accepted for items and additionalProperties',()=>{
  assert.doesNotThrow(()=>assertSchema({type:'array',items:true},['anything']));
  assert.throws(()=>assertSchema({type:'array',items:false},['blocked']),/INVALID_ARGUMENTS/);
  assert.doesNotThrow(()=>assertSchema({type:'object',additionalProperties:true},{free:'value'}));
  assert.throws(()=>assertSchema({type:'object',additionalProperties:false},{blocked:'value'}),/INVALID_ARGUMENTS/);
  assert.doesNotThrow(()=>assertSchema({type:'array',items:{type:'integer'}},[1,2,3]));
});

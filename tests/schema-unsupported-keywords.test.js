import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSchema} from '../lib/shared/schema.js';

function expectUnsupported(schema,value){
  assert.throws(
    ()=>assertSchema(schema,value),
    error=>error instanceof Error&&error.message==='INVALID_SCHEMA'&&error.details?.some(detail=>detail.includes('Unsupported executable schema keyword'))
  );
}

test('fails closed when standard executable JSON Schema keywords are present but not implemented',()=>{
  expectUnsupported({type:'array',contains:{type:'integer'}},['not-an-integer']);
  expectUnsupported({type:'object',patternProperties:{'^x-':{type:'string'}}},{'x-id':123});
  expectUnsupported({type:'object',dependentSchemas:{admin:{required:['scope']}}},{admin:true});
  expectUnsupported({type:'object',unevaluatedProperties:false},{unexpected:true});
  expectUnsupported({type:'array',unevaluatedItems:false},['unexpected']);
  expectUnsupported({if:{properties:{mode:{const:'strict'}}},then:{required:['token']}},{mode:'strict'});
  expectUnsupported({not:{type:'string'}},'silently-accepted-before');
});

test('still accepts annotation and extension metadata that does not change validation semantics',()=>{
  assert.doesNotThrow(()=>assertSchema({
    type:'string',
    title:'Identifier',
    description:'Human-readable metadata',
    default:'example',
    examples:['one','two'],
    'x-kata-origin':'openapi'
  },'actual'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSchema} from '../lib/shared/schema.js';

function expectUnsupportedReference(schema,value,keyword){
  assert.throws(
    ()=>assertSchema(schema,value),
    error=>error instanceof Error&&
      error.message==='INVALID_SCHEMA'&&
      error.details?.some(detail=>detail.includes(`Unsupported executable schema keyword "${keyword}"`))
  );
}

test('fails closed when unresolved JSON Schema reference applicators reach the executable validator',()=>{
  expectUnsupportedReference({$ref:'#/$defs/Code',$defs:{Code:{type:'string',minLength:3}}},'x','$ref');
  expectUnsupportedReference({$dynamicRef:'#node',$defs:{node:{$dynamicAnchor:'node',type:'integer'}}},'not-an-integer','$dynamicRef');
});

test('reference identifiers and definitions remain harmless metadata when no unsupported reference applicator executes',()=>{
  assert.doesNotThrow(()=>assertSchema({
    $id:'https://example.test/schema',
    $defs:{Code:{type:'string',minLength:3}},
    type:'string',
    minLength:2
  },'ok'));
});

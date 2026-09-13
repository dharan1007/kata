import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSchema,validateSchema} from '../lib/shared/schema.js';

test('boolean false schema rejects every instance instead of behaving like an empty schema',()=>{
  assert.deepEqual(validateSchema(false,'value'),['$: boolean schema is false']);
  assert.throws(
    ()=>assertSchema(false,'value'),
    error=>error instanceof Error&&error.message==='INVALID_ARGUMENTS'&&Array.isArray(error.details)&&error.details.includes('$: boolean schema is false')
  );
});

test('boolean schemas preserve Draft 2020-12 semantics when nested under properties and combinators',()=>{
  assert.throws(
    ()=>assertSchema({type:'object',properties:{forbidden:false}},{forbidden:'present'}),
    error=>error instanceof Error&&error.message==='INVALID_ARGUMENTS'&&Array.isArray(error.details)&&error.details.some(detail=>detail.includes('$.forbidden: boolean schema is false'))
  );
  assert.doesNotThrow(()=>assertSchema({anyOf:[false,{type:'string'}]},'allowed'));
  assert.throws(
    ()=>assertSchema({allOf:[true,false]},'blocked'),
    error=>error instanceof Error&&error.message==='INVALID_ARGUMENTS'
  );
});

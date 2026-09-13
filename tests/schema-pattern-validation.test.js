import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSchema} from '../lib/shared/schema.js';

test('rejects malformed regex patterns as INVALID_SCHEMA instead of throwing a raw RegExp exception',()=>{
  assert.throws(
    ()=>assertSchema({type:'string',pattern:'['},'value'),
    error=>error instanceof Error&&error.message==='INVALID_SCHEMA'&&Array.isArray(error.details)&&error.details.some(detail=>detail.includes('Invalid pattern schema'))
  );
});

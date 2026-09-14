import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSchema} from '../lib/shared/schema.js';

const MAX_SCHEMA_BRANCHES=32;

test('rejects oversized executable schema branch vectors before validation',()=>{
  const oversized=Array.from({length:MAX_SCHEMA_BRANCHES+1},()=>true);
  for(const keyword of ['allOf','anyOf','oneOf','prefixItems']){
    const schema={type:keyword==='prefixItems'?'array':'string',[keyword]:oversized};
    const value=keyword==='prefixItems'?[]:'value';
    assert.throws(
      ()=>assertSchema(schema,value),
      error=>error instanceof Error&&error.message==='INVALID_SCHEMA'&&Array.isArray(error.details)&&error.details.some(detail=>detail.includes(`Invalid ${keyword} schema`)),
      `${keyword} should fail closed when its branch vector exceeds the execution budget`
    );
  }
});

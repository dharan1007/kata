import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSchema} from '../lib/shared/schema.js';

test('uniqueItems avoids pairwise deep comparisons for distinct JSON object arrays',()=>{
  let reads=0;
  const values=Array.from({length:128},(_,id)=>{
    const value={};
    Object.defineProperty(value,'id',{
      enumerable:true,
      get(){reads+=1;return id;}
    });
    return value;
  });

  assert.doesNotThrow(()=>assertSchema({type:'array',uniqueItems:true},values));
  assert.ok(reads<=values.length*4,`expected near-linear property reads, observed ${reads}`);
});

test('uniqueItems keeps structural equality independent of object key order',()=>{
  assert.throws(
    ()=>assertSchema(
      {type:'array',uniqueItems:true},
      [{id:1,name:'kata'},{name:'kata',id:1}]
    ),
    error=>error?.message==='INVALID_ARGUMENTS'&&error.details?.some(detail=>detail.includes('items must be unique'))
  );
});

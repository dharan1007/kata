import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveUsage,commitUsage,releaseUsage,getUsageSummary} from '../lib/commercial/usage.js';

function makeStore(){
  const state={buckets:new Map(),reservations:new Map(),events:[]};
  let tail=Promise.resolve();let seq=0;
  const key=(o,m,w)=>`${o}|${m}|${w}`;
  const store={
    state,
    async transaction(fn){let unlock;const previous=tail;tail=new Promise(r=>unlock=r);await previous;try{return await fn(store);}finally{unlock();}},
    async getOrCreateUsageBucketForUpdate({organizationId,metric,windowStart,limit}){const k=key(organizationId,metric,windowStart);let row=state.buckets.get(k);if(!row){row={id:`b-${++seq}`,organizationId,metric,windowStart,limit,usedUnits:0,reservedUnits:0};state.buckets.set(k,row);}return row;},
    async getUsageReservation({organizationId,metric,idempotencyKey}){return [...state.reservations.values()].find(x=>x.organizationId===organizationId&&x.metric===metric&&x.idempotencyKey===idempotencyKey)??null;},
    async insertUsageReservation(input){const row={id:`r-${++seq}`,...input,status:'RESERVED'};state.reservations.set(row.id,row);return row;},
    async updateUsageBucket(bucketId,patch){const row=[...state.buckets.values()].find(x=>x.id===bucketId);Object.assign(row,patch);return row;},
    async getUsageReservationById(id){return state.reservations.get(id)??null;},
    async updateUsageReservation(id,patch){const row=state.reservations.get(id);Object.assign(row,patch);return row;},
    async insertUsageEvent(input){const row={id:`e-${++seq}`,...input};state.events.push(row);return row;},
    async listUsageBuckets(organizationId){return [...state.buckets.values()].filter(x=>x.organizationId===organizationId);}
  };
  return store;
}

const entitlements={monthlyEvaluations:1};
const base={organizationId:'org-1',metric:'compatibility_evaluation',units:1,entitlements,now:new Date('2026-09-10T00:00:00Z')};

test('same idempotency key returns one reservation and consumes capacity once',async()=>{
  const store=makeStore();
  const a=await reserveUsage({store,...base,idempotencyKey:'req-1'});
  const b=await reserveUsage({store,...base,idempotencyKey:'req-1'});
  assert.equal(a.id,b.id);
  assert.equal([...store.state.buckets.values()][0].reservedUnits,1);
});

test('concurrent reservations cannot overspend one remaining unit',async()=>{
  const store=makeStore();
  const results=await Promise.allSettled([
    reserveUsage({store,...base,idempotencyKey:'req-a'}),
    reserveUsage({store,...base,idempotencyKey:'req-b'})
  ]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  const rejected=results.find(x=>x.status==='rejected');
  assert.equal(rejected.reason.code,'QUOTA_EXCEEDED');
  assert.equal(rejected.reason.status,429);
});

test('commit moves reserved to used exactly once while internal failure releases it',async()=>{
  const store=makeStore();
  const r=await reserveUsage({store,...base,idempotencyKey:'req-1'});
  await commitUsage({store,reservationId:r.id,outcome:'BLOCKED',metadata:{findingCount:2}});
  await commitUsage({store,reservationId:r.id,outcome:'BLOCKED',metadata:{findingCount:2}});
  const bucket=[...store.state.buckets.values()][0];
  assert.equal(bucket.usedUnits,1);assert.equal(bucket.reservedUnits,0);assert.equal(store.state.events.length,1);

  const store2=makeStore();
  const r2=await reserveUsage({store:store2,...base,idempotencyKey:'req-2'});
  await releaseUsage({store:store2,reservationId:r2.id,reason:'KATA_INTERNAL_ERROR'});
  assert.equal([...store2.state.buckets.values()][0].usedUnits,0);
  assert.equal([...store2.state.buckets.values()][0].reservedUnits,0);
});

test('usage summary is bounded to tenant buckets',async()=>{
  const store=makeStore();
  const r=await reserveUsage({store,...base,idempotencyKey:'req-1'});await commitUsage({store,reservationId:r.id,outcome:'COMPLETED'});
  const summary=await getUsageSummary({store,organizationId:'org-1'});
  assert.equal(summary.metrics.compatibility_evaluation.used,1);
  assert.equal(summary.metrics.compatibility_evaluation.limit,1);
});

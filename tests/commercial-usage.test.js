import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveUsage,commitUsage,releaseUsage} from '../lib/commercial/usage.js';

class MemoryUsageStore{
  constructor(){this.buckets=new Map();this.reservations=new Map();this.events=[];this.sequence=0;this.tail=Promise.resolve();}
  async transaction(fn){let unlock;const next=new Promise(r=>unlock=r);const prior=this.tail;this.tail=next;await prior;try{return await fn(this);}finally{unlock();}}
  key(org,metric,key){return `${org}:${metric}:${key}`;}
  async getUsageReservation(org,metric,key){return this.reservations.get(this.key(org,metric,key))??null;}
  async getUsageReservationByIdForUpdate(id){return [...this.reservations.values()].find(r=>r.id===id)??null;}
  async getOrCreateUsageBucketForUpdate({organizationId,metric,windowStart,windowEnd,limitUnits}){const key=`${organizationId}:${metric}:${windowStart}`;if(!this.buckets.has(key))this.buckets.set(key,{id:`b${++this.sequence}`,organizationId,metric,windowStart,windowEnd,limitUnits,usedUnits:0,reservedUnits:0});return this.buckets.get(key);}
  async getUsageBucketByIdForUpdate(id){return [...this.buckets.values()].find(b=>b.id===id)??null;}
  async insertUsageReservation(input){const key=this.key(input.organizationId,input.metric,input.idempotencyKey);if(this.reservations.has(key))return null;const record={id:`r${++this.sequence}`,...input};this.reservations.set(key,record);return record;}
  async updateUsageBucket(id,{usedUnits,reservedUnits}){const bucket=[...this.buckets.values()].find(b=>b.id===id);Object.assign(bucket,{usedUnits,reservedUnits});return bucket;}
  async updateUsageReservation(id,patch){const record=[...this.reservations.values()].find(r=>r.id===id);Object.assign(record,patch);return record;}
  async insertUsageEvent(event){this.events.push(event);return event;}
}

const base={organizationId:'org',metric:'compatibility_evaluation',units:1,entitlements:{monthlyEvaluations:1},now:new Date('2026-09-11T00:00:00Z')};

test('usage reservation is idempotent and concurrent requests cannot overspend quota',async()=>{
  const store=new MemoryUsageStore();
  const first=await reserveUsage({store,...base,idempotencyKey:'same'});
  const replay=await reserveUsage({store,...base,idempotencyKey:'same'});
  assert.equal(first.id,replay.id);
  const store2=new MemoryUsageStore();
  const results=await Promise.allSettled([
    reserveUsage({store:store2,...base,idempotencyKey:'a'}),
    reserveUsage({store:store2,...base,idempotencyKey:'b'})
  ]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  const rejected=results.find(x=>x.status==='rejected');
  assert.equal(rejected.reason.code,'QUOTA_EXCEEDED');
  assert.equal(rejected.reason.status,429);
});

test('completed BLOCKED work consumes usage while internal failure releases it',async()=>{
  const store=new MemoryUsageStore();
  const completed=await reserveUsage({store,...base,idempotencyKey:'blocked'});
  const committed=await commitUsage({store,reservationId:completed.id,outcome:'BLOCKED',metadata:{code:'AUTH_REQUIRED'}});
  assert.equal(committed.state,'COMMITTED');
  const bucket=[...store.buckets.values()][0];
  assert.equal(bucket.usedUnits,1);assert.equal(bucket.reservedUnits,0);
  const store2=new MemoryUsageStore();
  const failed=await reserveUsage({store:store2,...base,idempotencyKey:'internal'});
  const released=await releaseUsage({store:store2,reservationId:failed.id,reason:'KATA_INTERNAL_FAILURE'});
  assert.equal(released.state,'RELEASED');
  const bucket2=[...store2.buckets.values()][0];
  assert.equal(bucket2.usedUnits,0);assert.equal(bucket2.reservedUnits,0);
});

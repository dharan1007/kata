import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptProviderEvent,beginCheckout,cancelSubscription} from '../lib/commercial/billing.js';

class Store{
  constructor(){this.user={id:'u1'};this.membership={role:'OWNER'};this.account=null;this.events=[];this.snapshots=[];this.audits=[];this.sequence=0;this.tail=Promise.resolve();}
  async transaction(fn){let unlock;const next=new Promise(r=>unlock=r);const prior=this.tail;this.tail=next;await prior;try{return await fn(this);}finally{unlock();}}
  async getUserBySubject(){return this.user;}
  async getMembership(){return this.membership;}
  async getOrCreateSubscriptionAccountForUpdate(organizationId){if(!this.account)this.account={organizationId,planId:'free',state:'FREE',version:1};return this.account;}
  async getSubscriptionAccountByProviderSubscriptionForUpdate(provider,subscriptionId){return this.account?.provider===provider&&this.account?.providerSubscriptionId===subscriptionId?this.account:null;}
  async updateSubscriptionAccount(organizationId,patch){Object.assign(this.account,{...patch,organizationId});return this.account;}
  async insertBillingEvent(record){if(this.events.some(e=>e.provider===record.provider&&e.eventId===record.eventId))return null;const stored={id:`evt-${++this.sequence}`,...record};this.events.push(stored);return stored;}
  async getBillingEvent(provider,eventId){return this.events.find(e=>e.provider===provider&&e.eventId===eventId)??null;}
  async insertEntitlementSnapshot(record){this.snapshots.push(record);return record;}
  async appendAuditEvent(record){this.audits.push(record);return record;}
}

const actor={type:'user',authn:'identity-session',subject:'s1',email:'owner@example.test'};
const activeEvent={provider:'razorpay',eventId:'evt-active',eventType:'subscription.activated',providerCreatedAt:100,subscriptionId:'sub_1',mappedState:'ACTIVE',rawDigest:'a'.repeat(64)};

test('checkout binds provider subscription but does not grant paid entitlement before provider ACTIVE evidence',async()=>{
  const store=new Store();
  const provider={name:'razorpay',createSubscription:async()=>({subscriptionId:'sub_1',status:'created',shortUrl:'https://rzp.io/i/test'}),cancelSubscription:async()=>({})};
  const checkout=await beginCheckout({store,provider,actor,organizationId:'o1',planId:'developer',planMappings:{developer:'plan_dev',team:'plan_team'}});
  assert.equal(checkout.subscriptionId,'sub_1');
  assert.equal(store.account.state,'CHECKOUT_PENDING');
  assert.equal(store.account.planId,'developer');
  assert.equal(store.snapshots.at(-1).effectivePlanId,'free');
});

test('provider event transition and effective entitlement snapshot commit once and stale replay cannot resurrect state',async()=>{
  const store=new Store();
  store.account={organizationId:'o1',planId:'developer',state:'CHECKOUT_PENDING',version:1,provider:'razorpay',providerSubscriptionId:'sub_1',providerEventTime:null,providerEventId:null};
  const provider={name:'razorpay',verifyWebhook:()=>activeEvent};
  const first=await acceptProviderEvent({store,provider,rawBody:Buffer.from('{}'),headers:{'x-razorpay-signature':'sig','x-razorpay-event-id':'evt-active'}});
  assert.equal(first.duplicate,false);
  assert.equal(store.account.state,'ACTIVE');
  assert.equal(store.snapshots.at(-1).effectivePlanId,'developer');
  const snapshots=store.snapshots.length,audits=store.audits.length;
  const duplicate=await acceptProviderEvent({store,provider,rawBody:Buffer.from('{}'),headers:{'x-razorpay-signature':'sig','x-razorpay-event-id':'evt-active'}});
  assert.equal(duplicate.duplicate,true);
  assert.equal(store.snapshots.length,snapshots);
  assert.equal(store.audits.length,audits);
});

test('cancel requests are owner-only and move state to cancel pending until provider evidence finalizes it',async()=>{
  const store=new Store();
  store.account={organizationId:'o1',planId:'developer',state:'ACTIVE',version:2,provider:'razorpay',providerSubscriptionId:'sub_1'};
  const provider={name:'razorpay',cancelSubscription:async()=>({subscriptionId:'sub_1',status:'active',cancelAtCycleEnd:true})};
  const result=await cancelSubscription({store,provider,actor,organizationId:'o1',cancelAtCycleEnd:true});
  assert.equal(result.state,'CANCEL_PENDING');
  assert.equal(store.account.state,'CANCEL_PENDING');
  store.membership={role:'MEMBER'};
  await assert.rejects(()=>cancelSubscription({store,provider,actor,organizationId:'o1'}),error=>error?.code==='FORBIDDEN');
});

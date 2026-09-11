import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBillingEvent,BILLING_STATES} from '../lib/commercial/billing-state.js';

const evidence=(overrides={})=>({provider:'razorpay',eventId:'evt-1',eventType:'subscription.activated',providerCreatedAt:100,subscriptionId:'sub-1',mappedState:'ACTIVE',rawDigest:'a'.repeat(64),...overrides});

test('billing state machine is deterministic under stale and conflicting provider events',()=>{
  assert.ok(BILLING_STATES.includes('RECONCILIATION_REQUIRED'));
  const active=applyBillingEvent({state:'AUTHENTICATED',providerEventTime:50,providerEventId:'evt-auth'},evidence());
  assert.equal(active.state,'ACTIVE');
  const cancelled=applyBillingEvent(active,evidence({eventId:'evt-cancel',eventType:'subscription.cancelled',providerCreatedAt:200,mappedState:'CANCELLED'}));
  assert.equal(cancelled.state,'CANCELLED');
  const stale=applyBillingEvent(cancelled,evidence({eventId:'evt-old',providerCreatedAt:100,mappedState:'ACTIVE'}));
  assert.equal(stale.state,'CANCELLED');
  assert.equal(stale.ignoredEventId,'evt-old');
  const ambiguous=applyBillingEvent(active,evidence({eventId:'evt-conflict',providerCreatedAt:100,mappedState:'CANCELLED'}));
  assert.equal(ambiguous.state,'RECONCILIATION_REQUIRED');
});

test('billing state cannot be elevated without authenticated provider evidence',()=>{
  assert.throws(()=>applyBillingEvent({state:'FREE'}, {mappedState:'ACTIVE',providerCreatedAt:10}),error=>error?.code==='BILLING_EVENT_EVIDENCE_REQUIRED');
  assert.throws(()=>applyBillingEvent({state:'FREE'}, evidence({rawDigest:'bad'})),error=>error?.code==='BILLING_EVENT_EVIDENCE_REQUIRED');
});

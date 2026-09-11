import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAN_IDS,getPlanEntitlements,getPublicPlans} from '../lib/commercial/plans.js';
import {deriveEffectiveEntitlements} from '../lib/commercial/entitlements.js';

test('canonical plans expose immutable authorization and safe pricing metadata',()=>{
  assert.deepEqual(PLAN_IDS,['free','developer','team','enterprise']);
  assert.deepEqual(getPlanEntitlements('free'),{
    maxProjects:2,monthlyEvaluations:30,historyDays:7,privateProjects:false,
    apiKeys:false,ciTokens:false,ciEnforcement:false,regressionHistory:false,
    jsonExport:false,organizationMembers:1,policyManagement:false,
    auditExport:false,enterpriseSelfHosting:false
  });
  assert.equal(getPlanEntitlements('developer').monthlyEvaluations,500);
  assert.equal(getPlanEntitlements('team').organizationMembers,10);
  assert.equal(getPublicPlans().find(p=>p.id==='developer').priceInrMonthly,999);
  assert.equal(getPublicPlans().find(p=>p.id==='team').priceInrMonthly,4999);
  assert.ok(Object.isFrozen(getPlanEntitlements('team')));
  assert.doesNotMatch(JSON.stringify(getPublicPlans()),/plan_[A-Za-z0-9]+|secret|keyId/i);
  assert.throws(()=>getPlanEntitlements('made-up'),error=>error?.code==='UNKNOWN_PLAN');
});

test('only reconciled active server billing state grants paid entitlements',()=>{
  const active=deriveEffectiveEntitlements({billingState:'ACTIVE',planId:'team'});
  assert.equal(active.effectivePlanId,'team');
  assert.equal(active.capabilities.ciEnforcement,true);
  for(const state of ['PAST_DUE','HALTED','CANCELLED','EXPIRED','RECONCILIATION_REQUIRED']){
    const restricted=deriveEffectiveEntitlements({billingState:state,planId:'team'});
    assert.equal(restricted.effectivePlanId,'free');
    assert.equal(restricted.capabilities.ciEnforcement,false);
  }
  const clientLike=deriveEffectiveEntitlements({billingState:null,planId:'team'});
  assert.equal(clientLike.effectivePlanId,'free');
  assert.ok(Object.isFrozen(clientLike.capabilities));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {getPlanEntitlements,getPublicPlans} from '../lib/commercial/plans.js';
import {deriveEffectiveEntitlements} from '../lib/commercial/entitlements.js';

const FREE={maxProjects:2,monthlyEvaluations:30,historyDays:7,privateProjects:false,apiKeys:false,ciTokens:false,ciEnforcement:false,regressionHistory:false,jsonExport:false,organizationMembers:1,policyManagement:false,auditExport:false,enterpriseSelfHosting:false};

test('plan registry exposes exact immutable bootstrap limits',()=>{
  assert.deepEqual(getPlanEntitlements('free'),FREE);
  assert.equal(getPlanEntitlements('developer').maxProjects,10);
  assert.equal(getPlanEntitlements('developer').monthlyEvaluations,500);
  assert.equal(getPlanEntitlements('team').maxProjects,50);
  assert.equal(getPlanEntitlements('team').monthlyEvaluations,5000);
  assert.equal(getPlanEntitlements('team').organizationMembers,10);
  assert.equal(Object.isFrozen(getPlanEntitlements('free')),true);
  assert.throws(()=>getPlanEntitlements('made-up'),error=>error.code==='UNKNOWN_PLAN');
});

test('public pricing is display-only and contains no provider IDs or secret configuration',()=>{
  const plans=getPublicPlans();
  assert.equal(plans.find(x=>x.id==='free').priceInrMonthly,0);
  assert.equal(plans.find(x=>x.id==='developer').priceInrMonthly,999);
  assert.equal(plans.find(x=>x.id==='team').priceInrMonthly,4999);
  assert.equal(plans.find(x=>x.id==='enterprise').priceInrMonthly,null);
  assert.doesNotMatch(JSON.stringify(plans),/razorpay|plan_external|secret|providerPlan/i);
});

test('paid capability derives only from reconciled ACTIVE server billing state',()=>{
  assert.deepEqual(deriveEffectiveEntitlements({billingState:'FREE',planId:'free'}),FREE);
  assert.equal(deriveEffectiveEntitlements({billingState:'ACTIVE',planId:'developer'}).apiKeys,true);
  assert.equal(deriveEffectiveEntitlements({billingState:'ACTIVE',planId:'developer'}).ciEnforcement,false);
  assert.equal(deriveEffectiveEntitlements({billingState:'ACTIVE',planId:'team'}).ciEnforcement,true);
  for(const state of ['CHECKOUT_PENDING','AUTHENTICATED','PAST_DUE','HALTED','CANCEL_PENDING','CANCELLED','EXPIRED','RECONCILIATION_REQUIRED']){
    assert.deepEqual(deriveEffectiveEntitlements({billingState:state,planId:'team'}),FREE);
  }
});

test('enterprise overrides are accepted only through explicit server contract input and cannot weaken finite boolean types',()=>{
  const ent=deriveEffectiveEntitlements({billingState:'ACTIVE',planId:'enterprise',enterpriseOverrides:{maxProjects:250,monthlyEvaluations:25000,historyDays:730,organizationMembers:100,apiKeys:true,ciTokens:true,ciEnforcement:true,policyManagement:true,auditExport:true,enterpriseSelfHosting:true}});
  assert.equal(ent.maxProjects,250);
  assert.equal(ent.enterpriseSelfHosting,true);
  assert.throws(()=>deriveEffectiveEntitlements({billingState:'ACTIVE',planId:'enterprise',enterpriseOverrides:{maxProjects:-1}}),error=>error.code==='INVALID_ENTERPRISE_ENTITLEMENTS');
});

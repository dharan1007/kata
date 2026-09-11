import {commercialError} from './errors.js';
import {getPlanEntitlements,PLAN_IDS} from './plans.js';

const PAID_STATES=new Set(['ACTIVE','CANCEL_PENDING']);
const OVERRIDABLE_NUMERIC=new Set(['maxProjects','monthlyEvaluations','historyDays','organizationMembers']);
const OVERRIDABLE_BOOLEAN=new Set(['privateProjects','apiKeys','ciTokens','ciEnforcement','regressionHistory','jsonExport','policyManagement','auditExport','enterpriseSelfHosting']);

function normalizePlan(planId){
  const value=String(planId||'free').toLowerCase();
  if(!PLAN_IDS.includes(value))throw commercialError('UNKNOWN_PLAN',400);
  return value;
}

function applyEnterpriseOverrides(base,overrides){
  if(overrides==null)return base;
  if(typeof overrides!=='object'||Array.isArray(overrides))throw commercialError('INVALID_ENTERPRISE_OVERRIDES',500);
  const next={...base};
  for(const [key,value] of Object.entries(overrides)){
    if(OVERRIDABLE_NUMERIC.has(key)){
      if(!Number.isSafeInteger(value)||value<0)throw commercialError('INVALID_ENTERPRISE_OVERRIDES',500);
      next[key]=value;
      continue;
    }
    if(OVERRIDABLE_BOOLEAN.has(key)){
      if(typeof value!=='boolean')throw commercialError('INVALID_ENTERPRISE_OVERRIDES',500);
      next[key]=value;
      continue;
    }
    throw commercialError('INVALID_ENTERPRISE_OVERRIDES',500);
  }
  return Object.freeze(next);
}

export function deriveEffectiveEntitlements({billingState=null,planId='free',enterpriseOverrides=null}={}){
  const requested=normalizePlan(planId);
  const normalizedState=String(billingState||'FREE').toUpperCase();
  const effectivePlanId=requested==='free'||PAID_STATES.has(normalizedState)?requested:'free';
  let capabilities=getPlanEntitlements(effectivePlanId);
  if(effectivePlanId==='enterprise')capabilities=applyEnterpriseOverrides(capabilities,enterpriseOverrides);
  return Object.freeze({
    effectivePlanId,
    billingState:normalizedState,
    capabilities:Object.freeze({...capabilities})
  });
}

export function requireEntitlement(snapshot,capability,{status=403}={}){
  if(!snapshot?.capabilities||snapshot.capabilities[capability]!==true)throw commercialError('ENTITLEMENT_REQUIRED',status,{capability});
  return snapshot;
}

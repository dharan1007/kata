import {commercialError} from './errors.js';

export const PLAN_IDS=Object.freeze(['free','developer','team','enterprise']);

const freezeEntitlements=value=>Object.freeze({...value});
const REGISTRY=Object.freeze({
  free:freezeEntitlements({
    maxProjects:2,monthlyEvaluations:30,historyDays:7,privateProjects:false,
    apiKeys:false,ciTokens:false,ciEnforcement:false,regressionHistory:false,
    jsonExport:false,organizationMembers:1,policyManagement:false,
    auditExport:false,enterpriseSelfHosting:false
  }),
  developer:freezeEntitlements({
    maxProjects:10,monthlyEvaluations:500,historyDays:30,privateProjects:true,
    apiKeys:true,ciTokens:false,ciEnforcement:false,regressionHistory:true,
    jsonExport:true,organizationMembers:1,policyManagement:false,
    auditExport:false,enterpriseSelfHosting:false
  }),
  team:freezeEntitlements({
    maxProjects:100,monthlyEvaluations:5000,historyDays:365,privateProjects:true,
    apiKeys:true,ciTokens:true,ciEnforcement:true,regressionHistory:true,
    jsonExport:true,organizationMembers:10,policyManagement:true,
    auditExport:true,enterpriseSelfHosting:false
  }),
  enterprise:freezeEntitlements({
    maxProjects:10000,monthlyEvaluations:100000,historyDays:3650,privateProjects:true,
    apiKeys:true,ciTokens:true,ciEnforcement:true,regressionHistory:true,
    jsonExport:true,organizationMembers:1000,policyManagement:true,
    auditExport:true,enterpriseSelfHosting:true
  })
});

const PUBLIC_PLANS=Object.freeze([
  Object.freeze({id:'free',name:'Free',priceInrMonthly:0,description:'Evaluate interoperability locally and run a bounded hosted allowance.',features:Object.freeze(['2 projects','30 hosted evaluations / month','7-day history'])}),
  Object.freeze({id:'developer',name:'Developer',priceInrMonthly:999,description:'Private developer workflows, API access and compatibility history.',features:Object.freeze(['10 projects','500 hosted evaluations / month','API keys','JSON export','30-day history'])}),
  Object.freeze({id:'team',name:'Team',priceInrMonthly:4999,description:'Team-scale CI enforcement, policy controls and audit-ready compatibility history.',features:Object.freeze(['100 projects','5,000 hosted evaluations / month','CI tokens','CI enforcement','policy management','audit export'])}),
  Object.freeze({id:'enterprise',name:'Enterprise',priceInrMonthly:null,description:'Contracted capacity, governance and self-hosting support.',features:Object.freeze(['Contracted limits','enterprise self-hosting','extended retention','commercial support'])})
]);

export function getPlanEntitlements(planId){
  const value=REGISTRY[String(planId||'').toLowerCase()];
  if(!value)throw commercialError('UNKNOWN_PLAN',400);
  return value;
}

export function getPublicPlans(){
  return PUBLIC_PLANS.map(plan=>Object.freeze({...plan,features:Object.freeze([...plan.features])}));
}

import {commercialError} from './errors.js';
import {requireOrgRole} from './authz.js';
import {applyBillingEvent} from './billing-state.js';
import {deriveEffectiveEntitlements} from './entitlements.js';

const PAID_PLANS=new Set(['developer','team']);
function headerValue(headers,name){
  if(headers?.get)return headers.get(name);
  const target=name.toLowerCase();
  for(const [key,value] of Object.entries(headers||{}))if(key.toLowerCase()===target)return value;
  return null;
}
function snapshotRecord(account){
  const effective=deriveEffectiveEntitlements({billingState:account.state,planId:account.planId,enterpriseOverrides:account.enterpriseOverrides??null});
  return{organizationId:account.organizationId,subscriptionVersion:account.version,effectivePlanId:effective.effectivePlanId,capabilities:effective.capabilities,evidence:{billingState:account.state,provider:account.provider??null,providerSubscriptionId:account.providerSubscriptionId??null,providerEventId:account.providerEventId??null}};
}
function providerName(provider){
  const value=String(provider?.name||'').trim();
  if(!value)throw commercialError('BILLING_PROVIDER_NOT_CONFIGURED',503);
  return value;
}

export async function beginCheckout({store,provider,actor,organizationId,planId,planMappings,customerNotify=true}={}){
  if(!PAID_PLANS.has(planId))throw commercialError('INVALID_BILLING_PLAN',400);
  await requireOrgRole({store,principal:actor,organizationId,allowedRoles:['OWNER']});
  const externalPlanId=planMappings?.[planId];
  if(typeof externalPlanId!=='string'||!externalPlanId)throw commercialError('BILLING_NOT_CONFIGURED',503,{planId});
  const name=providerName(provider);
  const created=await provider.createSubscription({planExternalId:externalPlanId,organizationId,customerNotify});
  if(!created?.subscriptionId)throw commercialError('BILLING_PROVIDER_INVALID_RESPONSE',502);
  try{
    return await store.transaction(async tx=>{
      const current=await tx.getOrCreateSubscriptionAccountForUpdate(organizationId);
      if(current.state==='ACTIVE'||current.state==='CANCEL_PENDING')throw commercialError('SUBSCRIPTION_ALREADY_ACTIVE',409);
      const next=await tx.updateSubscriptionAccount(organizationId,{planId,state:'CHECKOUT_PENDING',provider:name,providerSubscriptionId:created.subscriptionId,providerPlanId:externalPlanId,providerEventTime:null,providerEventId:null,version:Number(current.version||0)+1,reconciliationReason:null,cancelAtPeriodEnd:false});
      await tx.insertEntitlementSnapshot(snapshotRecord(next));
      await tx.appendAuditEvent({organizationId,actorType:'user',actorId:actor.subject??null,action:'billing.checkout.begin',targetType:'subscription',targetId:created.subscriptionId,outcome:'CHECKOUT_PENDING',requestId:null,metadata:{planId,provider:name}});
      return Object.freeze({subscriptionId:created.subscriptionId,shortUrl:created.shortUrl??null,state:next.state,planId});
    });
  }catch(error){
    try{if(typeof provider.cancelSubscription==='function')await provider.cancelSubscription(created.subscriptionId,{cancelAtCycleEnd:false});}catch{}
    throw error;
  }
}

export async function acceptProviderEvent({store,provider,rawBody,headers}={}){
  const name=providerName(provider);
  const eventId=String(headerValue(headers,'x-razorpay-event-id')||'').trim();
  const signature=String(headerValue(headers,'x-razorpay-signature')||'').trim();
  const event=provider.verifyWebhook({rawBody,signature,eventId});
  if(event.provider!==name)throw commercialError('BILLING_PROVIDER_MISMATCH',400);

  return store.transaction(async tx=>{
    const account=await tx.getSubscriptionAccountByProviderSubscriptionForUpdate(name,event.subscriptionId);
    if(!account)throw commercialError('BILLING_SUBSCRIPTION_NOT_BOUND',409);
    const duplicate=await tx.getBillingEvent(name,event.eventId);
    if(duplicate)return Object.freeze({duplicate:true,eventId:event.eventId,state:account.state});

    const nextState=applyBillingEvent(account,event);
    const processingResult=nextState.ignoredEventId===event.eventId?'IGNORED_STALE':nextState.state==='RECONCILIATION_REQUIRED'?'RECONCILIATION_REQUIRED':'ACCEPTED';
    const inserted=await tx.insertBillingEvent({organizationId:account.organizationId,provider:name,eventId:event.eventId,eventType:event.eventType,providerCreatedAt:event.providerCreatedAt,providerSubscriptionId:event.subscriptionId,providerPaymentId:event.paymentId??null,mappedState:event.mappedState,rawDigest:event.rawDigest,processingResult,metadata:{}});
    if(!inserted){
      const existing=await tx.getBillingEvent(name,event.eventId);
      if(existing)return Object.freeze({duplicate:true,eventId:event.eventId,state:account.state});
      throw commercialError('BILLING_EVENT_CONFLICT',409);
    }
    if(processingResult==='IGNORED_STALE')return Object.freeze({duplicate:false,ignored:true,eventId:event.eventId,state:account.state});

    const updated=await tx.updateSubscriptionAccount(account.organizationId,{state:nextState.state,provider:name,providerSubscriptionId:event.subscriptionId,providerEventTime:nextState.providerEventTime,providerEventId:nextState.providerEventId,version:Number(account.version||0)+1,reconciliationReason:nextState.reconciliationReason??null});
    await tx.insertEntitlementSnapshot(snapshotRecord(updated));
    await tx.appendAuditEvent({organizationId:account.organizationId,actorType:'system',actorId:'razorpay-webhook',action:'billing.event.accept',targetType:'subscription',targetId:event.subscriptionId,outcome:updated.state,requestId:event.eventId,metadata:{eventType:event.eventType,processingResult,rawDigest:event.rawDigest}});
    return Object.freeze({duplicate:false,ignored:false,eventId:event.eventId,state:updated.state,effectivePlanId:deriveEffectiveEntitlements({billingState:updated.state,planId:updated.planId}).effectivePlanId});
  });
}

export async function cancelSubscription({store,provider,actor,organizationId,cancelAtCycleEnd=true}={}){
  await requireOrgRole({store,principal:actor,organizationId,allowedRoles:['OWNER']});
  const name=providerName(provider);
  const current=await store.transaction(tx=>tx.getOrCreateSubscriptionAccountForUpdate(organizationId));
  if(current.provider!==name||!current.providerSubscriptionId)throw commercialError('SUBSCRIPTION_NOT_FOUND',404);
  if(!['ACTIVE','PAST_DUE','HALTED','CANCEL_PENDING'].includes(current.state))throw commercialError('SUBSCRIPTION_NOT_CANCELLABLE',409);
  await provider.cancelSubscription(current.providerSubscriptionId,{cancelAtCycleEnd});
  return store.transaction(async tx=>{
    const locked=await tx.getOrCreateSubscriptionAccountForUpdate(organizationId);
    if(locked.providerSubscriptionId!==current.providerSubscriptionId)throw commercialError('SUBSCRIPTION_CHANGED',409);
    const updated=await tx.updateSubscriptionAccount(organizationId,{state:'CANCEL_PENDING',cancelAtPeriodEnd:Boolean(cancelAtCycleEnd),version:Number(locked.version||0)+1});
    await tx.insertEntitlementSnapshot(snapshotRecord(updated));
    await tx.appendAuditEvent({organizationId,actorType:'user',actorId:actor.subject??null,action:'billing.cancel.request',targetType:'subscription',targetId:updated.providerSubscriptionId,outcome:'CANCEL_PENDING',requestId:null,metadata:{cancelAtCycleEnd:Boolean(cancelAtCycleEnd)}});
    return Object.freeze({subscriptionId:updated.providerSubscriptionId,state:updated.state,cancelAtCycleEnd:Boolean(cancelAtCycleEnd)});
  });
}

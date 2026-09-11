import {commercialError} from './errors.js';

export const BILLING_STATES=Object.freeze(['FREE','CHECKOUT_PENDING','AUTHENTICATED','ACTIVE','PAST_DUE','HALTED','CANCEL_PENDING','CANCELLED','EXPIRED','RECONCILIATION_REQUIRED']);
const STATE_SET=new Set(BILLING_STATES);
const TERMINAL=new Set(['CANCELLED','EXPIRED']);
const DIGEST=/^[0-9a-f]{64}$/i;

function validateEvidence(event){
  if(!event||typeof event!=='object'||typeof event.provider!=='string'||!event.provider.trim()||typeof event.eventId!=='string'||!event.eventId.trim()||typeof event.eventType!=='string'||!event.eventType.trim()||!Number.isFinite(event.providerCreatedAt)||event.providerCreatedAt<0||typeof event.subscriptionId!=='string'||!event.subscriptionId.trim()||!STATE_SET.has(event.mappedState)||!DIGEST.test(String(event.rawDigest||'')))throw commercialError('BILLING_EVENT_EVIDENCE_REQUIRED',400);
}

export function applyBillingEvent(current={state:'FREE'},event){
  validateEvidence(event);
  const priorState=STATE_SET.has(current?.state)?current.state:'FREE';
  const priorTime=Number.isFinite(current?.providerEventTime)?current.providerEventTime:-1;
  const priorId=typeof current?.providerEventId==='string'?current.providerEventId:null;

  if(event.providerCreatedAt<priorTime)return Object.freeze({...current,state:priorState,ignoredEventId:event.eventId});
  if(event.providerCreatedAt===priorTime&&priorId&&priorId!==event.eventId){
    if(priorState===event.mappedState)return Object.freeze({...current,state:priorState,ignoredEventId:event.eventId});
    return Object.freeze({...current,state:'RECONCILIATION_REQUIRED',providerEventTime:event.providerCreatedAt,providerEventId:event.eventId,provider:event.provider,subscriptionId:event.subscriptionId,reconciliationReason:'CONFLICTING_SAME_TIME_EVENTS'});
  }
  if(TERMINAL.has(priorState)&&event.mappedState==='ACTIVE'){
    return Object.freeze({...current,state:'RECONCILIATION_REQUIRED',providerEventTime:event.providerCreatedAt,providerEventId:event.eventId,provider:event.provider,subscriptionId:event.subscriptionId,reconciliationReason:'TERMINAL_STATE_REACTIVATION'});
  }
  return Object.freeze({...current,state:event.mappedState,provider:event.provider,subscriptionId:event.subscriptionId,providerEventTime:event.providerCreatedAt,providerEventId:event.eventId,lastProviderEventType:event.eventType,lastRawDigest:event.rawDigest,reconciliationReason:null});
}

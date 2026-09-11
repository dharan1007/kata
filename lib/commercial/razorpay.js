import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {commercialError} from './errors.js';

const API_BASE='https://api.razorpay.com';
const MAX_WEBHOOK_BYTES=262144;
const MAX_RESPONSE_BYTES=524288;
const SIGNATURE=/^[0-9a-f]{64}$/i;
const EVENT_STATE=Object.freeze({
  'subscription.authenticated':'AUTHENTICATED',
  'subscription.activated':'ACTIVE',
  'subscription.charged':'ACTIVE',
  'subscription.resumed':'ACTIVE',
  'subscription.pending':'PAST_DUE',
  'subscription.halted':'HALTED',
  'subscription.paused':'HALTED',
  'subscription.cancelled':'CANCELLED',
  'subscription.completed':'EXPIRED'
});

function required(value,code='BILLING_NOT_CONFIGURED'){
  if(typeof value!=='string'||!value.trim())throw commercialError(code,503);
  return value.trim();
}

function rawBytes(value){
  if(typeof value==='string')return Buffer.from(value,'utf8');
  if(value instanceof Uint8Array)return Buffer.from(value.buffer,value.byteOffset,value.byteLength);
  throw commercialError('INVALID_WEBHOOK_BODY',400);
}

async function readBoundedJson(response){
  const declared=Number(response.headers?.get?.('content-length')||0);
  if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES)throw commercialError('BILLING_PROVIDER_RESPONSE_TOO_LARGE',502);
  const chunks=[];let total=0;
  if(response.body?.getReader){
    const reader=response.body.getReader();
    try{
      while(true){
        const {done,value}=await reader.read();if(done)break;
        total+=value.byteLength;
        if(total>MAX_RESPONSE_BYTES){await reader.cancel();throw commercialError('BILLING_PROVIDER_RESPONSE_TOO_LARGE',502);}
        chunks.push(Buffer.from(value));
      }
    }finally{try{reader.releaseLock();}catch{}}
  }else{
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length>MAX_RESPONSE_BYTES)throw commercialError('BILLING_PROVIDER_RESPONSE_TOO_LARGE',502);
    chunks.push(bytes);
  }
  const text=Buffer.concat(chunks).toString('utf8');
  if(!text)return{};
  try{return JSON.parse(text);}catch{throw commercialError('BILLING_PROVIDER_INVALID_RESPONSE',502);}
}

function normalizeEvent(payload,eventId,rawDigest){
  const eventType=String(payload?.event||'');
  const mappedState=EVENT_STATE[eventType];
  if(!mappedState)throw commercialError('UNSUPPORTED_BILLING_EVENT',400,{eventType});
  const subscription=payload?.payload?.subscription?.entity;
  if(!subscription||typeof subscription.id!=='string'||!subscription.id)throw commercialError('INVALID_BILLING_EVENT',400);
  const providerCreatedAt=Number(payload?.created_at);
  if(!Number.isFinite(providerCreatedAt)||providerCreatedAt<0)throw commercialError('INVALID_BILLING_EVENT',400);
  const paymentId=payload?.payload?.payment?.entity?.id;
  return Object.freeze({provider:'razorpay',eventId,eventType,providerCreatedAt,subscriptionId:subscription.id,...(typeof paymentId==='string'&&paymentId?{paymentId}:{}),mappedState,rawDigest});
}

export function createRazorpayProvider({keyId,keySecret,webhookSecret,fetchImpl=globalThis.fetch,timeoutMs=10000}={}){
  const id=required(keyId),secret=required(keySecret),webhook=required(webhookSecret);
  if(typeof fetchImpl!=='function')throw commercialError('BILLING_PROVIDER_NOT_CONFIGURED',503);
  const authorization=`Basic ${Buffer.from(`${id}:${secret}`,'utf8').toString('base64')}`;

  async function request(path,{method='GET',body}={}){
    let response;
    try{
      response=await fetchImpl(`${API_BASE}${path}`,{
        method,
        headers:{authorization,'content-type':'application/json','accept':'application/json'},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),
        redirect:'manual',
        signal:AbortSignal.timeout(timeoutMs)
      });
    }catch(error){
      if(error?.name==='TimeoutError'||error?.name==='AbortError')throw commercialError('BILLING_PROVIDER_TIMEOUT',504);
      throw commercialError('BILLING_PROVIDER_UNAVAILABLE',502);
    }
    if(response.status<200||response.status>=300)throw commercialError('BILLING_PROVIDER_ERROR',502,{providerStatus:response.status});
    return readBoundedJson(response);
  }

  return Object.freeze({
    name:'razorpay',
    async createSubscription({planExternalId,organizationId,customerNotify=true,totalCount=120}){
      if(typeof planExternalId!=='string'||!/^plan_[A-Za-z0-9]+$/.test(planExternalId))throw commercialError('INVALID_BILLING_PLAN_MAPPING',500);
      if(typeof organizationId!=='string'||!organizationId)throw commercialError('ORGANIZATION_REQUIRED',400);
      if(!Number.isSafeInteger(totalCount)||totalCount<1||totalCount>360)throw commercialError('INVALID_BILLING_CYCLE_COUNT',400);
      const data=await request('/v1/subscriptions',{method:'POST',body:{plan_id:planExternalId,total_count:totalCount,quantity:1,customer_notify:Boolean(customerNotify),notes:{kata_organization_id:organizationId}}});
      if(typeof data.id!=='string'||!data.id)throw commercialError('BILLING_PROVIDER_INVALID_RESPONSE',502);
      return Object.freeze({subscriptionId:data.id,status:String(data.status||''),shortUrl:typeof data.short_url==='string'?data.short_url:null});
    },
    async fetchSubscription(subscriptionId){
      if(typeof subscriptionId!=='string'||!/^sub_[A-Za-z0-9]+$/.test(subscriptionId))throw commercialError('INVALID_SUBSCRIPTION_ID',400);
      const data=await request(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
      return Object.freeze({subscriptionId:data.id,status:String(data.status||''),planExternalId:typeof data.plan_id==='string'?data.plan_id:null,currentStart:data.current_start??null,currentEnd:data.current_end??null,endedAt:data.ended_at??null});
    },
    async cancelSubscription(subscriptionId,{cancelAtCycleEnd=true}={}){
      if(typeof subscriptionId!=='string'||!/^sub_[A-Za-z0-9]+$/.test(subscriptionId))throw commercialError('INVALID_SUBSCRIPTION_ID',400);
      const data=await request(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,{method:'POST',body:{cancel_at_cycle_end:Boolean(cancelAtCycleEnd)}});
      return Object.freeze({subscriptionId:data.id??subscriptionId,status:String(data.status||''),cancelAtCycleEnd:Boolean(cancelAtCycleEnd)});
    },
    verifyWebhook({rawBody,signature,eventId}){
      const bytes=rawBytes(rawBody);
      if(bytes.length>MAX_WEBHOOK_BYTES)throw commercialError('WEBHOOK_PAYLOAD_TOO_LARGE',413);
      const idValue=String(eventId||'').trim();
      if(!idValue)throw commercialError('WEBHOOK_EVENT_ID_REQUIRED',400);
      const sig=String(signature||'').trim();
      if(!SIGNATURE.test(sig))throw commercialError('INVALID_WEBHOOK_SIGNATURE',401);
      const expected=createHmac('sha256',webhook).update(bytes).digest();
      const actual=Buffer.from(sig,'hex');
      if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw commercialError('INVALID_WEBHOOK_SIGNATURE',401);
      let payload;
      try{payload=JSON.parse(bytes.toString('utf8'));}catch{throw commercialError('INVALID_WEBHOOK_JSON',400);}
      const rawDigest=createHash('sha256').update(bytes).digest('hex');
      return normalizeEvent(payload,idValue,rawDigest);
    }
  });
}

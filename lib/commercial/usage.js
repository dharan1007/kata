import {commercialError} from './errors.js';

const METRIC_LIMIT=Object.freeze({compatibility_evaluation:'monthlyEvaluations'});

function positiveUnits(value){
  if(!Number.isSafeInteger(value)||value<1)throw commercialError('INVALID_USAGE_UNITS',400);
  return value;
}
function requireText(value,code){
  const text=String(value??'').trim();
  if(!text)throw commercialError(code,400);
  return text;
}
function monthWindow(now){
  const value=now instanceof Date?now:new Date(now??Date.now());
  if(Number.isNaN(value.getTime()))throw commercialError('INVALID_USAGE_TIME',500);
  const start=new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth(),1,0,0,0,0));
  const end=new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth()+1,1,0,0,0,0));
  return{start:start.toISOString(),end:end.toISOString()};
}
function metricLimit(metric,entitlements){
  const key=METRIC_LIMIT[metric];
  if(!key)throw commercialError('UNKNOWN_USAGE_METRIC',400);
  const limit=entitlements?.[key];
  if(!Number.isSafeInteger(limit)||limit<0)throw commercialError('USAGE_LIMIT_UNAVAILABLE',503,{metric});
  return limit;
}

export async function reserveUsage({store,organizationId,metric,units=1,idempotencyKey,entitlements,now=new Date()}={}){
  if(!store||typeof store.transaction!=='function')throw commercialError('USAGE_STORE_NOT_CONFIGURED',503);
  const org=requireText(organizationId,'ORGANIZATION_REQUIRED');
  const metricName=requireText(metric,'USAGE_METRIC_REQUIRED');
  const key=requireText(idempotencyKey,'IDEMPOTENCY_KEY_REQUIRED');
  const count=positiveUnits(units);
  const limitUnits=metricLimit(metricName,entitlements);
  const {start,end}=monthWindow(now);

  return store.transaction(async tx=>{
    const replay=await tx.getUsageReservation(org,metricName,key);
    if(replay)return replay;

    const bucket=await tx.getOrCreateUsageBucketForUpdate({organizationId:org,metric:metricName,windowStart:start,windowEnd:end,limitUnits});
    if(!bucket)throw commercialError('USAGE_BUCKET_UNAVAILABLE',503);
    const used=Number(bucket.usedUnits??0),reserved=Number(bucket.reservedUnits??0);
    const effectiveLimit=Math.min(Number(bucket.limitUnits??limitUnits),limitUnits);
    if(!Number.isSafeInteger(used)||!Number.isSafeInteger(reserved)||!Number.isSafeInteger(effectiveLimit)||used<0||reserved<0||effectiveLimit<0)throw commercialError('USAGE_BUCKET_CORRUPT',500);
    if(used+reserved+count>effectiveLimit)throw commercialError('QUOTA_EXCEEDED',429,{metric:metricName,limit:effectiveLimit,used,reserved});

    const inserted=await tx.insertUsageReservation({organizationId:org,metric:metricName,idempotencyKey:key,bucketId:bucket.id,units:count,state:'RESERVED',outcome:null,metadata:{}});
    if(!inserted){
      const concurrentReplay=await tx.getUsageReservation(org,metricName,key);
      if(concurrentReplay)return concurrentReplay;
      throw commercialError('USAGE_RESERVATION_CONFLICT',409);
    }
    await tx.updateUsageBucket(bucket.id,{usedUnits:used,reservedUnits:reserved+count});
    return inserted;
  });
}

async function finalize({store,reservationId,targetState,outcome,metadata={},reason=null}){
  if(!store||typeof store.transaction!=='function')throw commercialError('USAGE_STORE_NOT_CONFIGURED',503);
  const id=requireText(reservationId,'RESERVATION_REQUIRED');
  return store.transaction(async tx=>{
    const reservation=await tx.getUsageReservationByIdForUpdate(id);
    if(!reservation)throw commercialError('USAGE_RESERVATION_NOT_FOUND',404);
    if(reservation.state===targetState)return reservation;
    if(reservation.state!=='RESERVED')return reservation;
    const bucket=await tx.getUsageBucketByIdForUpdate(reservation.bucketId);
    if(!bucket)throw commercialError('USAGE_BUCKET_UNAVAILABLE',503);
    const units=positiveUnits(Number(reservation.units));
    const used=Number(bucket.usedUnits??0),reserved=Number(bucket.reservedUnits??0);
    if(reserved<units)throw commercialError('USAGE_BUCKET_CORRUPT',500);
    const now=new Date().toISOString();
    if(targetState==='COMMITTED'){
      await tx.updateUsageBucket(bucket.id,{usedUnits:used+units,reservedUnits:reserved-units});
      await tx.insertUsageEvent({organizationId:reservation.organizationId,reservationId:reservation.id,metric:reservation.metric,units,outcome:String(outcome||'COMPLETED'),metadata});
      return tx.updateUsageReservation(reservation.id,{state:'COMMITTED',outcome:String(outcome||'COMPLETED'),metadata,finalizedAt:now});
    }
    await tx.updateUsageBucket(bucket.id,{usedUnits:used,reservedUnits:reserved-units});
    return tx.updateUsageReservation(reservation.id,{state:'RELEASED',outcome:String(reason||'RELEASED'),metadata,finalizedAt:now});
  });
}

export function commitUsage({store,reservationId,outcome='COMPLETED',metadata={}}={}){
  return finalize({store,reservationId,targetState:'COMMITTED',outcome,metadata});
}

export function releaseUsage({store,reservationId,reason='KATA_INTERNAL_FAILURE',metadata={}}={}){
  return finalize({store,reservationId,targetState:'RELEASED',reason,metadata});
}

export async function getUsageSummary({store,organizationId,windowStart}={}){
  if(!store||typeof store.getUsageSummary!=='function')throw commercialError('USAGE_STORE_NOT_CONFIGURED',503);
  return store.getUsageSummary(requireText(organizationId,'ORGANIZATION_REQUIRED'),windowStart??null);
}

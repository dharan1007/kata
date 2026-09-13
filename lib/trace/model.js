import {EFFECT_CLASSES} from '../kir/model.js';

export const TRACE_VERSION=1;
export const TRACE_SOURCES=new Set(['BROWSER','HTTP','MCP','KATA_COMMAND','USER','SYSTEM']);
export const TRACE_EVENT_KINDS=new Set(['TRACE_STARTED','OBSERVATION','ACTION_REQUESTED','ACTION_STARTED','ACTION_COMPLETED','ACTION_FAILED','EFFECT_PREPARED','EFFECT_CONFIRMED','EFFECT_UNCERTAIN','CHECKPOINT','TRACE_COMPLETED']);

const ID=/^[A-Za-z][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST=/^sha256:[a-f0-9]{64}$/;
const TERMINAL_KINDS=new Set(['TRACE_COMPLETED']);
const TRACE_KEYS=new Set(['traceVersion','id','source','startedAt','events','metadata']);
const EVENT_KEYS=new Set(['id','seq','kind','at','parents','payload']);
const SOURCE_KEYS=new Set(['kind','authority','principal','session']);
const MAX_EVENTS=100_000;
const MAX_PARENTS=128;
const MAX_JSON_DEPTH=64;
const MAX_ARRAY_ITEMS=100_000;
const MAX_STRING_BYTES=4_000_000;
const SENSITIVE_KEYS=new Set(['authorization','proxy-authorization','cookie','set-cookie','credentialsecret','rawsecret']);

function fail(code,detail=''){
  const error=new Error(detail?`${code}: ${detail}`:code);
  error.code=code;
  throw error;
}

function plain(value){
  if(value===null||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  return proto===Object.prototype||proto===null;
}

function ownKeysOnly(value,allowed,code){for(const key of Object.keys(value))if(!allowed.has(key))fail(code,key);}
function validTime(value){if(typeof value!=='string'||value.length>64)return false;const ms=Date.parse(value);return Number.isFinite(ms)&&new Date(ms).toISOString()===value;}
function boundedString(value,max,code){if(typeof value!=='string'||!value||Buffer.byteLength(value,'utf8')>max)fail(code);return value;}

function assertSafeJson(value,depth=0,seen=new Set(),key=''){
  if(depth>MAX_JSON_DEPTH)fail('TRACE_JSON_DEPTH_EXCEEDED');
  if(value===null||typeof value==='boolean')return;
  if(typeof value==='string'){
    if(Buffer.byteLength(value,'utf8')>MAX_STRING_BYTES)fail('TRACE_JSON_STRING_TOO_LARGE');
    return;
  }
  if(typeof value==='number'){
    if(!Number.isFinite(value))fail('TRACE_NON_FINITE_NUMBER');
    return;
  }
  if(typeof value!=='object')fail('TRACE_NON_JSON_VALUE');
  if(seen.has(value))fail('TRACE_CYCLIC_VALUE');
  seen.add(value);
  if(Array.isArray(value)){
    if(value.length>MAX_ARRAY_ITEMS)fail('TRACE_JSON_ARRAY_TOO_LARGE');
    for(const item of value)assertSafeJson(item,depth+1,seen,key);
  }else{
    if(!plain(value))fail('TRACE_NON_PLAIN_OBJECT');
    for(const [childKey,item] of Object.entries(value)){
      boundedString(childKey,1024,'TRACE_OBJECT_KEY_INVALID');
      if(SENSITIVE_KEYS.has(childKey.toLowerCase()))fail('TRACE_SENSITIVE_FIELD_FORBIDDEN',childKey);
      assertSafeJson(item,depth+1,seen,childKey);
    }
  }
  seen.delete(value);
}

function validateSource(source){
  if(!plain(source))fail('TRACE_SOURCE_REQUIRED');
  ownKeysOnly(source,SOURCE_KEYS,'TRACE_UNKNOWN_SOURCE_FIELD');
  if(!TRACE_SOURCES.has(source.kind))fail('TRACE_SOURCE_INVALID');
  boundedString(source.authority,128,'TRACE_AUTHORITY_REQUIRED');
  if(source.principal!==undefined)boundedString(source.principal,512,'TRACE_PRINCIPAL_INVALID');
  if(source.session!==undefined)boundedString(source.session,512,'TRACE_SESSION_INVALID');
}

function validateEffect(kind,effect){
  if(!plain(effect))fail('TRACE_EFFECT_REQUIRED');
  if(!EFFECT_CLASSES.has(effect.class))fail('TRACE_EFFECT_CLASS_INVALID');
  if(typeof effect.operationId!=='string'||!effect.operationId||effect.operationId.length>256||typeof effect.targetIdentity!=='string'||!effect.targetIdentity||effect.targetIdentity.length>2048)fail('TRACE_EFFECT_IDENTITY_REQUIRED');
  if(effect.inputDigest!==undefined&&!DIGEST.test(effect.inputDigest))fail('TRACE_EFFECT_DIGEST_INVALID');
  if(effect.resultDigest!==undefined&&!DIGEST.test(effect.resultDigest))fail('TRACE_EFFECT_DIGEST_INVALID');
  if(kind==='EFFECT_PREPARED'&&!DIGEST.test(effect.inputDigest??''))fail('TRACE_EFFECT_INPUT_DIGEST_REQUIRED');
  if(kind==='EFFECT_UNCERTAIN')boundedString(effect.reason,512,'TRACE_EFFECT_UNCERTAINTY_REASON_REQUIRED');
  assertSafeJson(effect);
}

function validateEventShape(event,index,ids){
  if(!plain(event))fail('TRACE_EVENT_INVALID');
  ownKeysOnly(event,EVENT_KEYS,'TRACE_UNKNOWN_EVENT_FIELD');
  if(typeof event.id!=='string'||!ID.test(event.id))fail('TRACE_EVENT_ID_INVALID');
  if(ids.has(event.id))fail('TRACE_DUPLICATE_EVENT_ID',event.id);
  ids.add(event.id);
  if(event.seq!==index+1)fail('TRACE_SEQUENCE_INVALID');
  if(!TRACE_EVENT_KINDS.has(event.kind))fail('TRACE_EVENT_KIND_INVALID');
  if(!validTime(event.at))fail('TRACE_EVENT_TIME_INVALID');
  if(!Array.isArray(event.parents)||event.parents.length>MAX_PARENTS)fail('TRACE_PARENTS_INVALID');
  const parents=new Set();
  for(const parent of event.parents){if(typeof parent!=='string'||!ID.test(parent))fail('TRACE_PARENT_ID_INVALID');if(parents.has(parent))fail('TRACE_DUPLICATE_PARENT');parents.add(parent);}
  if(!plain(event.payload))fail('TRACE_PAYLOAD_INVALID');
  assertSafeJson(event.payload);
  if(event.kind.startsWith('EFFECT_'))validateEffect(event.kind,event.payload.effect);
  if(event.kind==='TRACE_COMPLETED'&&!['success','failed','cancelled','blocked'].includes(event.payload.status))fail('TRACE_COMPLETION_STATUS_INVALID');
}

function validateCausality(events,ids){
  const outgoing=new Map([...ids].map(id=>[id,[]]));
  const indegree=new Map([...ids].map(id=>[id,0]));
  for(const event of events){
    for(const parent of event.parents){
      if(!ids.has(parent))fail('TRACE_UNKNOWN_PARENT',parent);
      outgoing.get(parent).push(event.id);
      indegree.set(event.id,indegree.get(event.id)+1);
    }
  }
  const queue=[];
  for(const [id,count] of indegree)if(count===0)queue.push(id);
  let visited=0;
  for(let i=0;i<queue.length;i++){
    const id=queue[i];visited++;
    for(const child of outgoing.get(id)){const n=indegree.get(child)-1;indegree.set(child,n);if(n===0)queue.push(child);}
  }
  if(visited!==events.length)fail('TRACE_CAUSAL_CYCLE');
}

export function validateTrace(trace){
  if(!plain(trace))fail('TRACE_INVALID');
  ownKeysOnly(trace,TRACE_KEYS,'TRACE_UNKNOWN_FIELD');
  if(trace.traceVersion!==TRACE_VERSION)fail('TRACE_VERSION_UNSUPPORTED');
  if(typeof trace.id!=='string'||!ID.test(trace.id))fail('TRACE_ID_INVALID');
  validateSource(trace.source);
  if(!validTime(trace.startedAt))fail('TRACE_STARTED_AT_INVALID');
  if(!Array.isArray(trace.events)||trace.events.length>MAX_EVENTS)fail('TRACE_EVENTS_INVALID');
  if(trace.metadata!==undefined)assertSafeJson(trace.metadata);
  const ids=new Set();
  let terminalIndex=-1;
  for(let i=0;i<trace.events.length;i++){
    const event=trace.events[i];
    validateEventShape(event,i,ids);
    if(TERMINAL_KINDS.has(event.kind)){
      if(terminalIndex!==-1)fail('TRACE_MULTIPLE_TERMINALS');
      terminalIndex=i;
    }
  }
  validateCausality(trace.events,ids);
  if(terminalIndex!==-1&&terminalIndex!==trace.events.length-1)fail('TRACE_TERMINAL_NOT_LAST');
  return true;
}

export function createTrace({id,source,startedAt,metadata={}}){
  const trace={traceVersion:TRACE_VERSION,id,source:structuredClone(source),startedAt,events:[],metadata:structuredClone(metadata)};
  validateTrace(trace);
  return trace;
}

export function appendTraceEvent(trace,event){
  validateTrace(trace);
  if(trace.events.some(item=>TERMINAL_KINDS.has(item.kind)))fail('TRACE_TERMINAL');
  if(!plain(event))fail('TRACE_EVENT_INVALID');
  if(trace.events.some(item=>item.id===event.id))fail('TRACE_DUPLICATE_EVENT_ID',String(event.id));
  const known=new Set(trace.events.map(item=>item.id));
  for(const parent of event.parents??[])if(!known.has(parent))fail('TRACE_UNKNOWN_PARENT',String(parent));
  const next=structuredClone(trace);
  next.events.push({...structuredClone(event),seq:next.events.length+1});
  validateTrace(next);
  return next;
}

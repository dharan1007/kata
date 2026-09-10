const TRACEPARENT_MAX_BYTES=512;
const TRACESTATE_MAX_BYTES=512;
const TRACESTATE_MAX_MEMBERS=32;
const BAGGAGE_MAX_BYTES=8192;
const BAGGAGE_MAX_MEMBERS=64;
const TRACE_ID_ZERO='00000000000000000000000000000000';
const PARENT_ID_ZERO='0000000000000000';
const TOKEN=/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const SIMPLE_TRACE_KEY=/^[a-z][a-z0-9_\-*\/]{0,255}$/;
const TENANT_TRACE_KEY=/^[a-z0-9][a-z0-9_\-*\/]{0,240}$/;
const SYSTEM_TRACE_KEY=/^[a-z][a-z0-9_\-*\/]{0,13}$/;
const TRACE_VALUE=/^[\x20-\x2B\x2D-\x3C\x3E-\x7E]{0,255}[\x21-\x2B\x2D-\x3C\x3E-\x7E]$/;
const BAGGAGE_VALUE=/^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/;
const TRACE_FIELDS=['traceparent','tracestate','baggage'];
const hasOwn=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const trimOws=value=>value.replace(/^[ \t]+|[ \t]+$/g,'');
const byteLength=value=>new TextEncoder().encode(String(value)).length;

function validTraceparent(value){
  if(typeof value!=='string'||byteLength(value)>TRACEPARENT_MAX_BYTES||value.length<55)return false;
  const match=/^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})/.exec(value);
  if(!match)return false;
  const [,version,traceId,parentId]=match;
  if(version==='ff'||traceId===TRACE_ID_ZERO||parentId===PARENT_ID_ZERO)return false;
  if(version==='00')return value.length===55;
  return value.length===55||value[55]==='-';
}

function validTraceKey(key){
  if(SIMPLE_TRACE_KEY.test(key))return true;
  const at=key.indexOf('@');
  if(at<=0||at!==key.lastIndexOf('@'))return false;
  return TENANT_TRACE_KEY.test(key.slice(0,at))&&SYSTEM_TRACE_KEY.test(key.slice(at+1));
}

function validTracestate(value){
  if(typeof value!=='string'||byteLength(value)>TRACESTATE_MAX_BYTES)return false;
  const members=value.split(',');
  if(members.length>TRACESTATE_MAX_MEMBERS)return false;
  const keys=new Set();
  for(const rawMember of members){
    const member=trimOws(rawMember);
    if(!member)continue;
    const separator=member.indexOf('=');
    if(separator<=0||separator!==member.lastIndexOf('='))return false;
    const key=member.slice(0,separator);
    const memberValue=member.slice(separator+1);
    if(!validTraceKey(key)||!TRACE_VALUE.test(memberValue)||keys.has(key))return false;
    keys.add(key);
  }
  return true;
}

function validBaggagePair(segment,{valueRequired=true}={}){
  const pair=trimOws(segment);
  if(!pair)return false;
  const separator=pair.indexOf('=');
  if(separator<0)return !valueRequired&&TOKEN.test(pair);
  const key=trimOws(pair.slice(0,separator));
  const value=trimOws(pair.slice(separator+1));
  return TOKEN.test(key)&&BAGGAGE_VALUE.test(value);
}

function validBaggage(value){
  if(typeof value!=='string'||byteLength(value)>BAGGAGE_MAX_BYTES)return false;
  const members=value.split(',');
  if(!members.length||members.length>BAGGAGE_MAX_MEMBERS)return false;
  for(const rawMember of members){
    const parts=rawMember.split(';');
    if(!validBaggagePair(parts[0]))return false;
    for(let index=1;index<parts.length;index++)if(!validBaggagePair(parts[index],{valueRequired:false}))return false;
  }
  return true;
}

export function invalidMcpTraceContextField(meta){
  if(!meta||typeof meta!=='object'||Array.isArray(meta))return null;
  if(hasOwn(meta,'traceparent')&&!validTraceparent(meta.traceparent))return'traceparent';
  if(hasOwn(meta,'tracestate')){
    if(!hasOwn(meta,'traceparent')||!validTracestate(meta.tracestate))return'tracestate';
  }
  if(hasOwn(meta,'baggage')&&!validBaggage(meta.baggage))return'baggage';
  return null;
}

export function normalizeMcpTraceContext(raw){
  if(raw===undefined||raw===null)return null;
  if(typeof raw!=='object'||Array.isArray(raw))throw new TypeError('Invalid MCP trace context.');
  const normalized={};
  for(const field of TRACE_FIELDS)if(hasOwn(raw,field))normalized[field]=raw[field];
  const invalid=invalidMcpTraceContextField(normalized);
  if(invalid)throw new TypeError(`Invalid MCP trace context: ${invalid}.`);
  return Object.keys(normalized).length?normalized:null;
}

export function mcpTraceId(traceContext){
  const traceparent=traceContext?.traceparent;
  if(typeof traceparent!=='string'||!validTraceparent(traceparent))return null;
  return traceparent.slice(3,35);
}

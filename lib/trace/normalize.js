import {TRACE_SOURCES} from './model.js';

const SEMANTIC_ID=/^[A-Za-z][A-Za-z0-9_.:-]{0,191}$/;

function fail(code){const error=new Error(code);error.code=code;throw error;}
function plain(value){if(value===null||typeof value!=='object'||Array.isArray(value))return false;const p=Object.getPrototypeOf(value);return p===Object.prototype||p===null;}
function safeJson(value,depth=0){
  if(depth>64)fail('TRACE_NORMALIZE_DEPTH_EXCEEDED');
  if(value===null||typeof value==='string'||typeof value==='boolean')return structuredClone(value);
  if(typeof value==='number'){if(!Number.isFinite(value))fail('TRACE_NORMALIZE_NON_FINITE');return value;}
  if(Array.isArray(value))return value.map(item=>safeJson(item,depth+1));
  if(!plain(value))fail('TRACE_NORMALIZE_NON_JSON');
  const out={};for(const key of Object.keys(value).sort())out[key]=safeJson(value[key],depth+1);return out;
}

export function normalizeOperationEvent(input){
  if(!plain(input)||!TRACE_SOURCES.has(input.source))fail('TRACE_NORMALIZE_SOURCE_INVALID');
  if(typeof input.semanticId!=='string'||!SEMANTIC_ID.test(input.semanticId))fail('TRACE_NORMALIZE_SEMANTIC_ID_INVALID');
  if(typeof input.target!=='string'||!input.target||input.target.length>2048)fail('TRACE_NORMALIZE_TARGET_INVALID');
  const operation={semanticId:input.semanticId,target:input.target,input:safeJson(input.input??{})};
  return {
    source:{kind:input.source,authority:typeof input.authority==='string'&&input.authority?input.authority:'observed'},
    operation,
    evidence:safeJson(input.evidence??{}),
  };
}

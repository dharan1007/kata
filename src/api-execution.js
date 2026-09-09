import {previewOpenApiRequest} from './api-adapter.js';
import {assertSchema} from '../lib/shared/schema.js';

const SAFE_METHODS=new Set(['GET','HEAD','OPTIONS']);
const FORBIDDEN_BROWSER_METHODS=new Set(['CONNECT','TRACE','TRACK']);
const FORBIDDEN_HEADERS=new Set(['authorization','cookie','proxy-authorization','set-cookie','host','content-length','origin','referer']);
const DEFAULT_TIMEOUT_MS=15000;
const MAX_TIMEOUT_MS=15000;
const DEFAULT_RESPONSE_BYTES=1024*1024;
const MAX_RESPONSE_BYTES=1024*1024;
const MAX_REQUEST_BODY_BYTES=256*1024;
const MAX_REQUEST_URL_BYTES=16*1024;
const MAX_REQUEST_HEADER_BYTES=32*1024;
const EXECUTABLE_SCHEMA_KEYS=new Set(['type','enum','properties','required','additionalProperties','items','minItems','maxItems','minLength','maxLength','pattern','minimum','maximum','title','description','default','examples','example','format','deprecated','readOnly','writeOnly']);

function boundedInt(value,fallback,min,max){const n=Number(value);return Number.isInteger(n)?Math.max(min,Math.min(max,n)):fallback;}
function safeHttpUrl(raw){try{const url=new URL(String(raw));if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;url.hash='';return url;}catch{return null;}}
function canonicalize(value){if(value===null||typeof value==='string'||typeof value==='boolean')return value;if(typeof value==='number'){if(!Number.isFinite(value))throw new TypeError('Execution preview contains a non-finite number');return value;}if(Array.isArray(value))return value.map(canonicalize);if(value&&typeof value==='object'){const out={};for(const key of Object.keys(value).sort())out[key]=canonicalize(value[key]);return out;}throw new TypeError('Execution preview contains a non-JSON value');}
function sanitizeHeaders(headers){const out={};for(const [name,value] of Object.entries(headers??{})){const lower=String(name).toLowerCase();if(FORBIDDEN_HEADERS.has(lower)||lower.startsWith('proxy-')||lower.startsWith('sec-'))throw new TypeError(`Credential or transport header is not executable: ${name}`);out[name]=String(value);}return out;}
function assertExecutableSchemaSubset(schema,path='$'){if(!schema||typeof schema!=='object'||Array.isArray(schema))throw new TypeError(`Execution schema is not enforceable at ${path}`);for(const key of Object.keys(schema))if(!EXECUTABLE_SCHEMA_KEYS.has(key))throw new TypeError(`Execution schema keyword is not supported at ${path}: ${key}`);if(Array.isArray(schema.type))throw new TypeError(`Union types are not supported for execution at ${path}`);if(schema.additionalProperties!==undefined&&typeof schema.additionalProperties!=='boolean')throw new TypeError(`Schema-valued additionalProperties is not supported for execution at ${path}`);if(schema.properties!==undefined){if(!schema.properties||typeof schema.properties!=='object'||Array.isArray(schema.properties))throw new TypeError(`Invalid properties schema at ${path}`);for(const [name,child] of Object.entries(schema.properties))assertExecutableSchemaSubset(child,`${path}.properties.${name}`);}if(schema.items!==undefined)assertExecutableSchemaSubset(schema.items,`${path}.items`);}
function utf8Bytes(value){return new TextEncoder().encode(String(value??'')).length;}
function assertRequestBudgets(url,headers,body){if(utf8Bytes(url)>MAX_REQUEST_URL_BYTES)throw new TypeError('API request URL is too large for bounded execution');let headerBytes=0;for(const [name,value] of Object.entries(headers??{}))headerBytes+=utf8Bytes(name)+utf8Bytes(value)+4;if(headerBytes>MAX_REQUEST_HEADER_BYTES)throw new TypeError('API request headers are too large for bounded execution');if(body!==null&&body!==undefined&&utf8Bytes(body)>MAX_REQUEST_BODY_BYTES)throw new TypeError('API request body is too large for bounded execution');}
function descriptorBinding(descriptor,transport){return canonicalize({credentialId:descriptor.credentialId,revision:descriptor.revision,origin:descriptor.origin,kind:descriptor.kind,schemeName:descriptor.schemeName??null,location:descriptor.location??null,parameterName:descriptor.parameterName??null,scopes:Array.isArray(descriptor.scopes)?descriptor.scopes:[],transport});}
function scopesCover(descriptorScopes,requiredScopes){const have=new Set(Array.isArray(descriptorScopes)?descriptorScopes:[]);return (Array.isArray(requiredScopes)?requiredScopes:[]).every(scope=>have.has(scope));}
function brokerBindingFor(item,scheme,inventory,targetOrigin){
  if(!scheme||!item||typeof item.name!=='string')return null;
  const requiredScopes=Array.isArray(item.scopes)?item.scopes:[];
  if(scheme.type==='apiKey'&&(scheme.in==='header'||scheme.in==='query')){
    const parameterName=scheme.parameterName??scheme.apiKeyName??scheme.keyName??null;if(typeof parameterName!=='string'||!parameterName)return null;
    const descriptor=inventory.find(row=>row?.origin===targetOrigin&&row?.kind==='api-key'&&row?.schemeName===item.name&&row?.location===scheme.in&&row?.parameterName===parameterName);
    return descriptor?descriptorBinding(descriptor,scheme.in):null;
  }
  const bearerCompatible=(scheme.type==='http'&&String(scheme.scheme??'').toLowerCase()==='bearer')||scheme.type==='oauth2'||scheme.type==='openIdConnect';
  if(bearerCompatible){
    const descriptor=inventory.find(row=>row?.origin===targetOrigin&&row?.kind==='bearer-token'&&row?.schemeName===item.name&&scopesCover(row?.scopes,requiredScopes));
    return descriptor?descriptorBinding(descriptor,'bearer'):null;
  }
  return null;
}
function authorizationPlan(request,inventory,targetOrigin){
  const requirements=Array.isArray(request?.securityRequirements)?request.securityRequirements:[];
  const schemeMap=new Map((Array.isArray(request?.securitySchemes)?request.securitySchemes:[]).filter(scheme=>scheme&&typeof scheme.name==='string').map(scheme=>[scheme.name,scheme]));
  const descriptors=Array.isArray(inventory)?inventory.filter(row=>row&&typeof row==='object'):[];
  if(requirements.length===0||requirements.some(requirement=>Array.isArray(requirement)&&requirement.length===0))return{requiresAuthorization:false,credentialMode:'omit',authorizationStrategy:'anonymous',selectedSecurityRequirement:[],credentialBindings:[]};
  for(const requirement of requirements){
    if(!Array.isArray(requirement)||!requirement.length)continue;
    let supported=true,usesCookie=false;const credentialBindings=[];
    for(const item of requirement){
      const scheme=schemeMap.get(item?.name);
      if(scheme?.type==='apiKey'&&scheme.in==='cookie'){usesCookie=true;continue;}
      const binding=brokerBindingFor(item,scheme,descriptors,targetOrigin);
      if(!binding){supported=false;break;}
      credentialBindings.push(binding);
    }
    if(!supported)continue;
    return{requiresAuthorization:true,credentialMode:usesCookie?'same-origin':'omit',authorizationStrategy:usesCookie?(credentialBindings.length?'browser-cookie+brokered':'browser-cookie'):'brokered',selectedSecurityRequirement:canonicalize(requirement),credentialBindings:canonicalize(credentialBindings)};
  }
  return{requiresAuthorization:true,credentialMode:'omit',authorizationStrategy:'unsupported-browser-managed',selectedSecurityRequirement:null,credentialBindings:[]};
}

export function buildAuthorizedExecutionPreview(candidate,args,pageOrigin,options={}){
  assertExecutableSchemaSubset(candidate?.inputSchema??null);
  try{assertSchema(candidate.inputSchema,args);}catch(error){const details=Array.isArray(error?.details)&&error.details.length?`: ${error.details.join('; ')}`:'';throw new TypeError(`Invalid API execution arguments${details}`);}
  const page=safeHttpUrl(pageOrigin),request=previewOpenApiRequest(candidate,args);if(!page)throw new TypeError('A valid HTTP(S) page origin is required');
  const target=safeHttpUrl(request.url);if(!target)throw new TypeError('Candidate request URL is invalid');
  const method=String(request.method??'').toUpperCase(),sameOrigin=target.origin===page.origin,unsupportedMethod=FORBIDDEN_BROWSER_METHODS.has(method)||!method||/\s/.test(method),auth=authorizationPlan(request,options.credentialInventory,target.origin);
  const timeoutMs=boundedInt(options.timeoutMs,DEFAULT_TIMEOUT_MS,250,MAX_TIMEOUT_MS),maxResponseBytes=boundedInt(options.maxResponseBytes,DEFAULT_RESPONSE_BYTES,1,MAX_RESPONSE_BYTES);
  const headers=sanitizeHeaders(request.headers);assertRequestBudgets(target.href,headers,request.body??null);
  const blockedReason=!sameOrigin?'same_origin_required':unsupportedMethod?'unsupported_browser_method':auth.authorizationStrategy==='unsupported-browser-managed'?'authorization_setup_required':null;
  return{operationName:candidate.name,method,url:target.href,headers,body:request.body??null,security:[...(request.security??[])],securityRequirements:canonicalize(request.securityRequirements??[]),securitySchemes:canonicalize(request.securitySchemes??[]),requiresAuthorization:auth.requiresAuthorization,credentialMode:auth.credentialMode,authorizationStrategy:auth.authorizationStrategy,selectedSecurityRequirement:auth.selectedSecurityRequirement,credentialBindings:auth.credentialBindings,streamingMedia:[...(request.streamingMedia??[])],sameOrigin,stateChanging:!SAFE_METHODS.has(method),redirect:'error',cache:'no-store',timeoutMs,maxResponseBytes,readyToExecute:blockedReason===null,blockedReason};
}

export async function fingerprintExecutionPreview(preview,cryptoImpl=globalThis.crypto){if(!cryptoImpl?.subtle?.digest)throw new Error('Web Crypto SHA-256 is unavailable');const serialized=JSON.stringify(canonicalize(preview));const bytes=new TextEncoder().encode(serialized),digest=await cryptoImpl.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
export function executionRequestFromPreview(preview){
  if(!preview?.readyToExecute)throw new Error(`API request is not executable: ${preview?.blockedReason??'policy_blocked'}`);
  const strategy=preview.authorizationStrategy,bindings=canonicalize(preview.credentialBindings??[]);
  if((strategy==='browser-cookie'||strategy==='browser-cookie+brokered')&&preview.credentialMode!=='same-origin')throw new Error('Browser-cookie authorization requires same-origin credentials');
  if((strategy==='anonymous'||strategy==='brokered')&&preview.credentialMode!=='omit')throw new Error('Ambient browser credentials are not authorized by this API preview');
  if(!['anonymous','browser-cookie','brokered','browser-cookie+brokered'].includes(strategy))throw new Error('API authorization strategy is not executable');
  if(strategy.includes('brokered')&&!bindings.length)throw new Error('Brokered API authorization requires credential bindings');
  return{method:preview.method,url:preview.url,headers:{...(preview.headers??{})},body:preview.body??null,credentials:preview.credentialMode,credentialBindings:bindings,redirect:'error',cache:'no-store',timeoutMs:preview.timeoutMs,maxResponseBytes:preview.maxResponseBytes};
}

export async function executePageApiRequest(request,runtime={}){
  const scope=runtime&&typeof runtime==='object'?runtime:{};
  const currentOrigin=scope.location?.origin??globalThis.location?.origin;
  let page,target;
  try{page=new URL(String(currentOrigin));target=new URL(String(request?.url));}catch{throw new TypeError('A valid page and request URL are required');}
  if(!['http:','https:'].includes(target.protocol)||target.username||target.password)throw new TypeError('API execution requires a safe HTTP(S) URL');
  if(target.origin!==page.origin)throw new Error('API execution is restricted to the active page same-origin boundary');
  const publicUrl=target.href;
  const method=String(request?.method??'').toUpperCase();
  if(!method||/\s/.test(method)||['CONNECT','TRACE','TRACK'].includes(method))throw new TypeError('Unsupported browser HTTP method');
  const credentials=request?.credentials==='same-origin'?'same-origin':request?.credentials==='omit'?'omit':null;
  if(!credentials)throw new TypeError('Unsupported credential mode');
  if(request?.redirect!=='error')throw new TypeError('Redirects must remain disabled for API execution');
  const timeoutMs=Math.max(250,Math.min(15000,Number.isInteger(request?.timeoutMs)?request.timeoutMs:15000));
  const maxResponseBytes=Math.max(1,Math.min(1024*1024,Number.isInteger(request?.maxResponseBytes)?request.maxResponseBytes:1024*1024));
  const headers={};
  for(const [name,value] of Object.entries(request?.headers??{})){
    const lower=String(name).toLowerCase();
    if(['authorization','cookie','proxy-authorization','set-cookie','host','content-length','origin','referer'].includes(lower)||lower.startsWith('proxy-')||lower.startsWith('sec-'))throw new TypeError(`Credential or transport header is not executable: ${name}`);
    headers[name]=String(value);
  }
  const secretValues=[];
  const bindings=Array.isArray(request?.credentialBindings)?request.credentialBindings:[];
  if(bindings.length){
    const resolveCredential=scope.resolveCredential;
    if(typeof resolveCredential!=='function')throw new Error('Session authorization is unavailable.');
    for(const binding of bindings){
      if(!binding||typeof binding!=='object'||binding.origin!==target.origin)throw new Error('Credential binding origin is invalid.');
      const resolved=await resolveCredential(binding);
      if(!resolved||typeof resolved!=='object'||resolved.credentialId!==binding.credentialId||resolved.revision!==binding.revision||resolved.origin!==binding.origin||resolved.kind!==binding.kind||resolved.schemeName!==binding.schemeName)throw new Error('Credential binding no longer matches the approved preview.');
      if(typeof resolved.secret!=='string'||!resolved.secret)throw new Error('Credential secret is unavailable.');
      const Encoder=scope.TextEncoder??globalThis.TextEncoder;if(new Encoder().encode(resolved.secret).length>16384)throw new Error('Credential secret exceeds the session execution bound.');
      secretValues.push(resolved.secret);
      if(binding.transport==='bearer'){
        if(binding.kind!=='bearer-token')throw new Error('Bearer credential binding kind is invalid.');
        if(headers.Authorization!==undefined)throw new Error('Multiple authorization values are not permitted.');
        headers.Authorization=`Bearer ${resolved.secret}`;
      }else if(binding.transport==='header'){
        if(binding.kind!=='api-key'||binding.location!=='header'||resolved.location!=='header'||resolved.parameterName!==binding.parameterName)throw new Error('API-key header binding no longer matches the approved preview.');
        const name=String(binding.parameterName??''),lower=name.toLowerCase();
        if(!name||['authorization','cookie','proxy-authorization','set-cookie','host','content-length','origin','referer'].includes(lower)||lower.startsWith('proxy-')||lower.startsWith('sec-'))throw new Error('API-key header binding targets a forbidden transport header.');
        if(Object.keys(headers).some(existing=>existing.toLowerCase()===lower))throw new Error('API-key header binding collides with an existing request header.');
        headers[name]=resolved.secret;
      }else if(binding.transport==='query'){
        if(binding.kind!=='api-key'||binding.location!=='query'||resolved.location!=='query'||resolved.parameterName!==binding.parameterName)throw new Error('API-key query binding no longer matches the approved preview.');
        const name=String(binding.parameterName??'');if(!name)throw new Error('API-key query parameter is invalid.');
        target.searchParams.set(name,resolved.secret);
      }else throw new Error('Credential transport is not supported.');
    }
  }
  const body=(method==='GET'||method==='HEAD')?null:(request?.body??null);
  const Encoder=scope.TextEncoder??globalThis.TextEncoder;
  let headerBytes=0;
  for(const [name,value] of Object.entries(headers))headerBytes+=new Encoder().encode(`${name}: ${value}\r\n`).length;
  if(new Encoder().encode(target.href).length>16384||headerBytes>32768||(body!==null&&new Encoder().encode(String(body)).length>262144))throw new TypeError('API request exceeds bounded execution limits');

  const fetchImpl=scope.fetch??globalThis.fetch;
  if(typeof fetchImpl!=='function')throw new Error('Browser fetch is unavailable');
  const AbortControllerImpl=scope.AbortController??globalThis.AbortController;
  if(typeof AbortControllerImpl!=='function')throw new Error('AbortController is unavailable');
  const setTimer=scope.setTimeout??globalThis.setTimeout;
  const clearTimer=scope.clearTimeout??globalThis.clearTimeout;
  const now=()=>scope.performance?.now?.()??globalThis.performance?.now?.()??Date.now();
  const redactError=value=>{let text=String(value??'');for(const secret of secretValues)if(secret)text=text.split(secret).join('[redacted]');text=text.split(target.href).join(publicUrl);return text;};
  const started=now();
  const controller=new AbortControllerImpl();
  let timedOut=false;
  let reader=null;
  const timer=setTimer(()=>{
    timedOut=true;
    try{controller.abort(new Error('KATA_API_TIMEOUT'));}catch{controller.abort();}
  },timeoutMs);

  let response=null;
  let contentType=null;
  let bytes=0;
  try{
    try{
      response=await fetchImpl(target.href,{method,headers,body:body??undefined,credentials,redirect:'error',cache:'no-store',signal:controller.signal});
    }catch(error){
      return{ok:false,status:null,statusText:null,url:publicUrl,contentType:null,bytes:0,bodyText:null,truncated:false,outcome:'unknown',networkError:timedOut?'timeout':redactError(error?.message??error),durationMs:Math.max(0,now()-started)};
    }

    const finalUrl=new URL(String(response?.url||target.href),target.href);
    if(finalUrl.origin!==page.origin)throw new Error('API response escaped the active page same-origin boundary');
    contentType=String(response?.headers?.get?.('content-type')??'')||null;
    const declaredLength=Number(response?.headers?.get?.('content-length'));
    const textual=/^(?:text\/)|json|xml|javascript|x-www-form-urlencoded/i.test(contentType??'');
    let bodyText=null;
    let truncated=false;

    if(Number.isFinite(declaredLength)&&declaredLength>maxResponseBytes){
      truncated=true;
      try{await response?.body?.cancel?.('KATA_RESPONSE_LIMIT');}catch{}
      try{controller.abort(new Error('KATA_RESPONSE_LIMIT'));}catch{controller.abort();}
    }else if(response?.body?.getReader){
      reader=response.body.getReader();
      const chunks=[];
      let total=0;
      try{
        while(true){
          const {done,value}=await reader.read();
          if(done)break;
          const chunk=value instanceof Uint8Array?value:new Uint8Array(value??[]);
          const room=maxResponseBytes-total;
          if(chunk.length>room){
            if(room>0)chunks.push(chunk.slice(0,room));
            total+=Math.max(0,room);
            truncated=true;
            try{await reader.cancel('KATA_RESPONSE_LIMIT');}catch{}
            try{controller.abort(new Error('KATA_RESPONSE_LIMIT'));}catch{controller.abort();}
            break;
          }
          chunks.push(chunk);
          total+=chunk.length;
        }
      }catch(error){
        return{ok:false,status:Number(response?.status??0),statusText:String(response?.statusText??''),url:publicUrl,contentType,bytes:total,bodyText:null,truncated:false,outcome:'unknown',networkError:timedOut?'timeout':`response_body_error:${redactError(error?.message??error)}`,durationMs:Math.max(0,now()-started)};
      }
      bytes=total;
      if(textual){
        const merged=new Uint8Array(total);
        let offset=0;
        for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.length;}
        const Decoder=scope.TextDecoder??globalThis.TextDecoder;
        bodyText=new Decoder().decode(merged);
      }
    }else if(typeof response?.text==='function'){
      try{
        const text=await response.text();
        const encoded=Encoder?new Encoder().encode(text):new TextEncoder().encode(text);
        if(encoded.length>maxResponseBytes){
          truncated=true;
          bytes=maxResponseBytes;
          if(textual){const Decoder=scope.TextDecoder??globalThis.TextDecoder;bodyText=new Decoder().decode(encoded.slice(0,maxResponseBytes));}
        }else{
          bytes=encoded.length;
          if(textual)bodyText=text;
        }
      }catch(error){
        return{ok:false,status:Number(response?.status??0),statusText:String(response?.statusText??''),url:publicUrl,contentType,bytes:0,bodyText:null,truncated:false,outcome:'unknown',networkError:timedOut?'timeout':`response_body_error:${redactError(error?.message??error)}`,durationMs:Math.max(0,now()-started)};
      }
    }

    return{ok:Boolean(response?.ok),status:Number(response?.status??0),statusText:String(response?.statusText??''),url:publicUrl,contentType,bytes,bodyText,truncated,outcome:'completed',networkError:null,durationMs:Math.max(0,now()-started)};
  }finally{
    try{reader?.releaseLock?.();}catch{}
    clearTimer(timer);
  }
}

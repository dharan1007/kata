import {previewOpenApiRequest} from './api-adapter.js';

const SAFE_METHODS=new Set(['GET','HEAD','OPTIONS']);
const FORBIDDEN_BROWSER_METHODS=new Set(['CONNECT','TRACE','TRACK']);
const FORBIDDEN_HEADERS=new Set(['authorization','cookie','proxy-authorization','set-cookie','host','content-length','origin','referer']);
const DEFAULT_TIMEOUT_MS=15000;
const MAX_TIMEOUT_MS=15000;
const DEFAULT_RESPONSE_BYTES=1024*1024;
const MAX_RESPONSE_BYTES=1024*1024;

function boundedInt(value,fallback,min,max){const n=Number(value);return Number.isInteger(n)?Math.max(min,Math.min(max,n)):fallback;}
function safeHttpUrl(raw){try{const url=new URL(String(raw));if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;url.hash='';return url;}catch{return null;}}
function canonicalize(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'){if(!Number.isFinite(value))throw new TypeError('Execution preview contains a non-finite number');return value;}
  if(Array.isArray(value))return value.map(canonicalize);
  if(value&&typeof value==='object'){
    const out={};for(const key of Object.keys(value).sort())out[key]=canonicalize(value[key]);return out;
  }
  throw new TypeError('Execution preview contains a non-JSON value');
}
function sanitizeHeaders(headers){
  const out={};for(const [name,value] of Object.entries(headers??{})){
    const lower=String(name).toLowerCase();
    if(FORBIDDEN_HEADERS.has(lower)||lower.startsWith('proxy-')||lower.startsWith('sec-'))throw new TypeError(`Credential or transport header is not executable: ${name}`);
    out[name]=String(value);
  }return out;
}

export function buildAuthorizedExecutionPreview(candidate,args,pageOrigin,options={}){
  const page=safeHttpUrl(pageOrigin),request=previewOpenApiRequest(candidate,args);if(!page)throw new TypeError('A valid HTTP(S) page origin is required');
  const target=safeHttpUrl(request.url);if(!target)throw new TypeError('Candidate request URL is invalid');
  const method=String(request.method??'').toUpperCase();
  const sameOrigin=target.origin===page.origin;
  const unsupportedMethod=FORBIDDEN_BROWSER_METHODS.has(method)||!method||/\s/.test(method);
  const requiresAuthorization=Boolean(request.requiresAuthorization);
  const credentialMode=requiresAuthorization?'same-origin':'omit';
  const timeoutMs=boundedInt(options.timeoutMs,DEFAULT_TIMEOUT_MS,250,MAX_TIMEOUT_MS);
  const maxResponseBytes=boundedInt(options.maxResponseBytes,DEFAULT_RESPONSE_BYTES,1,MAX_RESPONSE_BYTES);
  const blockedReason=!sameOrigin?'same_origin_required':unsupportedMethod?'unsupported_browser_method':null;
  return{
    operationName:candidate.name,method,url:target.href,headers:sanitizeHeaders(request.headers),body:request.body??null,
    security:[...(request.security??[])],requiresAuthorization,credentialMode,
    streamingMedia:[...(request.streamingMedia??[])],sameOrigin,stateChanging:!SAFE_METHODS.has(method),
    redirect:'error',cache:'no-store',timeoutMs,maxResponseBytes,readyToExecute:blockedReason===null,blockedReason
  };
}

export async function fingerprintExecutionPreview(preview,cryptoImpl=globalThis.crypto){
  if(!cryptoImpl?.subtle?.digest)throw new Error('Web Crypto SHA-256 is unavailable');
  const serialized=JSON.stringify(canonicalize(preview));
  const bytes=new TextEncoder().encode(serialized),digest=await cryptoImpl.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function executionRequestFromPreview(preview){
  if(!preview?.readyToExecute)throw new Error(`API request is not executable: ${preview?.blockedReason??'policy_blocked'}`);
  return{method:preview.method,url:preview.url,headers:{...(preview.headers??{})},body:preview.body??null,credentials:preview.credentialMode,redirect:'error',cache:'no-store',timeoutMs:preview.timeoutMs,maxResponseBytes:preview.maxResponseBytes};
}

export async function executePageApiRequest(request,runtime={}){
  const scope=runtime&&typeof runtime==='object'?runtime:{};
  const currentOrigin=scope.location?.origin??globalThis.location?.origin;
  let page,target;try{page=new URL(String(currentOrigin));target=new URL(String(request?.url));}catch{throw new TypeError('A valid page and request URL are required');}
  if(!['http:','https:'].includes(target.protocol)||target.username||target.password)throw new TypeError('API execution requires a safe HTTP(S) URL');
  if(target.origin!==page.origin)throw new Error('API execution is restricted to the active page same-origin boundary');
  const method=String(request?.method??'').toUpperCase();
  if(!method||/\s/.test(method)||['CONNECT','TRACE','TRACK'].includes(method))throw new TypeError('Unsupported browser HTTP method');
  const credentials=request?.credentials==='same-origin'?'same-origin':request?.credentials==='omit'?'omit':null;if(!credentials)throw new TypeError('Unsupported credential mode');
  if(request?.redirect!=='error')throw new TypeError('Redirects must remain disabled for API execution');
  const timeoutMs=Math.max(250,Math.min(15000,Number.isInteger(request?.timeoutMs)?request.timeoutMs:15000));
  const maxResponseBytes=Math.max(1,Math.min(1024*1024,Number.isInteger(request?.maxResponseBytes)?request.maxResponseBytes:1024*1024));
  const headers={};for(const [name,value] of Object.entries(request?.headers??{})){
    const lower=String(name).toLowerCase();if(['authorization','cookie','proxy-authorization','set-cookie','host','content-length','origin','referer'].includes(lower)||lower.startsWith('proxy-')||lower.startsWith('sec-'))throw new TypeError(`Credential or transport header is not executable: ${name}`);headers[name]=String(value);
  }
  const fetchImpl=scope.fetch??globalThis.fetch;if(typeof fetchImpl!=='function')throw new Error('Browser fetch is unavailable');
  const AbortControllerImpl=scope.AbortController??globalThis.AbortController;if(typeof AbortControllerImpl!=='function')throw new Error('AbortController is unavailable');
  const setTimer=scope.setTimeout??globalThis.setTimeout,clearTimer=scope.clearTimeout??globalThis.clearTimeout;
  const started=scope.performance?.now?.()??globalThis.performance?.now?.()??Date.now();const controller=new AbortControllerImpl();let timedOut=false;
  const timer=setTimer(()=>{timedOut=true;controller.abort(new Error('KATA_API_TIMEOUT'));},timeoutMs);
  let response;
  try{
    response=await fetchImpl(target.href,{method,headers,body:(method==='GET'||method==='HEAD')?undefined:(request?.body??undefined),credentials,redirect:'error',cache:'no-store',signal:controller.signal});
  }catch(error){
    clearTimer(timer);const ended=scope.performance?.now?.()??globalThis.performance?.now?.()??Date.now();
    return{ok:false,status:null,statusText:null,url:target.href,contentType:null,bytes:0,bodyText:null,truncated:false,outcome:'unknown',networkError:timedOut?'timeout':String(error?.message??error),durationMs:Math.max(0,ended-started)};
  }
  clearTimer(timer);
  const finalUrl=new URL(String(response?.url||target.href),target.href);if(finalUrl.origin!==page.origin)throw new Error('API response escaped the active page same-origin boundary');
  const contentType=String(response?.headers?.get?.('content-type')??'');const declaredLength=Number(response?.headers?.get?.('content-length'));
  const textual=/^(?:text\/)|json|xml|javascript|x-www-form-urlencoded/i.test(contentType);
  let bytes=0,bodyText=null,truncated=false;
  if(Number.isFinite(declaredLength)&&declaredLength>maxResponseBytes){truncated=true;}
  else if(response?.body?.getReader){
    const reader=response.body.getReader(),chunks=[];let total=0;
    try{
      while(true){const {done,value}=await reader.read();if(done)break;const chunk=value instanceof Uint8Array?value:new Uint8Array(value??[]);const room=maxResponseBytes-total;if(chunk.length>room){if(room>0)chunks.push(chunk.slice(0,room));total+=Math.max(0,room);truncated=true;await reader.cancel();break;}chunks.push(chunk);total+=chunk.length;}
    }finally{try{reader.releaseLock?.();}catch{}}
    bytes=total;
    if(textual){const merged=new Uint8Array(total);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.length;}const Decoder=scope.TextDecoder??globalThis.TextDecoder;bodyText=new Decoder().decode(merged);}
  }else if(typeof response?.text==='function'){
    const text=await response.text();const Encoder=scope.TextEncoder??globalThis.TextEncoder;const encoded=new Encoder().encode(text);
    if(encoded.length>maxResponseBytes){truncated=true;bytes=maxResponseBytes;if(textual){const Decoder=scope.TextDecoder??globalThis.TextDecoder;bodyText=new Decoder().decode(encoded.slice(0,maxResponseBytes));}}
    else{bytes=encoded.length;if(textual)bodyText=text;}
  }
  const ended=scope.performance?.now?.()??globalThis.performance?.now?.()??Date.now();
  return{ok:Boolean(response?.ok),status:Number(response?.status??0),statusText:String(response?.statusText??''),url:finalUrl.href,contentType:contentType||null,bytes,bodyText,truncated,outcome:'completed',networkError:null,durationMs:Math.max(0,ended-started)};
}

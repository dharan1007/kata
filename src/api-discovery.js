const BASE_HTTP_METHODS=['get','put','post','delete','options','head','patch','trace'];
const STREAMING_MEDIA=new Set(['text/event-stream','application/jsonl','application/json-seq']);
const MAX_DESCRIPTION_BYTES=2*1024*1024;
const MAX_OPERATIONS=250;
const MAX_SCHEMA_REF_DEPTH=8;
const MAX_SERVERS=50;
const MAX_SERVER_VARIABLES=50;

function safeHttpUrl(raw,base){
  if(raw===undefined||raw===null||raw==='')return null;
  try{const url=new URL(String(raw),base);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;url.hash='';return url;}catch{return null;}
}
function unique(values){return[...new Set(values)];}
function boundedInt(value,fallback,min,max){const n=Number(value);return Number.isInteger(n)?Math.max(min,Math.min(max,n)):fallback;}
function aborted(signal,error){if(signal?.aborted)throw signal.reason??error;}
function formatOf(contentType,url,text){const type=String(contentType??'').split(';')[0].trim().toLowerCase();if(type.includes('yaml')||/\.ya?ml$/i.test(url.pathname))return'yaml';if(type.includes('json')||/^\s*[\[{]/.test(text))return'json';return'unknown';}
function normalizeSecurityRequirements(security){
  if(!Array.isArray(security))return[];
  const out=[];
  for(const item of security){
    if(!item||typeof item!=='object'||Array.isArray(item))continue;
    const requirement=[];
    for(const [name,scopes] of Object.entries(item)){
      if(typeof name!=='string'||!name)continue;
      requirement.push({name,scopes:Array.isArray(scopes)?scopes.filter(scope=>typeof scope==='string').slice(0,128):[]});
    }
    requirement.sort((a,b)=>a.name.localeCompare(b.name));
    out.push(requirement);
  }
  return out;
}
function securityNames(requirements){return unique((requirements??[]).flatMap(requirement=>requirement.map(item=>item.name))).sort();}
function streamingMedia(operation){const media=[];for(const response of Object.values(operation?.responses??{}))for(const type of Object.keys(response?.content??{}))if(STREAMING_MEDIA.has(type))media.push(type);return unique(media).sort();}
function localRef(raw,prefix){if(typeof raw!=='string'||!raw.startsWith(prefix))return null;const key=raw.slice(prefix.length);if(!key||key.includes('/')||key.includes('~'))return null;try{return decodeURIComponent(key);}catch{return null;}}
function resolveSchema(schema,document,depth=0,seen=new Set()){
  if(!schema||typeof schema!=='object'||Array.isArray(schema))return{schema:null,unresolved:true};
  if(depth>MAX_SCHEMA_REF_DEPTH)return{schema:null,unresolved:true};
  if(typeof schema.$ref==='string'){
    const key=localRef(schema.$ref,'#/components/schemas/');if(!key||seen.has(key))return{schema:null,unresolved:true};
    const target=document.components?.schemas?.[key];if(!target||typeof target!=='object')return{schema:null,unresolved:true};
    const next=new Set(seen);next.add(key);return resolveSchema(target,document,depth+1,next);
  }
  const out={};let unresolved=false;
  for(const [key,value] of Object.entries(schema)){
    if(key==='$ref')continue;
    if(key==='properties'&&value&&typeof value==='object'&&!Array.isArray(value)){
      const properties={};for(const [name,property] of Object.entries(value)){const resolved=resolveSchema(property,document,depth+1,new Set(seen));if(resolved.unresolved){unresolved=true;continue;}properties[name]=resolved.schema;}out.properties=properties;continue;
    }
    if(key==='items'&&value&&typeof value==='object'){const resolved=resolveSchema(value,document,depth+1,new Set(seen));if(resolved.unresolved)unresolved=true;else out.items=resolved.schema;continue;}
    if(['allOf','anyOf','oneOf','prefixItems'].includes(key)&&Array.isArray(value)){const resolvedItems=[];for(const item of value){const resolved=resolveSchema(item,document,depth+1,new Set(seen));if(resolved.unresolved)unresolved=true;else resolvedItems.push(resolved.schema);}out[key]=resolvedItems;continue;}
    if(key==='additionalProperties'&&value&&typeof value==='object'){const resolved=resolveSchema(value,document,depth+1,new Set(seen));if(resolved.unresolved)unresolved=true;else out.additionalProperties=resolved.schema;continue;}
    out[key]=structuredClone(value);
  }
  const required=Array.isArray(out.required)?out.required.filter(x=>typeof x==='string'):[];if(required.length&&out.properties)for(const name of required)if(!Object.hasOwn(out.properties,name))unresolved=true;
  return{schema:out,unresolved};
}
function resolveParameter(parameter,document){
  let source=parameter;
  if(parameter&&typeof parameter==='object'&&typeof parameter.$ref==='string'){const key=localRef(parameter.$ref,'#/components/parameters/');if(!key)return{parameter:null,unresolved:true};source=document.components?.parameters?.[key];}
  if(!source||typeof source!=='object'||Array.isArray(source)||typeof source.name!=='string'||typeof source.in!=='string')return{parameter:null,unresolved:true};
  if(source.schema){const resolved=resolveSchema(source.schema,document);return{parameter:{name:source.name,in:source.in,required:Boolean(source.required),style:typeof source.style==='string'?source.style:null,explode:typeof source.explode==='boolean'?source.explode:null,schema:resolved.schema},unresolved:resolved.unresolved||!resolved.schema};}
  return{parameter:{name:source.name,in:source.in,required:Boolean(source.required),style:typeof source.style==='string'?source.style:null,explode:typeof source.explode==='boolean'?source.explode:null,schema:null},unresolved:true};
}
function mergedParameters(pathItem,operation,document){const map=new Map();let unresolvedRequired=false;const consume=list=>{for(const raw of Array.isArray(list)?list:[]){const resolved=resolveParameter(raw,document);if(resolved.parameter){map.set(`${resolved.parameter.in}:${resolved.parameter.name}`,resolved.parameter);if(resolved.unresolved&&resolved.parameter.required)unresolvedRequired=true;}else unresolvedRequired=true;}};consume(pathItem?.parameters);consume(operation?.parameters);return{parameters:[...map.values()],unresolvedRequired};}
function resolveRequestBody(requestBody,document){
  if(requestBody===undefined)return{requestBody:null,unresolvedRequired:false};
  let source=requestBody;if(requestBody&&typeof requestBody==='object'&&typeof requestBody.$ref==='string'){const key=localRef(requestBody.$ref,'#/components/requestBodies/');if(!key)return{requestBody:null,unresolvedRequired:true};source=document.components?.requestBodies?.[key];}
  if(!source||typeof source!=='object'||Array.isArray(source))return{requestBody:null,unresolvedRequired:true};
  const required=Boolean(source.required),media=source.content?.['application/json'];if(!media?.schema)return{requestBody:{required,contentType:null,schema:null},unresolvedRequired:required};
  const resolved=resolveSchema(media.schema,document);return{requestBody:{required,contentType:'application/json',schema:resolved.schema},unresolvedRequired:required&&resolved.unresolved};
}
function securitySchemeRecords(document){
  return Object.entries(document.components?.securitySchemes??{}).map(([name,scheme])=>({
    name,type:typeof scheme?.type==='string'?scheme.type:'unknown',
    in:typeof scheme?.in==='string'?scheme.in:null,
    parameterName:typeof scheme?.name==='string'?scheme.name:null,
    scheme:typeof scheme?.scheme==='string'?scheme.scheme:null,
    bearerFormat:typeof scheme?.bearerFormat==='string'?scheme.bearerFormat:null,
    openIdConnectUrl:typeof scheme?.openIdConnectUrl==='string'?scheme.openIdConnectUrl:null,
    oauthFlows:scheme?.flows&&typeof scheme.flows==='object'?Object.keys(scheme.flows).sort():[]
  })).sort((a,b)=>a.name.localeCompare(b.name));
}
function serverRecords(servers){
  const out=[];
  for(const item of Array.isArray(servers)?servers:[]){
    if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.url!=='string')continue;
    const variables={};
    for(const [name,variable] of Object.entries(item.variables??{}).slice(0,MAX_SERVER_VARIABLES)){
      if(!name||!variable||typeof variable!=='object'||Array.isArray(variable))continue;
      variables[name]={...(typeof variable.default==='string'?{default:variable.default}:{}),...(Array.isArray(variable.enum)?{enum:variable.enum.filter(value=>typeof value==='string').slice(0,50)}:{})};
    }
    out.push({url:item.url,variables});
    if(out.length>=MAX_SERVERS)break;
  }
  return out;
}
function operationRecord(method,path,pathItem,operation,topSecurityRequirements,securitySchemeMap,document){
  const parameters=mergedParameters(pathItem,operation,document),body=resolveRequestBody(operation.requestBody,document);
  const securityRequirements=Object.hasOwn(operation,'security')?normalizeSecurityRequirements(operation.security):topSecurityRequirements;
  const security=securityNames(securityRequirements);
  const operationSecuritySchemes=security.map(name=>securitySchemeMap.get(name)??{name,type:'unresolved',in:null,parameterName:null,scheme:null,bearerFormat:null,openIdConnectUrl:null,oauthFlows:[]});
  const selectedServers=Object.hasOwn(operation,'servers')?operation.servers:Object.hasOwn(pathItem,'servers')?pathItem.servers:document.servers;
  const serverDefinitions=serverRecords(selectedServers),servers=serverDefinitions.map(item=>item.url);
  return{method,path,operationId:typeof operation.operationId==='string'?operation.operationId:null,summary:typeof operation.summary==='string'?operation.summary:null,tags:Array.isArray(operation.tags)?operation.tags.filter(x=>typeof x==='string').slice(0,20):[],servers,serverDefinitions,security,securityRequirements,securitySchemes:operationSecuritySchemes,streamingMedia:streamingMedia(operation),parameters:parameters.parameters,requestBody:body.requestBody,hasUnresolvedRequiredInputs:Boolean(parameters.unresolvedRequired||body.unresolvedRequired)};
}
function parseOpenApiDocument(document,url){
  if(!document||typeof document!=='object'||Array.isArray(document))return{ok:false,reason:'invalid_document'};
  const version=typeof document.openapi==='string'?document.openapi:'';if(!/^3\.(?:0|1|2)(?:\.|$)/.test(version))return{ok:false,reason:'unsupported_openapi_version',version:version||null};
  const securitySchemes=securitySchemeRecords(document),securitySchemeMap=new Map(securitySchemes.map(scheme=>[scheme.name,scheme]));
  const topSecurityRequirements=normalizeSecurityRequirements(document.security),topSecurity=securityNames(topSecurityRequirements),operations=[],oas32=/^3\.2(?:\.|$)/.test(version),standardMethods=oas32?[...BASE_HTTP_METHODS,'query']:BASE_HTTP_METHODS;
  outer:for(const [path,pathItem] of Object.entries(document.paths??{})){
    if(!pathItem||typeof pathItem!=='object')continue;
    for(const method of standardMethods){const operation=pathItem[method];if(!operation||typeof operation!=='object'||Array.isArray(operation))continue;operations.push(operationRecord(method.toUpperCase(),path,pathItem,operation,topSecurityRequirements,securitySchemeMap,document));if(operations.length>=MAX_OPERATIONS)break outer;}
    const additional=oas32?pathItem.additionalOperations:pathItem['x-oai-additionalOperations'];
    if(additional&&typeof additional==='object'&&!Array.isArray(additional))for(const [method,operation] of Object.entries(additional)){if(!method||!operation||typeof operation!=='object'||Array.isArray(operation)||standardMethods.includes(method.toLowerCase()))continue;operations.push(operationRecord(method,path,pathItem,operation,topSecurityRequirements,securitySchemeMap,document));if(operations.length>=MAX_OPERATIONS)break outer;}
  }
  const serverDefinitions=serverRecords(document.servers),servers=serverDefinitions.map(item=>item.url);
  return{ok:true,description:{url,openapi:version,title:typeof document.info?.title==='string'?document.info.title:null,version:typeof document.info?.version==='string'?document.info.version:null,servers,serverDefinitions,security:topSecurity,securityRequirements:topSecurityRequirements,operationCount:operations.length,operationInventoryTruncated:operations.length>=MAX_OPERATIONS},operations,securitySchemes};
}
function linkTargets(value,base){if(value===undefined||value===null)return[];const items=Array.isArray(value)?value:[value],out=[];for(const item of items){if(item===undefined||item===null)continue;const raw=typeof item==='string'?item:item?.href;const url=safeHttpUrl(raw,base);if(url)out.push(url.href);}return out;}
function parseCatalog(document,catalogUrl){const descriptionUrls=[],apiEndpoints=[],nestedCatalogs=[];for(const entry of Array.isArray(document?.linkset)?document.linkset:[]){const anchor=safeHttpUrl(entry?.anchor,catalogUrl)?.href??catalogUrl;descriptionUrls.push(...linkTargets(entry?.['service-desc'],anchor));apiEndpoints.push(...linkTargets(entry?.item,anchor));nestedCatalogs.push(...linkTargets(entry?.['api-catalog'],anchor));}return{descriptionUrls:unique(descriptionUrls),apiEndpoints:unique(apiEndpoints),nestedCatalogs:unique(nestedCatalogs)};}
async function readBoundedText(response,signal){
  const reader=response?.body?.getReader?.();
  if(!reader){const text=await response.text(),bytes=new TextEncoder().encode(text).byteLength;return bytes>MAX_DESCRIPTION_BYTES?{ok:false,status:'too_large',bytes}:{ok:true,text,bytes};}
  const decoder=new TextDecoder();let bytes=0,text='';
  try{
    while(true){
      aborted(signal);
      const {value,done}=await reader.read();
      aborted(signal);
      if(done)break;
      const chunk=value instanceof Uint8Array?value:new Uint8Array(value);
      bytes+=chunk.byteLength;
      if(bytes>MAX_DESCRIPTION_BYTES){try{await reader.cancel('response too large');}catch{}return{ok:false,status:'too_large',bytes};}
      text+=decoder.decode(chunk,{stream:true});
    }
    text+=decoder.decode();
    return{ok:true,text,bytes};
  }finally{try{reader.releaseLock();}catch{}}
}
async function fetchText(url,origin,fetchFn,signal,accept){
  const sameOrigin=url.origin===origin;let response;try{response=await fetchFn(url.href,{method:'GET',mode:'cors',credentials:sameOrigin?'same-origin':'omit',redirect:'follow',headers:{Accept:accept},signal});}catch(error){aborted(signal,error);return{ok:false,status:'fetch_blocked_or_failed',error:error instanceof Error?error.message:String(error)};}
  const finalUrl=safeHttpUrl(response?.url||url.href,url.href)?.href??url.href;if(!response?.ok)return{ok:false,status:'http_error',httpStatus:response?.status??0,finalUrl};
  const declaredLength=Number(response.headers?.get?.('content-length'));if(Number.isFinite(declaredLength)&&declaredLength>MAX_DESCRIPTION_BYTES)return{ok:false,status:'too_large',bytes:declaredLength,finalUrl};
  let read;try{read=await readBoundedText(response,signal);}catch(error){aborted(signal,error);return{ok:false,status:'read_failed',error:error instanceof Error?error.message:String(error),finalUrl};}aborted(signal);if(!read.ok)return{...read,finalUrl};return{ok:true,text:read.text,contentType:response.headers?.get?.('content-type')??'',finalUrl,httpStatus:response.status};
}

export async function discoverBrowserApis(options={},runtime={}){
  const originUrl=safeHttpUrl(runtime.origin??globalThis.location?.origin);if(!originUrl)throw new TypeError('A valid http(s) browser origin is required');
  const origin=originUrl.origin,fetchFn=runtime.fetch??globalThis.fetch;if(typeof fetchFn!=='function')throw new TypeError('Browser fetch is unavailable');
  const signal=options.signal,maxDescriptions=boundedInt(options.maxDescriptions,3,1,5),includeCatalog=options.includeWellKnownCatalog!==false,sources=[];
  for(const raw of Array.isArray(options.declaredApiDescriptions)?options.declaredApiDescriptions:[]){const url=safeHttpUrl(raw,origin);if(url&&!sources.includes(url.href))sources.push(url.href);}
  let catalog={status:includeCatalog?'not_checked':'disabled',url:null,finalUrl:null,apiEndpoints:[],nestedCatalogs:[]};
  if(includeCatalog){
    const catalogUrl=new URL('/.well-known/api-catalog',origin),fetched=await fetchText(catalogUrl,origin,fetchFn,signal,'application/linkset+json, application/json;q=0.9');
    catalog={status:fetched.ok?'ok':fetched.status,url:catalogUrl.href,finalUrl:fetched.finalUrl??null,apiEndpoints:[],nestedCatalogs:[],...(!fetched.ok&&fetched.httpStatus?{httpStatus:fetched.httpStatus}:{})};
    if(fetched.ok){const format=formatOf(fetched.contentType,safeHttpUrl(fetched.finalUrl,catalogUrl.href)??catalogUrl,fetched.text);if(format==='json'){try{const parsedCatalog=parseCatalog(JSON.parse(fetched.text),fetched.finalUrl??catalogUrl.href);catalog.apiEndpoints=parsedCatalog.apiEndpoints;catalog.nestedCatalogs=parsedCatalog.nestedCatalogs;for(const discovered of parsedCatalog.descriptionUrls)if(!sources.includes(discovered))sources.push(discovered);}catch{catalog.status='invalid_json';}}else catalog.status='unsupported_format';}
  }
  const selected=sources.slice(0,maxDescriptions),resources=[],descriptions=[],operations=[],securityMap=new Map(),evidence=[];
  if(catalog.status==='ok'&&(catalog.apiEndpoints.length||catalog.nestedCatalogs.length))evidence.push({code:'API_CATALOG_DISCOVERED',apiEndpointCount:catalog.apiEndpoints.length,nestedCatalogCount:catalog.nestedCatalogs.length});
  for(const source of selected){
    const url=safeHttpUrl(source,origin);if(!url)continue;
    const fetched=await fetchText(url,origin,fetchFn,signal,'application/openapi+json, application/vnd.oai.openapi+json, application/json');
    if(!fetched.ok){resources.push({url:url.href,status:fetched.status,...(fetched.httpStatus?{httpStatus:fetched.httpStatus}:{})});evidence.push({code:'API_DESCRIPTION_FETCH_FAILED',url:url.href,status:fetched.status});continue;}
    const finalUrl=safeHttpUrl(fetched.finalUrl,url.href)??url,format=formatOf(fetched.contentType,finalUrl,fetched.text);if(format!=='json'){resources.push({url:url.href,finalUrl:finalUrl.href,status:'unsupported_format',format});evidence.push({code:'API_DESCRIPTION_UNSUPPORTED_FORMAT',url:finalUrl.href,format});continue;}
    let document;try{document=JSON.parse(fetched.text);}catch{resources.push({url:url.href,finalUrl:finalUrl.href,status:'invalid_json',format});evidence.push({code:'API_DESCRIPTION_INVALID_JSON',url:finalUrl.href});continue;}
    const parsed=parseOpenApiDocument(document,finalUrl.href);if(!parsed.ok){resources.push({url:url.href,finalUrl:finalUrl.href,status:parsed.reason,format,openapi:parsed.version??null});evidence.push({code:'API_DESCRIPTION_NOT_SUPPORTED',url:finalUrl.href,reason:parsed.reason});continue;}
    resources.push({url:url.href,finalUrl:finalUrl.href,status:'parsed',format:'json',openapi:parsed.description.openapi});descriptions.push(parsed.description);for(const op of parsed.operations)operations.push({...op,descriptionUrl:finalUrl.href});for(const scheme of parsed.securitySchemes)if(!securityMap.has(scheme.name))securityMap.set(scheme.name,scheme);evidence.push({code:'OPENAPI_DESCRIPTION_PARSED',url:finalUrl.href,openapi:parsed.description.openapi,operationCount:parsed.description.operationCount});
  }
  const securitySchemes=[...securityMap.values()].sort((a,b)=>a.name.localeCompare(b.name)),environmentPatch=descriptions.length?{api:'documented'}:{};
  return{sources:selected,catalog,resources,descriptions,operations,securitySchemes,evidence,environmentPatch,limits:{maxDescriptions,maxOperationsPerDescription:MAX_OPERATIONS,maxDescriptionBytes:MAX_DESCRIPTION_BYTES,maxSchemaRefDepth:MAX_SCHEMA_REF_DEPTH}};
}
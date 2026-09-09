import {createToolRegistry} from './tools.js';

export const MCP_VERSION='2026-07-28';
export const LEGACY_MCP_VERSION='2025-11-25';
export const MCP_SUPPORTED_VERSIONS=[MCP_VERSION,LEGACY_MCP_VERSION];

const SERVER_INFO={name:'kata-webmcp',version:'3.0.0'};
const INSTRUCTIONS='KATA provides real OpenAlex research, deterministic workflow compilation, workspace commands and preview-bound automations.';
const META_PROTOCOL_VERSION='io.modelcontextprotocol/protocolVersion';
const META_CLIENT_INFO='io.modelcontextprotocol/clientInfo';
const META_CLIENT_CAPABILITIES='io.modelcontextprotocol/clientCapabilities';
const HEADER_MISMATCH=-32020;
const UNSUPPORTED_PROTOCOL_VERSION=-32022;
const RECOVERABLE_TOOL_ERRORS=new Set([
  'REQUEST_CANCELLED','INVALID_ARGUMENTS','INVALID_QUERY','UPSTREAM_TIMEOUT','UPSTREAM_RATE_LIMITED','UPSTREAM_UNAVAILABLE','UPSTREAM_INVALID_RESPONSE',
  'INVALID_WORKSPACE','INVALID_COMMAND','INVALID_WORK_ID','UNKNOWN_WORK','WORK_NOT_SAVED','INVALID_PRIORITY','INVALID_TAG','TAG_LIMIT','INVALID_NOTE','INVALID_COMMAND_KIND',
  'INVALID_TOOL_NAME','UNSUPPORTED_ARGUMENT_TYPE','EMPTY_TRACE','DEMO_STRUCTURE_MISMATCH','DEMO_TYPE_MISMATCH','INVALID_PROGRAM','INVALID_AUTOMATION_ACTION','INVALID_TOOL_INPUT',
  'INVALID_TRIGGER','INVALID_AUTOMATION_ACTIONS','INVALID_AUTOMATION_NAME','STALE_PREVIEW','TOOL_DEPTH_EXCEEDED','TOOL_RUNTIME_REQUIRED','INVALID_TOOL_RESULT'
]);
const meta=()=>({'io.modelcontextprotocol/serverInfo':SERVER_INFO});
const header=(headers,name)=>{const target=name.toLowerCase();for(const [k,v] of Object.entries(headers??{}))if(k.toLowerCase()===target)return Array.isArray(v)?v[0]:v;return undefined;};
const metadataCacheControl=env=>env.MCP_BEARER_TOKEN?'private, no-store':'public, max-age=60';
const metadataCacheScope=env=>env.MCP_BEARER_TOKEN?'private':'public';
const metadataTtlMs=env=>env.MCP_BEARER_TOKEN?0:60000;

function decodeMcpHeaderValue(value){
  if(value===undefined)return undefined;
  const raw=String(value);
  const prefix='=?base64?',suffix='?=';
  if(!raw.startsWith(prefix)||!raw.endsWith(suffix))return raw;
  const encoded=raw.slice(prefix.length,-suffix.length);
  if(!encoded||encoded.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))return null;
  const bytes=Buffer.from(encoded,'base64');
  const decoded=bytes.toString('utf8');
  if(!Buffer.from(decoded,'utf8').equals(bytes))return null;
  return decoded;
}

function modernRpc(id,result){return{jsonrpc:'2.0',id,result:{resultType:'complete',...result,_meta:{...(result?._meta??{}),...meta()}}};}
function modernError(id,code,message,data){return{jsonrpc:'2.0',id,error:{code,message,...(data?{data}:{}),_meta:meta()}};}
function legacyRpc(id,result){return{jsonrpc:'2.0',id,result};}
function legacyError(id,code,message,data){return{jsonrpc:'2.0',id,error:{code,message,...(data?{data}: {})}};}

function authCheck(headers,env){
  const origin=header(headers,'origin');
  const allowed=String(env.MCP_ALLOWED_ORIGINS??'').split(',').map(x=>x.trim()).filter(Boolean);
  if(origin&&(!allowed.length||!allowed.includes(origin)))return{status:403,body:{error:'ORIGIN_NOT_ALLOWED'}};
  const token=env.MCP_BEARER_TOKEN;
  if(token){
    const supplied=header(headers,'authorization');
    if(supplied!==`Bearer ${token}`)return{status:401,body:{error:'UNAUTHORIZED'},headers:{'WWW-Authenticate':'Bearer'}};
  }
  return null;
}

function hasModernEnvelopeClaim(body){
  const envelope=body?.params?._meta;
  return !!envelope&&typeof envelope==='object'&&!Array.isArray(envelope)&&Object.prototype.hasOwnProperty.call(envelope,META_PROTOCOL_VERSION);
}

function isModernProtocolHeader(value){
  return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>=MCP_VERSION;
}

function isLegacyEnvelope(request){
  const protocol=header(request.headers,'mcp-protocol-version');
  if(hasModernEnvelopeClaim(request.body)||isModernProtocolHeader(protocol))return false;
  return protocol===LEGACY_MCP_VERSION||protocol===undefined;
}

function invalidJsonRpc(request,body,message='Invalid JSON-RPC request'){
  const legacy=isLegacyEnvelope(request);
  return{status:400,body:(legacy?legacyError:modernError)(null,-32600,message)};
}

function validateJsonRpcEnvelope(request,body){
  if(!body||typeof body!=='object'||Array.isArray(body))return invalidJsonRpc(request,body);
  if(body.jsonrpc!=='2.0'||typeof body.method!=='string'||!body.method)return invalidJsonRpc(request,body);
  if(body.params!=null&&(typeof body.params!=='object'||Array.isArray(body.params)))return invalidJsonRpc(request,body,'Invalid JSON-RPC params');
  if(body.id===null)return invalidJsonRpc(request,body,'MCP request id must not be null');
  if(body.id!==undefined&&typeof body.id!=='string'&&!(typeof body.id==='number'&&Number.isFinite(body.id)))return invalidJsonRpc(request,body,'Invalid MCP request id');
  if(body.id===undefined&&!body.method.startsWith('notifications/'))return invalidJsonRpc(request,body,'MCP requests require a string or integer id');
  return null;
}

function unsupportedVersion(body,legacy=false,requestedVersion){
  if(legacy){
    return{status:400,body:legacyError(body?.id??null,-32600,'Unsupported MCP protocol version',{supportedVersions:MCP_SUPPORTED_VERSIONS})};
  }
  const requested=String(requestedVersion??body?.params?._meta?.[META_PROTOCOL_VERSION]??'');
  return{status:400,body:modernError(body?.id??null,UNSUPPORTED_PROTOCOL_VERSION,'Unsupported MCP protocol version',{supported:MCP_SUPPORTED_VERSIONS,requested})};
}

function validateModernEnvelope(request,body,{validateHeaders=true}={}){
  const envelope=body?.params?._meta;
  if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))return{status:400,body:modernError(body?.id??null,-32600,'Missing MCP 2026 request metadata envelope')};
  const protocolVersion=envelope[META_PROTOCOL_VERSION];
  const capabilities=envelope[META_CLIENT_CAPABILITIES];
  if(typeof protocolVersion!=='string'||!protocolVersion)return{status:400,body:modernError(body?.id??null,-32602,'Missing MCP protocol version metadata')};
  if(!capabilities||typeof capabilities!=='object'||Array.isArray(capabilities))return{status:400,body:modernError(body?.id??null,-32600,'Missing MCP client capabilities metadata')};
  const clientInfo=envelope[META_CLIENT_INFO];
  if(clientInfo!=null&&(typeof clientInfo!=='object'||Array.isArray(clientInfo)))return{status:400,body:modernError(body?.id??null,-32600,'Invalid MCP client info metadata')};
  if(validateHeaders){
    const routedVersion=header(request.headers,'mcp-protocol-version');
    if(routedVersion!==protocolVersion)return{status:400,body:modernError(body?.id??null,HEADER_MISMATCH,'MCP-Protocol-Version header does not match request metadata',{header:routedVersion??null,body:protocolVersion})};
  }
  if(protocolVersion!==MCP_VERSION)return unsupportedVersion(body,false,protocolVersion);
  return null;
}

function validateLegacyInitializeParams(params){
  if(!params||typeof params!=='object'||Array.isArray(params))return false;
  if(typeof params.protocolVersion!=='string'||!params.protocolVersion)return false;
  if(!params.capabilities||typeof params.capabilities!=='object'||Array.isArray(params.capabilities))return false;
  const clientInfo=params.clientInfo;
  if(!clientInfo||typeof clientInfo!=='object'||Array.isArray(clientInfo))return false;
  if(typeof clientInfo.name!=='string'||!clientInfo.name)return false;
  if(typeof clientInfo.version!=='string'||!clientInfo.version)return false;
  return true;
}

function safeRecoverableDetails(code,details){
  if(code==='INVALID_ARGUMENTS'&&Array.isArray(details)&&details.every(x=>typeof x==='string'))return details.slice(0,32).map(x=>x.slice(0,240));
  if(code==='UPSTREAM_RATE_LIMITED'&&details&&typeof details==='object'&&!Array.isArray(details)&&Number.isFinite(details.retryAfterSeconds))return{retryAfterSeconds:Math.max(0,Number(details.retryAfterSeconds))};
  return undefined;
}

function normalizeToolFailure(error){
  const code=error instanceof Error?error.message:String(error);
  if(!RECOVERABLE_TOOL_ERRORS.has(code))return{error:'TOOL_EXECUTION_FAILED'};
  const details=safeRecoverableDetails(code,error?.details);
  return{error:code,...(details!==undefined?{details}:{})};
}

async function invokeTool(registry,body,legacy,ctx={}){
  const name=body.params?.name;
  let result;
  try{
    result=await registry.invoke(name,body.params?.arguments??{}, {depth:0,...ctx});
  }catch(error){
    if(error?.message==='TOOL_NOT_FOUND'){
      const protocolError=(legacy?legacyError:modernError)(body.id??null,-32602,`Unknown tool: ${String(name??'')}`);
      return{status:400,body:protocolError};
    }
    result=normalizeToolFailure(error);
    const payload={content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError:true};
    return{status:200,body:legacy?legacyRpc(body.id,payload):modernRpc(body.id,payload)};
  }
  const isError=result?.receipt?.status==='failed';
  const payload={content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError};
  return{status:200,body:legacy?legacyRpc(body.id,payload):modernRpc(body.id,payload)};
}

async function handleLegacy(body,registry,ctx){
  if(body.id===undefined)return{status:202,body:undefined};
  const method=String(body.method??'');
  if(method==='ping')return{status:200,body:legacyRpc(body.id,{})};
  if(method==='tools/list')return{status:200,body:legacyRpc(body.id,{tools:registry.list()})};
  if(method==='tools/call')return invokeTool(registry,body,true,ctx);
  return{status:404,body:legacyError(body.id??null,-32601,'Method not found')};
}

async function handleModern(request,body,registry,env,ctx){
  const notification=body.id===undefined;
  const envelopeError=validateModernEnvelope(request,body);
  if(envelopeError)return envelopeError;

  const method=String(body.method??'');
  const routedMethodRaw=header(request.headers,'mcp-method');
  const routed=decodeMcpHeaderValue(routedMethodRaw);
  if(!routed||routed!==method)return{status:400,body:modernError(body.id??null,HEADER_MISMATCH,'Mcp-Method header does not match JSON-RPC method',{header:routedMethodRaw??null,body:method})};
  if(notification)return{status:202,body:undefined};

  const name=body.params?.name;
  const routedNameRaw=header(request.headers,'mcp-name');
  const routedName=decodeMcpHeaderValue(routedNameRaw);
  if(method==='tools/call'&&(!routedName||routedName!==name))return{status:400,body:modernError(body.id??null,HEADER_MISMATCH,'Mcp-Name header does not match tool name',{header:routedNameRaw??null,body:name??null})};

  const cacheScope=metadataCacheScope(env),ttlMs=metadataTtlMs(env),cacheControl=metadataCacheControl(env);
  if(method==='server/discover')return{status:200,body:modernRpc(body.id,{supportedVersions:MCP_SUPPORTED_VERSIONS,capabilities:{tools:{}},instructions:INSTRUCTIONS,ttlMs,cacheScope}),headers:{'Cache-Control':cacheControl}};
  if(method==='tools/list')return{status:200,body:modernRpc(body.id,{tools:registry.list(),ttlMs,cacheScope}),headers:{'Cache-Control':cacheControl}};
  if(method==='tools/call')return invokeTool(registry,body,false,ctx);
  return{status:404,body:modernError(body.id??null,-32601,'Method not found')};
}

export async function handleMcpRequest(request,options={}){
  const env=options.env??process.env;
  const denied=authCheck(request.headers,env);
  if(denied)return denied;

  const body=request.body??{};
  const malformed=validateJsonRpcEnvelope(request,body);
  if(malformed)return malformed;
  const method=body.method;
  const registry=options.registry??createToolRegistry();
  const requestMeta=body.params?._meta;
  const ctx={signal:options.signal,meta:requestMeta&&typeof requestMeta==='object'&&!Array.isArray(requestMeta)?structuredClone(requestMeta):{}};

  try{
    const protocol=header(request.headers,'mcp-protocol-version');
    const modernClaim=hasModernEnvelopeClaim(body)||isModernProtocolHeader(protocol);
    if(method==='initialize'&&!modernClaim&&(protocol===undefined||protocol===LEGACY_MCP_VERSION)){
      if(!validateLegacyInitializeParams(body.params))return{status:400,body:legacyError(body.id??null,-32602,'Invalid params')};
      const requested=body.params.protocolVersion;
      const negotiated=requested===LEGACY_MCP_VERSION?requested:LEGACY_MCP_VERSION;
      return{status:200,body:legacyRpc(body.id,{protocolVersion:negotiated,capabilities:{tools:{listChanged:false}},serverInfo:SERVER_INFO,instructions:INSTRUCTIONS})};
    }

    if(modernClaim)return await handleModern(request,body,registry,env,ctx);
    if(protocol===LEGACY_MCP_VERSION)return await handleLegacy(body,registry,ctx);
    return unsupportedVersion(body,protocol===undefined,protocol);
  }catch(error){
    const legacy=isLegacyEnvelope(request);
    if(error?.message==='INVALID_ARGUMENTS')return{status:400,body:(legacy?legacyError:modernError)(body.id??null,-32602,'Invalid params',safeRecoverableDetails('INVALID_ARGUMENTS',error.details))};
    return{status:500,body:(legacy?legacyError:modernError)(body.id??null,-32603,'Internal error')};
  }
}
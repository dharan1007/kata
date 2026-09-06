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
  'INVALID_ARGUMENTS','INVALID_QUERY','UPSTREAM_TIMEOUT','UPSTREAM_RATE_LIMITED','UPSTREAM_UNAVAILABLE','UPSTREAM_INVALID_RESPONSE',
  'INVALID_WORKSPACE','INVALID_COMMAND','INVALID_WORK_ID','UNKNOWN_WORK','WORK_NOT_SAVED','INVALID_PRIORITY','INVALID_TAG','TAG_LIMIT','INVALID_NOTE','INVALID_COMMAND_KIND',
  'INVALID_TOOL_NAME','UNSUPPORTED_ARGUMENT_TYPE','EMPTY_TRACE','DEMO_STRUCTURE_MISMATCH','DEMO_TYPE_MISMATCH','INVALID_PROGRAM','INVALID_AUTOMATION_ACTION','INVALID_TOOL_INPUT',
  'INVALID_TRIGGER','INVALID_AUTOMATION_ACTIONS','INVALID_AUTOMATION_NAME','STALE_PREVIEW','TOOL_DEPTH_EXCEEDED','TOOL_RUNTIME_REQUIRED','INVALID_TOOL_RESULT'
]);
const meta=()=>({'io.modelcontextprotocol/serverInfo':SERVER_INFO});
const header=(headers,name)=>{const target=name.toLowerCase();for(const [k,v] of Object.entries(headers??{}))if(k.toLowerCase()===target)return Array.isArray(v)?v[0]:v;return undefined;};

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

function invalidJsonRpc(request,body,message='Invalid JSON-RPC request'){
  const protocol=header(request.headers,'mcp-protocol-version');
  const legacy=protocol===LEGACY_MCP_VERSION||body?.method==='initialize';
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

function validateModernEnvelope(request,body){
  const envelope=body?.params?._meta;
  if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))return{status:400,body:modernError(body?.id??null,-32600,'Missing MCP 2026 request metadata envelope')};
  const protocolVersion=envelope[META_PROTOCOL_VERSION];
  const capabilities=envelope[META_CLIENT_CAPABILITIES];
  if(protocolVersion!==MCP_VERSION)return unsupportedVersion(body,false,protocolVersion);
  if(!capabilities||typeof capabilities!=='object'||Array.isArray(capabilities))return{status:400,body:modernError(body?.id??null,-32600,'Missing MCP client capabilities metadata')};
  const clientInfo=envelope[META_CLIENT_INFO];
  if(clientInfo!=null&&(typeof clientInfo!=='object'||Array.isArray(clientInfo)))return{status:400,body:modernError(body?.id??null,-32600,'Invalid MCP client info metadata')};
  const routedVersion=header(request.headers,'mcp-protocol-version');
  if(routedVersion!==protocolVersion)return{status:400,body:modernError(body?.id??null,HEADER_MISMATCH,'MCP-Protocol-Version header does not match request metadata',{header:routedVersion??null,body:protocolVersion})};
  return null;
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

async function invokeTool(registry,body,legacy){
  const name=body.params?.name;
  let result;
  try{
    result=await registry.invoke(name,body.params?.arguments??{}, {depth:0});
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

async function handleLegacy(body,registry){
  if(body.id===undefined)return{status:202,body:undefined};
  const method=String(body.method??'');
  if(method==='ping')return{status:200,body:legacyRpc(body.id,{})};
  if(method==='tools/list')return{status:200,body:legacyRpc(body.id,{tools:registry.list()})};
  if(method==='tools/call')return invokeTool(registry,body,true);
  return{status:404,body:legacyError(body.id??null,-32601,'Method not found')};
}

async function handleModern(request,body,registry){
  const envelopeError=validateModernEnvelope(request,body);
  if(envelopeError)return envelopeError;
  if(body.id===undefined)return{status:202,body:undefined};

  const method=String(body.method??'');
  const routed=header(request.headers,'mcp-method');
  if(!routed||routed!==method)return{status:400,body:modernError(body.id??null,HEADER_MISMATCH,'Mcp-Method header does not match JSON-RPC method',{header:routed??null,body:method})};
  const name=body.params?.name;
  const routedName=header(request.headers,'mcp-name');
  if(method==='tools/call'&&(!routedName||routedName!==name))return{status:400,body:modernError(body.id??null,HEADER_MISMATCH,'Mcp-Name header does not match tool name',{header:routedName??null,body:name??null})};

  if(method==='server/discover')return{status:200,body:modernRpc(body.id,{supportedVersions:MCP_SUPPORTED_VERSIONS,capabilities:{tools:{}},instructions:INSTRUCTIONS,ttlMs:60000,cacheScope:'public'}),headers:{'Cache-Control':'public, max-age=60'}};
  if(method==='tools/list')return{status:200,body:modernRpc(body.id,{tools:registry.list(),ttlMs:60000,cacheScope:'public'}),headers:{'Cache-Control':'public, max-age=60'}};
  if(method==='tools/call')return invokeTool(registry,body,false);
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

  try{
    if(method==='initialize'){
      const requested=String(body.params?.protocolVersion??'');
      if(requested!==LEGACY_MCP_VERSION)return unsupportedVersion(body,true,requested);
      return{status:200,body:legacyRpc(body.id,{protocolVersion:LEGACY_MCP_VERSION,capabilities:{tools:{listChanged:false}},serverInfo:SERVER_INFO,instructions:INSTRUCTIONS})};
    }

    const protocol=header(request.headers,'mcp-protocol-version');
    if(protocol===LEGACY_MCP_VERSION)return handleLegacy(body,registry);
    if(protocol===MCP_VERSION)return handleModern(request,body,registry);
    return unsupportedVersion(body,false,protocol);
  }catch(error){
    const protocol=header(request.headers,'mcp-protocol-version');
    const legacy=protocol===LEGACY_MCP_VERSION||method==='initialize';
    if(error?.message==='INVALID_ARGUMENTS')return{status:400,body:(legacy?legacyError:modernError)(body.id??null,-32602,'Invalid params',safeRecoverableDetails('INVALID_ARGUMENTS',error.details))};
    return{status:500,body:(legacy?legacyError:modernError)(body.id??null,-32603,'Internal error')};
  }
}

import {createToolRegistry} from './tools.js';
export const MCP_VERSION='2026-07-28';
const SERVER_INFO={'name':'kata-webmcp','version':'3.0.0'};
const meta=()=>({'io.modelcontextprotocol/serverInfo':SERVER_INFO});
const header=(headers,name)=>{const target=name.toLowerCase();for(const [k,v] of Object.entries(headers??{}))if(k.toLowerCase()===target)return Array.isArray(v)?v[0]:v;return undefined;};
function rpc(id,result){return{jsonrpc:'2.0',id,result:{resultType:'complete',...result,_meta:{...(result?._meta??{}),...meta()}}};}
function rpcError(id,code,message,data){return{jsonrpc:'2.0',id,error:{code,message,...(data?{data}:{}),_meta:meta()}};}
function authCheck(headers,env){const origin=header(headers,'origin');const allowed=String(env.MCP_ALLOWED_ORIGINS??'').split(',').map(x=>x.trim()).filter(Boolean);if(origin&&(!allowed.length||!allowed.includes(origin)))return{status:403,body:{error:'ORIGIN_NOT_ALLOWED'}};const token=env.MCP_BEARER_TOKEN;if(token){const supplied=header(headers,'authorization');if(supplied!==`Bearer ${token}`)return{status:401,body:{error:'UNAUTHORIZED'},headers:{'WWW-Authenticate':'Bearer'}};}return null;}
export async function handleMcpRequest(request,options={}){
  const env=options.env??process.env, denied=authCheck(request.headers,env); if(denied)return denied;
  const protocol=header(request.headers,'mcp-protocol-version'); if(protocol!==MCP_VERSION)return{status:400,body:rpcError(request.body?.id??null,-32600,'Unsupported MCP protocol version',{supportedVersions:[MCP_VERSION]})};
  const body=request.body??{}, method=String(body.method??''), routed=header(request.headers,'mcp-method'); if(!routed||routed!==method)return{status:400,body:rpcError(body.id??null,-32600,'Mcp-Method header does not match JSON-RPC method')};
  const name=body.params?.name, routedName=header(request.headers,'mcp-name'); if(method==='tools/call'&&(!routedName||routedName!==name))return{status:400,body:rpcError(body.id??null,-32602,'Mcp-Name header does not match tool name')};
  try{
    if(method==='server/discover')return{status:200,body:rpc(body.id,{supportedVersions:[MCP_VERSION],capabilities:{tools:{}},instructions:'KATA provides real OpenAlex research, deterministic workflow compilation, workspace commands and preview-bound automations.',ttlMs:60000,cacheScope:'public'}),headers:{'Cache-Control':'public, max-age=60'}};
    if(method==='tools/list')return{status:200,body:rpc(body.id,{tools:(options.registry??createToolRegistry()).list(),ttlMs:60000,cacheScope:'public'}),headers:{'Cache-Control':'public, max-age=60'}};
    if(method==='tools/call'){
      const result=await (options.registry??createToolRegistry()).invoke(name,body.params?.arguments??{}, {depth:0});
      return{status:200,body:rpc(body.id,{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError:false})};
    }
    return{status:404,body:rpcError(body.id??null,-32601,'Method not found')};
  }catch(error){const code=error.message==='INVALID_ARGUMENTS'?-32602:-32000;return{status:code===-32602?400:500,body:rpcError(body.id??null,code,error.message,error.details)};}
}

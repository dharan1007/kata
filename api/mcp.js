import {readJsonBody,send} from '../lib/server/http.js';
import {handleMcpRequest} from '../lib/server/mcp.js';

function allowedOrigins(){
  return String(process.env.MCP_ALLOWED_ORIGINS??'').split(',').map(x=>x.trim()).filter(Boolean);
}

function applyCors(req,res){
  const origin=req.headers?.origin??req.headers?.Origin;
  if(!origin)return true;
  if(!allowedOrigins().includes(origin))return false;
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  return true;
}

function requestMediaType(req){
  const raw=req.headers?.['content-type']??req.headers?.['Content-Type'];
  return String(raw??'').split(';',1)[0].trim().toLowerCase();
}

export default async function handler(req,res){
  const corsAllowed=applyCors(req,res);
  if(req.method==='OPTIONS'){
    if(!corsAllowed)return send(res,403,{error:'ORIGIN_NOT_ALLOWED'},{Vary:'Origin'});
    res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id');
    res.setHeader('Access-Control-Max-Age','600');
    return res.status(204).end();
  }
  if(req.method!=='POST')return send(res,405,{error:'METHOD_NOT_ALLOWED'},{Allow:'POST, OPTIONS'});
  if(requestMediaType(req)!=='application/json')return send(res,415,{jsonrpc:'2.0',id:null,error:{code:-32600,message:'MCP POST requests require Content-Type: application/json'}});
  try{
    const body=await readJsonBody(req,262144);
    const out=await handleMcpRequest({headers:req.headers??{},body});
    for(const[k,v]of Object.entries(out.headers??{}))res.setHeader(k,v);
    if(out.body===undefined)return res.status(out.status).end();
    return send(res,out.status,out.body);
  }catch(error){
    return send(res,error.status??400,{jsonrpc:'2.0',id:null,error:{code:-32700,message:error.message}});
  }
}

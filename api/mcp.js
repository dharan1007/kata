import {readJsonBody,send} from '../lib/server/http.js';
import {handleMcpRequest} from '../lib/server/mcp.js';

export default async function handler(req,res){
  if(req.method==='OPTIONS'){
    res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id');
    return res.status(204).end();
  }
  if(req.method!=='POST')return send(res,405,{error:'METHOD_NOT_ALLOWED'},{Allow:'POST, OPTIONS'});
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

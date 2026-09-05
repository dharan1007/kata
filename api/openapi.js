import {method,send} from '../lib/server/http.js';
import {toolDefinitions} from '../lib/server/tools.js';

const toolNames=toolDefinitions.map(tool=>tool.name);
const jsonRequest=schema=>({required:true,content:{'application/json':{schema}}});
const invokeSchema={type:'object',properties:{name:{type:'string',enum:toolNames},arguments:{type:'object'}},required:['name'],additionalProperties:false};

const schema={
  openapi:'3.1.0',
  info:{title:'KATA API',version:'3.0.0',description:'Stateless deterministic research and automation API. Remote MCP is available separately at /api/mcp.'},
  servers:[{url:'https://kata-webmcp.vercel.app'}],
  paths:{
    '/api/health':{get:{operationId:'getKataHealth',summary:'Health check',responses:{200:{description:'Healthy'}}}},
    '/api/capabilities':{get:{operationId:'getKataCapabilities',summary:'Discover KATA protocol, tool, MCP and model-bridge capabilities',responses:{200:{description:'Capability contract'}}}},
    '/api/openapi':{get:{operationId:'getKataOpenApi',summary:'Get this OpenAPI 3.1 description',responses:{200:{description:'OpenAPI document'}}}},
    '/api/search':{get:{operationId:'searchKataResearch',summary:'Live OpenAlex search',parameters:[{in:'query',name:'query',required:true,schema:{type:'string',maxLength:240}},{in:'query',name:'limit',schema:{type:'integer',minimum:1,maximum:25}}],responses:{200:{description:'Normalized OpenAlex works'}}}},
    '/api/invoke':{post:{operationId:'invokeKataTool',summary:'Invoke any canonical KATA tool',requestBody:jsonRequest(invokeSchema),responses:{200:{description:'Tool result'}}}},
    '/api/triage':{post:{operationId:'planKataTriage',summary:'Compatibility endpoint for kata_plan_triage',responses:{200:{description:'Plan'}}}},
    '/api/compile':{post:{operationId:'compileKataWorkflow',summary:'Compile two semantic demonstrations',responses:{200:{description:'Compiled program'}}}},
    '/api/execute':{post:{operationId:'executeKataProgram',summary:'Execute a deterministic compiled program',responses:{200:{description:'Next workspace snapshot'}}}},
    '/api/agents':{get:{operationId:'getKataAgentSchemas',summary:'KATA, OpenAI, Anthropic and Gemini tool definitions',responses:{200:{description:'Agent schemas'}}}},
    '/api/mcp':{post:{operationId:'callKataMcp',summary:'MCP 2026-07-28 / 2025-11-25 endpoint',responses:{200:{description:'JSON-RPC response'}}}}
  }
};

export default async function handler(req,res){if(!method(req,res,['GET']))return;return send(res,200,schema,{'Cache-Control':'public, max-age=300, s-maxage=300'});}

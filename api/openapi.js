import {method,send} from '../lib/server/http.js';
import {toolDefinitions} from '../lib/server/tools.js';
import {MCP_VERSION,LEGACY_MCP_VERSION} from '../lib/server/mcp.js';

const toolNames=toolDefinitions.map(tool=>tool.name);
const jsonRequest=schema=>({required:true,content:{'application/json':{schema}}});
const invokeSchema={type:'object',properties:{name:{type:'string',enum:toolNames},arguments:{type:'object'}},required:['name'],additionalProperties:false};
const jsonRpcId={oneOf:[{type:'string'},{type:'integer'}]};
const mcpMetaSchema={
  type:'object',
  description:`Required on ${MCP_VERSION} requests, including notifications. Legacy ${LEGACY_MCP_VERSION} requests use handshake-era negotiation instead.`,
  properties:{
    'io.modelcontextprotocol/protocolVersion':{type:'string',const:MCP_VERSION},
    'io.modelcontextprotocol/clientCapabilities':{type:'object'},
    'io.modelcontextprotocol/clientInfo':{type:'object'},
    traceparent:{type:'string',description:'Optional W3C trace context propagated into KATA tool execution context.'},
    tracestate:{type:'string'},
    baggage:{type:'string'}
  },
  additionalProperties:true
};
const mcpRequestSchema={
  type:'object',
  description:`JSON-RPC 2.0 MCP request. Every ${MCP_VERSION} POST, including notifications, must carry MCP-Protocol-Version and body-matched Mcp-Method headers plus the modern _meta envelope.`,
  properties:{
    jsonrpc:{type:'string',const:'2.0'},
    id:jsonRpcId,
    method:{type:'string',minLength:1},
    params:{type:'object',properties:{name:{type:'string'},arguments:{type:'object'},_meta:mcpMetaSchema},additionalProperties:true}
  },
  required:['jsonrpc','method'],
  additionalProperties:true
};
const mcpResponseSchema={
  type:'object',
  properties:{
    jsonrpc:{type:'string',const:'2.0'},
    id:{oneOf:[jsonRpcId,{type:'null'}]},
    result:{type:'object'},
    error:{type:'object',properties:{code:{type:'integer'},message:{type:'string'},data:{},_meta:{type:'object'}},required:['code','message'],additionalProperties:true}
  },
  required:['jsonrpc','id'],
  additionalProperties:true
};
const mcpHeaders=[
  {in:'header',name:'MCP-Protocol-Version',required:false,description:`Required on every ${MCP_VERSION} POST, including notifications, and must match request _meta. Also used by ${LEGACY_MCP_VERSION} compatibility traffic.`,schema:{type:'string',enum:[MCP_VERSION,LEGACY_MCP_VERSION]}},
  {in:'header',name:'Mcp-Method',required:false,description:`Required and body-matched on every ${MCP_VERSION} request, including notifications.`,schema:{type:'string'}},
  {in:'header',name:'Mcp-Name',required:false,description:`Required for ${MCP_VERSION} tools/call requests and must match params.name.`,schema:{type:'string'}}
];
const mcpResponses={
  200:{description:'JSON-RPC response for request/response calls',content:{'application/json':{schema:mcpResponseSchema}}},
  202:{description:'Accepted MCP notification after required modern routing-header validation; no JSON-RPC response body'},
  400:{description:'Invalid JSON-RPC envelope, MCP metadata, missing or mismatched required routing header, or unsupported protocol request',content:{'application/json':{schema:mcpResponseSchema}}},
  401:{description:'Bearer authentication required or invalid when MCP_BEARER_TOKEN is configured'},
  403:{description:'Origin rejected by the configured MCP origin allowlist'},
  406:{description:'Accept must permit both application/json and text/event-stream for Streamable HTTP request/response calls'},
  413:{description:'Request body exceeds the configured transport size limit'},
  415:{description:'Request Content-Type is not application/json'},
  500:{description:'Sanitized internal MCP transport or handler failure',content:{'application/json':{schema:mcpResponseSchema}}}
};

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
    '/api/mcp':{post:{operationId:'callKataMcp',summary:`MCP ${MCP_VERSION} / ${LEGACY_MCP_VERSION} Streamable HTTP endpoint`,description:`Content-Type is application/json. Every ${MCP_VERSION} POST, including notifications, requires MCP-Protocol-Version and Mcp-Method. Request/response calls must advertise both application/json and text/event-stream in Accept; accepted notifications return HTTP 202 without a JSON-RPC body.`,parameters:mcpHeaders,requestBody:jsonRequest(mcpRequestSchema),responses:mcpResponses}}
  }
};

export default async function handler(req,res){if(!method(req,res,['GET']))return;return send(res,200,schema,{'Cache-Control':'public, max-age=300, s-maxage=300'});}

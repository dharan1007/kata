import test from 'node:test';
import assert from 'node:assert/strict';
import {compileMcpToolInventory,buildMcpToolCallPreview,fingerprintMcpToolCallPreview,listModernMcpTools,executeModernMcpToolCall} from '../src/mcp-adapter.js';

const MCP_VERSION='2026-07-28';
const tool={name:'lookup.user',description:'Lookup a user',inputSchema:{type:'object',properties:{id:{type:'string','x-mcp-header':'User-Id'}},required:['id'],additionalProperties:false},outputSchema:{type:'object',properties:{name:{type:'string'}},required:['name'],additionalProperties:false}};

test('compiles valid MCP tools and rejects malformed x-mcp-header contracts independently',()=>{
  const bad={...tool,name:'bad',inputSchema:{type:'object',properties:{x:{type:'object','x-mcp-header':'Route'}}}};
  const result=compileMcpToolInventory([tool,bad]);
  assert.deepEqual(result.tools.map(x=>x.name),['lookup.user']);
  assert.equal(result.rejected.length,1);
  assert.match(result.rejected[0].reason,/x-mcp-header/i);
});

test('rejects Tasks-required tools and does not pretend unsupported output schemas were validated',()=>{
  const requiredTask={...tool,name:'async.only',execution:{taskSupport:'required'}};
  const complexOutput={...tool,name:'complex.output',outputSchema:{oneOf:[{type:'string'},{type:'number'}]}};
  const result=compileMcpToolInventory([requiredTask,complexOutput]);
  assert.deepEqual(result.tools.map(x=>x.name),['complex.output']);
  assert.match(result.rejected[0].reason,/Tasks extension/i);
  assert.equal(result.tools[0].outputSchemaValidation,'unsupported-schema');
});

test('builds a preview-bound tools/call with MCP routing and mirrored primitive headers',async()=>{
  const candidate=compileMcpToolInventory([tool]).tools[0];
  const preview=buildMcpToolCallPreview(candidate,{id:'abc'},'https://example.com/mcp');
  assert.equal(preview.method,'tools/call');
  assert.equal(preview.endpoint,'https://example.com/mcp');
  assert.equal(preview.headers['Mcp-Method'],'tools/call');
  assert.equal(preview.headers['Mcp-Name'],'lookup.user');
  assert.equal(preview.headers['Mcp-Param-User-Id'],'abc');
  assert.equal(preview.credentials,'omit');
  assert.equal(preview.readyToExecute,true);
  assert.match(await fingerprintMcpToolCallPreview(preview),/^[a-f0-9]{64}$/);
});

test('base64-encodes unsafe x-mcp-header values instead of rejecting or leaking raw Unicode/control data',()=>{
  const encodedTool={...tool,name:'echo.greeting',inputSchema:{type:'object',properties:{greeting:{type:'string','x-mcp-header':'Greeting'}},required:['greeting'],additionalProperties:false}};
  const candidate=compileMcpToolInventory([encodedTool]).tools[0];
  const unicode=buildMcpToolCallPreview(candidate,{greeting:'Hello, 世界'},'https://example.com/mcp');
  assert.equal(unicode.headers['Mcp-Param-Greeting'],'=?base64?SGVsbG8sIOS4lueVjA==?=');
  const padded=buildMcpToolCallPreview(candidate,{greeting:' padded '},'https://example.com/mcp');
  assert.equal(padded.headers['Mcp-Param-Greeting'],'=?base64?IHBhZGRlZCA=?=');
});

test('lists modern MCP tools with bounded pagination, required metadata, and no credentials',async()=>{
  const calls=[];
  const pages=[
    {resultType:'complete',tools:[tool],nextCursor:'next',ttlMs:5000,cacheScope:'private'},
    {resultType:'complete',tools:[{...tool,name:'other'}],ttlMs:5000,cacheScope:'private'}
  ];
  const fetchImpl=async(url,init)=>{const body=JSON.parse(init.body);calls.push({url,init,body});const result=pages[calls.length-1];return{ok:true,status:200,json:async()=>({jsonrpc:'2.0',id:body.id,result})};};
  const result=await listModernMcpTools('https://example.com/mcp',{fetchImpl,maxPages:4,maxTools:10});
  assert.deepEqual(result.tools.map(x=>x.name),['lookup.user','other']);
  assert.equal(calls.length,2);
  assert.equal(calls[0].init.credentials,'omit');
  assert.equal(calls[0].init.redirect,'manual');
  assert.equal(calls[0].init.headers['MCP-Protocol-Version'],MCP_VERSION);
  assert.equal(calls[0].init.headers['Mcp-Method'],'tools/list');
  assert.equal(calls[0].body.params._meta['io.modelcontextprotocol/protocolVersion'],MCP_VERSION);
  assert.equal(calls[1].body.params.cursor,'next');
});

test('executes only an explicitly approved fresh preview and validates supported structured output',async()=>{
  const candidate=compileMcpToolInventory([tool]).tools[0];
  const preview=buildMcpToolCallPreview(candidate,{id:'abc'},'https://example.com/mcp');
  const fingerprint=await fingerprintMcpToolCallPreview(preview);
  const calls=[];
  const fetchImpl=async(url,init)=>{calls.push({url,init,body:JSON.parse(init.body)});return{ok:true,status:200,json:async()=>({jsonrpc:'2.0',id:'kata-mcp-call',result:{resultType:'complete',content:[{type:'text',text:'ok'}],structuredContent:{name:'Ada'},isError:false}})};};
  const result=await executeModernMcpToolCall(preview,fingerprint,{approved:true,expectedFingerprint:fingerprint,fetchImpl});
  assert.equal(result.ok,true);
  assert.equal(result.receipt.toolName,'lookup.user');
  assert.equal(result.receipt.isError,false);
  assert.equal(result.receipt.outputValidation,'validated-supported-subset');
  assert.deepEqual(result.result.structuredContent,{name:'Ada'});
  assert.equal(calls.length,1);
  await assert.rejects(()=>executeModernMcpToolCall(preview,fingerprint,{approved:false,expectedFingerprint:fingerprint,fetchImpl}),/approval/i);
});

test('never labels a full-JSON-Schema output as validated when KATA supports only a safe validator subset',async()=>{
  const complex={...tool,name:'complex.output',outputSchema:{oneOf:[{type:'string'},{type:'number'}]}};
  const candidate=compileMcpToolInventory([complex]).tools[0];
  const preview=buildMcpToolCallPreview(candidate,{id:'abc'},'https://example.com/mcp');
  const fingerprint=await fingerprintMcpToolCallPreview(preview);
  const fetchImpl=async()=>({ok:true,status:200,json:async()=>({jsonrpc:'2.0',id:'kata-mcp-call',result:{resultType:'complete',structuredContent:'ok',isError:false}})});
  const result=await executeModernMcpToolCall(preview,fingerprint,{approved:true,expectedFingerprint:fingerprint,fetchImpl});
  assert.equal(result.ok,true);
  assert.equal(result.receipt.outputValidation,'not-validated-unsupported-schema');
});

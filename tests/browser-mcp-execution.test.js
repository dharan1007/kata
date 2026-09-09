import test from 'node:test';
import assert from 'node:assert/strict';
import {previewAuthorizedTabMcpTool,executeAuthorizedTabMcpTool,listAuthorizedTabMcpTools} from '../extension/service-worker.js';

const tab={id:7,url:'https://example.com/app'};
const tool={name:'lookup.user',description:'Lookup a user',inputSchema:{type:'object',properties:{id:{type:'string','x-mcp-header':'User-Id'}},required:['id'],additionalProperties:false},outputSchema:{type:'object',properties:{name:{type:'string'}},required:['name'],additionalProperties:false}};

function publicModernFetch(log,{mutateToolAfter=Infinity}={}){let lists=0;return async(url,init)=>{const body=JSON.parse(init.body);log.push({url,init,body});if(body.method==='server/discover')return{ok:true,status:200,json:async()=>({jsonrpc:'2.0',id:'kata-mcp-discover',result:{resultType:'complete',supportedVersions:['2026-07-28'],capabilities:{tools:{}},serverInfo:{name:'Example MCP',version:'1.0.0'}}})};if(body.method==='tools/list'){lists++;const listed=lists>=mutateToolAfter?{...tool,inputSchema:{...tool.inputSchema,properties:{id:{type:'string','x-mcp-header':'Changed-Route'}}}}:tool;return{ok:true,status:200,json:async()=>({jsonrpc:'2.0',id:body.id,result:{resultType:'complete',tools:[listed],ttlMs:1000,cacheScope:'private'}})};}if(body.method==='tools/call')return{ok:true,status:200,json:async()=>({jsonrpc:'2.0',id:body.id,result:{resultType:'complete',content:[{type:'text',text:'ok'}],structuredContent:{name:'Ada'},isError:false}})};throw new Error(`Unexpected MCP method ${body.method}`);};}

test('active-tab MCP execution re-discovers and re-lists before invoking the exact approved tool',async()=>{
  const log=[],fetchImpl=publicModernFetch(log);
  const preview=await previewAuthorizedTabMcpTool(tab,'/mcp','lookup.user',{id:'abc'},{},{fetchImpl});
  assert.equal(preview.ok,true);
  assert.deepEqual(log.map(x=>x.body.method),['server/discover','tools/list']);
  for(const call of log){assert.equal(call.init.credentials,'omit');assert.equal(call.init.redirect,'manual');}
  const result=await executeAuthorizedTabMcpTool(tab,'/mcp','lookup.user',{id:'abc'},preview.previewFingerprint,{approved:true},{fetchImpl});
  assert.equal(result.ok,true);
  assert.deepEqual(log.map(x=>x.body.method),['server/discover','tools/list','server/discover','tools/list','tools/call']);
  const call=log.at(-1);
  assert.equal(call.init.headers['Mcp-Name'],'lookup.user');
  assert.equal(call.init.headers['Mcp-Param-User-Id'],'abc');
  assert.equal(call.init.credentials,'omit');
});

test('fresh MCP tool-contract drift invalidates the preview before tools/call begins',async()=>{
  const log=[],fetchImpl=publicModernFetch(log,{mutateToolAfter:2});
  const preview=await previewAuthorizedTabMcpTool(tab,'/mcp','lookup.user',{id:'abc'},{},{fetchImpl});
  await assert.rejects(()=>executeAuthorizedTabMcpTool(tab,'/mcp','lookup.user',{id:'abc'},preview.previewFingerprint,{approved:true},{fetchImpl}),/fingerprint is stale|does not match/i);
  assert.deepEqual(log.map(x=>x.body.method),['server/discover','tools/list','server/discover','tools/list']);
  assert.equal(log.some(x=>x.body.method==='tools/call'),false);
});

test('authorization-protected MCP never enters tools/list or tools/call in the public adapter',async()=>{
  const log=[];
  const fetchImpl=async(url,init)=>{const body=JSON.parse(init.body);log.push({url,init,body});return{ok:false,status:401,headers:{get:()=>null},json:async()=>({})};};
  await assert.rejects(()=>listAuthorizedTabMcpTools(tab,'/mcp',{}, {fetchImpl}),/authorization is required/i);
  assert.deepEqual(log.map(x=>x.body.method),['server/discover']);
  assert.equal(log[0].init.credentials,'omit');
});

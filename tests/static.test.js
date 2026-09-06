import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';

test('product source preserves all ten routes and no inline event handlers',()=>{const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');for(const route of ['/dashboard','/research','/automations','/teach','/tools','/developers','/activity','/learn','/settings'])assert.match(app,new RegExp(route.replace('/','\\/')));const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.doesNotMatch(html,/\son[a-z]+\s*=/i);assert.doesNotMatch(html,/style\s*=/i);});

test('developer MCP example is a self-describing 2026-07-28 request',()=>{
  const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const start=app.indexOf('<h2>MCP request example</h2>');
  assert.notEqual(start,-1,'developer MCP example must exist');
  const example=app.slice(start,start+1400);
  assert.match(example,/MCP-Protocol-Version: 2026-07-28/);
  assert.match(example,/io\.modelcontextprotocol\/protocolVersion/);
  assert.match(example,/io\.modelcontextprotocol\/clientCapabilities/);
});

test('README MCP request example includes the required Streamable HTTP Accept contract',()=>{
  const readme=fs.readFileSync(new URL('../README.md',import.meta.url),'utf8');
  const start=readme.indexOf('A valid tool call is:');
  assert.notEqual(start,-1,'README MCP tool-call example must exist');
  const example=readme.slice(start,start+900);
  assert.match(example,/Content-Type: application\/json/);
  assert.match(example,/Accept: application\/json, text\/event-stream/);
});

test('browser source uses document.modelContext and not deprecated navigator alias',()=>{const src=fs.readFileSync(new URL('../src/webmcp.js',import.meta.url),'utf8');assert.match(src,/document\?\.modelContext|document\.modelContext/);assert.doesNotMatch(src,/navigator\.modelContext/);});

test('public api directory contains endpoint modules only',()=>{
  const apiDir=new URL('../api/',import.meta.url);
  const entries=fs.readdirSync(apiDir,{withFileTypes:true});
  assert.deepEqual(entries.filter(e=>e.isDirectory()).map(e=>e.name),[],'helper libraries must live outside /api so Vercel cannot expose them as routes');
  const endpointNames=entries.filter(e=>e.isFile()&&e.name.endsWith('.js')).map(e=>e.name).sort();
  assert.deepEqual(endpointNames,['agents.js','capabilities.js','compile.js','execute.js','health.js','invoke.js','mcp.js','openapi.js','search.js','triage.js']);
});

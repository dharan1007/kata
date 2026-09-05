import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';

test('product source preserves all ten routes and no inline event handlers',()=>{const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');for(const route of ['/dashboard','/research','/automations','/teach','/tools','/developers','/activity','/learn','/settings'])assert.match(app,new RegExp(route.replace('/','\\/')));const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.doesNotMatch(html,/\son[a-z]+\s*=/i);assert.doesNotMatch(html,/style\s*=/i);});

test('browser source uses document.modelContext and not deprecated navigator alias',()=>{const src=fs.readFileSync(new URL('../src/webmcp.js',import.meta.url),'utf8');assert.match(src,/document\?\.modelContext|document\.modelContext/);assert.doesNotMatch(src,/navigator\.modelContext/);});

test('public api directory contains endpoint modules only',()=>{
  const apiDir=new URL('../api/',import.meta.url);
  const entries=fs.readdirSync(apiDir,{withFileTypes:true});
  assert.deepEqual(entries.filter(e=>e.isDirectory()).map(e=>e.name),[],'helper libraries must live outside /api so Vercel cannot expose them as routes');
  const endpointNames=entries.filter(e=>e.isFile()&&e.name.endsWith('.js')).map(e=>e.name).sort();
  assert.deepEqual(endpointNames,['agents.js','capabilities.js','compile.js','execute.js','health.js','invoke.js','mcp.js','openapi.js','search.js','triage.js']);
});

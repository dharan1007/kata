import test from 'node:test';
import assert from 'node:assert/strict';
import health from '../api/health.js';
import capabilities from '../api/capabilities.js';
import invoke from '../api/invoke.js';

function res(){return{statusCode:200,headers:{},body:null,status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};}

test('/api/health is explicit and versioned',async()=>{const r=res();await health({method:'GET',headers:{}},r);assert.equal(r.statusCode,200);assert.deepEqual(r.body,{ok:true,service:'kata-webmcp',version:'3.0.0',apiVersion:'v2'});});

test('/api/capabilities exposes real protocol surfaces',async()=>{const r=res();await capabilities({method:'GET',headers:{}},r);assert.equal(r.statusCode,200);assert.equal(r.body.capabilities.mcp.protocolVersion,'2026-07-28');assert.equal(r.body.capabilities.webmcp.entryPoint,'document.modelContext');assert.ok(r.body.capabilities.tools.length>=7);});

test('/api/invoke rejects oversized/unexpected tool input cleanly',async()=>{const r=res();await invoke({method:'POST',headers:{'content-length':'200000'},body:{}},r);assert.equal(r.statusCode,413);});

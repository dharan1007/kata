import test from 'node:test';
import assert from 'node:assert/strict';
import health from '../api/health.js';
import capabilities from '../api/capabilities.js';
import invoke from '../api/invoke.js';
import {queryParam} from '../lib/server/http.js';

function res(){return{statusCode:200,headers:{},body:null,status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;},json(v){this.body=v;return this;},end(v){this.body=v;return this;}};}

test('/api/health is explicit and versioned',async()=>{const r=res();await health({method:'GET',headers:{}},r);assert.equal(r.statusCode,200);assert.deepEqual(r.body,{ok:true,service:'kata-webmcp',version:'3.0.0',apiVersion:'v2'});});

test('/api/capabilities exposes real protocol surfaces',async()=>{const r=res();await capabilities({method:'GET',headers:{}},r);assert.equal(r.statusCode,200);assert.equal(r.body.capabilities.mcp.protocolVersion,'2026-07-28');assert.equal(r.body.capabilities.webmcp.entryPoint,'document.modelContext');assert.ok(r.body.capabilities.tools.length>=7);});

test('/api/invoke rejects oversized/unexpected tool input cleanly',async()=>{const r=res();await invoke({method:'POST',headers:{'content-length':'200000'},body:{}},r);assert.equal(r.statusCode,413);});

test('query parsing uses WHATWG URL without touching deprecated req.query compatibility layer',()=>{const req={url:'/api/search?query=machine%20learning&limit=2'};Object.defineProperty(req,'query',{get(){throw new Error('REQ_QUERY_ACCESSED');}});assert.equal(queryParam(req,'query'),'machine learning');assert.equal(queryParam(req,'limit'),'2');assert.equal(queryParam(req,'missing'),null);});

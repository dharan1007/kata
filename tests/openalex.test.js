import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOpenAlexUrl, searchOpenAlex} from '../lib/server/openalex.js';

test('OpenAlex URL uses WHATWG URL and clamps result limits',()=>{
 const u=buildOpenAlexUrl('web agents',999); assert.equal(u.searchParams.get('search'),'web agents'); assert.equal(u.searchParams.get('per-page'),'25');
});

test('OpenAlex retries one rate limit and normalizes real response shape',async()=>{
 let n=0; const fake=async()=>{n++; if(n===1)return new Response('{}',{status:429}); return Response.json({results:[{id:'https://openalex.org/W1',title:'X',publication_year:2026,cited_by_count:7,authorships:[{author:{display_name:'A'}}],doi:'https://doi.org/10.x'}]});};
 const out=await searchOpenAlex('x',1,{fetchImpl:fake,retryDelayMs:0}); assert.equal(n,2); assert.equal(out.works[0].id,'W1'); assert.equal(out.works[0].citations,7);
});

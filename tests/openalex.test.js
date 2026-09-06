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

test('OpenAlex terminal rate limit preserves upstream retry guidance',async()=>{
 const fake=async()=>new Response('{}',{status:429,headers:{'X-RateLimit-Reset':'43200'}});
 await assert.rejects(
  searchOpenAlex('rate limited',1,{fetchImpl:fake,retries:0}),
  error=>error?.message==='UPSTREAM_RATE_LIMITED'&&error?.details?.retryAfterSeconds===43200
 );
});

test('OpenAlex uses configured API key and exposes upstream rate-limit telemetry',async()=>{
 let seenAuthorization=null;
 const fake=async(_url,options={})=>{
  seenAuthorization=options.headers?.Authorization??null;
  return Response.json({results:[{id:'https://openalex.org/W2',title:'Authenticated',publication_year:2026,cited_by_count:2,authorships:[]}]},{headers:{
   'X-RateLimit-Limit':'10000',
   'X-RateLimit-Remaining':'8766',
   'X-RateLimit-Credits-Used':'1',
   'X-RateLimit-Reset':'43200'
  }});
 };
 const out=await searchOpenAlex('auth',1,{fetchImpl:fake,apiKey:'secret-test-key'});
 assert.equal(seenAuthorization,'Bearer secret-test-key');
 assert.deepEqual(out.meta.rateLimit,{limit:10000,remaining:8766,creditsUsed:1,resetSeconds:43200});
});

test('OpenAlex retries transient failures with exponential backoff',async()=>{
 let attempts=0;const delays=[];
 const fake=async()=>{attempts++;if(attempts<=3)return new Response('{}',{status:500});return Response.json({results:[]});};
 const out=await searchOpenAlex('backoff',1,{fetchImpl:fake,retries:3,retryDelayMs:100,sleepImpl:async ms=>{delays.push(ms);}});
 assert.equal(attempts,4);
 assert.deepEqual(delays,[100,200,400]);
 assert.equal(out.meta.source,'openalex');
});

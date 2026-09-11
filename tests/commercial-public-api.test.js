import test from 'node:test';
import assert from 'node:assert/strict';
import pricingHandler from '../api/pricing.js';
import readinessHandler from '../api/readiness/commercial.js';

function response(){return{headers:{},statusCode:null,body:null,setHeader(name,value){this.headers[String(name).toLowerCase()]=String(value);},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};}
function withEnv(patch,fn){const previous={};for(const [key,value] of Object.entries(patch)){previous[key]=process.env[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}return Promise.resolve().then(fn).finally(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});}

test('public pricing API exposes display metadata but no provider identifiers or authorization state',()=>{
  const req={method:'GET',headers:{},url:'/api/pricing'},res=response();pricingHandler(req,res);assert.equal(res.statusCode,200);assert.equal(res.body.ok,true);assert.equal(res.body.plans.find(p=>p.id==='developer').priceInrMonthly,999);assert.equal(res.body.plans.find(p=>p.id==='team').priceInrMonthly,4999);const serialized=JSON.stringify(res.body);assert.doesNotMatch(serialized,/razorpay|plan_[A-Za-z0-9]+|entitlement/i);assert.match(res.headers['cache-control'],/s-maxage=300/);
});

test('commercial readiness API fails closed and never exposes configured secret values',async()=>{
  await withEnv({VERCEL:'1',VERCEL_GIT_COMMIT_SHA:'d'.repeat(40),VERCEL_GIT_REPO_OWNER:'dharan1007',VERCEL_GIT_REPO_SLUG:'kata',VERCEL_GIT_COMMIT_REF:'main',KATA_RAZORPAY_KEY_SECRET:'do-not-leak-this',KATA_KEY_PEPPER:'also-private',KATA_IDENTITY_CONFIGURED:undefined,KATA_DATABASE_CONFIGURED:undefined},()=>{
    const req={method:'GET',headers:{},url:'/api/readiness/commercial'},res=response();readinessHandler(req,res);assert.equal(res.statusCode,200);assert.equal(res.body.readiness.status,'blocked');assert.equal(res.body.readiness.sourceBound,true);const text=JSON.stringify(res.body);assert.doesNotMatch(text,/do-not-leak-this|also-private/);assert.match(res.headers['cache-control'],/no-store/);
  });
});

test('commercial public APIs reject unsupported methods',()=>{
  for(const handler of [pricingHandler,readinessHandler]){const req={method:'POST',headers:{},url:'/'},res=response();handler(req,res);assert.equal(res.statusCode,405);assert.equal(res.body.error.code,'METHOD_NOT_ALLOWED');}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {decideVercelBuild} from '../scripts/vercel-prebuild-gate.mjs';

const SHA='a'.repeat(40);
const otherSha='b'.repeat(40);
const baseEnv={
  VERCEL_ENV:'production',
  VERCEL_TARGET_ENV:'production',
  VERCEL_GIT_COMMIT_REF:'main',
  VERCEL_GIT_COMMIT_SHA:SHA,
  VERCEL_GIT_REPO_OWNER:'dharan1007',
  VERCEL_GIT_REPO_SLUG:'kata'
};

const jsonResponse=(value,{status=200}={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','x-ratelimit-remaining':'50'}});
const run=(name,status='completed',conclusion='success')=>({name,event:'push',head_branch:'main',head_sha:SHA,status,conclusion});

test('vercel.json invokes the committed exact-SHA ignored-build gate',()=>{
  const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
  assert.equal(config.ignoreCommand,'node scripts/vercel-prebuild-gate.mjs');
});

test('preview and non-main deployments are not held by the production release gate',async()=>{
  let calls=0;
  const result=await decideVercelBuild({env:{...baseEnv,VERCEL_ENV:'preview',VERCEL_TARGET_ENV:'preview',VERCEL_GIT_COMMIT_REF:'feature'},fetchImpl:async()=>{calls++;throw new Error('unexpected fetch');}});
  assert.equal(result.proceed,true);
  assert.equal(result.reason,'not_production_main');
  assert.equal(calls,0);
});

test('production main waits for exact-SHA push Release Gate and CodeQL then rechecks main before proceeding',async()=>{
  let actionPolls=0;
  let sleeps=0;
  const fetchImpl=async url=>{
    const value=String(url);
    if(value.endsWith('/branches/main'))return jsonResponse({commit:{sha:SHA}});
    if(value.includes('/actions/runs')){
      actionPolls++;
      if(actionPolls===1)return jsonResponse({workflow_runs:[run('KATA Release Gate','completed','success'),run('CodeQL','in_progress',null)]});
      return jsonResponse({workflow_runs:[run('KATA Release Gate'),run('CodeQL')]});
    }
    throw new Error(`unexpected URL: ${value}`);
  };
  const result=await decideVercelBuild({env:baseEnv,fetchImpl,sleepImpl:async()=>{sleeps++;},maxAttempts:3,pollMs:0});
  assert.equal(result.proceed,true);
  assert.equal(result.reason,'verified');
  assert.equal(actionPolls,2);
  assert.equal(sleeps,1);
});

test('failed required checks fail closed without allowing a production build',async()=>{
  const fetchImpl=async url=>String(url).endsWith('/branches/main')
    ? jsonResponse({commit:{sha:SHA}})
    : jsonResponse({workflow_runs:[run('KATA Release Gate'),run('CodeQL','completed','failure')]});
  const result=await decideVercelBuild({env:baseEnv,fetchImpl,sleepImpl:async()=>{},maxAttempts:2,pollMs:0});
  assert.equal(result.proceed,false);
  assert.equal(result.reason,'required_check_failed');
});

test('stale or out-of-order main candidates fail closed even when their old checks passed',async()=>{
  const fetchImpl=async url=>String(url).endsWith('/branches/main')
    ? jsonResponse({commit:{sha:otherSha}})
    : jsonResponse({workflow_runs:[run('KATA Release Gate'),run('CodeQL')]});
  const result=await decideVercelBuild({env:baseEnv,fetchImpl,sleepImpl:async()=>{},maxAttempts:1,pollMs:0});
  assert.equal(result.proceed,false);
  assert.equal(result.reason,'stale_main');
});

test('GitHub API/network uncertainty and missing deployment identity fail closed',async()=>{
  const unavailable=await decideVercelBuild({env:baseEnv,fetchImpl:async()=>{throw new Error('network down');},sleepImpl:async()=>{},maxAttempts:1,pollMs:0});
  assert.equal(unavailable.proceed,false);
  assert.equal(unavailable.reason,'github_unavailable');
  const invalid=await decideVercelBuild({env:{...baseEnv,VERCEL_GIT_COMMIT_SHA:'not-a-sha'},fetchImpl:async()=>{throw new Error('unexpected');}});
  assert.equal(invalid.proceed,false);
  assert.equal(invalid.reason,'invalid_deployment_identity');
});

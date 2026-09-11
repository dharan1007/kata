import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSourceIdentity} from '../scripts/release-contract.mjs';
import {runtimeReleaseEvidence} from '../lib/commercial/runtime-release.js';

test('Vercel Git execution is provider-bound without requiring an unavailable local .git cleanliness probe',()=>{
  const env={VERCEL:'1',VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),VERCEL_GIT_REPO_OWNER:'dharan1007',VERCEL_GIT_REPO_SLUG:'kata',VERCEL_GIT_COMMIT_REF:'main'};
  const source=resolveSourceIdentity(env,{});
  assert.equal(source.provenance,'source-bound');assert.equal(source.authority,'vercel-git');assert.equal(source.repository,'dharan1007/kata');assert.equal(source.ref,'main');assert.equal(source.verification.providerBound,true);assert.equal(source.verification.headMatches,true);assert.equal(source.verification.clean,null);
  assert.deepEqual(runtimeReleaseEvidence(env),{releaseSha:'a'.repeat(40),sourceBound:true,authority:'vercel-git',repository:'dharan1007/kata',ref:'main'});
});

test('Vercel-looking environment is not trusted outside Vercel or on a non-main deployment',()=>{
  const spoof={VERCEL_GIT_COMMIT_SHA:'b'.repeat(40),VERCEL_GIT_REPO_OWNER:'dharan1007',VERCEL_GIT_REPO_SLUG:'kata',VERCEL_GIT_COMMIT_REF:'main'};
  assert.notEqual(resolveSourceIdentity(spoof,{}).provenance,'source-bound');assert.equal(runtimeReleaseEvidence(spoof).sourceBound,false);
  assert.equal(runtimeReleaseEvidence({...spoof,VERCEL:'1',VERCEL_GIT_COMMIT_REF:'feature'}).sourceBound,false);
});

test('GitHub Actions still requires exact clean checkout evidence',()=>{
  const env={GITHUB_SHA:'c'.repeat(40),GITHUB_REPOSITORY:'dharan1007/kata',GITHUB_REF:'refs/heads/main'};
  assert.equal(resolveSourceIdentity(env,{sourceHeadSha:'c'.repeat(40),sourceClean:true}).provenance,'source-bound');
  assert.equal(resolveSourceIdentity(env,{sourceHeadSha:'c'.repeat(40),sourceClean:false}).provenance,'dirty');
  assert.equal(resolveSourceIdentity(env,{}).provenance,'unverified');
});
